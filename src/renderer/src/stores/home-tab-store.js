import { create } from "zustand";
import { useHomeSearchStore } from "@/stores/home-search-store";
export const useHomeTabStore = create((set, get) => ({
    tab: "video",
    setTab: (tab) => {
        if (get().tab === tab)
            return;
        if (tab === "live") {
            useHomeSearchStore.getState().clear();
        }
        set({ tab });
    },
}));
