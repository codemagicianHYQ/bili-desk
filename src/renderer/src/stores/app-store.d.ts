import type { Theme, UserInfo } from "@shared/types";
export type HomeGridColumns = 2 | 3 | 4 | 5;
/** 收藏卡片是横向的，列数比首页少一档 */
export type FavGridColumns = 1 | 2 | 3 | 4;
export type ThemePreset = "rose" | "glass" | "violet" | "ocean" | "emerald" | "amber";
export type TextColorTone = "auto" | "pure" | "soft" | "warm" | "cool" | "custom";
export declare const THEME_PRESETS: Array<{
    id: ThemePreset;
    label: string;
    description: string;
    swatches: [string, string, string];
}>;
export declare const TEXT_COLOR_TONES: Array<{
    id: TextColorTone;
    label: string;
    hint: string;
}>;
export declare function applyUiCustomization(opts: {
    theme: Theme;
    themePreset: ThemePreset;
    uiTransparency: number;
    textContrast: number;
    textColorTone: TextColorTone;
    customTextColor: string;
}): void;
interface AppState {
    theme: Theme;
    themePreset: ThemePreset;
    /** 0–100，越高越透（液态玻璃更明显） */
    uiTransparency: number;
    /** 0–100，越高文字越亮/对比越强 */
    textContrast: number;
    textColorTone: TextColorTone;
    customTextColor: string;
    user: UserInfo | null;
    homeGridColumns: HomeGridColumns;
    favGridColumns: FavGridColumns;
    /** 无痕模式：不向 B 站同步观看历史 */
    incognitoMode: boolean;
    setTheme: (theme: Theme) => Promise<void>;
    setThemePreset: (preset: ThemePreset) => void;
    setUiTransparency: (value: number) => void;
    setTextContrast: (value: number) => void;
    setTextColorTone: (tone: TextColorTone) => void;
    setCustomTextColor: (color: string) => void;
    loadTheme: () => Promise<void>;
    loadUser: () => Promise<void>;
    loadPreferences: () => void;
    setHomeGridColumns: (columns: HomeGridColumns) => void;
    setFavGridColumns: (columns: FavGridColumns) => void;
    setIncognitoMode: (enabled: boolean) => void;
    setUser: (user: UserInfo | null) => void;
}
export declare const useAppStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AppState>>;
export {};
