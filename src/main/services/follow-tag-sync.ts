import type {
  FollowTag,
  FollowTagSyncGroupPlan,
  FollowTagSyncPlan,
  FollowTagSyncStatus,
} from "@shared/types";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { biliApi } from "./bili-api";

/**
 * 不再新建 B 站分组（数量上限约 30）。
 * 用本地分类结果，把还在「默认分组」或还没进对应官方组的 UP，
 * 慢速 copy 进名字能对上的现有 B 站分组。
 */

interface InternalGroupPlan extends FollowTagSyncGroupPlan {
  add: number[];
}

interface InternalPlan {
  planId: string;
  groups: InternalGroupPlan[];
  writeRequests: number;
}

const BATCH_SIZE = 20;
/** 比之前更慢，整理几千人时更不容易撞风控 */
const WRITE_GAP_MIN_MS = 2800;
const WRITE_GAP_JITTER_MS = 1800;
const READ_GAP_MS = 900;

/** 本地一级 / 二级名 → 常见 B 站分组名（按你账号里已有的来） */
const NAME_ALIASES: Record<string, string[]> = {
  ai: ["ai", "人工智能", "AIvideo"],
  人工智能: ["ai", "AIvideo", "人工智能"],
  前端: ["前端开发", "前端"],
  前端开发: ["前端开发", "前端"],
  计算机: ["计算机", "计算机考研", "硬核科技"],
  科技: ["硬核科技", "科技测评", "科技"],
  科普: ["硬核科技", "科技测评", "科普"],
  数码: ["科技测评", "硬核科技", "数码"],
  测评: ["科技测评"],
  生活: ["生活"],
  美食: ["美食"],
  游戏: ["游戏"],
  影视: ["影视"],
  音乐: ["音乐"],
  学习: ["学习", "数学", "计算机考研"],
  数学: ["数学"],
  人文社科: ["历史人文", "社科"],
  历史: ["历史人文"],
  社科: ["社科"],
  财经商业: ["股票投资", "商业", "经济学", "行业研究"],
  股票: ["股票投资"],
  商业: ["商业"],
  经济: ["经济学"],
  运动健身: ["运动着装", "自行车"],
  骑行: ["自行车"],
  自行车: ["自行车"],
  技能: ["兴趣技能", "摄影"],
  摄影: ["摄影"],
  健康: ["健康"],
  汽车: ["汽车"],
  旅游: ["旅游", "旅行户外"],
  旅行: ["旅游"],
  艺术: ["艺术"],
  嵌入式: ["嵌入式"],
  海外: ["海外博主"],
};

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

function isRiskError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /安全策略|频繁|风控|-412|412/.test(message);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

function scoreTagName(tagName: string, l1: string, l2: string): number {
  const tag = normalize(tagName);
  const a = normalize(l1);
  const b = normalize(l2);
  if (!tag) return 0;
  if (b && tag === b) return 100;
  if (a && tag === a) return 85;
  if (b && (tag.includes(b) || b.includes(tag))) return 70;
  if (a && (tag.includes(a) || a.includes(tag))) return 55;

  let best = 0;
  for (const key of [l1, l2]) {
    const aliases = NAME_ALIASES[key] ?? NAME_ALIASES[normalize(key)] ?? [];
    for (const alias of aliases) {
      if (normalize(alias) === tag) best = Math.max(best, 90);
      else if (tag.includes(normalize(alias)) || normalize(alias).includes(tag))
        best = Math.max(best, 65);
    }
  }
  return best;
}

