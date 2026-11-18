/** 简介 / 评论里识别到的外链，只放行 http(s) */
export type LinkifyPart = {
    kind: "text";
    value: string;
} | {
    kind: "url";
    value: string;
    href: string;
} | {
    kind: "bvid";
    value: string;
};
export declare function normalizeBvid(raw: string): string;
export declare function sanitizeExternalUrl(raw: string): string | null;
export declare function splitLinkifiedText(text: string): LinkifyPart[];
