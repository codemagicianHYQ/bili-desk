import type { FavFolder, FavResource } from "@shared/types";
import {
  listDuplicateGeneratedFolderPairs,
  listUngroupedFavFolders,
  type FavFolderGroupOverrides,
} from "@shared/utils/fav-folder-groups";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { appStore } from "../store/app-store";
import { biliApi } from "./bili-api";
import {
  buildFavClassifyText,
  classifyFavoriteItemsAsync,
  isDumpFolderTitle,
  resolveBiliOrganizeFolderTitle,
  folderConflictsWithVideoTitle,
} from "./fav-classifier";
import { classifyUpText } from "./up-classifier";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 稍作抖动，避免固定间隔看起来像脚本打满 */
function sleepJitter(baseMs: number): Promise<void> {
  const factor = 0.8 + Math.random() * 0.45;
  return sleep(Math.round(baseMs * factor));
}

/** 规则升级后清掉旧的「对不上」名单，让 Windows 命令行这类视频能再扫一遍 */
const CLASSIFIER_RULES_VERSION = 2;

function loadOrganizeSkipAids(): Set<number> {
  const version = appStore.get("organizeSkipRulesVersion" as never) as unknown;
  if (version !== CLASSIFIER_RULES_VERSION) {
    appStore.set("organizeSkipRulesVersion" as never, CLASSIFIER_RULES_VERSION);
    appStore.set("organizeSkipAids" as never, []);
    return new Set();
  }
  const raw = appStore.get("organizeSkipAids" as never) as unknown;
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  );
}

function saveOrganizeSkipAids(aids: Set<number>) {
  appStore.set("organizeSkipAids" as never, [...aids].slice(-3000));
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const BILI_FOLDER_SOFT_CAP = 98;
const BILI_FOLDER_MEDIA_CAP = 990;
const MOVE_CHUNK = 1;
const ORGANIZE_BATCH_SIZE = 40;
/** 对不上的会跳过继续往后扫，避免每次卡在 default 最前面同一批 */
const ORGANIZE_LOOKAHEAD_CAP = 240;
const DELAY_AFTER_MOVE_MS = 3200;
const DELAY_AFTER_CREATE_MS = 2200;
const DELAY_BETWEEN_SOURCE_FOLDERS_MS = 1600;
const DELAY_BETWEEN_LIST_PAGES_MS = 1400;
const LIST_PAGE_SIZE = 20;
const DELAY_PER_ITEM_FALLBACK_MS = 1200;
/** 412 后逐步拉长等待，而不是几秒内连打 */
const RISK_BACKOFF_MS = [12_000, 30_000, 60_000, 90_000];

function isFavFolderFullError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("FAV_FOLDER_FULL") ||
    message.includes("收藏数量已达上限") ||
    message.includes("内容收藏数量")
  );
}

function isRetryableFavWrite(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("412") || message.includes("安全策略");
}

function formatFavTaskError(error: unknown, fallback: string): string {
  if (isFavFolderFullError(error)) {
    return "某个普通收藏夹满了（大约 1000 条）。请再整理一次，满了会自动拆到「原名-2」";
  }
  if (error instanceof Error && isRetryableFavWrite(error)) {
    return "请求太密，被 B 站风控拦了。请先停 3～5 分钟，不要连点整理，已经搬走的会留在新夹里";
  }
  return error instanceof Error ? error.message : fallback;
}

async function withFavWriteRetry<T>(
  fn: () => Promise<T>,
  onWait?: (waitMs: number, attempt: number) => void,
): Promise<T> {
  let lastError: unknown;
  const maxAttempts = RISK_BACKOFF_MS.length + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableFavWrite(error) || attempt === maxAttempts) throw error;
      const waitMs = RISK_BACKOFF_MS[attempt - 1] ?? 90_000;
      onWait?.(waitMs, attempt);
      await sleepJitter(waitMs);
    }
  }
  throw lastError;
}

function isIgnorableMoveError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /已经|重复|不存在|未找到/.test(message);
}

