import type { BinaryImageFile, CommentItem } from "@shared/types";
export interface CommentThreadHandlers {
    like: (item: CommentItem, next: boolean) => Promise<void>;
    hate: (item: CommentItem, next: boolean) => Promise<void>;
    delete: (item: CommentItem) => Promise<void>;
    report: (item: CommentItem, reason: number) => Promise<void>;
    reply: (item: CommentItem, text: string, images?: BinaryImageFile[]) => Promise<void>;
    pin?: (item: CommentItem, pin: boolean) => Promise<void>;
    loadMoreReplies?: (item: CommentItem, page: number) => Promise<{
        comments: CommentItem[];
    }>;
}
interface CommentThreadProps {
    item: CommentItem;
    ownerMid?: number;
    selfMid?: number;
    nested?: boolean;
    handlers: CommentThreadHandlers;
    onChanged: () => void;
    onDeleted: (rpid: number) => void;
    highlightRpid?: number;
    /** 评论区类型，视频是 1 */
    subjectType?: number;
    bvid?: string;
}
export declare function CommentThread({ item, ownerMid, selfMid, nested, handlers, onChanged, onDeleted, highlightRpid, subjectType, bvid, }: CommentThreadProps): import("react/jsx-runtime").JSX.Element;
export {};
