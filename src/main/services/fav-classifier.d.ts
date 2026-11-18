import type { FavResource } from "@shared/types";
import { isGeneratedPrefixedFolderTitle } from "@shared/utils/fav-folder-groups";
export { isGeneratedPrefixedFolderTitle };
interface CategoryMatch {
    categoryL1Id: number | null;
    categoryL2Id: number | null;
    categoryL3Id: number | null;
}
type FavMatch = {
    l1: string;
    l2?: string;
    l3?: string;
};
/**
 * 计算机方向沿用细分到三级的关键词规则；其余方向交给证据打分目录，
 * 老规则里「社会人文」「科普」这类兜底只在打分也说不出时才用。
 */
export declare function matchTitleToCategory(title: string): FavMatch | null;
export declare const BILI_OTHER_FOLDER_TITLE = "\u5176\u4ED6";
export declare function isDumpFolderTitle(name: string): boolean;
export declare function findCanonicalExistingFolder(existingTitles: Iterable<string>, matched: {
    l1: string;
    l2?: string;
    l3?: string;
} | null, preferred: string | null): string | null;
/** 标题已经很明确时，禁止再用 UP 票把 Mac mini 塞进自行车夹 */
export declare function folderConflictsWithVideoTitle(folderTitle: string, videoTitle: string): boolean;
export declare function buildFavClassifyText(item: {
    title: string;
    intro?: string;
    upper?: {
        name?: string;
    };
    comments?: string;
}): string;
/** 热评里去掉水评/广告，只留对分类有用的几句 */
export declare function pickClassifyCommentSnippets(messages: string[]): string;
export declare function preferredBiliOrganizeTitle(title: string): string | null;
/**
 * 先归入用户已有收藏夹（含「算法与数据结构」对「算法」这种包含关系）；
 * 对不上再按方向新建。分不出来就返回 null，不要堆进「其他」。
 */
export declare function resolveBiliOrganizeFolderTitle(title: string, existingTitles: Iterable<string>): string | null;
/** 只推荐用户已经有的夹，不建议新建「计算机-人工智能」这种名字 */
export declare function suggestExistingFavFolderTitle(title: string, existingTitles: Iterable<string>): string | null;
export declare function classifyFavoriteTitle(title: string): CategoryMatch;
export declare function classifyFavoriteItemsAsync(items: FavResource[], onProgress?: (done: number, total: number) => void, options?: {
    resetCategories?: boolean;
}): Promise<number>;
export declare function classifyFavoriteItems(items: FavResource[]): number;
