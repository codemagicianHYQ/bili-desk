import type { FavFolder } from "../types";
/** 侧栏未识别夹的分组名；不是官方收藏夹 */
export declare const UNGROUPED_L1 = "\u672A\u5206\u7EC4";
/** 用户把夹拖出一级目录后，不再按名字自动归组 */
export declare const FLAT_GROUP_OVERRIDE = "__flat__";
export type FavFolderGroupOverrides = Record<string, string>;
export declare function parseFavFolderPath(title: string): {
    parts: string[];
    overflow: number | null;
};
export declare function isDumpFolderTitle(title: string): boolean;
/** 智能整理生成的「计算机-算法」这类夹名 */
export declare function isGeneratedPrefixedFolderTitle(name: string): boolean;
export declare function generatedFavTopic(name: string): string;
/** 同一主题的叫法，避免「算法与数据结构」旁边再留一个「计算机-算法」 */
export declare const FOLDER_TOPIC_ALIASES: string[][];
/** 「计算机-算法」应并进已有的「算法与数据结构」 */
export declare function listDuplicateGeneratedFolderPairs(folders: Array<{
    title: string;
    isDefault?: boolean;
}>): Array<{
    duplicateTitle: string;
    canonicalTitle: string;
}>;
export declare function inferFavFolderGroup(title: string): {
    l1: string;
    l2: string;
    l3?: string;
} | null;
export declare function favFolderLeafLabel(title: string): string;
export type FolderNavItem = {
    folder: FavFolder;
    label: string;
};
export type FolderNavL2 = {
    kind: "l2";
    name: string;
    folders: FolderNavItem[];
};
export type FolderNavL1 = {
    kind: "l1";
    name: string;
    totalCount: number;
    items: Array<FolderNavItem | FolderNavL2>;
};
export type FolderNavOverflow = {
    kind: "overflow";
    folders: FolderNavItem[];
};
export type FolderNavFlat = {
    kind: "flat";
    folder: FavFolder;
    label: string;
};
export type FolderNavUngrouped = {
    kind: "ungrouped";
    folders: FolderNavItem[];
};
export type FolderNavBlock = FolderNavL1 | FolderNavOverflow | FolderNavFlat | FolderNavUngrouped;
export declare function flattenFolderNavBlock(block: FolderNavBlock): FavFolder[];
export declare function groupFavFolders(folders: FavFolder[], overrides?: FavFolderGroupOverrides): {
    pinned: FavFolder[];
    blocks: FolderNavBlock[];
};
export declare function listUngroupedFavFolders(folders: FavFolder[], overrides?: FavFolderGroupOverrides): FavFolder[];
export declare function reorderGroupedFavFolders(folders: FavFolder[], fromId: number, toId: number, overrides?: FavFolderGroupOverrides, options?: {
    after?: boolean;
}): {
    folders: FavFolder[];
    overrides: FavFolderGroupOverrides;
} | null;
export declare function moveFavFolderIntoGroup(folders: FavFolder[], fromId: number, groupName: string, overrides?: FavFolderGroupOverrides): {
    folders: FavFolder[];
    overrides: FavFolderGroupOverrides;
} | null;
