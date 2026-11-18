import type { LiveRoomItem } from "@shared/types";
interface HomeLiveState {
    rooms: LiveRoomItem[];
    following: LiveRoomItem[];
    followingCount: number;
    page: number;
    hasMore: boolean;
    hydrated: boolean;
    loading: boolean;
    loadingMore: boolean;
    refreshing: boolean;
    error: string;
    followingError: string;
    fetchInitial: () => Promise<void>;
    loadMore: () => Promise<void>;
    refresh: () => Promise<void>;
}
export declare const useHomeLiveStore: import("zustand").UseBoundStore<import("zustand").StoreApi<HomeLiveState>>;
export {};
