import type { ToViewItem, VideoItem } from "@shared/types";
export declare const localToViewRepo: {
    list(): ToViewItem[];
    add(video: VideoItem | undefined, aid: number, bvid: string): ToViewItem;
    remove(bvid: string): void;
    removeMany(bvids: string[]): void;
};
