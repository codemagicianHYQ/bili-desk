import type { VideoSubtitleTrack } from "@shared/types";
export type SubtitleScope = "all" | "current";
export interface SubtitleChoice {
    enabled: boolean;
    /** 空字符串表示自动选中文 */
    lan: string;
}
export declare function readSubtitleScope(): SubtitleScope;
export declare function readGlobalSubtitleChoice(): SubtitleChoice;
export declare function resolveSubtitleChoice(bvid: string): SubtitleChoice;
export declare function rememberSubtitleChoice(bvid: string, choice: SubtitleChoice): void;
export declare function setSubtitleScope(scope: SubtitleScope, bvid: string, current: SubtitleChoice): void;
export declare function trackLanKey(track: VideoSubtitleTrack): string;
export declare function matchSubtitleTrack(tracks: VideoSubtitleTrack[], choice: SubtitleChoice, pickAuto: (tracks: VideoSubtitleTrack[]) => VideoSubtitleTrack | undefined): VideoSubtitleTrack | undefined;
