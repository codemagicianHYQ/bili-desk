import type {
  AbnormalFollowingRecord,
  IntegrityScanProgress,
  IntegrityScanResult,
  IntegrityScanScope,
  InvalidVideoRecord,
  InvalidVideoSource,
} from "@shared/types";
import { appStore } from "../store/app-store";
import { localToViewRepo } from "../db/repositories/local-toview";
import { biliApi } from "./bili-api";
import { isLoggedIn } from "../store/app-store";

type VideoMetaCache = Record<
  string,
  {
    title: string;
    cover: string;
    upperMid: number;
    upperName: string;
    updatedAt: number;
  }
>;

function readMetaCache(): VideoMetaCache {
  const raw = appStore.get("videoMetaCache");
  return raw && typeof raw === "object" ? (raw as VideoMetaCache) : {};
}

function writeMetaCache(cache: VideoMetaCache): void {
  appStore.set("videoMetaCache", cache);
}

function rememberMeta(input: {
  bvid: string;
  title: string;
  cover: string;
  upperMid: number;
  upperName: string;
}): void {
  if (!input.bvid) return;
  if (isPlaceholderTitle(input.title)) return;
  const cache = readMetaCache();
  cache[input.bvid] = {
    title: input.title,
    cover: input.cover,
    upperMid: input.upperMid,
    upperName: input.upperName,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  writeMetaCache(cache);
}

export function isPlaceholderTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  return (
    t === "已失效视频" ||
    t.includes("已失效") ||
    t.includes("视频不见了") ||
    t.includes("内容已失效")
  );
}

/** 收藏夹 medias[].attr：1 其他原因失效，9 UP 删除；不要把 attr!==0 一律当失效 */
export function isInvalidFavAttr(attr: number): boolean {
  return attr === 1 || attr === 9;
}

export function favInvalidReason(attr: number, title: string): string {
  if (attr === 9) return "UP 主已删除";
  if (attr === 1) return "稿件已下架/失效";
  if (isPlaceholderTitle(title)) return "标题显示为已失效";
  return "稿件不可用";
}

function resolveTitle(
  bvid: string,
  currentTitle: string,
): { title: string; titlePlaceholder: boolean } {
  if (!isPlaceholderTitle(currentTitle)) {
    return { title: currentTitle, titlePlaceholder: false };
  }
  const cached = readMetaCache()[bvid];
  if (cached?.title && !isPlaceholderTitle(cached.title)) {
    return { title: cached.title, titlePlaceholder: false };
  }
  return {
    title: currentTitle.trim() || "已失效视频",
    titlePlaceholder: true,
  };
}

