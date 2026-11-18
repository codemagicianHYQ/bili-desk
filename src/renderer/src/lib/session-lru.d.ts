/** 写入后最长存活，对标 HTTP Cache-Control max-age / Caffeine expireAfterWrite */
export declare const SESSION_TTL_MS: number;
/** 一直不访问则提前淘汰，对标 Caffeine expireAfterAccess */
export declare const SESSION_IDLE_MS: number;
/** 主动过期扫描间隔，对标 Redis active expire，避免过期条目占着内存直到下次 get */
export declare const SESSION_SWEEP_MS: number;
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
export declare function createTtlLruCache<T>(options: {
    maxSize: number;
    ttlMs?: number;
    idleMs?: number;
}): TtlLruCache<T>;
export declare function onSessionCacheSweep(hook: () => void): void;
export declare function pruneAllSessionCaches(): number;
export declare function clearAllSessionCaches(): void;
export declare function startSessionCacheJanitor(): void;