function numberedFavTitle(base: string, index: number): string {
  const normalized = base.slice(0, 20);
  if (index <= 1) return normalized;
  const suffix = `-${index}`;
  return `${normalized.slice(0, Math.max(1, 20 - suffix.length))}${suffix}`;
}

function parseFavTitleIndex(title: string): { base: string; index: number } {
  const match = title.match(/^(.*)-(\d+)$/);
  if (!match) return { base: title, index: 1 };
  return { base: match[1], index: Number(match[2]) };
}

function pickDefaultFolder(folders: FavFolder[]): FavFolder | null {
  if (folders.length === 0) return null;
  return (
    folders.find((folder) => folder.isDefault) ??
    folders.find((folder) => folder.title === "默认收藏夹") ??
    folders.find((folder) => folder.title.toLowerCase() === "default") ??
    folders[0]
  );
}

function pickOrganizeSources(
  folders: FavFolder[],
  defaultFolder: FavFolder,
  overrides: FavFolderGroupOverrides = {},
): FavFolder[] {
  const seen = new Set<number>();
  const take = (list: FavFolder[]) => {
    const ordered: FavFolder[] = [];
    for (const folder of list) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      ordered.push(folder);
    }
    return ordered;
  };

  const defaults = folders.filter(
    (folder) => folder.id === defaultFolder.id || folder.isDefault,
  );
  const ungrouped = listUngroupedFavFolders(folders, overrides).filter(
    (folder) =>
      folder.id !== defaultFolder.id &&
      !folder.isDefault &&
      !isDumpFolderTitle(folder.title),
  );
  return take([...defaults, ...ungrouped]);
}

function createTaskReporter(taskId: number) {
  let lastUpdateAt = 0;

  return (patch: {
    progress?: number;
    message?: string;
    status?: "running" | "done" | "failed";
  }) => {
    const now = Date.now();
    if (
      patch.status !== "done" &&
      patch.status !== "failed" &&
      now - lastUpdateAt < 400
    ) {
      return;
    }
    lastUpdateAt = now;
    taxonomyRepo.updateTask(taskId, patch);
  };
}

export class FavClassifyEngine {
  private organizeTaskId: number | null = null;

  startClassifyAll(): number {
    const task = taxonomyRepo.createTask("fav_classification");
    void this.runClassifyAll(task.id);
    return task.id;
  }

  startClassifyFolder(mediaId: number): number {
    const task = taxonomyRepo.createTask("fav_classification_folder");
    void this.runClassifyFolder(task.id, mediaId);
    return task.id;
  }

  startOrganizeBiliFolders(overrides: FavFolderGroupOverrides = {}): number {
    return this.startExclusiveFavTask("fav_organize_bili", (taskId) =>
      this.runOrganizeBiliFolders(taskId, overrides),
    );
  }

  startMergeDumpIntoDefault(): number {
    return this.startExclusiveFavTask("fav_merge_dump", (taskId) =>
      this.runMergeDumpIntoDefault(taskId),
    );
  }

  startMergeDuplicateTopics(): number {
    return this.startExclusiveFavTask("fav_merge_dup_topics", (taskId) =>
      this.runMergeDuplicateTopics(taskId),
    );
  }

  private startExclusiveFavTask(
    type: string,
    run: (taskId: number) => Promise<void>,
  ): number {
    if (this.organizeTaskId != null) {
      const current = taxonomyRepo.getTask(this.organizeTaskId);
      if (
        current &&
        (current.status === "pending" || current.status === "running")
      ) {
        return this.organizeTaskId;
      }
    }
    const task = taxonomyRepo.createTask(type);
    this.organizeTaskId = task.id;
    void run(task.id).finally(() => {
      if (this.organizeTaskId === task.id) this.organizeTaskId = null;
    });
    return task.id;
  }

