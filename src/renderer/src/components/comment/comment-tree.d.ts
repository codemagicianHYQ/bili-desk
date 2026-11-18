import type { CommentItem } from "@shared/types";
export declare function commentRpid(item: CommentItem): string | number;
export declare function countCommentTree(item: CommentItem): number;
/** 接口常把楼中楼拍扁；按 parent 还原成官网那种多级树 */
export declare function nestCommentReplies(replies: CommentItem[], rootRpid: number): CommentItem[];
export declare function formatCommentTime(ctime: number): string;
/** 从评论树里摘掉一条（含子楼），并返回实际去掉的条数，用来改总数 */
export declare function stripComment(list: CommentItem[], rpid: number): {
    list: CommentItem[];
    removed: number;
};
