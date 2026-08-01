import { create } from "zustand";
import { useHomeSearchStore } from "@/stores/home-search-store";

export type HomeTab = "video" | "live";

interface HomeTabState {
  tab: HomeTab;
  setTab: (tab: HomeTab) => void;
}

export const useHomeTabStore = create<HomeTabState>((set, get) => ({
  tab: "video",
  setTab: (tab) => {
    if (get().tab === tab) return;
    if (tab === "live") {
      useHomeSearchStore.getState().clear();
    }
    set({ tab });
  },
}));
