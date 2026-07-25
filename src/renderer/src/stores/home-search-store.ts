import { create } from "zustand";
import type { SearchOrder } from "@shared/types";

interface HomeSearchState {
  query: string;
  order: SearchOrder;
  setSearch: (query: string, order: SearchOrder) => void;
  clear: () => void;
}

export const useHomeSearchStore = create<HomeSearchState>((set) => ({
  query: "",
  order: "totalrank",
  setSearch: (query, order) => set({ query, order }),
  clear: () => set({ query: "", order: "totalrank" }),
}));
