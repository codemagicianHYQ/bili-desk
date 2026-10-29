import { create } from "zustand";

interface NavigationState {
  followingKeepAlive: boolean;
  favoritesKeepAlive: boolean;
  collectionsKeepAlive: boolean;
  watchLaterKeepAlive: boolean;
  dynamicsKeepAlive: boolean;
  historyKeepAlive: boolean;
  popularKeepAlive: boolean;
  upActivityKeepAlive: boolean;
  integrityKeepAlive: boolean;
  settingsKeepAlive: boolean;
  messagesKeepAlive: boolean;
  videoKeepAlive: boolean;
  liveKeepAlive: boolean;
  activeVideoBvid: string | null;
  activeLiveRoomId: number | null;
  /** 最近一次停留的主栏目，进视频/UP/专栏等详情页时侧栏高亮它 */
  lastSection: string;
  syncKeepAlive: (path: string, prevPath: string) => void;
}

type SectionKey =
  | "followingKeepAlive"
  | "favoritesKeepAlive"
  | "collectionsKeepAlive"
  | "watchLaterKeepAlive"
  | "dynamicsKeepAlive"
  | "historyKeepAlive"
  | "popularKeepAlive"
  | "upActivityKeepAlive"
  | "integrityKeepAlive"
  | "settingsKeepAlive"
  | "messagesKeepAlive";

/**
 * 主栏目进过一次就一直挂着（隐藏），数据留在组件里，直到退出应用或登出；
 * 要拿新数据走顶栏刷新按钮。
 */
const SECTION_KEYS: Record<string, SectionKey> = {
  "/following": "followingKeepAlive",
  "/favorites": "favoritesKeepAlive",
  "/collections": "collectionsKeepAlive",
  "/watch-later": "watchLaterKeepAlive",
  "/dynamics": "dynamicsKeepAlive",
  "/history": "historyKeepAlive",
  "/popular": "popularKeepAlive",
  "/up-activity": "upActivityKeepAlive",
  "/integrity": "integrityKeepAlive",
  "/settings": "settingsKeepAlive",
  "/messages": "messagesKeepAlive",
};

const MAIN_SECTIONS = new Set(["/", "/me", ...Object.keys(SECTION_KEYS)]);

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
  collectionsKeepAlive: false,
  watchLaterKeepAlive: false,
  dynamicsKeepAlive: false,
  historyKeepAlive: false,
  popularKeepAlive: false,
  upActivityKeepAlive: false,
  integrityKeepAlive: false,
  settingsKeepAlive: false,
  messagesKeepAlive: false,
  videoKeepAlive: false,
  liveKeepAlive: false,
  activeVideoBvid: null,
  activeLiveRoomId: null,
  lastSection: "/",

  syncKeepAlive: (path, prevPath) => {
    const current = get();
    let videoKeepAlive = current.videoKeepAlive;
    let liveKeepAlive = current.liveKeepAlive;
    let activeVideoBvid = current.activeVideoBvid;
    let activeLiveRoomId = current.activeLiveRoomId;

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

    const sectionKey = SECTION_KEYS[path];
    const patch: Partial<NavigationState> = {};
    if (sectionKey && !current[sectionKey]) patch[sectionKey] = true;
    if (MAIN_SECTIONS.has(path) && current.lastSection !== path) {
      patch.lastSection = path;
    }
    if (current.videoKeepAlive !== videoKeepAlive) {
      patch.videoKeepAlive = videoKeepAlive;
    }
    if (current.liveKeepAlive !== liveKeepAlive) {
      patch.liveKeepAlive = liveKeepAlive;
    }
    if (current.activeVideoBvid !== activeVideoBvid) {
      patch.activeVideoBvid = activeVideoBvid;
    }
    if (current.activeLiveRoomId !== activeLiveRoomId) {
      patch.activeLiveRoomId = activeLiveRoomId;
    }
    if (Object.keys(patch).length > 0) set(patch);
  },
}));
