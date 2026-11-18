import { create } from "zustand";
import { folderListCache, } from "@/lib/session-data-cache";
export const useFavoritesStore = create((set, get) => ({
    tree: [],
    assignments: [],
    folders: [],
    taxonomyReady: false,
    foldersReady: false,
    coversEnriched: false,
    refreshing: false,
    refreshVersion: 0,
    ensureTaxonomy: async ({ force = false } = {}) => {
        if (!force && get().taxonomyReady)
            return;
        const [nextTree, nextAssignments] = await Promise.all([
            window.biliDesk.taxonomy.getTree(),
            window.biliDesk.taxonomy.getFavoriteAssignments(),
        ]);
        set({
            tree: nextTree,
            assignments: nextAssignments,
            taxonomyReady: true,
        });
    },
    ensureFolders: async ({ force = false } = {}) => {
        if (!force && get().foldersReady) {
            return get().folders;
        }
        const list = await window.biliDesk.bili.getFavFolders();
        set({ folders: list, foldersReady: true });
        return list;
    },
    enrichCoversOnce: async () => {
        if (get().coversEnriched)
            return;
        let remaining = 1;
        let guard = 0;
        while (remaining > 0 && guard < 20) {
            const result = await window.biliDesk.taxonomy.enrichFavoriteCovers();
            remaining = result.remaining;
            guard++;
            if (result.updated > 0) {
                const nextAssignments = await window.biliDesk.taxonomy.getFavoriteAssignments();
                set({ assignments: nextAssignments, taxonomyReady: true });
            }
            if (remaining === 0)
                break;
        }
        set({ coversEnriched: true });
    },
    refresh: async () => {
        if (get().refreshing)
            return;
        set({
            refreshing: true,
            foldersReady: false,
            taxonomyReady: false,
        });
        folderListCache.clear();
        try {
            await Promise.all([
                get().ensureTaxonomy({ force: true }),
                get().ensureFolders({ force: true }),
            ]);
            set((state) => ({ refreshVersion: state.refreshVersion + 1 }));
        }
        finally {
            set({ refreshing: false });
        }
    },
    invalidateTaxonomy: () => {
        set({ taxonomyReady: false, coversEnriched: false });
    },
    invalidateFolders: () => {
        folderListCache.clear();
        set({ foldersReady: false });
    },
    addFolder: (folder) => {
        set((state) => {
            if (!state.foldersReady)
                return state;
            if (state.folders.some((item) => item.id === folder.id))
                return state;
            return { folders: [...state.folders, folder] };
        });
    },
    patchFolder: (id, patch) => {
        set((state) => ({
            folders: state.folders.map((folder) => folder.id === id ? { ...folder, ...patch } : folder),
        }));
    },
    setFolders: (folders) => {
        set({ folders, foldersReady: true });
    },
    patchFolderCounts: (deltas) => {
        set((state) => ({
            folders: state.folders.map((folder) => {
                const delta = deltas[folder.id];
                if (!delta)
                    return folder;
                return {
                    ...folder,
                    mediaCount: Math.max(0, folder.mediaCount + delta),
                };
            }),
        }));
    },
    getFolderList: (mediaId) => folderListCache.get(String(mediaId)),
    putFolderList: (mediaId, list) => {
        folderListCache.set(String(mediaId), list);
    },
    removeItemsFromFolderList: (mediaId, aids) => {
        const current = folderListCache.get(String(mediaId));
        if (!current)
            return;
        const removed = new Set(aids);
        folderListCache.set(String(mediaId), {
            ...current,
            resources: current.resources.filter((item) => !removed.has(item.id)),
        });
    },
    clearFolderList: (mediaId) => {
        folderListCache.delete(String(mediaId));
    },
    clearFolderLists: () => {
        folderListCache.clear();
    },
}));
