import type { FavFolder } from "@shared/types";
interface EditFavFolderDialogProps {
    folder: FavFolder | null;
    onClose: () => void;
}
export declare function EditFavFolderDialog({ folder, onClose, }: EditFavFolderDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
