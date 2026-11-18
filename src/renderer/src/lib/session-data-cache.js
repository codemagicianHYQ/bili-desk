import { createTtlLruCache, SESSION_IDLE_MS, SESSION_TTL_MS, } from "@/lib/session-lru";
const MINUTE = 60 * 1000;
/** 列表类：6h 绝对过期 + 90min 空闲淘汰 + 条数上限 */
export const folderListCache = createTtlLruCache({
    maxSize: 24,
    ttlMs: SESSION_TTL_MS,
    idleMs: SESSION_IDLE_MS,
});
export const tagListCache = createTtlLruCache({
    maxSize: 16,
    ttlMs: SESSION_TTL_MS,
    idleMs: SESSION_IDLE_MS,
});
export const videoDetailCache = createTtlLruCache({
    maxSize: 40,
    ttlMs: SESSION_TTL_MS,
    idleMs: SESSION_IDLE_MS,
});
export const upProfileCache = createTtlLruCache({
    maxSize: 40,
    ttlMs: SESSION_TTL_MS,
    idleMs: SESSION_IDLE_MS,
});
export const upRelationCache = createTtlLruCache({
    maxSize: 40,
    ttlMs: SESSION_TTL_MS,
    idleMs: SESSION_IDLE_MS,
});
export const upSpaceCache = createTtlLruCache({
    maxSize: 16,
    ttlMs: SESSION_TTL_MS,
    idleMs: SESSION_IDLE_MS,
});
/** 评论 / 动态更易变，短 TTL，但仍走统一清扫 */
export const commentsCache = createTtlLruCache({
    maxSize: 20,
    ttlMs: 15 * MINUTE,
    idleMs: 15 * MINUTE,
});
export const dynamicsTabCache = createTtlLruCache({
    maxSize: 4,
    ttlMs: 10 * MINUTE,
    idleMs: 10 * MINUTE,
});
export const dynamicsLiveCache = createTtlLruCache({
    maxSize: 1,
    ttlMs: 3 * MINUTE,
    idleMs: 3 * MINUTE,
});
export function commentsCacheKey(aid, sort) {
    return `main:${aid}:${sort}`;
}
export function upVideosCacheKey(order, page, specialType = "") {
    const special = specialType.trim();
    return special ? `${order}:${page}:s:${special}` : `${order}:${page}`;
}
