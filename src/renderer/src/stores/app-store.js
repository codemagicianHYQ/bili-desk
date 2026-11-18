import { create } from "zustand";
export const THEME_PRESETS = [
    {
        id: "rose",
        label: "玫瑰",
        description: "B 站感粉调",
        swatches: ["#fb7299", "#ff9fba", "#2a1119"],
    },
    {
        id: "glass",
        label: "液态玻璃",
        description: "Win11 磨砂透壁纸",
        swatches: ["#c5dbff", "#7eb6ff", "#161822"],
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
export const TEXT_COLOR_TONES = [
    { id: "auto", label: "跟随主题", hint: "随浅色/深色自动" },
    { id: "pure", label: "纯白/纯黑", hint: "最高对比" },
    { id: "soft", label: "柔白", hint: "略柔和的白" },
    { id: "warm", label: "暖白", hint: "带一点暖调" },
    { id: "cool", label: "冷白", hint: "偏蓝的亮白" },
    { id: "custom", label: "自定义", hint: "自己选颜色" },
];
const HOME_GRID_STORAGE_KEY = "bilidesk-home-grid-columns";
const FAV_GRID_STORAGE_KEY = "bilidesk-fav-grid-columns";
const THEME_PRESET_STORAGE_KEY = "bilidesk-theme-preset";
const INCOGNITO_STORAGE_KEY = "bilidesk-incognito-mode";
const UI_TRANSPARENCY_KEY = "bilidesk-ui-transparency";
const TEXT_CONTRAST_KEY = "bilidesk-text-contrast";
const TEXT_TONE_KEY = "bilidesk-text-tone";
const TEXT_CUSTOM_COLOR_KEY = "bilidesk-text-custom-color";
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
function readHomeGridColumns() {
    const raw = localStorage.getItem(HOME_GRID_STORAGE_KEY);
    if (raw === "2" || raw === "3" || raw === "4" || raw === "5") {
        return Number(raw);
    }
    return 3;
}
function readFavGridColumns() {
    const raw = localStorage.getItem(FAV_GRID_STORAGE_KEY);
    if (raw === "1" || raw === "2" || raw === "3" || raw === "4") {
        return Number(raw);
    }
    return 2;
}
function readThemePreset() {
    const raw = localStorage.getItem(THEME_PRESET_STORAGE_KEY);
    if (THEME_PRESETS.some((preset) => preset.id === raw)) {
        return raw;
    }
    return "rose";
}
function readIncognitoMode() {
    return localStorage.getItem(INCOGNITO_STORAGE_KEY) === "1";
}
function readPercent(key, fallback) {
    const raw = Number(localStorage.getItem(key));
    if (!Number.isFinite(raw))
        return fallback;
    return clamp(Math.round(raw), 0, 100);
}
function readTextTone() {
    const raw = localStorage.getItem(TEXT_TONE_KEY);
    if (TEXT_COLOR_TONES.some((item) => item.id === raw)) {
        return raw;
    }
    return "pure";
}
function readCustomTextColor() {
    const raw = localStorage.getItem(TEXT_CUSTOM_COLOR_KEY);
    if (raw && /^#[0-9a-fA-F]{6}$/.test(raw))
        return raw;
    return "#ffffff";
}
function hexToHslComponents(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m)
        return null;
    const n = Number.parseInt(m[1], 16);
    let r = ((n >> 16) & 255) / 255;
    let g = ((n >> 8) & 255) / 255;
    let b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) {
        return `0 0% ${Math.round(l * 100)}%`;
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    switch (max) {
        case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
        case g:
            h = ((b - r) / d + 2) / 6;
            break;
        default:
            h = ((r - g) / d + 4) / 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function applyUiCustomization(opts) {
    const root = document.documentElement;
    root.classList.toggle("dark", opts.theme === "dark");
    root.dataset.themePreset = opts.themePreset;
    root.dataset.textTone = opts.textColorTone;
    const t = clamp(opts.uiTransparency, 0, 100) / 100;
    const c = clamp(opts.textContrast, 0, 100) / 100;
    // 越高越透：chrome / panel / card alpha 越低
    root.style.setProperty("--ui-chrome-alpha", lerp(0.14, 0.02, t).toFixed(3));
    root.style.setProperty("--ui-panel-alpha", lerp(0.08, 0.008, t).toFixed(3));
    root.style.setProperty("--ui-card-alpha", lerp(0.2, 0.05, t).toFixed(3));
    root.style.setProperty("--ui-text-contrast", c.toFixed(3));
    root.style.setProperty("--ui-text-shadow", (0.25 + 0.55 * c).toFixed(3));
    if (opts.textColorTone === "custom") {
        const hsl = hexToHslComponents(opts.customTextColor);
        if (hsl) {
            root.style.setProperty("--ui-text-hsl", hsl);
            root.style.setProperty("--foreground", hsl);
            root.style.setProperty("--card-foreground", hsl);
        }
    }
    else {
        root.style.removeProperty("--ui-text-hsl");
        root.style.removeProperty("--foreground");
        root.style.removeProperty("--card-foreground");
    }
    const glassOn = opts.themePreset === "glass";
    void (async () => {
        try {
            await window.biliDesk?.app?.setThemePreset?.(opts.themePreset);
        }
        catch (err) {
            console.warn("[BiliDesk] setThemePreset failed", err);
        }
        try {
            await window.biliDesk?.app?.setWindowGlass?.(glassOn);
        }
        catch (err) {
            console.warn("[BiliDesk] setWindowGlass failed", err);
        }
    })();
}
function applyFromState(get) {
    const state = get();
    applyUiCustomization({
        theme: state.theme,
        themePreset: state.themePreset,
        uiTransparency: state.uiTransparency,
        textContrast: state.textContrast,
        textColorTone: state.textColorTone,
        customTextColor: state.customTextColor,
    });
}
export const useAppStore = create((set, get) => ({
    theme: "dark",
    themePreset: readThemePreset(),
    uiTransparency: readPercent(UI_TRANSPARENCY_KEY, 72),
    textContrast: readPercent(TEXT_CONTRAST_KEY, 78),
    textColorTone: readTextTone(),
    customTextColor: readCustomTextColor(),
    user: null,
    homeGridColumns: readHomeGridColumns(),
    favGridColumns: readFavGridColumns(),
    incognitoMode: readIncognitoMode(),
    setTheme: async (theme) => {
        await window.biliDesk.app.setTheme(theme);
        set({ theme });
        applyFromState(get);
    },
    setThemePreset: (preset) => {
        localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
        set({ themePreset: preset });
        applyFromState(get);
    },
    setUiTransparency: (value) => {
        const uiTransparency = clamp(Math.round(value), 0, 100);
        localStorage.setItem(UI_TRANSPARENCY_KEY, String(uiTransparency));
        set({ uiTransparency });
        applyFromState(get);
    },
    setTextContrast: (value) => {
        const textContrast = clamp(Math.round(value), 0, 100);
        localStorage.setItem(TEXT_CONTRAST_KEY, String(textContrast));
        set({ textContrast });
        applyFromState(get);
    },
    setTextColorTone: (tone) => {
        localStorage.setItem(TEXT_TONE_KEY, tone);
        set({ textColorTone: tone });
        applyFromState(get);
    },
    setCustomTextColor: (color) => {
        const customTextColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ffffff";
        localStorage.setItem(TEXT_CUSTOM_COLOR_KEY, customTextColor);
        set({ customTextColor, textColorTone: "custom" });
        localStorage.setItem(TEXT_TONE_KEY, "custom");
        applyFromState(get);
    },
    loadTheme: async () => {
        const theme = await window.biliDesk.app.getTheme();
        set({ theme });
        applyFromState(get);
    },
    loadUser: async () => {
        const user = await window.biliDesk.auth.getStatus();
        set({ user });
    },
    loadPreferences: () => {
        const homeGridColumns = readHomeGridColumns();
        const themePreset = readThemePreset();
        const incognitoMode = readIncognitoMode();
        const uiTransparency = readPercent(UI_TRANSPARENCY_KEY, 72);
        const textContrast = readPercent(TEXT_CONTRAST_KEY, 78);
        const textColorTone = readTextTone();
        const customTextColor = readCustomTextColor();
        set({
            homeGridColumns,
            favGridColumns: readFavGridColumns(),
            themePreset,
            incognitoMode,
            uiTransparency,
            textContrast,
            textColorTone,
            customTextColor,
        });
        applyFromState(get);
    },
    setHomeGridColumns: (columns) => {
        localStorage.setItem(HOME_GRID_STORAGE_KEY, String(columns));
        set({ homeGridColumns: columns });
    },
    setFavGridColumns: (columns) => {
        localStorage.setItem(FAV_GRID_STORAGE_KEY, String(columns));
        set({ favGridColumns: columns });
    },
    setIncognitoMode: (enabled) => {
        localStorage.setItem(INCOGNITO_STORAGE_KEY, enabled ? "1" : "0");
        set({ incognitoMode: enabled });
    },
    setUser: (user) => set({ user }),
}));
