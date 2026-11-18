import { type ReactNode } from "react";
export declare function ExternalTextLink({ href, children, className, }: {
    href: string;
    children: ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function BvidTextLink({ bvid, className, }: {
    bvid: string;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function LinkifiedText({ text, className, }: {
    text: string;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
