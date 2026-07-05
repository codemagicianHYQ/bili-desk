import { create } from "zustand";

interface NavigationState {
  followingKeepAlive: boolean;
  favoritesKeepAlive: boolean;
  watchLaterKeepAlive: boolean;
  videoKeepAlive: boolean;
  activeVideoBvid: string | null;
  syncKeepAlive: (path: string, prevPath: string) => void;
}

const MAIN_SECTIONS = new Set([
  "/",
  "/favorites",
  "/following",
  "/watch-later",
  "/me",
  "/settings",
]);

function isUpPath(path: string): boolean {
  return path.startsWith("/up/");
}

function isVideoPath(path: string): boolean {
  return path.startsWith("/video/");
}

function getVideoBvid(path: string): string | null {
  const match = path.match(/^\/video\/([^/]+)/);
  return match?.[1] ?? null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  followingKeepAlive: false,
  favoritesKeepAlive: false,
  watchLaterKeepAlive: false,
  videoKeepAlive: false,
  activeVideoBvid: null,

  syncKeepAlive: (path, prevPath) => {
    let followingKeepAlive = get().followingKeepAlive;
    let favoritesKeepAlive = get().favoritesKeepAlive;
    let watchLaterKeepAlive = get().watchLaterKeepAlive;
    let videoKeepAlive = get().videoKeepAlive;
    let activeVideoBvid = get().activeVideoBvid;

    const videoBvid = getVideoBvid(path);

    if (videoBvid) {
      videoKeepAlive = true;
      activeVideoBvid = videoBvid;
    } else if (isUpPath(path) && (isVideoPath(prevPath) || videoKeepAlive)) {
      videoKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path)) {
      videoKeepAlive = false;
      activeVideoBvid = null;
    }

    if (path === "/following" || isUpPath(path)) {
      followingKeepAlive = true;
    } else if (
      isVideoPath(path) &&
      (prevPath === "/following" || isUpPath(prevPath))
    ) {
      followingKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/following") {
      followingKeepAlive = false;
    }

    if (path === "/favorites") {
      favoritesKeepAlive = true;
    } else if (
      isVideoPath(path) &&
      (prevPath === "/favorites" || isVideoPath(prevPath) || isUpPath(prevPath))
    ) {
      if (prevPath === "/favorites" || favoritesKeepAlive) {
        favoritesKeepAlive = true;
      }
    } else if (isUpPath(path) && favoritesKeepAlive) {
      favoritesKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/favorites") {
      favoritesKeepAlive = false;
    }

    if (path === "/watch-later") {
      watchLaterKeepAlive = true;
    } else if (
      isVideoPath(path) &&
      (prevPath === "/watch-later" ||
        isVideoPath(prevPath) ||
        isUpPath(prevPath))
    ) {
      if (prevPath === "/watch-later" || watchLaterKeepAlive) {
        watchLaterKeepAlive = true;
      }
    } else if (isUpPath(path) && watchLaterKeepAlive) {
      watchLaterKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/watch-later") {
      watchLaterKeepAlive = false;
    }

    const current = get();
    if (
      current.followingKeepAlive !== followingKeepAlive ||
      current.favoritesKeepAlive !== favoritesKeepAlive ||
      current.watchLaterKeepAlive !== watchLaterKeepAlive ||
      current.videoKeepAlive !== videoKeepAlive ||
      current.activeVideoBvid !== activeVideoBvid
    ) {
      set({
        followingKeepAlive,
        favoritesKeepAlive,
        watchLaterKeepAlive,
        videoKeepAlive,
        activeVideoBvid,
      });
    }
  },
}));
