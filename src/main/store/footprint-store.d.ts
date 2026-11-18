import type { FootprintItem, FootprintKind, FootprintListQuery } from "@shared/types";
export interface FootprintFile {
    uid: number;
    items: FootprintItem[];
    /** 本机已删除的评论 rpid。AICU 索引有延迟，再同步也不能把它们加回来 */
    removedCommentIds: string[];
    syncedAt: number | null;
    replyPn: number;
    replyDone: boolean;
    dmPn: number;
    dmDone: boolean;
}
export declare function flushFootprintStore(): void;
export declare function loadFootprint(uid: number): FootprintFile;
export declare function upsertFootprintItems(uid: number, incoming: FootprintItem[]): number;
/** 评论在 B 站删除成功后，从本地足迹去掉，并记住 rpid，避免历史同步又加回来 */
export declare function removeFootprintComments(uid: number, rpids: string[]): number;
export declare function setFootprintSyncCursor(uid: number, patch: Partial<Pick<FootprintFile, "replyPn" | "replyDone" | "dmPn" | "dmDone" | "syncedAt">>): void;
export declare function resetFootprintSyncCursors(uid: number): void;
export declare function listFootprint(uid: number, query: FootprintListQuery): {
    items: FootprintItem[];
    total: number;
    syncedAt: number | null;
    hasMore: boolean;
    replyDone: boolean;
    danmakuDone: boolean;
};
export declare function countFootprintByKind(uid: number, kind: FootprintKind): number;