  private async runClassifyAll(taskId: number): Promise<void> {
    const report = createTaskReporter(taskId);

    try {
      taxonomyRepo.ensureExtendedFavTaxonomy();
      report({
        status: "running",
        progress: 0,
        message: "正在获取收藏夹列表...",
      });

      const folders = await biliApi.getFavFolders();
      const seen = new Set<number>();
      const all: Awaited<
        ReturnType<typeof biliApi.getAllFavResourcesInFolder>
      > = [];
      const totalEstimate = Math.max(
        folders.reduce((sum, folder) => sum + folder.mediaCount, 0),
        1,
      );

      for (let index = 0; index < folders.length; index++) {
        const folder = folders[index];
        report({
          progress: Math.min(15, Math.round((index / folders.length) * 15)),
          message: `正在拉取「${folder.title}」(${index + 1}/${folders.length})...`,
        });

        const items = await biliApi.getAllFavResourcesInFolder(
          folder.id,
          async (fetchedInFolder) => {
            report({
              progress: Math.min(
                18,
                Math.round(
                  (15 * (all.length + fetchedInFolder)) / totalEstimate,
                ),
              ),
              message: `正在拉取「${folder.title}」已获取 ${fetchedInFolder} 条...`,
            });
            await yieldToEventLoop();
          },
        );

        for (const item of items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          all.push(item);
        }

        await yieldToEventLoop();
        if (index < folders.length - 1) {
          await sleep(500);
        }
      }

      if (all.length === 0) {
        report({
          status: "done",
          progress: 100,
          message: "暂无收藏视频可分类",
        });
        return;
      }

      report({
        progress: 20,
        message: `已获取 ${all.length} 条收藏，正在重建目录并分类...`,
      });

      const total = await classifyFavoriteItemsAsync(
        all,
        (done, totalCount) => {
          report({
            progress: Math.round(20 + (done / totalCount) * 75),
            message: `正在分类 ${done}/${totalCount}...`,
          });
        },
      );

      report({
        status: "done",
        progress: 100,
        message: `已完成 ${total} 个视频的本地分类`,
      });
    } catch (error) {
      report({
        status: "failed",
        progress: 100,
        message: formatFavTaskError(error, "收藏分类失败"),
      });
    }
  }

  private async runClassifyFolder(
    taskId: number,
    mediaId: number,
  ): Promise<void> {
    const report = createTaskReporter(taskId);

    try {
      taxonomyRepo.ensureDefaultFavTaxonomy();
      report({
        status: "running",
        progress: 5,
        message: "正在拉取当前收藏夹...",
      });

      const items = await biliApi.getAllFavResourcesInFolder(
        mediaId,
        async (fetched) => {
          report({
            progress: Math.min(
              20,
              Math.round((fetched / Math.max(fetched, 1)) * 20),
            ),
            message: `已获取 ${fetched} 条收藏...`,
          });
          await yieldToEventLoop();
        },
      );

      if (items.length === 0) {
        report({
          status: "done",
          progress: 100,
          message: "当前收藏夹没有视频",
        });
        return;
      }

      const total = await classifyFavoriteItemsAsync(
        items,
        (done, totalCount) => {
          report({
            progress: Math.round(20 + (done / totalCount) * 75),
            message: `正在分类 ${done}/${totalCount}...`,
          });
        },
        { resetCategories: false },
      );

      report({
        status: "done",
        progress: 100,
        message: `已完成 ${total} 个视频的本地分类`,
      });
    } catch (error) {
      report({
        status: "failed",
        progress: 100,
        message: formatFavTaskError(error, "收藏分类失败"),
      });
    }
  }

