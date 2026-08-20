import type { FavFolder, FavResource } from "@shared/types";
import { taxonomyRepo } from "../db/repositories/taxonomy";
import { biliApi } from "./bili-api";
import {
  buildFavClassifyText,
  classifyFavoriteItemsAsync,
  isDumpFolderTitle,
  listDuplicateGeneratedFolderTitles,
  resolveBiliOrganizeFolderTitle,
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

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const BILI_FOLDER_SOFT_CAP = 98;
const BILI_FOLDER_MEDIA_CAP = 990;
const MOVE_CHUNK = 40;
const ORGANIZE_BATCH_SIZE = 100;
const ORGANIZE_SCAN_CAP = 120;
const DELAY_AFTER_MOVE_MS = 1800;
const DELAY_AFTER_CREATE_MS = 1400;
const DELAY_BETWEEN_SOURCE_FOLDERS_MS = 900;
const DELAY_BETWEEN_LIST_PAGES_MS = 800;
const DELAY_PER_ITEM_FALLBACK_MS = 900;
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
    return "请求太密，被 B 站风控拦了。请先停 2～3 分钟，不要连点整理，已经搬走的会留在新夹里";
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
): FavFolder[] {
  const dumps = folders
    .filter((folder) => isDumpFolderTitle(folder.title))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  const duplicateTitles = new Set(listDuplicateGeneratedFolderTitles(folders));
  const duplicates = folders.filter((folder) =>
    duplicateTitles.has(folder.title),
  );
  const defaults = folders.filter(
    (folder) => folder.id === defaultFolder.id || folder.isDefault,
  );
  const seen = new Set<number>();
  const ordered: FavFolder[] = [];
  for (const folder of [...dumps, ...duplicates, ...defaults]) {
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    ordered.push(folder);
  }
  return ordered;
}

