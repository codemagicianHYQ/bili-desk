import { type ReactNode } from "react";
export declare const COMMENT_REPORT_REASONS: Array<{
    id: number;
    label: string;
}>;
interface CommentActionBarProps {
    leading?: ReactNode;
    liked: boolean;
    hated: boolean;
    likeCount: number;
    liking?: boolean;
    hating?: boolean;
    deleting?: boolean;
    reporting?: boolean;
    isOwn: boolean;
    canDelete: boolean;
    copyText?: string;
    onLike: () => void;
    onHate: () => void;
    onReply: () => void;
    onDelete: () => void;
    onReport: (reason: number) => void;
    canPin?: boolean;
    pinned?: boolean;
    onPin?: () => void;
    /** 外部菜单要求打开举报理由 */
    reportSignal?: number;
}
export declare function CommentActionBar({ leading, liked, hated, likeCount, liking, hating, deleting, reporting, isOwn, canDelete, copyText, onLike, onHate, onReply, onDelete, onReport, canPin, pinned, onPin, reportSignal, }: CommentActionBarProps): import("react/jsx-runtime").JSX.Element;
export {};
