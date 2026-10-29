import type {
  FollowTag,
  FollowTagSyncGroupPlan,
  FollowTagSyncPlan,
  FollowTagSyncStatus,
} from "@shared/types";
import { appStore } from "../store/app-store";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { biliApi } from "./bili-api";

/** 本地叶子分组 ↔ B 站分组；mids 是上次同步后的成员，用来少读接口 */
interface SyncEntry {
  groupId: number;
  tagId: number;
  name: string;
  mids: number[];
}

interface InternalGroupPlan extends FollowTagSyncGroupPlan {
  current: number[];
  add: number[];
  remove: number[];
}

interface InternalPlan {
  planId: string;
  groups: InternalGroupPlan[];
  deleteTags: FollowTagSyncPlan["deleteTags"];
  writeRequests: number;
}

const STORE_KEY = "followTagSync";
const TAG_NAME_MAX = 16;
const BATCH_SIZE = 30;
const WRITE_GAP_MIN_MS = 2000;
const WRITE_GAP_JITTER_MS = 1500;
const READ_GAP_MS = 700;

let pendingPlan: InternalPlan | null = null;
let cancelRequested = false;
let status: FollowTagSyncStatus = {
  state: "idle",
  done: 0,
  total: 0,
  message: "",
  errors: [],
};

class CancelledError extends Error {}

function readEntries(): SyncEntry[] {
  const stored = appStore.get(STORE_KEY as never) as
    | { entries?: SyncEntry[] }
    | undefined;
  return Array.isArray(stored?.entries) ? stored.entries : [];
}

function writeEntries(entries: SyncEntry[]): void {
  appStore.set(STORE_KEY as never, { entries } as never);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

function truncateName(name: string): string {
  return Array.from(name).slice(0, TAG_NAME_MAX).join("");
}

function uniqueName(base: string, used: Set<string>): string {
  let name = truncateName(base);
  for (let suffix = 2; used.has(name); suffix++) {
    const tail = String(suffix);
    name = truncateName(base).slice(0, TAG_NAME_MAX - tail.length) + tail;
  }
  used.add(name);
  return name;
}

function isRiskError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /安全策略|频繁|风控|-412|412/.test(message);
}

function isTagLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("上限");
}

async function readAllMidsInTag(tagId: number): Promise<number[]> {
  const mids: number[] = [];
  for (let page = 1; page <= 100; page++) {
    if (page > 1) await sleep(READ_GAP_MS);
    const result = await biliApi.getFollowingsInTag(tagId, page, 50);
    mids.push(...result.followings.map((up) => up.mid));
    if (!result.hasMore) break;
  }
  return mids;
}