function videoKey(
  source: InvalidVideoSource,
  aid: number,
  bvid: string,
): string {
  return `${source}:${aid || bvid || "0"}`;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onItem?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        done += 1;
        onItem?.(done, items.length);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function emitProgress(
  onProgress: ((p: IntegrityScanProgress) => void) | undefined,
  patch: IntegrityScanProgress,
): void {
  onProgress?.(patch);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildResult(
  invalidVideos: InvalidVideoRecord[],
  abnormalFollowings: AbnormalFollowingRecord[],
  scannedAt: number,
  warnings: string[],
): IntegrityScanResult {
  return {
    invalidVideos,
    abnormalFollowings,
    scannedAt,
    stats: {
      invalidFavorites: invalidVideos.filter((v) => v.source === "favorite")
        .length,
      invalidToView: invalidVideos.filter(
        (v) => v.source === "toview" || v.source === "toview-local",
      ).length,
      abnormalFollowings: abnormalFollowings.length,
    },
    warnings: warnings.length > 0 ? warnings.slice(0, 30) : undefined,
  };
}

function readStoredVideos(): InvalidVideoRecord[] {
  return (appStore.get("invalidVideos") ?? []) as InvalidVideoRecord[];
}

function readStoredFollowings(): AbnormalFollowingRecord[] {
  return (appStore.get("abnormalFollowings") ??
    []) as AbnormalFollowingRecord[];
}

async function scanFavorites(
  onProgress?: (p: IntegrityScanProgress) => void,
): Promise<{ items: InvalidVideoRecord[]; warnings: string[] }> {
  const items: InvalidVideoRecord[] = [];
  const warnings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  emitProgress(onProgress, {
    phase: "favorites",
    message: "正在扫描收藏夹…",
    current: 0,
    total: 0,
  });

  const folders = await biliApi.getFavFolders();
  let folderIndex = 0;
  for (const folder of folders) {
    folderIndex += 1;
    emitProgress(onProgress, {
      phase: "favorites",
      message: `扫描收藏夹「${folder.title}」(${folderIndex}/${folders.length})`,
      current: folderIndex,
      total: folders.length,
    });

    let medias: Record<string, unknown>[] = [];
    try {
      medias = await biliApi.getAllFavMediaRawInFolder(folder.id, {
        soft: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`跳过收藏夹「${folder.title}」：${msg}`);
      await sleep(800);
      continue;
    }

    if (medias.length === 0 && Number(folder.mediaCount) > 0) {
      warnings.push(
        `收藏夹「${folder.title}」有 ${folder.mediaCount} 条但本次未拉到列表（可能风控），已跳过`,
      );
    }

    for (const media of medias) {
      const bvid = String(media.bvid ?? media.bv_id ?? "");
      const aid = Number(media.id) || 0;
      const title = String(media.title ?? "");
      const cover = String(media.cover ?? "");
      const upper = (media.upper as { mid?: number; name?: string }) ?? {};
      const upperMid = Number(upper.mid) || 0;
      const upperName = String(upper.name ?? "");
      const attr = Number(media.attr) || 0;

      if (!isInvalidFavAttr(attr) && !isPlaceholderTitle(title)) {
        rememberMeta({ bvid, title, cover, upperMid, upperName });
        continue;
      }

      const resolved = resolveTitle(bvid, title);
      const cached = readMetaCache()[bvid];
      items.push({
        id: videoKey("favorite", aid, bvid),
        source: "favorite",
        aid,
        bvid,
        title: resolved.title,
        titlePlaceholder: resolved.titlePlaceholder,
        cover: cover || cached?.cover || "",
        upperMid: upperMid || cached?.upperMid || 0,
        upperName: upperName || cached?.upperName || "未知 UP",
        folderId: folder.id,
        folderTitle: folder.title,
        reason: favInvalidReason(attr, title),
        attr,
        detectedAt: now,
      });
    }

    await sleep(450);
  }

  return { items, warnings };
}

async function scanToView(
  onProgress?: (p: IntegrityScanProgress) => void,
): Promise<{ items: InvalidVideoRecord[]; warnings: string[] }> {
  const items: InvalidVideoRecord[] = [];
  const warnings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  emitProgress(onProgress, {
    phase: "toview",
    message: "正在扫描稍后再看…",
    current: 0,
    total: 1,
  });

  try {
    const toview = await biliApi.getToViewListDetailed();
    for (const item of toview) {
      if (!item.invalid) {
        rememberMeta({
          bvid: item.bvid,
          title: item.title,
          cover: item.cover,
          upperMid: item.owner.mid,
          upperName: item.owner.name,
        });
        continue;
      }
      const resolved = resolveTitle(item.bvid, item.title);
      const cached = readMetaCache()[item.bvid];
      items.push({
        id: videoKey("toview", item.aid, item.bvid),
        source: "toview",
        aid: item.aid,
        bvid: item.bvid,
        title: resolved.title,
        titlePlaceholder: resolved.titlePlaceholder,
        cover: item.cover || cached?.cover || "",
        upperMid: item.owner.mid || cached?.upperMid || 0,
        upperName: item.owner.name || cached?.upperName || "未知 UP",
        reason: item.reason || "稍后再看中已失效",
        detectedAt: now,
      });
    }
  } catch (err) {
    warnings.push(
      `稍后再看扫描失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  for (const item of localToViewRepo.list()) {
    if (!isPlaceholderTitle(item.title)) {
      rememberMeta({
        bvid: item.bvid,
        title: item.title,
        cover: item.cover,
        upperMid: item.owner.mid,
        upperName: item.owner.name,
      });
      continue;
    }
    const resolved = resolveTitle(item.bvid, item.title);
    items.push({
      id: videoKey("toview-local", item.aid, item.bvid),
      source: "toview-local",
      aid: item.aid,
      bvid: item.bvid,
      title: resolved.title,
      titlePlaceholder: resolved.titlePlaceholder,
      cover: item.cover,
      upperMid: item.owner.mid,
      upperName: item.owner.name || "未知 UP",
      reason: "本地稍后再看标记为失效",
      detectedAt: now,
    });
  }

  emitProgress(onProgress, {
    phase: "toview",
    message: "稍后再看扫描完成",
    current: 1,
    total: 1,
  });

  return { items, warnings };
}

async function scanFollowing(
  onProgress?: (p: IntegrityScanProgress) => void,
): Promise<{ items: AbnormalFollowingRecord[]; warnings: string[] }> {
  const items: AbnormalFollowingRecord[] = [];
  const warnings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  emitProgress(onProgress, {
    phase: "following",
    message: "正在拉取关注列表…",
    current: 0,
    total: 0,
  });

  let followings: Awaited<ReturnType<typeof biliApi.getAllFollowings>> = [];
  try {
    followings = await biliApi.getAllFollowings();
  } catch (err) {
    warnings.push(
      `关注列表拉取失败：${err instanceof Error ? err.message : String(err)}`,
    );
    return { items, warnings };
  }

  if (followings.length === 0) {
    return { items, warnings };
  }

  emitProgress(onProgress, {
    phase: "following",
    message: `正在检测关注 UP 状态（共 ${followings.length}）…`,
    current: 0,
    total: followings.length,
  });

  await mapPool(
    followings,
    3,
    async (up) => {
      try {
        const status = await biliApi.getUserAccountStatus(up.mid);
        if (status.silence || status.deleted || status.unavailable) {
          items.push({
            mid: up.mid,
            name: status.name || up.uname,
            face: status.face || up.face,
            sign: up.sign,
            reason: status.deleted
              ? "deleted"
              : status.silence
                ? "silenced"
                : "unavailable",
            reasonText: status.deleted
              ? "账号已注销/不存在"
              : status.silence
                ? "账号被封禁"
                : "空间不可用",
            detectedAt: now,
          });
        }
      } catch {
        // 单条失败不中断
      }
      await sleep(220);
      return null;
    },
    (done, total) => {
      emitProgress(onProgress, {
        phase: "following",
        message: `检测关注 UP ${done}/${total}`,
        current: done,
        total,
      });
    },
  );

  return { items, warnings };
}

function dedupeVideos(list: InvalidVideoRecord[]): InvalidVideoRecord[] {
  const seen = new Set<string>();
  const out: InvalidVideoRecord[] = [];
  for (const item of list) {
    const key = item.bvid || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** 按分类单独扫描，只更新对应归档，不影响其它 Tab */
export async function runIntegrityScan(
  scope: IntegrityScanScope = "favorites",
  onProgress?: (p: IntegrityScanProgress) => void,
): Promise<IntegrityScanResult> {
  if (!isLoggedIn()) throw new Error("请先登录后再扫描");

  const now = Math.floor(Date.now() / 1000);
  let warnings: string[] = [];
  let invalidVideos = readStoredVideos();
  let abnormalFollowings = readStoredFollowings();

  if (scope === "favorites") {
    const result = await scanFavorites(onProgress);
    warnings = result.warnings;
    const kept = invalidVideos.filter((v) => v.source !== "favorite");
    invalidVideos = dedupeVideos([...result.items, ...kept]);
  } else if (scope === "toview") {
    const result = await scanToView(onProgress);
    warnings = result.warnings;
    const kept = invalidVideos.filter(
      (v) => v.source !== "toview" && v.source !== "toview-local",
    );
    invalidVideos = dedupeVideos([...result.items, ...kept]);
  } else {
    const result = await scanFollowing(onProgress);
    warnings = result.warnings;
    abnormalFollowings = result.items;
  }

  appStore.set("invalidVideos", invalidVideos);
  appStore.set("abnormalFollowings", abnormalFollowings);
  appStore.set("lastIntegrityScanAt", now);

  emitProgress(onProgress, {
    phase: "done",
    message: "扫描完成",
    current: 1,
    total: 1,
  });

  return buildResult(invalidVideos, abnormalFollowings, now, warnings);
}

export function getIntegrityArchive(): IntegrityScanResult {
  const invalidVideos = readStoredVideos();
  const abnormalFollowings = readStoredFollowings();
  const scannedAt = Number(appStore.get("lastIntegrityScanAt") ?? 0) || 0;
  return buildResult(invalidVideos, abnormalFollowings, scannedAt, []);
}

export function dismissInvalidVideo(id: string): IntegrityScanResult {
  const list = readStoredVideos().filter((item) => item.id !== id);
  appStore.set("invalidVideos", list);
  return getIntegrityArchive();
}

export function dismissAbnormalFollowing(mid: number): IntegrityScanResult {
  const list = readStoredFollowings().filter((item) => item.mid !== mid);
  appStore.set("abnormalFollowings", list);
  return getIntegrityArchive();
}

export function clearIntegrityArchive(
  scope?: IntegrityScanScope,
): IntegrityScanResult {
  if (!scope) {
    appStore.set("invalidVideos", []);
    appStore.set("abnormalFollowings", []);
    return getIntegrityArchive();
  }
  if (scope === "favorites") {
    appStore.set(
      "invalidVideos",
      readStoredVideos().filter((v) => v.source !== "favorite"),
    );
  } else if (scope === "toview") {
    appStore.set(
      "invalidVideos",
      readStoredVideos().filter(
        (v) => v.source !== "toview" && v.source !== "toview-local",
      ),
    );
  } else {
    appStore.set("abnormalFollowings", []);
  }
  return getIntegrityArchive();
}
