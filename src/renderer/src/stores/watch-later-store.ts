import { create } from "zustand";
import type { ToViewItem, VideoItem } from "@shared/types";

interface WatchLaterState {
  videos: ToViewItem[];
  bvids: Set<string>;
  count: number;
  loading: boolean;
  ready: boolean;
  refreshing: boolean;
  error: string;
  ensureLoaded: () => Promise<void>;
  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
  add: (aid: number, bvid: string, video?: VideoItem) => Promise<void>;
  remove: (aid: number, bvid: string) => Promise<void>;
  toggle: (aid: number, bvid: string, video?: VideoItem) => Promise<void>;
  isInList: (bvid: string) => boolean;
  reset: () => void;
}

function toToViewItem(video: VideoItem): ToViewItem {
  return {
    ...video,
    progress: 0,
    addAt: Math.floor(Date.now() / 1000),
    cid: 0,
  };
}

export const useWatchLaterStore = create<WatchLaterState>((set, get) => ({
  videos: [],
  bvids: new Set(),
  count: 0,
  loading: false,
  ready: false,
  refreshing: false,
  error: "",

  ensureLoaded: async () => {
    if (get().ready || get().loading) return;
    await get().fetch();
  },

  fetch: async () => {
    set({ loading: true, error: "" });
    try {
      const result = await window.biliDesk.bili.getToViewList();
      set({
        videos: result.videos,
        bvids: new Set(result.videos.map((video) => video.bvid)),
        count: result.count,
        ready: true,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "加载稍后再看失败",
        ready: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async () => {
    set({ refreshing: true });
    await get().fetch();
    set({ refreshing: false });
  },

  add: async (aid, bvid, video) => {
    await window.biliDesk.bili.addToView(aid, bvid);
    set((state) => {
      const bvids = new Set(state.bvids);
      bvids.add(bvid);
      const exists = state.videos.some((item) => item.bvid === bvid);
      const videos = exists
        ? state.videos
        : video
          ? [toToViewItem(video), ...state.videos]
          : state.videos;
      return {
        bvids,
        videos,
        count: bvids.size,
      };
    });
  },

  remove: async (aid, bvid) => {
    await window.biliDesk.bili.removeFromToView(aid);
    set((state) => {
      const bvids = new Set(state.bvids);
      bvids.delete(bvid);
      return {
        bvids,
        videos: state.videos.filter((item) => item.bvid !== bvid),
        count: bvids.size,
      };
    });
  },

  toggle: async (aid, bvid, video) => {
    if (get().bvids.has(bvid)) {
      await get().remove(aid, bvid);
    } else {
      await get().add(aid, bvid, video);
    }
  },

  isInList: (bvid) => get().bvids.has(bvid),

  reset: () => {
    set({
      videos: [],
      bvids: new Set(),
      count: 0,
      ready: false,
      error: "",
    });
  },
}));
