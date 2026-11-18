import { type Dispatch, type SetStateAction } from "react";
import type { CommentItem } from "@shared/types";
export declare function commentTreeHas(item: CommentItem, rpid: number): boolean;
export declare function mergeCommentReplies(root: CommentItem, extra: CommentItem[]): CommentItem;
export declare function scrollCommentIntoView(rpid: number): boolean;
export declare function useFocusComment(options: {
    comments: CommentItem[];
    setComments: Dispatch<SetStateAction<CommentItem[]>>;
    focusRpid?: number;
    focusRoot?: number;
    loadReplies?: (root: number) => Promise<CommentItem[]>;
}): void;
