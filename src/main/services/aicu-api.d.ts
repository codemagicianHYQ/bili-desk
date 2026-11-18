import type { FootprintItem } from "@shared/types";
export interface AicuPageResult {
    items: FootprintItem[];
    isEnd: boolean;
    allCount: number;
}
type ChallengeListener = (state: "open" | "waiting" | "done" | "fail", detail?: string) => void;
/** 每次点「同步历史」开头调用，允许再弹一次验证（仍不会连弹） */
export declare function resetAicuChallengeGate(uid?: number): void;
export declare function setAicuChallengeListener(listener: ChallengeListener | null): void;
export declare function closeAicuBridge(): void;
export declare function fetchAicuReplies(uid: number, pn: number, ps?: number): Promise<AicuPageResult>;
export declare function fetchAicuVideoDanmaku(uid: number, pn: number, ps?: number): Promise<AicuPageResult>;
export {};
