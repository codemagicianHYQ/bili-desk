import type { OpusFavItem, UserCollectionItem, VideoItem } from "@shared/types";
export declare function UpSpaceHome({ videos, videoCount, opus, opusCount, collections, collectionCount, gridClass, onOpenTab, }: {
    videos: VideoItem[];
    videoCount: number;
    opus: OpusFavItem[];
    opusCount: number;
    collections: UserCollectionItem[];
    collectionCount: number;
    gridClass: string;
    onOpenTab: (tab: "videos" | "opus" | "collections") => void;
}): import("react/jsx-runtime").JSX.Element;
