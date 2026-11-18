import type { CategoryTreeNode, LocalCategorySelection, ToViewItem } from "@shared/types";
export interface CategoryPath {
    l1: string;
    l2?: string;
    l3?: string;
}
interface NodeIds {
    l1: number;
    l2: number | null;
    l3: number | null;
}
export declare const OTHER_CATEGORY = "\u5176\u4ED6";
/** 只在本页内用的临时树，不进本地分类库 */
export declare function buildWatchLaterTree(videos: ToViewItem[], paths: Map<string, CategoryPath>): {
    tree: CategoryTreeNode[];
    idsByBvid: Map<string, NodeIds>;
};
export declare function filterBySelection(videos: ToViewItem[], idsByBvid: Map<string, NodeIds>, selection: LocalCategorySelection): ToViewItem[];
export {};
