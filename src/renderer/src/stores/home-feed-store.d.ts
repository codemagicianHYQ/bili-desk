import type { RecommendDislikeReason, VideoItem } from "@shared/types";
interface HomeFeedState {
    videos: VideoItem[];
    freshIdx: number;
    pageCount: number;
    hasMore: boolean;
    hydrated: boolean;
    loading: boolean;
    loadingMore: boolean;
    refreshing: boolean;
    error: string;
    fetchInitial: () => Promise<void>;
    loadMore: () => Promise<void>;
    refresh: () => Promise<void>;
    /** 先本地移除再上报；返回给用户看的提示 */
    dislike: (video: VideoItem, reason: RecommendDislikeReason) => Promise<string>;
}
export declare const useHomeFeedStore: import("zustand").UseBoundStore<import("zustand").StoreApi<HomeFeedState>>;
export {};
