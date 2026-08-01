import { create } from "zustand";
import type { VideoItem } from "@shared/types";

/** 防止推荐无限滚动把堆内存撑爆（首页常挂载 + Zustand 跨路由不清空） */
const MAX_FEED_VIDEOS = 240;
const MAX_FEED_PAGES = 20;

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
}

function mergeVideos(prev: VideoItem[], next: VideoItem[]): VideoItem[] {
  const seen = new Set(prev.map((item) => item.bvid));
  const merged = [...prev];
  for (const item of next) {
    if (seen.has(item.bvid)) continue;
    seen.add(item.bvid);
    merged.push(item);
  }
  return merged;
}

export const useHomeFeedStore = create<HomeFeedState>((set, get) => ({
  videos: [],
  freshIdx: 1,
  pageCount: 0,
  hasMore: true,
  hydrated: false,
  loading: false,
  loadingMore: false,
  refreshing: false,
  error: "",

  fetchInitial: async () => {
    const { hydrated, loading } = get();
    if (hydrated || loading) return;

    set({ loading: true, error: "" });
    try {
      const page = await window.biliDesk.bili.getRecommend({
        freshIdx: 1,
        freshIdx1h: 1,
      });
      const videos = page.videos.slice(0, MAX_FEED_VIDEOS);
      set({
        videos,
        freshIdx: page.freshIdx,
        pageCount: 1,
        hasMore:
          page.hasMore && videos.length > 0 && videos.length < MAX_FEED_VIDEOS,
        hydrated: true,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "加载推荐失败",
        loading: false,
      });
    }
  },

  loadMore: async () => {
    const {
      hasMore,
      loadingMore,
      loading,
      refreshing,
      freshIdx,
      videos,
      pageCount,
    } = get();
    if (!hasMore || loadingMore || loading || refreshing) return;
    if (pageCount >= MAX_FEED_PAGES || videos.length >= MAX_FEED_VIDEOS) {
      set({ hasMore: false });
      return;
    }

    set({ loadingMore: true, error: "" });
    try {
      const page = await window.biliDesk.bili.getRecommend({
        freshIdx,
        freshIdx1h: freshIdx,
      });
      const merged = mergeVideos(videos, page.videos);
      const added = merged.length - videos.length;
      const capped = merged.slice(0, MAX_FEED_VIDEOS);
      const nextPageCount = pageCount + 1;
      set({
        videos: capped,
        freshIdx: page.freshIdx,
        pageCount: nextPageCount,
        hasMore:
          page.hasMore &&
          added > 0 &&
          nextPageCount < MAX_FEED_PAGES &&
          capped.length < MAX_FEED_VIDEOS,
        loadingMore: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "加载更多失败",
        loadingMore: false,
      });
    }
  },

  refresh: async () => {
    const { refreshing } = get();
    if (refreshing) return;

    set({
      refreshing: true,
      error: "",
      videos: [],
      freshIdx: 1,
      pageCount: 0,
      hasMore: true,
    });

    try {
      const page = await window.biliDesk.bili.getRecommend({
        freshIdx: 1,
        freshIdx1h: 1,
      });
      const videos = page.videos.slice(0, MAX_FEED_VIDEOS);
      set({
        videos,
        freshIdx: page.freshIdx,
        pageCount: 1,
        hasMore:
          page.hasMore && videos.length > 0 && videos.length < MAX_FEED_VIDEOS,
        hydrated: true,
        refreshing: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "刷新失败",
        refreshing: false,
      });
    }
  },
}));
