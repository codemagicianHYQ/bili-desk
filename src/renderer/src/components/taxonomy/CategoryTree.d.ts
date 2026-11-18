import type { CategoryTreeNode, LocalCategorySelection } from "@shared/types";
interface CategoryTreeProps {
    tree: CategoryTreeNode[];
    selection: LocalCategorySelection;
    onSelect: (selection: LocalCategorySelection) => void;
    onRename?: (level: "l1" | "l2" | "l3", id: number, currentName: string) => void;
    allLabel?: string;
    allCount?: number;
    showCollapseAll?: boolean;
}
export declare function CategoryTree({ tree, selection, onSelect, onRename, allLabel, allCount, showCollapseAll, }: CategoryTreeProps): import("react/jsx-runtime").JSX.Element;
export {};
