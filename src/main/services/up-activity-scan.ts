import type {
  UpActivityArchive,
  UpActivityRecord,
  UpActivityScanProgress,
} from "@shared/types";
import { appStore, isLoggedIn } from "../store/app-store";
import { biliApi } from "./bili-api";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitProgress(
  onProgress: ((p: UpActivityScanProgress) => void) | undefined,
  patch: UpActivityScanProgress,
): void {
  onProgress?.(patch);
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

function readArchive(): UpActivityRecord[] {
  const raw = appStore.get("upActivityCache");
  return Array.isArray(raw) ? (raw as UpActivityRecord[]) : [];
}

export function getUpActivityArchive(): UpActivityArchive {
  return {
    items: readArchive(),
    scannedAt: Number(appStore.get("lastUpActivityScanAt") ?? 0) || 0,
  };
}

/** 扫描全部关注 UP 的最新稿件时间 + 最新动态时间 */
export async function runUpActivityScan(
  onProgress?: (p: UpActivityScanProgress) => void,
): Promise<UpActivityArchive> {
  if (!isLoggedIn()) throw new Error("请先登录后再扫描");

  const warnings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  emitProgress(onProgress, {
    phase: "followings",
    message: "正在拉取关注列表…",
    current: 0,
    total: 0,
  });

  const followings = await biliApi.getAllFollowings();
  if (followings.length === 0) {
    appStore.set("upActivityCache", []);
    appStore.set("lastUpActivityScanAt", now);
    return { items: [], scannedAt: now };
  }

  emitProgress(onProgress, {
    phase: "activity",
    message: `正在检测活跃度（共 ${followings.length} 位）…`,
    current: 0,
    total: followings.length,
  });

  const items = await mapPool(
    followings,
    3,
    async (up) => {
      const base: UpActivityRecord = {
        mid: up.mid,
        name: up.uname,
        face: up.face,
        sign: up.sign,
        latestVideoAt: 0,
        latestVideoTitle: "",
        latestVideoBvid: "",
        latestDynamicAt: 0,
        latestDynamicText: "",
        latestDynamicId: "",
        scannedAt: now,
      };
      try {
        const activity = await biliApi.getUpLatestActivity(up.mid);
        Object.assign(base, activity);
      } catch (err) {
        base.error = err instanceof Error ? err.message : String(err);
        if (warnings.length < 20) {
          warnings.push(`${up.uname || up.mid}：${base.error}`);
        }
      }
      await sleep(260);
      return base;
    },
    (done, total) => {
      emitProgress(onProgress, {
        phase: "activity",
        message: `检测活跃度 ${done}/${total}`,
        current: done,
        total,
      });
    },
  );

  // 按综合最新时间降序存一份，方便默认展示
  items.sort((a, b) => {
    const aMax = Math.max(a.latestVideoAt, a.latestDynamicAt);
    const bMax = Math.max(b.latestVideoAt, b.latestDynamicAt);
    return bMax - aMax;
  });

  appStore.set("upActivityCache", items);
  appStore.set("lastUpActivityScanAt", now);

  emitProgress(onProgress, {
    phase: "done",
    message: "扫描完成",
    current: 1,
    total: 1,
  });

  return {
    items,
    scannedAt: now,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function clearUpActivityArchive(): UpActivityArchive {
  appStore.set("upActivityCache", []);
  appStore.set("lastUpActivityScanAt", 0);
  return getUpActivityArchive();
}

/** 取关/拉黑后从本地缓存剔除，避免再进页面又冒出来 */
export function removeUpActivityRecords(mids: number[]): UpActivityArchive {
  const midSet = new Set(
    mids.map((m) => Number(m)).filter((m) => Number.isFinite(m) && m > 0),
  );
  if (midSet.size === 0) return getUpActivityArchive();

  const next = readArchive().filter((item) => !midSet.has(item.mid));
  appStore.set("upActivityCache", next);
  return {
    items: next,
    scannedAt: Number(appStore.get("lastUpActivityScanAt") ?? 0) || 0,
  };
}
