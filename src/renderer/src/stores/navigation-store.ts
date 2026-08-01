import { create } from "zustand";

interface NavigationState {
  followingKeepAlive: boolean;
  favoritesKeepAlive: boolean;
  watchLaterKeepAlive: boolean;
  dynamicsKeepAlive: boolean;
  historyKeepAlive: boolean;
  videoKeepAlive: boolean;
  liveKeepAlive: boolean;
  activeVideoBvid: string | null;
  activeLiveRoomId: number | null;
  syncKeepAlive: (path: string, prevPath: string) => void;
}

const MAIN_SECTIONS = new Set([
  "/",
  "/dynamics",
  "/history",
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

function isLivePath(path: string): boolean {
  return path.startsWith("/live/");
}

function getVideoBvid(path: string): string | null {
  const match = path.match(/^\/video\/([^/]+)/);
  return match?.[1] ?? null;
}

function getLiveRoomId(path: string): number | null {
  const match = path.match(/^\/live\/(\d+)/);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  followingKeepAlive: false,
  favoritesKeepAlive: false,
  watchLaterKeepAlive: false,
  dynamicsKeepAlive: false,
  historyKeepAlive: false,
  videoKeepAlive: false,
  liveKeepAlive: false,
  activeVideoBvid: null,
  activeLiveRoomId: null,

  syncKeepAlive: (path, prevPath) => {
    let followingKeepAlive = get().followingKeepAlive;
    let favoritesKeepAlive = get().favoritesKeepAlive;
    let watchLaterKeepAlive = get().watchLaterKeepAlive;
    let dynamicsKeepAlive = get().dynamicsKeepAlive;
    let historyKeepAlive = get().historyKeepAlive;
    let videoKeepAlive = get().videoKeepAlive;
    let liveKeepAlive = get().liveKeepAlive;
    let activeVideoBvid = get().activeVideoBvid;
    let activeLiveRoomId = get().activeLiveRoomId;

    const videoBvid = getVideoBvid(path);
    const liveRoomId = getLiveRoomId(path);

    if (videoBvid) {
      videoKeepAlive = true;
      activeVideoBvid = videoBvid;
      liveKeepAlive = false;
      activeLiveRoomId = null;
    } else if (liveRoomId) {
      liveKeepAlive = true;
      activeLiveRoomId = liveRoomId;
      videoKeepAlive = false;
      activeVideoBvid = null;
    } else if (isUpPath(path) && (isVideoPath(prevPath) || videoKeepAlive)) {
      videoKeepAlive = true;
    } else if (isUpPath(path) && (isLivePath(prevPath) || liveKeepAlive)) {
      liveKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path)) {
      videoKeepAlive = false;
      activeVideoBvid = null;
      liveKeepAlive = false;
      activeLiveRoomId = null;
    }

    if (path === "/following" || isUpPath(path)) {
      followingKeepAlive = true;
    } else if (
      (isVideoPath(path) || isLivePath(path)) &&
      (prevPath === "/following" || isUpPath(prevPath))
    ) {
      followingKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/following") {
      followingKeepAlive = false;
    }

    if (path === "/favorites") {
      favoritesKeepAlive = true;
    } else if (
      (isVideoPath(path) || isLivePath(path)) &&
      (prevPath === "/favorites" ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
        isUpPath(prevPath))
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
      (isVideoPath(path) || isLivePath(path)) &&
      (prevPath === "/watch-later" ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
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

    if (path === "/dynamics") {
      dynamicsKeepAlive = true;
    } else if (
      (isVideoPath(path) || isLivePath(path)) &&
      (prevPath === "/dynamics" ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
        isUpPath(prevPath))
    ) {
      if (prevPath === "/dynamics" || dynamicsKeepAlive) {
        dynamicsKeepAlive = true;
      }
    } else if (isUpPath(path) && dynamicsKeepAlive) {
      dynamicsKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/dynamics") {
      dynamicsKeepAlive = false;
    }

    if (path === "/history") {
      historyKeepAlive = true;
    } else if (
      (isVideoPath(path) || isLivePath(path)) &&
      (prevPath === "/history" ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
        isUpPath(prevPath))
    ) {
      if (prevPath === "/history" || historyKeepAlive) {
        historyKeepAlive = true;
      }
    } else if (isUpPath(path) && historyKeepAlive) {
      historyKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/history") {
      historyKeepAlive = false;
    }

    const current = get();
    if (
      current.followingKeepAlive !== followingKeepAlive ||
      current.favoritesKeepAlive !== favoritesKeepAlive ||
      current.watchLaterKeepAlive !== watchLaterKeepAlive ||
      current.dynamicsKeepAlive !== dynamicsKeepAlive ||
      current.historyKeepAlive !== historyKeepAlive ||
      current.videoKeepAlive !== videoKeepAlive ||
      current.liveKeepAlive !== liveKeepAlive ||
      current.activeVideoBvid !== activeVideoBvid ||
      current.activeLiveRoomId !== activeLiveRoomId
    ) {
      set({
        followingKeepAlive,
        favoritesKeepAlive,
        watchLaterKeepAlive,
        dynamicsKeepAlive,
        historyKeepAlive,
        videoKeepAlive,
        liveKeepAlive,
        activeVideoBvid,
        activeLiveRoomId,
      });
    }
  },
}));
