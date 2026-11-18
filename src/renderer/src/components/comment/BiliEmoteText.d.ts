import type { CommentMember } from "@shared/types";
interface BiliEmoteTextProps {
    text: string;
    emotes?: Record<string, string>;
    mentions?: CommentMember[];
    className?: string;
    /** 表情显示尺寸（px） */
    size?: number;
}
export declare function BiliEmoteText({ text, emotes, mentions, className, size, }: BiliEmoteTextProps): import("react/jsx-runtime").JSX.Element;
export {};