export async function previewFollowTagSync(
  followedMids: number[],
): Promise<FollowTagSyncPlan> {
  if (status.state === "running") throw new Error("同步正在进行中");

  const officialTags = await biliApi.getFollowTags();
  const tagById = new Map(officialTags.map((tag) => [tag.tagId, tag]));
  const entries = readEntries();
  const entryByGroup = new Map(entries.map((entry) => [entry.groupId, entry]));
  const followed = new Set(followedMids);
  const leaves = taxonomyRepo.getUpSyncLeaves();
  const leafIds = new Set(leaves.map((leaf) => leaf.groupId));

  const claimedTagIds = new Set(
    entries
      .filter((entry) => leafIds.has(entry.groupId) && tagById.has(entry.tagId))
      .map((entry) => entry.tagId),
  );
  const usedNames = new Set<string>();
  const groups: InternalGroupPlan[] = [];
  const warnings: string[] = [];
  let skippedUnfollowed = 0;
  let reads = 0;

  const loadCurrent = async (tag: FollowTag, entry?: SyncEntry) => {
    if (entry && entry.tagId === tag.tagId && entry.mids.length === tag.count) {
      return entry.mids;
    }
    if (tag.count === 0) return [];
    if (reads > 0) await sleep(READ_GAP_MS);
    reads++;
    return readAllMidsInTag(tag.tagId);
  };

  for (const leaf of leaves) {
    const base = leaf.l2Name ? `${leaf.l1Name}·${leaf.l2Name}` : leaf.l1Name;
    const tagName = uniqueName(base, usedNames);
    const mids =
      followed.size > 0
        ? leaf.mids.filter((mid) => followed.has(mid))
        : leaf.mids;
    skippedUnfollowed += leaf.mids.length - mids.length;

    const entry = entryByGroup.get(leaf.groupId);
    const mapped = entry ? tagById.get(entry.tagId) : undefined;
    let action: FollowTagSyncGroupPlan["action"];
    let tagId: number | null = null;
    let current: number[] = [];
    let oldName: string | undefined;

    if (mapped && entry) {
      tagId = mapped.tagId;
      action = mapped.name === tagName ? "keep" : "rename";
      if (action === "rename") oldName = mapped.name;
      current = await loadCurrent(mapped, entry);
    } else {
      const sameName = officialTags.find(
        (tag) =>
          tag.tagId > 0 &&
          tag.name === tagName &&
          !claimedTagIds.has(tag.tagId),
      );
      if (sameName) {
        action = "adopt";
        tagId = sameName.tagId;
        claimedTagIds.add(sameName.tagId);
        current = await loadCurrent(sameName);
        warnings.push(
          `B 站已有同名分组「${tagName}」，会接管它：这次只往里加人，以后重跑会按本地结果增删`,
        );
      } else {
        action = "create";
      }
    }

    const target = new Set(mids);
    const currentSet = new Set(current);
    const add = mids.filter((mid) => !currentSet.has(mid));
    const remove =
      action === "adopt" ? [] : current.filter((mid) => !target.has(mid));

    groups.push({
      groupId: leaf.groupId,
      tagName,
      action,
      tagId,
      ...(oldName ? { oldName } : {}),
      total: mids.length,
      addCount: add.length,
      removeCount: remove.length,
      current,
      add,
      remove,
    });
  }

  const deleteTags = entries
    .filter(
      (entry) =>
        !leafIds.has(entry.groupId) &&
        tagById.has(entry.tagId) &&
        !claimedTagIds.has(entry.tagId),
    )
    .map((entry) => {
      const tag = tagById.get(entry.tagId)!;
      return { tagId: tag.tagId, name: tag.name, count: tag.count };
    });

  const createCount = groups.filter(
    (group) => group.action === "create",
  ).length;
  const customAfter =
    officialTags.filter((tag) => tag.tagId > 0).length +
    createCount -
    deleteTags.length;
  if (createCount > 0 && customAfter > 20) {
    warnings.push(
      `同步后 B 站自定义分组约 ${customAfter} 个，B 站对分组数量有上限，超出时剩下的分组会跳过`,
    );
  }

  const writeRequests =
    deleteTags.length +
    groups.reduce(
      (sum, group) =>
        sum +
        (group.action === "create" || group.action === "rename" ? 1 : 0) +
        Math.ceil(group.add.length / BATCH_SIZE) +
        Math.ceil(group.remove.length / BATCH_SIZE),
      0,
    );

  const planId = `${Date.now()}`;
  pendingPlan = { planId, groups, deleteTags, writeRequests };

  return {
    planId,
    groups: groups.map(({ current, add, remove, ...rest }) => rest),
    deleteTags,
    skippedUnfollowed,
    writeRequests,
    estimatedSeconds: Math.ceil(
      (writeRequests * (WRITE_GAP_MIN_MS + WRITE_GAP_JITTER_MS / 2)) / 1000,
    ),
    warnings,
  };
}

