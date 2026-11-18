import type { ReactNode } from "react";
import type { OpusFavItem } from "@shared/types";
export declare function OpusAppLink({ item, className, children, }: {
    item: Pick<OpusFavItem, "id" | "url">;
    className?: string;
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
