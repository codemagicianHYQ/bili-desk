import type { FavFolder } from "@shared/types";
interface FavMoveDialogProps {
    open: boolean;
    folders: FavFolder[];
    sourceFolderId: number;
    selectedCount: number;
    loading?: boolean;
    error?: string;
    onConfirm: (targetFolderId: number) => void;
    onClose: () => void;
}
export declare function FavMoveDialog({ open, folders, sourceFolderId, selectedCount, loading, error, onConfirm, onClose, }: FavMoveDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
