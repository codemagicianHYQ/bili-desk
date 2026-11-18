/** 把 B 站链接映射到应用内路由，短链（b23.tv）需先解析再喂进来 */
export declare function isBiliUrl(href: string): boolean;
export declare function isBiliShortUrl(href: string): boolean;
export declare function parseBiliAppPath(href: string): string | null;
/** 图文 / opus：优先解析 jump_url，否则用 opus id 进应用内动态详情 */
export declare function resolveOpusAppPath(item: {
    id: string;
    url?: string;
}): string;
export declare function isInternalAppUrl(url: string): boolean;
export declare function extractAppHashPath(url: string): string | null;
/** 把新窗口 / 外链解析成应用内 hash 路由，解析不了返回 null */
export declare function resolveInAppPathFromUrl(url: string): string | null;
