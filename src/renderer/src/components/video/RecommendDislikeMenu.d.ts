import type { RecommendDislikeReason, VideoItem } from "@shared/types";
export declare function RecommendDislikeMenu({ video, onDislike, }: {
    video: VideoItem;
    onDislike: (reason: RecommendDislikeReason) => void;
}): import("react/jsx-runtime").JSX.Element;
