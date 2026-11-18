export type HomeTab = "video" | "live";
interface HomeTabState {
    tab: HomeTab;
    setTab: (tab: HomeTab) => void;
}
export declare const useHomeTabStore: import("zustand").UseBoundStore<import("zustand").StoreApi<HomeTabState>>;
export {};
