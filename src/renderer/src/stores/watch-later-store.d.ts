import type { ToViewItem, ToViewSource, VideoItem } from "@shared/types";
declare const TOVIEW_MAX = 1000;
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
    clearOfficial: () => Promise<void>;
    removeMany: (items: Array<{
        aid: number;
        bvid: string;
    }>) => Promise<void>;
    toggle: (aid: number, bvid: string, video?: VideoItem) => Promise<"removed" | ToViewSource>;
    isInList: (bvid: string) => boolean;
    reset: () => void;
}
export declare const useWatchLaterStore: import("zustand").UseBoundStore<import("zustand").StoreApi<WatchLaterState>>;
export { TOVIEW_MAX };
