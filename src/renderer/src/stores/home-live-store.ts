import { create } from "zustand";
import type { LiveRoomItem } from "@shared/types";

/** 防止无限滚动在异常 hasMore 下把堆内存撑爆 */
const MAX_LIVE_ROOMS = 96;
const MAX_LIVE_PAGES = 8;

interface HomeLiveState {
  rooms: LiveRoomItem[];
  following: LiveRoomItem[];
  followingCount: number;
  page: number;
  hasMore: boolean;
  hydrated: boolean;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string;
  followingError: string;
  fetchInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

function mergeRooms(
  prev: LiveRoomItem[],
  next: LiveRoomItem[],
): LiveRoomItem[] {
  const seen = new Set(prev.map((item) => item.roomId));
  const merged = [...prev];
  for (const item of next) {
    if (seen.has(item.roomId)) continue;
    seen.add(item.roomId);
    merged.push(item);
  }
  return merged;
}

export const useHomeLiveStore = create<HomeLiveState>((set, get) => ({
  rooms: [],
  following: [],
  followingCount: 0,
  page: 1,
  hasMore: true,
  hydrated: false,
  loading: false,
  loadingMore: false,
  refreshing: false,
  error: "",
  followingError: "",

  fetchInitial: async () => {
    const { hydrated, loading, rooms } = get();
    if (loading) return;
    // 已有推荐数据则跳过；若曾失败留下空列表，允许再拉
    if (hydrated && rooms.length > 0) return;

    set({ loading: true, error: "", followingError: "" });

    const recommendPromise = window.biliDesk.bili
      .getLiveRecommend(1)
      .catch((err: unknown) => {
        set({
          error: err instanceof Error ? err.message : "加载直播推荐失败",
        });
        return { rooms: [] as LiveRoomItem[], page: 1, hasMore: false };
      });

    const followingPromise = window.biliDesk.bili
      .getFollowingLives()
      .catch((err: unknown) => {
        set({
          followingError:
            err instanceof Error ? err.message : "关注直播加载失败",
        });
        return { rooms: [] as LiveRoomItem[], count: 0 };
      });

    const [recommend, following] = await Promise.all([
      recommendPromise,
      followingPromise,
    ]);

    set({
      rooms: recommend.rooms,
      page: recommend.page,
      hasMore: recommend.hasMore && recommend.rooms.length < MAX_LIVE_ROOMS,
      following: following.rooms,
      followingCount: following.count,
      hydrated: true,
      loading: false,
    });
  },

  loadMore: async () => {
    const { hasMore, loadingMore, loading, refreshing, page, rooms } = get();
    if (!hasMore || loadingMore || loading || refreshing) return;
    if (page >= MAX_LIVE_PAGES || rooms.length >= MAX_LIVE_ROOMS) {
      set({ hasMore: false });
      return;
    }

    set({ loadingMore: true, error: "" });
    try {
      const nextPage = page + 1;
      const result = await window.biliDesk.bili.getLiveRecommend(nextPage);
      const merged = mergeRooms(rooms, result.rooms);
      const added = merged.length - rooms.length;
      const capped = merged.slice(0, MAX_LIVE_ROOMS);
      set({
        rooms: capped,
        page: nextPage,
        hasMore:
          result.hasMore &&
          added > 0 &&
          nextPage < MAX_LIVE_PAGES &&
          capped.length < MAX_LIVE_ROOMS,
        loadingMore: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "加载更多失败",
        hasMore: false,
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
      followingError: "",
      page: 1,
      hasMore: true,
    });

    const recommendPromise = window.biliDesk.bili
      .getLiveRecommend(1)
      .catch((err: unknown) => {
        set({
          error: err instanceof Error ? err.message : "刷新直播推荐失败",
        });
        return null;
      });

    const followingPromise = window.biliDesk.bili
      .getFollowingLives()
      .catch((err: unknown) => {
        set({
          followingError:
            err instanceof Error ? err.message : "关注直播加载失败",
        });
        return null;
      });

    const [recommend, following] = await Promise.all([
      recommendPromise,
      followingPromise,
    ]);

    set({
      ...(recommend
        ? {
            rooms: recommend.rooms,
            page: recommend.page,
            hasMore:
              recommend.hasMore && recommend.rooms.length < MAX_LIVE_ROOMS,
          }
        : { hasMore: false }),
      ...(following
        ? {
            following: following.rooms,
            followingCount: following.count,
          }
        : {}),
      hydrated: true,
      refreshing: false,
    });
  },
}));
