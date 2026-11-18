import { type RefObject } from "react";
interface VideoCommentSectionProps {
    aid: number;
    bvid?: string;
    ownerMid?: number;
    replyCount?: number;
    scrollRootRef?: RefObject<HTMLElement | null>;
    focusRpid?: number;
    focusRoot?: number;
}
export declare function VideoCommentSection({ aid, bvid, ownerMid, replyCount, scrollRootRef, focusRpid, focusRoot, }: VideoCommentSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
