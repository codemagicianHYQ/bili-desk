import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";
import type { VideoSubtitleTrack } from "@shared/types";
export declare function pickSubtitleTrack(tracks: VideoSubtitleTrack[] | undefined): VideoSubtitleTrack | undefined;
export declare function createSubtitleBlobUrl(vtt: string): string;
export declare function applyArtSubtitle(art: Artplayer, track: VideoSubtitleTrack, blobUrl: string, show?: boolean): Promise<void>;
/** 控制栏右侧「字幕」：关闭 / 各语种轨 / 作用范围 */
export declare function createSubtitleControl(tracks: VideoSubtitleTrack[], trackUrls: Map<number, string>, bvid: string): ComponentOption;
