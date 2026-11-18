import type { ReactNode } from "react";
import type { BiliFailureHint } from "@shared/bili-error";
export declare function ErrorState({ error, hint, fallback, action, className, }: {
    error: unknown;
    hint?: BiliFailureHint;
    fallback?: string;
    action?: ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function ContentUnavailable({ kind, error, }: {
    kind: "video" | "dynamic";
    error: unknown;
}): import("react/jsx-runtime").JSX.Element;
