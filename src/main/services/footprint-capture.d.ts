import type { CommentItem, FootprintItem } from "@shared/types";
export declare function captureLocalComment(comment: CommentItem | null | undefined, type?: number, source?: FootprintItem["source"]): void;
export declare function captureLocalDanmaku(payload: {
    message: string;
    bvid: string;
    progress: number;
    aid?: number;
}): void;
