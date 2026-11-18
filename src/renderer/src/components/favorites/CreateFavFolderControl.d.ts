import type { FavFolder } from "@shared/types";
interface CreateFavFolderControlProps {
    disabled?: boolean;
    className?: string;
    onCreated?: (folder: FavFolder) => void;
}
export declare function CreateFavFolderControl({ disabled, className, onCreated, }: CreateFavFolderControlProps): import("react/jsx-runtime").JSX.Element;
export {};
