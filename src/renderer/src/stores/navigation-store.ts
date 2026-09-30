import { create } from "zustand";

interface NavigationState {
  followingKeepAlive: boolean;
  favoritesKeepAlive: boolean;
  watchLaterKeepAlive: boolean;
  dynamicsKeepAlive: boolean;
  historyKeepAlive: boolean;
  popularKeepAlive: boolean;
  upActivityKeepAlive: boolean;
  integrityKeepAlive: boolean;
  settingsKeepAlive: boolean;
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
  "/popular",
  "/favorites",
  "/following",
  "/watch-later",
  "/me",
  "/settings",
  "/up-activity",
  "/integrity",
]);

function isUpPath(path: string): boolean {
  return path.startsWith("/up/");
}

function isDynamicDetailPath(path: string): boolean {
  return path.startsWith("/dynamic/");
}

function isArticlePath(path: string): boolean {
  return path.startsWith("/article/");
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
  popularKeepAlive: false,
  upActivityKeepAlive: false,
  integrityKeepAlive: false,
  settingsKeepAlive: false,
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
    let popularKeepAlive = get().popularKeepAlive;
    let upActivityKeepAlive = get().upActivityKeepAlive;
    let integrityKeepAlive = get().integrityKeepAlive;
    let settingsKeepAlive = get().settingsKeepAlive;
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

    if (path === "/following") {
      followingKeepAlive = true;
    } else if (
      isUpPath(path) &&
      prevPath !== "/up-activity" &&
      prevPath !== "/integrity" &&
      prevPath !== "/settings" &&
      (prevPath === "/following" || followingKeepAlive)
    ) {
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
      (isVideoPath(path) ||
        isLivePath(path) ||
        isDynamicDetailPath(path) ||
        isArticlePath(path) ||
        isUpPath(path)) &&
      (prevPath === "/dynamics" ||
        isDynamicDetailPath(prevPath) ||
        isArticlePath(prevPath) ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
        isUpPath(prevPath) ||
        dynamicsKeepAlive)
    ) {
      if (
        prevPath === "/dynamics" ||
        isDynamicDetailPath(prevPath) ||
        isArticlePath(prevPath) ||
        dynamicsKeepAlive
      ) {
        dynamicsKeepAlive = true;
      }
    } else if (MAIN_SECTIONS.has(path) && path !== "/dynamics") {
      dynamicsKeepAlive = false;
    }

    if (path === "/history") {
      historyKeepAlive = true;
    } else if (
      (isVideoPath(path) || isLivePath(path) || isArticlePath(path)) &&
      (prevPath === "/history" ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
        isArticlePath(prevPath) ||
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

    if (path === "/popular") {
      popularKeepAlive = true;
    } else if (
      (isVideoPath(path) || isLivePath(path)) &&
      (prevPath === "/popular" ||
        isVideoPath(prevPath) ||
        isLivePath(prevPath) ||
        isUpPath(prevPath))
    ) {
      if (prevPath === "/popular" || popularKeepAlive) {
        popularKeepAlive = true;
      }
    } else if (isUpPath(path) && popularKeepAlive) {
      popularKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/popular") {
      popularKeepAlive = false;
    }

    const drillIn =
      isUpPath(path) ||
      isVideoPath(path) ||
      isLivePath(path) ||
      isArticlePath(path) ||
      isDynamicDetailPath(path);

    if (path === "/up-activity") {
      upActivityKeepAlive = true;
    } else if (
      drillIn &&
      (prevPath === "/up-activity" || upActivityKeepAlive)
    ) {
      upActivityKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/up-activity") {
      upActivityKeepAlive = false;
    }

    if (path === "/integrity") {
      integrityKeepAlive = true;
    } else if (drillIn && (prevPath === "/integrity" || integrityKeepAlive)) {
      integrityKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/integrity") {
      integrityKeepAlive = false;
    }

    if (path === "/settings") {
      settingsKeepAlive = true;
    } else if (drillIn && (prevPath === "/settings" || settingsKeepAlive)) {
      settingsKeepAlive = true;
    } else if (MAIN_SECTIONS.has(path) && path !== "/settings") {
      settingsKeepAlive = false;
    }

    const current = get();
    if (
      current.followingKeepAlive !== followingKeepAlive ||
      current.favoritesKeepAlive !== favoritesKeepAlive ||
      current.watchLaterKeepAlive !== watchLaterKeepAlive ||
      current.dynamicsKeepAlive !== dynamicsKeepAlive ||
      current.historyKeepAlive !== historyKeepAlive ||
      current.popularKeepAlive !== popularKeepAlive ||
      current.upActivityKeepAlive !== upActivityKeepAlive ||
      current.integrityKeepAlive !== integrityKeepAlive ||
      current.settingsKeepAlive !== settingsKeepAlive ||
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
        popularKeepAlive,
        upActivityKeepAlive,
        integrityKeepAlive,
        settingsKeepAlive,
        videoKeepAlive,
        liveKeepAlive,
        activeVideoBvid,
        activeLiveRoomId,
      });
    }
  },
}));
