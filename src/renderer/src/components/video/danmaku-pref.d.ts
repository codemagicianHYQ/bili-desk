import type { DanmakuCloudConfig } from "@shared/types";
export interface DanmakuPref {
    visible: boolean;
    opacity: number;
    speed: number;
    fontSize: number;
    margin: [number | `${number}%`, number | `${number}%`];
    antiOverlap: boolean;
    synchronousPlayback: boolean;
    modes: Array<0 | 1 | 2>;
    color: string;
    mode: 0 | 1 | 2;
}
export declare const DEFAULT_DANMAKU_PREF: DanmakuPref;
export declare function sanitizeDanmakuPref(raw: unknown): DanmakuPref;
export declare function readDanmakuPref(): DanmakuPref;
export declare function toDanmakuCloudConfig(pref: DanmakuPref): DanmakuCloudConfig;
export declare function flushDanmakuPref(): void;
export declare function writeDanmakuPref(raw: unknown): void;
