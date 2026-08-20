import type {
  CommentItem,
  FavResource,
  FollowingUp,
  LiveRoomItem,
  SpaceDynamicItem,
  UpProfile,
  UpRelation,
  UpVideosOrder,
  VideoDetail,
  VideoItem,
} from "@shared/types";
import {
  createTtlLruCache,
  SESSION_IDLE_MS,
  SESSION_TTL_MS,
} from "@/lib/session-lru";

const MINUTE = 60 * 1000;

export interface FolderListCache {
  resources: FavResource[];
  page: number;
  hasMore: boolean;
}

export interface TagListCache {
  followings: FollowingUp[];
  page: number;
  hasMore: boolean;
}

export interface CommentsListCache {
  comments: CommentItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface UpVideosPageCache {
  videos: VideoItem[];
  page: number;
  total: number;
  hasMore: boolean;
}

export interface UpSpaceCache {
  profile: UpProfile;
  relation: UpRelation | null;
  videos: Record<string, UpVideosPageCache>;
}

export interface DynamicsTabCache {
  items: SpaceDynamicItem[];
  offset: string;
  hasMore: boolean;
  emptyFilterPages: number;
}

/** 列表类：6h 绝对过期 + 90min 空闲淘汰 + 条数上限 */
export const folderListCache = createTtlLruCache<FolderListCache>({
  maxSize: 24,
  ttlMs: SESSION_TTL_MS,
  idleMs: SESSION_IDLE_MS,
});

export const tagListCache = createTtlLruCache<TagListCache>({
  maxSize: 16,
  ttlMs: SESSION_TTL_MS,
  idleMs: SESSION_IDLE_MS,
});

export const videoDetailCache = createTtlLruCache<VideoDetail>({
  maxSize: 40,
  ttlMs: SESSION_TTL_MS,
  idleMs: SESSION_IDLE_MS,
});

export const upProfileCache = createTtlLruCache<UpProfile>({
  maxSize: 40,
  ttlMs: SESSION_TTL_MS,
  idleMs: SESSION_IDLE_MS,
});

export const upRelationCache = createTtlLruCache<UpRelation>({
  maxSize: 40,
  ttlMs: SESSION_TTL_MS,
  idleMs: SESSION_IDLE_MS,
});

export const upSpaceCache = createTtlLruCache<UpSpaceCache>({
  maxSize: 16,
  ttlMs: SESSION_TTL_MS,
  idleMs: SESSION_IDLE_MS,
});

/** 评论 / 动态更易变，短 TTL，但仍走统一清扫 */
export const commentsCache = createTtlLruCache<CommentsListCache>({
  maxSize: 20,
  ttlMs: 15 * MINUTE,
  idleMs: 15 * MINUTE,
});

export const dynamicsTabCache = createTtlLruCache<DynamicsTabCache>({
  maxSize: 4,
  ttlMs: 10 * MINUTE,
  idleMs: 10 * MINUTE,
});

export const dynamicsLiveCache = createTtlLruCache<{
  rooms: LiveRoomItem[];
  count: number;
}>({
  maxSize: 1,
  ttlMs: 3 * MINUTE,
  idleMs: 3 * MINUTE,
});

export function commentsCacheKey(aid: number, sort: number): string {
  return `${aid}:${sort}`;
}

export function upVideosCacheKey(
  order: UpVideosOrder,
  page: number,
): string {
  return `${order}:${page}`;
}
