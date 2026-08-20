import { useFavoritesStore } from "@/stores/favorites-store";
import { useFollowingStore } from "@/stores/following-store";
import { useHomeFeedStore } from "@/stores/home-feed-store";
import { useHomeLiveStore } from "@/stores/home-live-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import {
  clearAllSessionCaches,
  onSessionCacheSweep,
  SESSION_TTL_MS,
  startSessionCacheJanitor,
} from "@/lib/session-lru";

let started = false;

export function initSessionCaches() {
  if (started) return;
  started = true;

  onSessionCacheSweep(() => {
    const following = useFollowingStore.getState();
    if (
      following.followingsLoadedAt != null &&
      Date.now() - following.followingsLoadedAt > SESSION_TTL_MS
    ) {
      following.invalidateFollowings();
    }
  });

  startSessionCacheJanitor();
}

export function resetSessionCachesOnLogout() {
  clearAllSessionCaches();
  useFavoritesStore.getState().clearFolderLists();
  useFollowingStore.getState().invalidateFollowings();
  useFollowingStore.getState().invalidateSidebar();
  useWatchLaterStore.getState().reset();
  useHomeFeedStore.setState({
    videos: [],
    hydrated: false,
    pageCount: 0,
    hasMore: true,
    error: "",
    loading: false,
    loadingMore: false,
  });
  useHomeLiveStore.setState({
    rooms: [],
    following: [],
    followingCount: 0,
    page: 1,
    hasMore: true,
    hydrated: false,
    error: "",
    followingError: "",
    loading: false,
    loadingMore: false,
  });
}
