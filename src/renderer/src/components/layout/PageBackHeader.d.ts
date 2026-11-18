import type { ReactNode } from "react";
interface PageBackHeaderProps {
    fallback?: string;
    label?: string;
    className?: string;
    trailing?: ReactNode;
}
export declare function PageBackHeader({ fallback, label, className, trailing, }: PageBackHeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