function capGroupedItems<T>(
  groups: Map<string, T[]>,
  maxItems: number,
): Map<string, T[]> {
  const capped = new Map<string, T[]>();
  let left = maxItems;
  for (const [title, items] of groups) {
    if (left <= 0) break;
    const slice = items.slice(0, left);
    capped.set(title, slice);
    left -= slice.length;
  }
  return capped;
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

  startOrganizeBiliFolders(): number {
    const task = taxonomyRepo.createTask("fav_organize_bili");
    void this.runOrganizeBiliFolders(task.id);
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

  private async runOrganizeBiliFolders(taskId: number): Promise<void> {
    const report = createTaskReporter(taskId);

    try {
      report({
        status: "running",
        progress: 0,
        message: "正在获取 B 站收藏夹列表...",
      });

      const folders = await biliApi.getFavFolders();
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
        progress: 5,
        message: `每次只整理约 ${ORGANIZE_BATCH_SIZE} 条，先处理「其他」再处理默认夹...`,
      });

      const sourceFolders = pickOrganizeSources(folders, defaultFolder);
      const sourceTotal = sourceFolders.reduce(
        (sum, folder) => sum + folder.mediaCount,
        0,
      );

      const movable: Array<FavResource & { sourceFolderId: number }> = [];
      const seenAids = new Set<number>();

      for (
        let sourceIndex = 0;
        sourceIndex < sourceFolders.length &&
        movable.length < ORGANIZE_SCAN_CAP;
        sourceIndex++
      ) {
        const source = sourceFolders[sourceIndex];
        let page = 1;
        while (movable.length < ORGANIZE_SCAN_CAP) {
          const result = await biliApi.getFavResources(
            source.id,
            page,
            40,
            "long",
          );
          for (const item of result.resources) {
            if (item.id <= 0 || seenAids.has(item.id)) continue;
            seenAids.add(item.id);
            movable.push({ ...item, sourceFolderId: source.id });
            if (movable.length >= ORGANIZE_SCAN_CAP) break;
          }
          report({
            progress: Math.min(
              18,
              Math.round(5 + (movable.length / ORGANIZE_SCAN_CAP) * 13),
            ),
            message: `本批已拉取「${source.title}」${movable.length}/${ORGANIZE_SCAN_CAP} 条...`,
          });
          await yieldToEventLoop();
          if (!result.hasMore || movable.length >= ORGANIZE_SCAN_CAP) break;
          page += 1;
          await sleepJitter(DELAY_BETWEEN_LIST_PAGES_MS);
        }

        if (
          sourceIndex < sourceFolders.length - 1 &&
          movable.length < ORGANIZE_SCAN_CAP
        ) {
          await sleepJitter(DELAY_BETWEEN_SOURCE_FOLDERS_MS);
        }
      }

      if (movable.length === 0) {
        report({
          status: "done",
          progress: 100,
          message: "默认收藏夹和「其他」里没有可整理的视频",
        });
        return;
      }

      report({
        progress: 20,
        message: `本批扫描 ${movable.length} 条，正在按标题、简介和 UP 归类...`,
      });

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
        if (bestCount >= 1 && bestCount === total) return bestName;
        if (bestCount >= 2 && bestCount * 2 >= total) return bestName;
        return null;
      };

      const groups = new Map<
        string,
        Array<FavResource & { sourceFolderId: number }>
      >();
      const unmatched: Array<FavResource & { sourceFolderId: number }> = [];
      let skippedUnmatched = 0;

      const assignItem = (
        item: FavResource & { sourceFolderId: number },
        targetTitle: string,
      ) => {
        const sourceTitle =
          folders.find((folder) => folder.id === item.sourceFolderId)?.title ??
          "";
        if (sourceTitle === targetTitle) return;
        addMidVote(item.upper.mid, targetTitle);
        const list = groups.get(targetTitle);
        if (list) list.push(item);
        else groups.set(targetTitle, [item]);
      };

      for (const item of movable) {
        const targetTitle = resolveBiliOrganizeFolderTitle(
          buildFavClassifyText(item),
          userFolderTitles,
        );
        if (!targetTitle || isDumpFolderTitle(targetTitle)) {
          unmatched.push(item);
          continue;
        }
        assignItem(item, targetTitle);
      }

      for (const item of unmatched) {
        const voted = majorityFolderForMid(item.upper.mid);
        if (voted && !isDumpFolderTitle(voted)) {
          assignItem(item, voted);
          continue;
        }

        const upMatch = item.upper.name
          ? classifyUpText(item.upper.name)
          : null;
        if (upMatch) {
          const fromUp = resolveBiliOrganizeFolderTitle(
            `${item.title}\n${upMatch.l1} ${upMatch.l2 ?? ""}\n${item.upper.name}`,
            userFolderTitles,
          );
          if (fromUp && !isDumpFolderTitle(fromUp)) {
            assignItem(item, fromUp);
            continue;
          }
          const created = upMatch.l2
            ? `${upMatch.l1}-${upMatch.l2}`
            : upMatch.l1;
          assignItem(item, created.slice(0, 20));
          continue;
        }

        skippedUnmatched += 1;
      }

      const queuedMoves = [...groups.values()].reduce(
        (sum, items) => sum + items.length,
        0,
      );
      if (queuedMoves > ORGANIZE_BATCH_SIZE) {
        const capped = capGroupedItems(groups, ORGANIZE_BATCH_SIZE);
        groups.clear();
        for (const [title, items] of capped) {
          groups.set(title, items);
        }
      }

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

      const neededTitles = [...groups.keys()].filter(
        (title) => title !== defaultFolder.title && !isDumpFolderTitle(title),
      );

      report({
        progress: 28,
        message: `准备 ${neededTitles.length} 个目标收藏夹...`,
      });

      const allocateByCapacity = async (
        baseTitle: string,
        startFolder: FavFolder,
        aids: number[],
      ): Promise<Array<{ folder: FavFolder; aids: number[] }>> => {
        const uniqueAids = [...new Set(aids)];
        const batches: Array<{ folder: FavFolder; aids: number[] }> = [];
        let index = 1;
        let folder = startFolder;
        let room = Math.max(0, BILI_FOLDER_MEDIA_CAP - folder.mediaCount);
        let bucket: number[] = [];

        const flush = () => {
          if (bucket.length === 0) return;
          batches.push({ folder, aids: bucket });
          folder = {
            ...folder,
            mediaCount: folder.mediaCount + bucket.length,
          };
          folderByTitle.set(folder.title, folder);
          bucket = [];
        };

        const advance = async () => {
          flush();
          for (let guard = 0; guard < 20; guard++) {
            index += 1;
            const nextTitle = numberedFavTitle(baseTitle, index);
            const nextFolder = await ensureFolder(nextTitle, {
              splitOverflow: true,
            });
            if (!nextFolder) continue;
            folder = nextFolder;
            room = Math.max(0, BILI_FOLDER_MEDIA_CAP - folder.mediaCount);
            if (room > 0) return;
          }
          throw new Error("FAV_FOLDER_FULL");
        };

        for (const aid of uniqueAids) {
          if (room <= 0) await advance();
          bucket.push(aid);
          room -= 1;
        }
        flush();
        return batches;
      };

      const moveJobs: Array<{
        folder: FavFolder;
        aids: number[];
        sourceId: number;
      }> = [];
      for (let index = 0; index < neededTitles.length; index++) {
        const title = neededTitles[index];
        const itemsInGroup = groups.get(title) ?? [];
        report({
          progress: Math.round(
            28 + ((index + 1) / Math.max(neededTitles.length, 1)) * 17,
          ),
          message: `正在准备收藏夹「${title}」(${index + 1}/${neededTitles.length})...`,
        });

        const target = await ensureFolder(title);
        if (!target || target.id === defaultFolder.id) {
          skippedUnmatched += itemsInGroup.length;
          continue;
        }

        const bySource = new Map<number, number[]>();
        for (const item of itemsInGroup) {
          const aids = bySource.get(item.sourceFolderId) ?? [];
          aids.push(item.id);
          bySource.set(item.sourceFolderId, aids);
        }

        for (const [sourceId, aids] of bySource) {
          if (sourceId === target.id) continue;
          const batches = await allocateByCapacity(target.title, target, aids);
          for (const batch of batches) {
            moveJobs.push({ ...batch, sourceId });
          }
        }
        await yieldToEventLoop();
      }

      const totalMoves = moveJobs.reduce(
        (sum, job) => sum + job.aids.length,
        0,
      );
      if (totalMoves === 0) {
        report({
          status: "done",
          progress: 100,
          message:
            skippedUnmatched > 0
              ? `本批扫描了 ${movable.length} 条，暂时没有能搬走的（${skippedUnmatched} 条对不上）。隔几分钟再点一次会扫下一批`
              : "默认收藏夹和「其他」里没有可整理的视频",
        });
        return;
      }

      let movedSoFar = 0;
      let splitHint = false;
      try {
        for (const job of moveJobs) {
          let currentFolder = job.folder;
          const { base, index: startIndex } = parseFavTitleIndex(
            currentFolder.title,
          );
          let splitIndex = startIndex;
          const uniqueAids = [...new Set(job.aids)];
          let offset = 0;
          let splitAttempts = 0;

          while (offset < uniqueAids.length) {
            const chunk = uniqueAids.slice(offset, offset + MOVE_CHUNK);
            report({
              progress: Math.min(
                96,
                Math.round(45 + (movedSoFar / totalMoves) * 51),
              ),
              message: `正在移入「${currentFolder.title}」${movedSoFar + chunk.length}/${totalMoves}...`,
            });

            try {
              await this.moveAidsBestEffort(
                job.sourceId,
                currentFolder.id,
                chunk,
                onRiskWait,
              );
              currentFolder.mediaCount += chunk.length;
              folderByTitle.set(currentFolder.title, currentFolder);
              movedCount += chunk.length;
              movedSoFar += chunk.length;
              offset += chunk.length;
              splitAttempts = 0;
              await sleepJitter(DELAY_AFTER_MOVE_MS);
            } catch (error) {
              if (!isFavFolderFullError(error)) throw error;
              splitAttempts += 1;
              if (splitAttempts > 15) throw error;

              splitIndex += 1;
              splitHint = true;
              const nextFolder = await ensureFolder(
                numberedFavTitle(base, splitIndex),
                { splitOverflow: true },
              );
              if (!nextFolder) throw error;
              currentFolder = nextFolder;
              report({
                message: `「${base}」已满，自动拆到「${currentFolder.title}」接着搬...`,
              });
            }
          }
        }
      } catch (error) {
        if (movedCount > 0 && isRetryableFavWrite(error)) {
          report({
            status: "done",
            progress: 100,
            message: `已整理 ${movedCount} 个视频后被风控打断。请停 2～3 分钟再点一次，会继续整理下一批`,
          });
          return;
        }
        throw error;
      }

      const remain = Math.max(0, sourceTotal - movedCount);
      const leftoverHint =
        skippedUnmatched > 0
          ? `，另有 ${skippedUnmatched} 个对不上先留在原夹`
          : "";
      const overflowHint =
        overflowCount > 0 ? "，收藏夹数量不够用的先留在原夹" : "";
      const splitText = splitHint ? "，超过 1000 条的分类已拆到带编号的夹" : "";
      const nextHint =
        remain > 0
          ? `。源夹大约还剩 ${remain} 个，隔几分钟再点一次继续，每次约 ${ORGANIZE_BATCH_SIZE} 条`
          : "";
      report({
        status: "done",
        progress: 100,
        message: `本批已整理 ${movedCount} 个视频，新建 ${createdCount} 个收藏夹${overflowHint}${splitText}${leftoverHint}${nextHint}`,
      });
    } catch (error) {
      report({
        status: "failed",
        progress: 100,
        message: formatFavTaskError(error, "整理 B 站收藏夹失败"),
      });
    }
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
