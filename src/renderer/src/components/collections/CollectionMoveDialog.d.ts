import type { CollectionGroup, UserCollectionItem } from "@shared/types";
import type { CollectionTreeL1 } from "./CollectionGroupTree";
export declare function CollectionMoveDialog({ item, current, tree, onConfirm, onClose, }: {
    item: UserCollectionItem | null;
    current: CollectionGroup | undefined;
    tree: CollectionTreeL1[];
    onConfirm: (group: {
        l1: string;
        l2: string;
    } | null) => Promise<void>;
    onClose: () => void;
}): import("react/jsx-runtime").JSX.Element | null;
