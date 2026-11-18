import type { SpaceDynamicItem } from "@shared/types";
export declare function ExclusiveTag({ text }: {
    text: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function DynamicMetaLine({ item }: {
    item: SpaceDynamicItem;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function UpowerExclusiveCard({ item }: {
    item: SpaceDynamicItem;
}): import("react/jsx-runtime").JSX.Element;
export declare function ImageGrid({ images, layout, }: {
    images: string[];
    layout?: "grid" | "stack";
}): import("react/jsx-runtime").JSX.Element | null;
export declare function ForwardedOrigEmbed({ item, depth, imageLayout, }: {
    item: SpaceDynamicItem;
    depth?: number;
    imageLayout?: "grid" | "stack";
}): import("react/jsx-runtime").JSX.Element;
export declare function DynamicFeedCard({ item, fallbackName, fallbackFace, onRemoved, onUnfollowed, }: {
    item: SpaceDynamicItem;
    fallbackName?: string;
    fallbackFace?: string;
    onRemoved?: (id: string) => void;
    onUnfollowed?: (mid: number) => void;
}): import("react/jsx-runtime").JSX.Element;
