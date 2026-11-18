import type { UpGroupSelection, UpGroupTreeNode } from "@shared/types";
interface UpGroupTreeProps {
    tree: UpGroupTreeNode[];
    selection: UpGroupSelection;
    uncategorizedCount?: number;
    onSelect: (selection: UpGroupSelection) => void;
    onRename?: (id: number, name: string) => void;
    /** 每个数组是同一父级下的新顺序 */
    onReorder?: (orders: number[][]) => void;
}
export declare function UpGroupTree({ tree, selection, uncategorizedCount, onSelect, onRename, onReorder, }: UpGroupTreeProps): import("react/jsx-runtime").JSX.Element;
export {};
