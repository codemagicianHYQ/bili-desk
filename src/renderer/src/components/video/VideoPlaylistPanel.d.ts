import type { VideoPagePart, VideoUgcSeason } from "@shared/types";
interface VideoPlaylistPanelProps {
    bvid: string;
    selectedCid: number | null;
    pages: VideoPagePart[];
    ugcSeason?: VideoUgcSeason;
    onSelectPart: (cid: number) => void;
    className?: string;
}
export declare function VideoPlaylistPanel({ bvid, selectedCid, pages, ugcSeason, onSelectPart, className, }: VideoPlaylistPanelProps): import("react/jsx-runtime").JSX.Element | null;
export {};
