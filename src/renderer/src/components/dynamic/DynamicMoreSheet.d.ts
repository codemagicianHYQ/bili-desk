import { type RefObject } from "react";
import type { SpaceDynamicItem } from "@shared/types";
export declare function DynamicMoreSheet({ open, anchorRef, item, isOwn, authorName, onClose, onTip, onRemoved, onUnfollowed, }: {
    open: boolean;
    anchorRef: RefObject<HTMLElement | null>;
    item: SpaceDynamicItem;
    isOwn: boolean;
    authorName: string;
    onClose: () => void;
    onTip: (message: string) => void;
    onRemoved?: (id: string) => void;
    onUnfollowed?: (mid: number) => void;
}): import("react/jsx-runtime").JSX.Element;
