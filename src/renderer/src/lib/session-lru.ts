const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** 写入后最长存活，对标 HTTP Cache-Control max-age / Caffeine expireAfterWrite */
export const SESSION_TTL_MS = 6 * HOUR;
/** 一直不访问则提前淘汰，对标 Caffeine expireAfterAccess */
export const SESSION_IDLE_MS = 90 * MINUTE;
/** 主动过期扫描间隔，对标 Redis active expire，避免过期条目占着内存直到下次 get */
export const SESSION_SWEEP_MS = 5 * MINUTE;

export interface TtlLruCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  prune(now?: number): number;
  size(): number;
  keys(): string[];
  forEach(fn: (value: T, key: string) => void): void;
}

interface CacheRecord<T> {
  value: T;
  createdAt: number;
  lastAccessAt: number;
}

type Sweepable = {
  prune: (now?: number) => number;
  clear: () => void;
};

const registry: Sweepable[] = [];
const extraSweepHooks: Array<() => void> = [];
let janitorTimer: number | null = null;
let hiddenAt: number | null = null;

function isExpired(entry: CacheRecord<unknown>, now: number, ttlMs: number, idleMs: number) {
  if (now - entry.createdAt > ttlMs) return true;
  if (idleMs > 0 && now - entry.lastAccessAt > idleMs) return true;
  return false;
}

export function createTtlLruCache<T>(options: {
  maxSize: number;
  ttlMs?: number;
  idleMs?: number;
}): TtlLruCache<T> {
  const maxSize = Math.max(1, options.maxSize);
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const idleMs = options.idleMs ?? SESSION_IDLE_MS;
  const map = new Map<string, CacheRecord<T>>();

  const cache: TtlLruCache<T> = {
    get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      const now = Date.now();
      if (isExpired(entry, now, ttlMs, idleMs)) {
        map.delete(key);
        return undefined;
      }
      entry.lastAccessAt = now;
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      const now = Date.now();
      if (map.has(key)) map.delete(key);
      map.set(key, {
        value,
        createdAt: now,
        lastAccessAt: now,
      });
      cache.prune(now);
      while (map.size > maxSize) {
        const oldest = map.keys().next().value;
        if (oldest == null) break;
        map.delete(oldest);
      }
    },
    delete(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    prune(now = Date.now()) {
      let removed = 0;
      for (const [key, entry] of map) {
        if (isExpired(entry, now, ttlMs, idleMs)) {
          map.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    size() {
      return map.size;
    },
    keys() {
      return [...map.keys()];
    },
    forEach(fn) {
      for (const [key, entry] of map) fn(entry.value, key);
    },
  };

  registry.push(cache);
  return cache;
}

export function onSessionCacheSweep(hook: () => void) {
  extraSweepHooks.push(hook);
}

export function pruneAllSessionCaches(): number {
  const now = Date.now();
  let removed = 0;
  for (const cache of registry) removed += cache.prune(now);
  for (const hook of extraSweepHooks) hook();
  return removed;
}

export function clearAllSessionCaches() {
  for (const cache of registry) cache.clear();
}

export function startSessionCacheJanitor() {
  if (typeof window === "undefined" || janitorTimer != null) return;

  janitorTimer = window.setInterval(() => {
    pruneAllSessionCaches();
  }, SESSION_SWEEP_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const awayMs = hiddenAt == null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (awayMs >= SESSION_TTL_MS) {
      clearAllSessionCaches();
      return;
    }
    pruneAllSessionCaches();
  });
}
