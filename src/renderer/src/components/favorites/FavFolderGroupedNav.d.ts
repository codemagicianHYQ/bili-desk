import { type DragEvent } from "react";
import type { FavFolder } from "@shared/types";
import { type FavFolderGroupOverrides } from "@shared/utils/fav-folder-groups";
interface FavFolderGroupedNavProps {
    folders: FavFolder[];
    groupOverrides?: FavFolderGroupOverrides;
    selectedFolder: number | null;
    draggingFolderId: number | null;
    dropFolderId: number | null;
    dropEdge: "before" | "after";
    dropGroupName: string | null;
    onSelect: (folderId: number) => void;
    onDragStart: (event: DragEvent<HTMLDivElement>, folder: FavFolder) => void;
    onDragOver: (event: DragEvent<HTMLDivElement>, folderId: number) => void;
    onDrop: (event: DragEvent<HTMLDivElement>, folderId: number) => void;
    onDragOverGroup: (event: DragEvent<HTMLElement>, groupName: string) => void;
    onDropOnGroup: (event: DragEvent<HTMLElement>, groupName: string) => void;
    onDragEnd: () => void;
    shouldIgnoreClick: () => boolean;
    onEdit: (folder: FavFolder) => void;
    onCleanInvalid: (folder: FavFolder) => void;
    onDelete: (folder: FavFolder) => void;
}
export declare function FavFolderGroupedNav({ folders, groupOverrides, selectedFolder, draggingFolderId, dropFolderId, dropEdge, dropGroupName, onSelect, onDragStart, onDragOver, onDrop, onDragOverGroup, onDropOnGroup, onDragEnd, shouldIgnoreClick, onEdit, onCleanInvalid, onDelete, }: FavFolderGroupedNavProps): import("react/jsx-runtime").JSX.Element;
export {};
