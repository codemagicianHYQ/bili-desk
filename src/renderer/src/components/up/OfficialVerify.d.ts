export declare function officialKind(type: 0 | 1 | undefined, desc?: string): {
    type: 0 | 1;
    desc: string;
    label: string;
    org: boolean;
} | null;
export declare function OfficialVerifyBadge({ type, size, }: {
    type: 0 | 1;
    size?: "sm" | "md";
}): import("react/jsx-runtime").JSX.Element;
export declare function OfficialVerifyLine({ type, desc, }: {
    type: 0 | 1;
    desc: string;
}): import("react/jsx-runtime").JSX.Element | null;
