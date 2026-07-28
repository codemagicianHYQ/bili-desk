import { create } from "zustand";
import type { Theme, UserInfo } from "@shared/types";

export type HomeGridColumns = 2 | 3 | 4 | 5;
export type ThemePreset = "rose" | "violet" | "ocean" | "emerald" | "amber";

export const THEME_PRESETS: Array<{
  id: ThemePreset;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    id: "rose",
    label: "玫瑰",
    description: "B 站感粉调",
    swatches: ["#fb7299", "#ff9fba", "#2a1119"],
  },
  {
    id: "violet",
    label: "紫雾",
    description: "Notion / Linear 风格",
    swatches: ["#8b5cf6", "#b18cff", "#1b1630"],
  },
  {
    id: "ocean",
    label: "海盐",
    description: "Discord / Arc 冷静蓝",
    swatches: ["#38bdf8", "#7dd3fc", "#0f1b28"],
  },
  {
    id: "emerald",
    label: "青岚",
    description: "GitHub 清爽绿",
    swatches: ["#34d399", "#6ee7b7", "#0d1f1a"],
  },
  {
    id: "amber",
    label: "琥珀",
    description: "Warm gold 点缀",
    swatches: ["#f59e0b", "#fbbf24", "#24170a"],
  },
];

const HOME_GRID_STORAGE_KEY = "bilidesk-home-grid-columns";
const THEME_PRESET_STORAGE_KEY = "bilidesk-theme-preset";

function readHomeGridColumns(): HomeGridColumns {
  const raw = localStorage.getItem(HOME_GRID_STORAGE_KEY);
  if (raw === "2" || raw === "3" || raw === "4" || raw === "5") {
    return Number(raw) as HomeGridColumns;
  }
  return 3;
}

function readThemePreset(): ThemePreset {
  const raw = localStorage.getItem(THEME_PRESET_STORAGE_KEY);
  if (THEME_PRESETS.some((preset) => preset.id === raw)) {
    return raw as ThemePreset;
  }
  return "rose";
}

function applyThemeAppearance(theme: Theme, preset: ThemePreset) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.themePreset = preset;
}

interface AppState {
  theme: Theme;
  themePreset: ThemePreset;
  user: UserInfo | null;
  homeGridColumns: HomeGridColumns;
  setTheme: (theme: Theme) => Promise<void>;
  setThemePreset: (preset: ThemePreset) => void;
  loadTheme: () => Promise<void>;
  loadUser: () => Promise<void>;
  loadPreferences: () => void;
  setHomeGridColumns: (columns: HomeGridColumns) => void;
  setUser: (user: UserInfo | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: "dark",
  themePreset: readThemePreset(),
  user: null,
  homeGridColumns: readHomeGridColumns(),
  setTheme: async (theme) => {
    await window.biliDesk.app.setTheme(theme);
    applyThemeAppearance(theme, get().themePreset);
    set({ theme });
  },
  setThemePreset: (preset) => {
    localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
    applyThemeAppearance(get().theme, preset);
    set({ themePreset: preset });
  },
  loadTheme: async () => {
    const theme = await window.biliDesk.app.getTheme();
    applyThemeAppearance(theme, get().themePreset);
    set({ theme });
  },
  loadUser: async () => {
    const user = await window.biliDesk.auth.getStatus();
    set({ user });
  },
  loadPreferences: () => {
    const homeGridColumns = readHomeGridColumns();
    const themePreset = readThemePreset();
    applyThemeAppearance(get().theme, themePreset);
    set({ homeGridColumns, themePreset });
  },
  setHomeGridColumns: (columns) => {
    localStorage.setItem(HOME_GRID_STORAGE_KEY, String(columns));
    set({ homeGridColumns: columns });
  },
  setUser: (user) => set({ user }),
}));
