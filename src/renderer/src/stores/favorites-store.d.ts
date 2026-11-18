import type { CategoryTreeNode, FavoriteItemAssignment, FavFolder } from "@shared/types";
import { type FolderListCache } from "@/lib/session-data-cache";
export type { FolderListCache };
interface FavoritesState {
    tree: CategoryTreeNode[];
    assignments: FavoriteItemAssignment[];
    folders: FavFolder[];
    taxonomyReady: boolean;
    foldersReady: boolean;
    coversEnriched: boolean;
    refreshing: boolean;
    refreshVersion: number;
    ensureTaxonomy: (options?: {
        force?: boolean;
    }) => Promise<void>;
    ensureFolders: (options?: {
        force?: boolean;
    }) => Promise<FavFolder[]>;
    enrichCoversOnce: () => Promise<void>;
    refresh: () => Promise<void>;
    invalidateTaxonomy: () => void;
    invalidateFolders: () => void;
    addFolder: (folder: FavFolder) => void;
    patchFolder: (id: number, patch: Partial<FavFolder>) => void;
    setFolders: (folders: FavFolder[]) => void;
    /** 乐观更新收藏夹数量，key 为 folder.id，value 为增量 */
    patchFolderCounts: (deltas: Record<number, number>) => void;
    getFolderList: (mediaId: number) => FolderListCache | undefined;
    putFolderList: (mediaId: number, list: FolderListCache) => void;
    removeItemsFromFolderList: (mediaId: number, aids: number[]) => void;
    clearFolderList: (mediaId: number) => void;
    clearFolderLists: () => void;
}
export declare const useFavoritesStore: import("zustand").UseBoundStore<import("zustand").StoreApi<FavoritesState>>;