function pickTagForPath(
  l1: string,
  l2: string,
  tags: FollowTag[],
): FollowTag | null {
  let best: FollowTag | null = null;
  let bestScore = 0;
  for (const tag of tags) {
    const score = scoreTagName(tag.name, l1, l2);
    if (score > bestScore) {
      bestScore = score;
      best = tag;
    }
  }
  return bestScore >= 55 ? best : null;
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
  if (status.state === "running") throw new Error("整理正在进行中");

  const warnings: string[] = [];
  const officialTags = await biliApi.getFollowTags();
  const customTags = officialTags.filter((tag) => tag.tagId > 0);
  if (customTags.length === 0) {
    throw new Error("B 站还没有自定义分组，请先在 B 站或本应用里建几个分组");
  }

  const followed = new Set(followedMids);
  const leaves = taxonomyRepo.getUpSyncLeaves();
  const targetByTag = new Map<number, Set<number>>();
  let unmatchedLocal = 0;
  let skippedUnfollowed = 0;

  for (const leaf of leaves) {
    const l1 = leaf.l1Name;
    const l2 = leaf.l2Name ?? leaf.l1Name;
    const tag = pickTagForPath(l1, l2, customTags);
    if (!tag) {
      unmatchedLocal += leaf.mids.length;
      continue;
    }
    let bucket = targetByTag.get(tag.tagId);
    if (!bucket) {
      bucket = new Set();
      targetByTag.set(tag.tagId, bucket);
    }
    for (const mid of leaf.mids) {
      if (!followed.has(mid)) {
        skippedUnfollowed += 1;
        continue;
      }
      bucket.add(mid);
    }
  }

  if (unmatchedLocal > 0) {
    warnings.push(
      `有约 ${unmatchedLocal} 位本地已分类的 UP，对不上现有 B 站分组名，不会强行挪动（例如本地很细、B 站没有对应夹）`,
    );
  }
  warnings.push(
    "不会新建 / 删除 / 改名 B 站分组，只把人加进名字能对上的现有分组；原来所在的其它分组会保留",
  );
  warnings.push(
    "请求间隔约 3～5 秒，人多时会跑比较久；触发风控会自动停，重新预览会跳过已进组的人",
  );

  status = {
    state: "idle",
    done: 0,
    total: 0,
    message: "正在读取现有 B 站分组成员…",
    errors: [],
  };

  const groups: InternalGroupPlan[] = [];
  for (const tag of customTags) {
    const wanted = targetByTag.get(tag.tagId);
    if (!wanted || wanted.size === 0) continue;

    await sleep(READ_GAP_MS);
    const current = await readAllMidsInTag(tag.tagId);
    const currentSet = new Set(current);
    const add = [...wanted].filter((mid) => !currentSet.has(mid));
    if (add.length === 0) continue;

    groups.push({
      groupId: tag.tagId,
      tagName: tag.name,
      action: "fill",
      tagId: tag.tagId,
      total: wanted.size,
      addCount: add.length,
      removeCount: 0,
      add,
    });
  }

  const writeRequests = groups.reduce(
    (sum, group) => sum + Math.ceil(group.add.length / BATCH_SIZE),
    0,
  );

  const planId = `${Date.now()}`;
  pendingPlan = { planId, groups, writeRequests };

  if (groups.length === 0) {
    warnings.push("没有需要加入现有分组的 UP，可能已经整理过了");
  }

  return {
    planId,
    groups: groups.map(({ add, ...rest }) => rest),
    deleteTags: [],
    skippedUnfollowed,
    writeRequests,
    estimatedSeconds: Math.ceil(
      (writeRequests * (WRITE_GAP_MIN_MS + WRITE_GAP_JITTER_MS / 2)) / 1000,
    ),
    warnings,
  };
}

async function runPlan(plan: InternalPlan): Promise<void> {
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

  for (const group of plan.groups) {
    const tagId = group.tagId;
    if (tagId == null) continue;
    for (const batch of chunk(group.add, BATCH_SIZE)) {
      try {
        await write(`「${group.tagName}」加入 ${batch.length} 个 UP`, () =>
          biliApi.copyUsersToTag(tagId, batch),
        );
      } catch (err) {
        if (isRiskError(err) || err instanceof CancelledError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        status = {
          ...status,
          errors: [...status.errors, `「${group.tagName}」加人：${message}`],
        };
      }
    }
  }
}

export async function startFollowTagSync(planId: string): Promise<void> {
  if (status.state === "running") throw new Error("整理正在进行中");
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
    message: "准备整理…",
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
            ? `整理完成，有 ${status.errors.length} 项失败`
            : "整理完成",
      };
    })
    .catch((err: unknown) => {
      if (err instanceof CancelledError) {
        status = {
          ...status,
          state: "cancelled",
          message: "已停止，已经加进分组的会保留；重新预览会从剩下的继续",
        };
        return;
      }
      status = {
        ...status,
        state: "failed",
        message: isRiskError(err)
          ? "触发 B 站风控，已自动停止。隔几分钟再重新预览，会跳过已经进组的人"
          : `整理中断：${err instanceof Error ? err.message : String(err)}`,
      };
    });
}

export function getFollowTagSyncStatus(): FollowTagSyncStatus {
  return status;
}

export function cancelFollowTagSync(): void {
  cancelRequested = true;
}
