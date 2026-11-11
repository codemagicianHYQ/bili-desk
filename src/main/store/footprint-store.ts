import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { FootprintItem, FootprintKind, FootprintListQuery } from "@shared/types";

export interface FootprintFile {
  uid: number;
  items: FootprintItem[];
  syncedAt: number | null;
  replyPn: number;
  replyDone: boolean;
  dmPn: number;
  dmDone: boolean;
}

const FLUSH_DELAY_MS = 800;
const cache = new Map<number, FootprintFile>();
const dirty = new Set<number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function dirPath(): string {
  return path.join(app.getPath("userData"), "footprint");
}

function filePath(uid: number): string {
  return path.join(dirPath(), `${uid}.json`);
}

function emptyFile(uid: number): FootprintFile {
  return {
    uid,
    items: [],
    syncedAt: null,
    replyPn: 1,
    replyDone: false,
    dmPn: 1,
    dmDone: false,
  };
}

function ensureDir(): void {
  const dir = dirPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFromDisk(uid: number): FootprintFile {
  try {
    const raw = fs.readFileSync(filePath(uid), "utf8");
    const parsed = JSON.parse(raw) as Partial<FootprintFile>;
    const base = emptyFile(uid);
    return {
      ...base,
      ...parsed,
      uid,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      syncedAt:
        typeof parsed.syncedAt === "number" ? parsed.syncedAt : null,
      replyPn: Math.max(1, Number(parsed.replyPn) || 1),
      replyDone: Boolean(parsed.replyDone),
      dmPn: Math.max(1, Number(parsed.dmPn) || 1),
      dmDone: Boolean(parsed.dmDone),
    };
  } catch {
    return emptyFile(uid);
  }
}

function writeToDisk(uid: number, data: FootprintFile): void {
  ensureDir();
  const tmp = `${filePath(uid)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, filePath(uid));
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushFootprintStore();
  }, FLUSH_DELAY_MS);
}

export function flushFootprintStore(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const uid of [...dirty]) {
    const data = cache.get(uid);
    if (!data) {
      dirty.delete(uid);
      continue;
    }
    try {
      writeToDisk(uid, data);
      dirty.delete(uid);
    } catch (error) {
      console.error("[footprint] flush failed", error);
    }
  }
}

export function loadFootprint(uid: number): FootprintFile {
  const hit = cache.get(uid);
  if (hit) return hit;
  const data = readFromDisk(uid);
  cache.set(uid, data);
  return data;
}

function markDirty(uid: number): void {
  dirty.add(uid);
  scheduleFlush();
}

export function upsertFootprintItems(
  uid: number,
  incoming: FootprintItem[],
): number {
  if (incoming.length === 0) return 0;
  const data = loadFootprint(uid);
  const map = new Map(data.items.map((item) => [item.id, item]));
  let added = 0;
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      added += 1;
      continue;
    }
    // 本地即时记录优先保留 bvid；AICU 补全其它字段
    map.set(item.id, {
      ...prev,
      ...item,
      bvid: item.bvid || prev.bvid,
      source: prev.source === "local" ? "local" : item.source,
      text: item.text || prev.text,
    });
  }
  data.items = [...map.values()].sort((a, b) => b.time - a.time);
  markDirty(uid);
  return added;
}

export function setFootprintSyncCursor(
  uid: number,
  patch: Partial<
    Pick<
      FootprintFile,
      "replyPn" | "replyDone" | "dmPn" | "dmDone" | "syncedAt"
    >
  >,
): void {
  const data = loadFootprint(uid);
  Object.assign(data, patch);
  markDirty(uid);
}

export function resetFootprintSyncCursors(uid: number): void {
  setFootprintSyncCursor(uid, {
    replyPn: 1,
    replyDone: false,
    dmPn: 1,
    dmDone: false,
  });
}

export function listFootprint(
  uid: number,
  query: FootprintListQuery,
): {
  items: FootprintItem[];
  total: number;
  syncedAt: number | null;
  hasMore: boolean;
  replyDone: boolean;
  danmakuDone: boolean;
} {
  const data = loadFootprint(uid);
  const keyword = (query.keyword ?? "").trim().toLowerCase();
  const fromTs = query.fromTs ?? 0;
  const toTs = query.toTs ?? Number.MAX_SAFE_INTEGER;
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(100, Math.max(1, query.limit ?? 40));

  const filtered = data.items.filter((item) => {
    if (item.kind !== query.kind) return false;
    if (item.time < fromTs || item.time > toTs) return false;
    if (keyword && !item.text.toLowerCase().includes(keyword)) return false;
    return true;
  });

  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    syncedAt: data.syncedAt,
    hasMore: offset + limit < filtered.length,
    replyDone: data.replyDone,
    danmakuDone: data.dmDone,
  };
}

export function countFootprintByKind(
  uid: number,
  kind: FootprintKind,
): number {
  return loadFootprint(uid).items.filter((item) => item.kind === kind).length;
}

app.on("will-quit", flushFootprintStore);
process.on("exit", flushFootprintStore);
