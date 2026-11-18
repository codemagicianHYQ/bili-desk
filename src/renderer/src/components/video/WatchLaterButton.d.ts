import type { VideoItem } from "@shared/types";
interface WatchLaterButtonProps {
    aid: number;
    bvid: string;
    video?: VideoItem;
    variant?: "overlay" | "inline";
    className?: string;
}
export declare function WatchLaterButton({ aid, bvid, video, variant, className, }: WatchLaterButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
