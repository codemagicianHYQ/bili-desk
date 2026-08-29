import { create } from "zustand";
import type { ToViewItem, ToViewSource, VideoItem } from "@shared/types";

const TOVIEW_MAX = 1000;

interface WatchLaterState {
  videos: ToViewItem[];
  bvids: Set<string>;
  count: number;
  localVideos: ToViewItem[];
  localBvids: Set<string>;
  localCount: number;
  loading: boolean;
  ready: boolean;
  refreshing: boolean;
  error: string;
  ensureLoaded: () => Promise<void>;
  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
  add: (aid: number, bvid: string, video?: VideoItem) => Promise<ToViewSource>;
  remove: (aid: number, bvid: string) => Promise<void>;
  removeMany: (items: Array<{ aid: number; bvid: string }>) => Promise<void>;
  toggle: (
    aid: number,
    bvid: string,
    video?: VideoItem,
  ) => Promise<"removed" | ToViewSource>;
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

function setFromLocal(videos: ToViewItem[]) {
  return {
    localVideos: videos,
    localBvids: new Set(videos.map((item) => item.bvid)),
    localCount: videos.length,
  };
}

export const useWatchLaterStore = create<WatchLaterState>((set, get) => ({
  videos: [],
  bvids: new Set(),
  count: 0,
  localVideos: [],
  localBvids: new Set(),
  localCount: 0,
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
      const [official, local] = await Promise.all([
        window.biliDesk.bili.getToViewList().then(
          (result) => ({ ok: true as const, result }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        window.biliDesk.bili.getLocalToViewList(),
      ]);

      const localState = setFromLocal(local.videos ?? []);

      if (!official.ok) {
        set({
          ...localState,
          error:
            official.err instanceof Error
              ? official.err.message
              : "加载稍后再看失败",
          ready: true,
        });
        return;
      }

      set({
        ...localState,
        videos: official.result.videos,
        bvids: new Set(official.result.videos.map((video) => video.bvid)),
        count: official.result.count,
        error: "",
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
    if (get().bvids.has(bvid)) return "official";
    if (get().localBvids.has(bvid)) return "local";

    const forceLocal = get().count >= TOVIEW_MAX;
    const result = await window.biliDesk.bili.addToView(
      aid,
      bvid,
      video,
      forceLocal,
    );

    if (result.source === "local") {
      const item = result.item ?? (video ? toToViewItem(video) : undefined);
      set((state) => {
        if (state.localBvids.has(bvid) || !item) {
          return {
            count: Math.max(state.count, TOVIEW_MAX),
          };
        }
        const localBvids = new Set(state.localBvids);
        localBvids.add(bvid);
        return {
          localBvids,
          localVideos: [item, ...state.localVideos],
          localCount: localBvids.size,
          count: Math.max(state.count, TOVIEW_MAX),
        };
      });
      return "local";
    }

    set((state) => {
      const bvids = new Set(state.bvids);
      bvids.add(bvid);
      const exists = state.videos.some((item) => item.bvid === bvid);
      const videos = exists
        ? state.videos
        : video
          ? [toToViewItem(video), ...state.videos]
          : state.videos;
      const localBvids = new Set(state.localBvids);
      localBvids.delete(bvid);
      return {
        bvids,
        videos,
        count: bvids.size,
        localBvids,
        localVideos: state.localVideos.filter((item) => item.bvid !== bvid),
        localCount: localBvids.size,
      };
    });
    return "official";
  },

  remove: async (aid, bvid) => {
    const inOfficial = get().bvids.has(bvid);
    const inLocal = get().localBvids.has(bvid);

    if (inOfficial) {
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
      return;
    }

    if (inLocal) {
      await window.biliDesk.bili.removeFromLocalToView(bvid);
      set((state) => {
        const localBvids = new Set(state.localBvids);
        localBvids.delete(bvid);
        return {
          localBvids,
          localVideos: state.localVideos.filter((item) => item.bvid !== bvid),
          localCount: localBvids.size,
        };
      });
    }
  },

  removeMany: async (items) => {
    if (items.length === 0) return;
    const official = items.filter((item) => get().bvids.has(item.bvid));
    const local = items.filter(
      (item) => !get().bvids.has(item.bvid) && get().localBvids.has(item.bvid),
    );

    for (const item of official) {
      await window.biliDesk.bili.removeFromToView(item.aid);
    }
    if (local.length > 0) {
      await window.biliDesk.bili.removeManyFromLocalToView(
        local.map((item) => item.bvid),
      );
    }

    set((state) => {
      const removeOfficial = new Set(official.map((item) => item.bvid));
      const removeLocal = new Set(local.map((item) => item.bvid));
      const bvids = new Set(state.bvids);
      const localBvids = new Set(state.localBvids);
      for (const bvid of removeOfficial) bvids.delete(bvid);
      for (const bvid of removeLocal) localBvids.delete(bvid);
      return {
        bvids,
        videos: state.videos.filter((item) => !removeOfficial.has(item.bvid)),
        count: bvids.size,
        localBvids,
        localVideos: state.localVideos.filter(
          (item) => !removeLocal.has(item.bvid),
        ),
        localCount: localBvids.size,
      };
    });
  },

  toggle: async (aid, bvid, video) => {
    if (get().bvids.has(bvid) || get().localBvids.has(bvid)) {
      await get().remove(aid, bvid);
      return "removed";
    }
    return get().add(aid, bvid, video);
  },

  isInList: (bvid) => get().bvids.has(bvid) || get().localBvids.has(bvid),

  reset: () => {
    set({
      videos: [],
      bvids: new Set(),
      count: 0,
      localVideos: [],
      localBvids: new Set(),
      localCount: 0,
      ready: false,
      error: "",
    });
  },
}));

export { TOVIEW_MAX };
