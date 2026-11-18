interface NavigationState {
    followingKeepAlive: boolean;
    favoritesKeepAlive: boolean;
    collectionsKeepAlive: boolean;
    watchLaterKeepAlive: boolean;
    dynamicsKeepAlive: boolean;
    historyKeepAlive: boolean;
    popularKeepAlive: boolean;
    upActivityKeepAlive: boolean;
    integrityKeepAlive: boolean;
    settingsKeepAlive: boolean;
    messagesKeepAlive: boolean;
    videoKeepAlive: boolean;
    liveKeepAlive: boolean;
    activeVideoBvid: string | null;
    activeLiveRoomId: number | null;
    /** 最近一次停留的主栏目，进视频/UP/专栏等详情页时侧栏高亮它 */
    lastSection: string;
    syncKeepAlive: (path: string, prevPath: string) => void;
}
export declare const useNavigationStore: import("zustand").UseBoundStore<import("zustand").StoreApi<NavigationState>>;
export {};