async function runPlan(plan: InternalPlan): Promise<void> {
  const entries = readEntries();
  const save = () => writeEntries(entries);
  const upsert = (next: SyncEntry): SyncEntry => {
    const index = entries.findIndex((entry) => entry.groupId === next.groupId);
    if (index >= 0) entries[index] = next;
    else entries.push(next);
    save();
    return next;
  };

  let wrote = 0;
  const write = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (cancelRequested) throw new CancelledError();
    if (wrote > 0) {
      await sleep(WRITE_GAP_MIN_MS + Math.random() * WRITE_GAP_JITTER_MS);
      if (cancelRequested) throw new CancelledError();
    }
    wrote++;
    status = { ...status, message: label };
    try {
      return await fn();
    } finally {
      status = { ...status, done: status.done + 1 };
    }
  };

  const fail = (label: string, err: unknown) => {
    if (isRiskError(err) || err instanceof CancelledError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    status = { ...status, errors: [...status.errors, `${label}：${message}`] };
  };

  for (const tag of plan.deleteTags) {
    try {
      await write(`删除旧分组「${tag.name}」`, () =>
        biliApi.deleteFollowTag(tag.tagId),
      );
      const index = entries.findIndex((entry) => entry.tagId === tag.tagId);
      if (index >= 0) entries.splice(index, 1);
      save();
    } catch (err) {
      fail(`删除「${tag.name}」`, err);
    }
  }

  let tagLimitHit = false;
  for (const group of plan.groups) {
    let tagId = group.tagId;
    try {
      if (group.action === "create") {
        if (tagLimitHit) {
          status = {
            ...status,
            done: status.done + 1,
            errors: [
              ...status.errors,
              `「${group.tagName}」：分组数量已达上限，已跳过`,
            ],
          };
          continue;
        }
        const created = await write(`新建分组「${group.tagName}」`, () =>
          biliApi.createFollowTag(group.tagName),
        );
        tagId = created.tagId;
      } else if (group.action === "rename" && tagId != null) {
        const id = tagId;
        await write(`分组改名为「${group.tagName}」`, () =>
          biliApi.renameFollowTag(id, group.tagName),
        );
      }
    } catch (err) {
      if (isTagLimitError(err)) {
        tagLimitHit = true;
        status = {
          ...status,
          errors: [
            ...status.errors,
            `「${group.tagName}」：分组数量已达上限，已跳过`,
          ],
        };
        continue;
      }
      fail(`「${group.tagName}」`, err);
      if (group.action === "create") continue;
    }
    if (tagId == null) continue;

    const entry = upsert({
      groupId: group.groupId,
      tagId,
      name: group.tagName,
      mids: [...group.current],
    });
    const id = tagId;

    for (const batch of chunk(group.add, BATCH_SIZE)) {
      try {
        await write(`「${group.tagName}」加入 ${batch.length} 个 UP`, () =>
          biliApi.copyUsersToTag(id, batch),
        );
        entry.mids = [...new Set([...entry.mids, ...batch])];
        save();
      } catch (err) {
        fail(`「${group.tagName}」加人`, err);
      }
    }
    for (const batch of chunk(group.remove, BATCH_SIZE)) {
      try {
        await write(`「${group.tagName}」移出 ${batch.length} 个 UP`, () =>
          biliApi.removeUsersFromTag(id, batch),
        );
        const removed = new Set(batch);
        entry.mids = entry.mids.filter((mid) => !removed.has(mid));
        save();
      } catch (err) {
        fail(`「${group.tagName}」移人`, err);
      }
    }
  }
}

export async function startFollowTagSync(planId: string): Promise<void> {
  if (status.state === "running") throw new Error("同步正在进行中");
  const plan = pendingPlan;
  if (!plan || plan.planId !== planId) {
    throw new Error("预览已过期，请重新预览");
  }
  pendingPlan = null;
  cancelRequested = false;
  status = {
    state: "running",
    done: 0,
    total: plan.writeRequests,
    message: "准备同步…",
    errors: [],
  };

  void runPlan(plan)
    .then(() => {
      status = {
        ...status,
        state: "done",
        done: status.total,
        message:
          status.errors.length > 0
            ? `同步完成，有 ${status.errors.length} 项失败`
            : "同步完成",
      };
    })
    .catch((err: unknown) => {
      if (err instanceof CancelledError) {
        status = {
          ...status,
          state: "cancelled",
          message: "已停止，已完成的部分会保留，重新预览会从剩下的继续",
        };
        return;
      }
      status = {
        ...status,
        state: "failed",
        message: isRiskError(err)
          ? "触发 B 站风控，已自动停止。建议隔一段时间再重新预览，会从剩下的部分继续"
          : `同步中断：${err instanceof Error ? err.message : String(err)}`,
      };
    });
}

export function getFollowTagSyncStatus(): FollowTagSyncStatus {
  return status;
}

export function cancelFollowTagSync(): void {
  if (status.state === "running") cancelRequested = true;
}