  private async runOrganizeBiliFolders(
    taskId: number,
    overrides: FavFolderGroupOverrides = {},
  ): Promise<void> {
    const report = createTaskReporter(taskId);

    try {
      report({
        status: "running",
        progress: 0,
        message: "正在获取 B 站收藏夹列表...",
      });

      let folders = await biliApi.getFavFolders();
      const defaultFolder = pickDefaultFolder(folders);
      if (!defaultFolder) {
        report({
          status: "failed",
          progress: 100,
          message: "请先登录后再整理收藏夹",
        });
        return;
      }

      report({
        progress: 6,
        message: `一条一条看标题并搬走，本轮最多 ${ORGANIZE_BATCH_SIZE} 条，先 default 再未分组...`,
      });

      const sourceFolders = pickOrganizeSources(
        folders,
        defaultFolder,
        overrides,
      );

      const folderByTitle = new Map(
        folders.map((folder) => [folder.title, folder]),
      );
      const userFolders = folders.filter(
        (folder) =>
          folder.id !== defaultFolder.id &&
          !folder.isDefault &&
          !isDumpFolderTitle(folder.title),
      );
      const userFolderTitles = userFolders.map((folder) => folder.title);

      const midVotes = new Map<number, Map<string, number>>();
      const addMidVote = (mid: number, folderTitle: string) => {
        if (!mid || isDumpFolderTitle(folderTitle)) return;
        let votes = midVotes.get(mid);
        if (!votes) {
          votes = new Map();
          midVotes.set(mid, votes);
        }
        votes.set(folderTitle, (votes.get(folderTitle) ?? 0) + 1);
      };

      const majorityFolderForMid = (mid: number): string | null => {
        const votes = midVotes.get(mid);
        if (!votes || votes.size === 0) return null;
        let bestName = "";
        let bestCount = 0;
        let total = 0;
        for (const [name, count] of votes) {
          total += count;
          if (count > bestCount) {
            bestCount = count;
            bestName = name;
          }
        }
        if (bestCount >= 2 && bestCount === total) return bestName;
        if (bestCount >= 2 && bestCount * 2 >= total) return bestName;
        return null;
      };

      let skippedUnmatched = 0;
      let skippedKnown = 0;
      let looked = 0;
      const seenAids = new Set<number>();
      const skipAids = loadOrganizeSkipAids();

      const onRiskWait = (waitMs: number) => {
        report({
          message: `请求有点密，暂停 ${Math.ceil(waitMs / 1000)} 秒后自动继续（已搬走的会保留）...`,
        });
      };
      let folderCount = folders.length;
      let atCap = folderCount >= BILI_FOLDER_SOFT_CAP;
      let createdCount = 0;
      let movedCount = 0;
      let overflowCount = 0;
      let splitHint = false;

      const ensureFolder = async (
        title: string,
        options?: { splitOverflow?: boolean },
      ): Promise<FavFolder | null> => {
        const hit = folderByTitle.get(title);
        if (hit) return hit;

        if (title === defaultFolder.title) return defaultFolder;

        const isSplitFolder = Boolean(
          options?.splitOverflow || /-\d+$/.test(title),
        );

        if (!isSplitFolder && (atCap || folderCount >= BILI_FOLDER_SOFT_CAP)) {
          atCap = true;
          overflowCount += 1;
          return null;
        }

        if (folderCount >= 100) {
          throw new Error("收藏夹数量已达上限");
        }

        try {
          const created = await withFavWriteRetry(
            () => biliApi.createFavFolder({ title, privacy: 0 }),
            onRiskWait,
          );
          folderByTitle.set(created.title, created);
          if (!userFolderTitles.includes(created.title)) {
            userFolderTitles.push(created.title);
          }
          folderCount += 1;
          createdCount += 1;
          await sleepJitter(DELAY_AFTER_CREATE_MS);
          return created;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("收藏夹数量")) {
            atCap = true;
            overflowCount += 1;
            return null;
          }
          throw error;
        }
      };

      const resolveTarget = (item: FavResource): string | null => {
        const targetTitle = resolveBiliOrganizeFolderTitle(
          buildFavClassifyText(item),
          userFolderTitles,
        );
        if (!targetTitle || isDumpFolderTitle(targetTitle)) return null;
        return targetTitle;
      };

      const tryResolve = (item: FavResource): string | null => {
        const fromText = resolveTarget(item);
        if (fromText) return fromText;

        const voted = majorityFolderForMid(item.upper.mid);
        if (
          voted &&
          !isDumpFolderTitle(voted) &&
          !folderConflictsWithVideoTitle(voted, item.title)
        ) {
          return voted;
        }

        const upMatch = item.upper.name
          ? classifyUpText(item.upper.name)
          : null;
        if (!upMatch) return null;
        const upFolder = (
          upMatch.l2 ? `${upMatch.l1}-${upMatch.l2}` : upMatch.l1
        ).slice(0, 20);
        if (folderConflictsWithVideoTitle(upFolder, item.title)) return null;
        const fromUp = resolveBiliOrganizeFolderTitle(
          item.title,
          userFolderTitles,
        );
        if (
          fromUp &&
          !isDumpFolderTitle(fromUp) &&
          !folderConflictsWithVideoTitle(fromUp, item.title)
        ) {
          return fromUp;
        }
        return upFolder;
      };

      const pickDestFolder = async (
        title: string,
      ): Promise<FavFolder | null> => {
        let dest = await ensureFolder(title);
        if (!dest || dest.id === defaultFolder.id) return null;
        if (dest.mediaCount >= BILI_FOLDER_MEDIA_CAP) {
          const parsed = parseFavTitleIndex(dest.title);
          dest = await ensureFolder(
            numberedFavTitle(parsed.base, parsed.index + 1),
            { splitOverflow: true },
          );
          splitHint = true;
        }
        return dest;
      };

      scan: for (
        let sourceIndex = 0;
        sourceIndex < sourceFolders.length &&
        movedCount < ORGANIZE_BATCH_SIZE &&
        looked < ORGANIZE_LOOKAHEAD_CAP;
        sourceIndex++
      ) {
        const source = sourceFolders[sourceIndex];
        let page = 1;
        while (
          movedCount < ORGANIZE_BATCH_SIZE &&
          looked < ORGANIZE_LOOKAHEAD_CAP
        ) {
          const result = await biliApi.getFavResources(
            source.id,
            page,
            LIST_PAGE_SIZE,
            "long",
          );
          for (const raw of result.resources) {
            if (movedCount >= ORGANIZE_BATCH_SIZE) break scan;
            if (looked >= ORGANIZE_LOOKAHEAD_CAP) break scan;
            if (raw.id <= 0 || seenAids.has(raw.id)) continue;
            seenAids.add(raw.id);
            if (skipAids.has(raw.id)) {
              skippedKnown += 1;
              continue;
            }

            looked += 1;
            report({
              progress: Math.min(
                96,
                Math.round(8 + (movedCount / ORGANIZE_BATCH_SIZE) * 88),
              ),
              message: `「${source.title}」看过 ${looked}，已搬走 ${movedCount}/${ORGANIZE_BATCH_SIZE}：${raw.title.slice(0, 18)}`,
            });

            const targetTitle = tryResolve(raw);
            if (!targetTitle || targetTitle === source.title) {
              if (!targetTitle) {
                skipAids.add(raw.id);
                skippedUnmatched += 1;
              }
              await yieldToEventLoop();
              continue;
            }

            try {
              const dest = await pickDestFolder(targetTitle);
              if (!dest) {
                skippedUnmatched += 1;
                await yieldToEventLoop();
                continue;
              }
              await this.moveAidsBestEffort(
                source.id,
                dest.id,
                [raw.id],
                onRiskWait,
              );
              dest.mediaCount += 1;
              folderByTitle.set(dest.title, dest);
              addMidVote(raw.upper.mid, dest.title);
              movedCount += 1;
              await sleepJitter(DELAY_AFTER_MOVE_MS);
            } catch (error) {
              if (isFavFolderFullError(error)) {
                overflowCount += 1;
                await yieldToEventLoop();
                continue;
              }
              saveOrganizeSkipAids(skipAids);
              if (movedCount > 0 && isRetryableFavWrite(error)) {
                report({
                  status: "done",
                  progress: 100,
                  message: `已一条一条搬走 ${movedCount} 个后被风控打断。请停 3～5 分钟再点一次，已搬走的会留在新夹里`,
                });
                return;
              }
              throw error;
            }
            await yieldToEventLoop();
          }

          if (!result.hasMore) break;
          page += 1;
          await sleepJitter(DELAY_BETWEEN_LIST_PAGES_MS);
        }

        if (
          sourceIndex < sourceFolders.length - 1 &&
          movedCount < ORGANIZE_BATCH_SIZE
        ) {
          await sleepJitter(DELAY_BETWEEN_SOURCE_FOLDERS_MS);
        }
      }

      saveOrganizeSkipAids(skipAids);

      if (movedCount === 0 && looked === 0 && skippedKnown === 0) {
        report({
          status: "done",
          progress: 100,
          message: "default 和未分组里没有可整理的视频",
        });
        return;
      }
      if (movedCount === 0) {
        const skipHint =
          skippedUnmatched + skippedKnown > 0
            ? `已跳过 ${skippedUnmatched + skippedKnown} 条对不上的（下次会从后面继续扫）`
            : "暂时没有能搬走的";
        report({
          status: "done",
          progress: 100,
          message: `本轮看过 ${looked} 条，${skipHint}。隔几分钟再点一次，每次最多 ${ORGANIZE_BATCH_SIZE} 条`,
        });
        return;
      }

      const leftoverHint =
        skippedUnmatched > 0
          ? `，另有 ${skippedUnmatched} 个对不上先留在原夹`
          : "";
      const overflowHint =
        overflowCount > 0 ? "，收藏夹数量不够用的先留在原夹" : "";
      const splitText = splitHint ? "，超过 1000 条的分类已拆到带编号的夹" : "";

      let deletedDump = 0;
      let defaultLeft = Math.max(0, defaultFolder.mediaCount - movedCount);
      let dumpLeft = 0;
      let ungroupedLeft = 0;
      try {
        const latest = await biliApi.getFavFolders();
        defaultLeft =
          latest.find(
            (folder) =>
              folder.id === defaultFolder.id ||
              folder.isDefault ||
              folder.title.toLowerCase() === "default" ||
              folder.title === "默认收藏夹",
          )?.mediaCount ?? defaultLeft;
        dumpLeft = latest
          .filter(
            (folder) =>
              isDumpFolderTitle(folder.title) &&
              folder.id !== defaultFolder.id &&
              !folder.isDefault,
          )
          .reduce((sum, folder) => sum + folder.mediaCount, 0);
        ungroupedLeft = listUngroupedFavFolders(latest, overrides)
          .filter(
            (folder) =>
              folder.id !== defaultFolder.id &&
              !folder.isDefault &&
              !isDumpFolderTitle(folder.title),
          )
          .reduce((sum, folder) => sum + folder.mediaCount, 0);
        for (const folder of latest) {
          if (
            folder.isDefault ||
            folder.id === defaultFolder.id ||
            !isDumpFolderTitle(folder.title) ||
            folder.mediaCount > 0
          ) {
            continue;
          }
          try {
            await withFavWriteRetry(
              () => biliApi.deleteFavFolder(folder.id),
              onRiskWait,
            );
            deletedDump += 1;
            await sleepJitter(DELAY_AFTER_CREATE_MS);
          } catch {
            // 删除失败不影响本批结果
          }
        }
      } catch {
        // 列表刷新失败就用估算
      }
      const dumpHint =
        deletedDump > 0 ? `，已删掉 ${deletedDump} 个空的「其他」夹` : "";

      const remainParts: string[] = [];
      if (defaultLeft > 0) remainParts.push(`default ${defaultLeft}`);
      if (ungroupedLeft > 0) remainParts.push(`未分组 ${ungroupedLeft}`);
      if (dumpLeft > 0) remainParts.push(`官方「其他」${dumpLeft}`);
      const nextHint =
        remainParts.length > 0
          ? `。还剩 ${remainParts.join("、")}，隔几分钟再点一次，每次最多 ${ORGANIZE_BATCH_SIZE} 条`
          : "";
      report({
        status: "done",
        progress: 100,
        message: `本轮已一条一条搬走 ${movedCount} 个视频，新建 ${createdCount} 个收藏夹${overflowHint}${splitText}${leftoverHint}${dumpHint}${nextHint}`,
      });
    } catch (error) {
      report({
        status: "failed",
        progress: 100,
        message: formatFavTaskError(error, "整理 B 站收藏夹失败"),
      });
    }
  }

  private async runMergeDumpIntoDefault(taskId: number): Promise<void> {
    const report = createTaskReporter(taskId);

    try {
      report({
        status: "running",
        progress: 0,
        message: "正在查找官方「其他」收藏夹...",
      });

      const folders = await biliApi.getFavFolders();
      const defaultFolder = pickDefaultFolder(folders);
      if (!defaultFolder) {
        report({
          status: "failed",
          progress: 100,
          message: "请先登录后再操作收藏夹",
        });
        return;
      }

      const dumps = folders.filter(
        (folder) =>
          isDumpFolderTitle(folder.title) &&
          folder.id !== defaultFolder.id &&
          !folder.isDefault,
      );
      if (dumps.length === 0) {
        report({
          status: "done",
          progress: 100,
          message: "没有名叫「其他」的收藏夹",
        });
        return;
      }

      const onRiskWait = (waitMs: number) => {
        report({
          message: `请求有点密，暂停 ${Math.ceil(waitMs / 1000)} 秒后自动继续...`,
        });
      };

      let movedCount = 0;
      let deletedCount = 0;
      const totalEstimate = Math.max(
        dumps.reduce((sum, folder) => sum + folder.mediaCount, 0),
        1,
      );

      for (const dump of dumps) {
        report({
          progress: Math.min(90, Math.round((movedCount / totalEstimate) * 80)),
          message: `正在把「${dump.title}」搬进 default...`,
        });

        const items = await biliApi.getAllFavResourcesInFolder(
          dump.id,
          (fetched) => {
            report({
              progress: Math.min(
                90,
                Math.round(((movedCount + fetched) / totalEstimate) * 80),
              ),
              message: `正在读取「${dump.title}」${fetched} 条...`,
            });
          },
        );
        const aids = [
          ...new Set(items.map((item) => item.id).filter((id) => id > 0)),
        ];

        for (let offset = 0; offset < aids.length; offset += MOVE_CHUNK) {
          const chunk = aids.slice(offset, offset + MOVE_CHUNK);
          await this.moveAidsBestEffort(
            dump.id,
            defaultFolder.id,
            chunk,
            onRiskWait,
          );
          movedCount += chunk.length;
          report({
            progress: Math.min(
              92,
              Math.round((movedCount / Math.max(aids.length, 1)) * 88),
            ),
            message: `已搬入 default ${movedCount} 条（「${dump.title}」）...`,
          });
          await sleepJitter(DELAY_AFTER_MOVE_MS);
        }

        await withFavWriteRetry(
          () => biliApi.deleteFavFolder(dump.id),
          onRiskWait,
        );
        deletedCount += 1;
        await sleepJitter(DELAY_AFTER_CREATE_MS);
      }

      report({
        status: "done",
        progress: 100,
        message: `已把 ${movedCount} 个视频从「其他」搬进 default，并删除 ${deletedCount} 个「其他」夹`,
      });
    } catch (error) {
      report({
        status: "failed",
        progress: 100,
        message: formatFavTaskError(error, "把「其他」并入 default 失败"),
      });
    }
  }

  private async runMergeDuplicateTopics(taskId: number): Promise<void> {
    const report = createTaskReporter(taskId);
    try {
      report({
        status: "running",
        progress: 0,
        message: "正在查找同主题重复收藏夹...",
      });
      const onRiskWait = (waitMs: number) => {
        report({
          message: `请求有点密，暂停 ${Math.ceil(waitMs / 1000)} 秒后自动继续...`,
        });
      };
      const result = await this.mergeDuplicateTopicFolders(report, onRiskWait);
      if (result.pairs === 0) {
        report({
          status: "done",
          progress: 100,
          message: "没有需要合并的同主题收藏夹",
        });
        return;
      }
      report({
        status: "done",
        progress: 100,
        message: `已把 ${result.moved} 个视频并入已有夹，删除 ${result.deleted} 个重复夹`,
      });
    } catch (error) {
      report({
        status: "failed",
        progress: 100,
        message: formatFavTaskError(error, "合并同主题收藏夹失败"),
      });
    }
  }

  private async mergeDuplicateTopicFolders(
    report: (patch: {
      progress?: number;
      message?: string;
      status?: "running" | "done" | "failed";
    }) => void,
    onRiskWait: (waitMs: number, attempt: number) => void,
  ): Promise<{ pairs: number; moved: number; deleted: number }> {
    const folders = await biliApi.getFavFolders();
    const pairs = listDuplicateGeneratedFolderPairs(folders);
    if (pairs.length === 0) {
      return { pairs: 0, moved: 0, deleted: 0 };
    }

    const folderByTitle = new Map(
      folders.map((folder) => [folder.title, folder]),
    );
    let moved = 0;
    let deleted = 0;
    const totalEstimate = Math.max(
      pairs.reduce((sum, pair) => {
        const src = folderByTitle.get(pair.duplicateTitle);
        return sum + (src?.mediaCount ?? 0);
      }, 0),
      1,
    );

    for (const pair of pairs) {
      const src = folderByTitle.get(pair.duplicateTitle);
      const dest = folderByTitle.get(pair.canonicalTitle);
      if (!src || !dest || src.id === dest.id) continue;

      report({
        progress: Math.min(90, Math.round((moved / totalEstimate) * 80)),
        message: `正在把「${src.title}」并入「${dest.title}」...`,
      });

      const items = await biliApi.getAllFavResourcesInFolder(
        src.id,
        (fetched) => {
          report({
            progress: Math.min(
              90,
              Math.round(((moved + fetched) / totalEstimate) * 80),
            ),
            message: `正在读取「${src.title}」${fetched} 条...`,
          });
        },
      );
      const aids = [
        ...new Set(items.map((item) => item.id).filter((id) => id > 0)),
      ];

      for (let offset = 0; offset < aids.length; offset += MOVE_CHUNK) {
        const chunk = aids.slice(offset, offset + MOVE_CHUNK);
        await this.moveAidsBestEffort(src.id, dest.id, chunk, onRiskWait);
        moved += chunk.length;
        dest.mediaCount += chunk.length;
        src.mediaCount = Math.max(0, src.mediaCount - chunk.length);
        report({
          progress: Math.min(92, Math.round((moved / totalEstimate) * 88)),
          message: `已把 ${moved} 条从「${src.title}」搬进「${dest.title}」...`,
        });
        await sleepJitter(DELAY_AFTER_MOVE_MS);
      }

      const leftover = await biliApi.getAllFavResourcesInFolder(src.id);
      const leftoverIds = [
        ...new Set(leftover.map((item) => item.id).filter((id) => id > 0)),
      ];
      if (leftoverIds.length > 0) {
        await this.moveAidsBestEffort(src.id, dest.id, leftoverIds, onRiskWait);
      }

      try {
        await withFavWriteRetry(
          () => biliApi.deleteFavFolder(src.id),
          onRiskWait,
        );
        folderByTitle.delete(src.title);
        deleted += 1;
        await sleepJitter(DELAY_AFTER_CREATE_MS);
      } catch {
        // 夹里若还剩重复收藏，删不掉也不阻断后面几对
      }
    }

    return { pairs: pairs.length, moved, deleted };
  }

  private async moveAidsBestEffort(
    srcMediaId: number,
    tarMediaId: number,
    aids: number[],
    onRiskWait?: (waitMs: number, attempt: number) => void,
  ): Promise<void> {
    try {
      await withFavWriteRetry(
        () => biliApi.moveFavResources(srcMediaId, tarMediaId, aids),
        onRiskWait,
      );
    } catch (error) {
      if (isFavFolderFullError(error)) throw error;
      // 412 后再逐条打只会更密，直接停，交给上层长间隔重试/收尾
      if (isRetryableFavWrite(error)) throw error;
      if (aids.length === 1 && isIgnorableMoveError(error)) return;
      if (aids.length <= 1) throw error;

      for (const aid of aids) {
        try {
          await withFavWriteRetry(
            () => biliApi.moveFavResources(srcMediaId, tarMediaId, [aid]),
            onRiskWait,
          );
        } catch (itemError) {
          if (isIgnorableMoveError(itemError)) continue;
          throw itemError;
        }
        await sleepJitter(DELAY_PER_ITEM_FALLBACK_MS);
      }
    }
  }
}

export const favClassifyEngine = new FavClassifyEngine();
