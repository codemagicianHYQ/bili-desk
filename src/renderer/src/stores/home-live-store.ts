import { create } from "zustand";
import type { LiveRoomItem } from "@shared/types";
import { useFollowingStore } from "@/stores/following-store";

/** 防止无限滚动在异常 hasMore 下把堆内存撑爆 */
const MAX_LIVE_ROOMS = 96;
const MAX_LIVE_PAGES = 24;
/** 过滤已关注后若本页为空，最多连翻几页补发现流 */
const SKIP_EMPTY_PAGES = 4;

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

/** 推荐区去掉已关注 UP（含完整关注列表 + 正在直播），避免整页都是已关注 */
function excludeFollowingRooms(
  rooms: LiveRoomItem[],
  followingLive: LiveRoomItem[],
): LiveRoomItem[] {
  const roomIds = new Set(followingLive.map((item) => item.roomId));
  const uids = new Set<number>();
  for (const item of followingLive) {
    if (item.uid > 0) uids.add(item.uid);
  }
  const allFollowings = useFollowingStore.getState().allFollowings;
  if (allFollowings) {
    for (const up of allFollowings) {
      if (up.mid > 0) uids.add(up.mid);
    }
  }
  if (roomIds.size === 0 && uids.size === 0) return rooms;
  return rooms.filter((room) => {
    if (roomIds.has(room.roomId)) return false;
    if (room.uid > 0 && uids.has(room.uid)) return false;
    return true;
  });
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

    // 先尽量拉齐关注列表，推荐区才能正确剔除已关注
    await useFollowingStore
      .getState()
      .ensureAllFollowings()
      .catch(() => []);

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

    let page = recommend.page;
    let hasMore = recommend.hasMore;
    let recRooms = excludeFollowingRooms(recommend.rooms, following.rooms);

    // 首页若几乎全被关注过滤掉，继续往后翻几页补发现内容
    let skips = 0;
    while (
      recRooms.length < 12 &&
      hasMore &&
      page < MAX_LIVE_PAGES &&
      skips < SKIP_EMPTY_PAGES
    ) {
      skips += 1;
      try {
        const next = await window.biliDesk.bili.getLiveRecommend(page + 1);
        page = next.page;
        hasMore = next.hasMore;
        recRooms = mergeRooms(
          recRooms,
          excludeFollowingRooms(next.rooms, following.rooms),
        );
        if (next.rooms.length === 0) {
          hasMore = false;
          break;
        }
      } catch {
        hasMore = false;
        break;
      }
    }

    set({
      rooms: recRooms.slice(0, MAX_LIVE_ROOMS),
      page,
      hasMore: hasMore && recRooms.length < MAX_LIVE_ROOMS,
      following: following.rooms,
      followingCount: following.count,
      hydrated: true,
      loading: false,
    });
  },

  loadMore: async () => {
    const {
      hasMore,
      loadingMore,
      loading,
      refreshing,
      page,
      rooms,
      following,
    } = get();
    if (!hasMore || loadingMore || loading || refreshing) return;
    if (page >= MAX_LIVE_PAGES || rooms.length >= MAX_LIVE_ROOMS) {
      set({ hasMore: false });
      return;
    }

    set({ loadingMore: true, error: "" });
    try {
      let currentPage = page;
      let currentRooms = rooms;
      let apiHasMore = true;
      let added = 0;
      let attempts = 0;

      while (
        attempts < SKIP_EMPTY_PAGES &&
        currentPage < MAX_LIVE_PAGES &&
        currentRooms.length < MAX_LIVE_ROOMS
      ) {
        attempts += 1;
        const nextPage = currentPage + 1;
        const result = await window.biliDesk.bili.getLiveRecommend(nextPage);
        currentPage = nextPage;
        apiHasMore = result.hasMore;
        const filtered = excludeFollowingRooms(result.rooms, following);
        const merged = mergeRooms(currentRooms, filtered);
        added = merged.length - currentRooms.length;
        currentRooms = merged.slice(0, MAX_LIVE_ROOMS);
        if (added > 0 || result.rooms.length === 0 || !result.hasMore) {
          if (result.rooms.length === 0) apiHasMore = false;
          break;
        }
      }

      set({
        rooms: currentRooms,
        page: currentPage,
        hasMore:
          apiHasMore &&
          added > 0 &&
          currentPage < MAX_LIVE_PAGES &&
          currentRooms.length < MAX_LIVE_ROOMS,
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

    await useFollowingStore
      .getState()
      .ensureAllFollowings()
      .catch(() => []);

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

    const followingRooms = following?.rooms ?? get().following;

    if (!recommend) {
      set({
        ...(following
          ? {
              following: following.rooms,
              followingCount: following.count,
            }
          : {}),
        hasMore: false,
        hydrated: true,
        refreshing: false,
      });
      return;
    }

    let page = recommend.page;
    let hasMore = recommend.hasMore;
    let recRooms = excludeFollowingRooms(recommend.rooms, followingRooms);

    let skips = 0;
    while (
      recRooms.length < 12 &&
      hasMore &&
      page < MAX_LIVE_PAGES &&
      skips < SKIP_EMPTY_PAGES
    ) {
      skips += 1;
      try {
        const next = await window.biliDesk.bili.getLiveRecommend(page + 1);
        page = next.page;
        hasMore = next.hasMore;
        recRooms = mergeRooms(
          recRooms,
          excludeFollowingRooms(next.rooms, followingRooms),
        );
        if (next.rooms.length === 0) {
          hasMore = false;
          break;
        }
      } catch {
        hasMore = false;
        break;
      }
    }

    set({
      rooms: recRooms.slice(0, MAX_LIVE_ROOMS),
      page,
      hasMore: hasMore && recRooms.length < MAX_LIVE_ROOMS,
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
