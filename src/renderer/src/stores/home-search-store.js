import { create } from "zustand";
export const useHomeSearchStore = create((set) => ({
    query: "",
    order: "totalrank",
    setSearch: (query, order) => set({ query, order }),
    clear: () => set({ query: "", order: "totalrank" }),
}));
