import type { CommentItem, FavResource, FollowingUp, LiveRoomItem, SpaceDynamicItem, UpProfile, UpRelation, UpVideoSpecial, UpVideosOrder, VideoDetail, VideoItem } from "@shared/types";
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
    nextOffset?: string;
}
export interface UpVideosPageCache {
    videos: VideoItem[];
    page: number;
    total: number;
    hasMore: boolean;
    specials?: UpVideoSpecial[];
    specialsKnown?: boolean;
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
export declare const folderListCache: import("@/lib/session-lru").TtlLruCache<FolderListCache>;
export declare const tagListCache: import("@/lib/session-lru").TtlLruCache<TagListCache>;
export declare const videoDetailCache: import("@/lib/session-lru").TtlLruCache<VideoDetail>;
export declare const upProfileCache: import("@/lib/session-lru").TtlLruCache<UpProfile>;
export declare const upRelationCache: import("@/lib/session-lru").TtlLruCache<UpRelation>;
export declare const upSpaceCache: import("@/lib/session-lru").TtlLruCache<UpSpaceCache>;
/** 评论 / 动态更易变，短 TTL，但仍走统一清扫 */
export declare const commentsCache: import("@/lib/session-lru").TtlLruCache<CommentsListCache>;
export declare const dynamicsTabCache: import("@/lib/session-lru").TtlLruCache<DynamicsTabCache>;
export declare const dynamicsLiveCache: import("@/lib/session-lru").TtlLruCache<{
    rooms: LiveRoomItem[];
    count: number;
}>;
export declare function commentsCacheKey(aid: number, sort: number): string;
export declare function upVideosCacheKey(order: UpVideosOrder, page: number, specialType?: string): string;
