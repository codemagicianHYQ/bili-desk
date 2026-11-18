import type { CollectionGroupMap, UserCollectionItem } from "@shared/types";
export interface CollectionGroupSelection {
    /** null = 全部；UNGROUPED_COLLECTION_L1 = 未分组 */
    l1: string | null;
    l2: string | null;
}
export interface CollectionTreeL1 {
    name: string;
    count: number;
    children: Array<{
        name: string;
        count: number;
    }>;
}
export declare function buildCollectionTree(items: UserCollectionItem[], groups: CollectionGroupMap): {
    tree: CollectionTreeL1[];
    ungrouped: number;
};
/** 不依赖合集列表，直接由已保存的分类生成目录（移动弹窗用） */
export declare function buildTreeFromGroups(groups: CollectionGroupMap): CollectionTreeL1[];
export declare function matchesCollectionSelection(item: UserCollectionItem, groups: CollectionGroupMap, selection: CollectionGroupSelection): boolean;
export declare function CollectionGroupTree({ tree, total, ungrouped, selection, onSelect, onRename, }: {
    tree: CollectionTreeL1[];
    total: number;
    ungrouped: number;
    selection: CollectionGroupSelection;
    onSelect: (selection: CollectionGroupSelection) => void;
    onRename: (l1: string, l2: string | null, name: string) => void;
}): import("react/jsx-runtime").JSX.Element;
