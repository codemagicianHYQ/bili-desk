import { type FollowTag, type FollowingUp, type UpGroupSelection, type UpGroupTreeNode } from "@shared/types";
import { type TagListCache } from "@/lib/session-data-cache";
export type { TagListCache };
interface FollowingState {
    allFollowings: FollowingUp[] | null;
    followingsLoadedAt: number | null;
    followingsLoading: boolean;
    /** 正在从 B 站拉全量关注时已拿到的人数 */
    followingsProgress: number;
    followTags: FollowTag[];
    upGroupTree: UpGroupTreeNode[];
    uncategorizedCount: number;
    sidebarReady: boolean;
    refreshing: boolean;
    refreshVersion: number;
    ensureAllFollowings: (options?: {
        force?: boolean;
    }) => Promise<FollowingUp[]>;
    refreshSidebar: (options?: {
        force?: boolean;
    }) => Promise<void>;
    refresh: () => Promise<void>;
    filterLocalFollowings: (selection: UpGroupSelection) => Promise<FollowingUp[]>;
    invalidateFollowings: () => void;
    invalidateSidebar: () => void;
    patchFollowing: (mid: number, patch: Partial<FollowingUp> | null) => void;
    patchFollowTagCount: (tagId: number, delta: number) => void;
    patchSpecialFollowCount: (delta: number) => void;
    refreshFollowTags: () => Promise<void>;
    addFollowTag: (tag: FollowTag) => void;
    renameFollowTagLocal: (tagId: number, name: string) => void;
    removeFollowTagLocal: (tagId: number) => void;
    reloadUpGroupTree: () => Promise<void>;
    /** mid → 官方「最常访问」名次，越小越常访问 */
    attentionRank: Map<number, number> | null;
    ensureAttentionRank: () => Promise<Map<number, number>>;
    /** key 为 tagId，或 `${tagId}:attention`（最常访问顺序） */
    getTagList: (key: number | string) => TagListCache | undefined;
    putTagList: (key: number | string, list: TagListCache) => void;
    removeMidFromTagLists: (mid: number) => void;
    clearTagList: (tagId: number) => void;
    clearTagLists: () => void;
}
export declare function clearFollowingsSnapshots(): void;
export declare const useFollowingStore: import("zustand").UseBoundStore<import("zustand").StoreApi<FollowingState>>;
