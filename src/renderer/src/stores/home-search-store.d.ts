import type { SearchOrder } from "@shared/types";
interface HomeSearchState {
    query: string;
    order: SearchOrder;
    setSearch: (query: string, order: SearchOrder) => void;
    clear: () => void;
}
export declare const useHomeSearchStore: import("zustand").UseBoundStore<import("zustand").StoreApi<HomeSearchState>>;
export {};
