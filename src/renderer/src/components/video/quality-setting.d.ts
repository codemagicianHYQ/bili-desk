import type { ComponentOption } from "artplayer/types/component";
import type { VideoPlayInfo } from "@shared/types";
export declare function createQualityControl(playInfo: VideoPlayInfo, selectedQn: number, onChange: (qn: number) => void): ComponentOption;
