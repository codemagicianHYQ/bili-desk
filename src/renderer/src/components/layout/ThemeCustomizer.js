import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { TEXT_COLOR_TONES, THEME_PRESETS, useAppStore, } from "@/stores/app-store";
import { cn } from "@/lib/utils";
function SliderRow({ label, hint, value, onChange, left, right, }) {
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-foreground", children: label }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: hint })] }), _jsx("span", { className: "tabular-nums text-xs text-muted-foreground", children: value })] }), _jsx("input", { type: "range", min: 0, max: 100, value: value, onChange: (event) => onChange(Number(event.target.value)), className: "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-primary" }), _jsxs("div", { className: "flex justify-between text-[10px] text-muted-foreground", children: [_jsx("span", { children: left }), _jsx("span", { children: right })] })] }));
}
export function ThemeCustomizer() {
    const wrapRef = useRef(null);
    const panelRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, right: 0 });
    const theme = useAppStore((state) => state.theme);
    const themePreset = useAppStore((state) => state.themePreset);
    const uiTransparency = useAppStore((state) => state.uiTransparency);
    const textContrast = useAppStore((state) => state.textContrast);
    const textColorTone = useAppStore((state) => state.textColorTone);
    const customTextColor = useAppStore((state) => state.customTextColor);
    const setTheme = useAppStore((state) => state.setTheme);
    const setThemePreset = useAppStore((state) => state.setThemePreset);
    const setUiTransparency = useAppStore((state) => state.setUiTransparency);
    const setTextContrast = useAppStore((state) => state.setTextContrast);
    const setTextColorTone = useAppStore((state) => state.setTextColorTone);
    const setCustomTextColor = useAppStore((state) => state.setCustomTextColor);
    useEffect(() => {
        if (!open)
            return;
        const updatePos = () => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (!rect)
                return;
            setPos({
                top: rect.bottom + 8,
                right: Math.max(8, window.innerWidth - rect.right),
            });
        };
        updatePos();
        window.addEventListener("resize", updatePos);
        window.addEventListener("scroll", updatePos, true);
        return () => {
            window.removeEventListener("resize", updatePos);
            window.removeEventListener("scroll", updatePos, true);
        };
    }, [open]);
    const handlePresetSelect = (preset) => {
        setThemePreset(preset);
    };
    const handleToneSelect = (tone) => {
        setTextColorTone(tone);
    };
    return (_jsxs("div", { ref: wrapRef, className: "relative", children: [_jsx(Button, { variant: "ghost", size: "icon", "aria-label": "\u4E3B\u9898\u5B9A\u5236", title: "\u4E3B\u9898\u5B9A\u5236", onClick: () => setOpen((value) => !value), children: _jsx(Palette, { className: "h-4 w-4" }) }), open && (_jsxs(OverlayPortal, { children: [_jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u4E3B\u9898\u5B9A\u5236", className: cn("fixed inset-0 cursor-default border-0 bg-transparent p-0", APP_OVERLAY_ZCLASS), onMouseDown: (event) => {
                            event.preventDefault();
                            setOpen(false);
                        } }), _jsx("div", { ref: panelRef, className: cn("fixed w-[22rem] overflow-hidden rounded-2xl border border-border shadow-2xl", APP_OVERLAY_ZCLASS, themePreset === "glass" ? "bili-glass bg-card/40" : "bg-card"), ...(themePreset === "glass" ? { "data-glass-panel": true } : {}), style: { top: pos.top, right: pos.right }, onMouseDown: (event) => event.stopPropagation(), children: _jsxs("div", { className: "max-h-[min(78vh,640px)] space-y-3 overflow-y-auto p-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-foreground", children: "\u4E3B\u9898\u5B9A\u5236" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "\u914D\u8272\u3001\u900F\u660E\u5EA6\u3001\u6587\u5B57\u989C\u8272\u4E0E\u5BF9\u6BD4\u5EA6\u90FD\u53EF\u8C03\uFF0C\u5207\u6362\u5373\u65F6\u751F\u6548\u3002" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs(Button, { variant: theme === "light" ? "default" : "outline", className: "justify-start gap-2", onClick: () => void setTheme("light"), children: [_jsx(Sun, { className: "h-4 w-4" }), "\u6D45\u8272\u6A21\u5F0F"] }), _jsxs(Button, { variant: theme === "dark" ? "default" : "outline", className: "justify-start gap-2", onClick: () => void setTheme("dark"), children: [_jsx(Moon, { className: "h-4 w-4" }), "\u6DF1\u8272\u6A21\u5F0F"] })] }), _jsx("div", { className: "space-y-2", children: THEME_PRESETS.map((preset) => {
                                        const active = themePreset === preset.id;
                                        return (_jsxs("button", { type: "button", onClick: () => handlePresetSelect(preset.id), className: cn("flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40", active
                                                ? "border-primary bg-primary/10"
                                                : themePreset === "glass"
                                                    ? "border-white/10 bg-white/10 hover:bg-white/16"
                                                    : "border-transparent bg-secondary/50 hover:bg-secondary/80"), children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-medium text-foreground", children: preset.label }), active && _jsx(Check, { className: "h-4 w-4 text-primary" })] }), _jsx("p", { className: "mt-0.5 text-xs text-muted-foreground", children: preset.description })] }), _jsx("div", { className: "ml-3 flex shrink-0 items-center gap-1.5", children: preset.swatches.map((swatch) => (_jsx("span", { className: "h-5 w-5 rounded-full border border-white/15 shadow-inner", style: { backgroundColor: swatch } }, swatch))) })] }, preset.id));
                                    }) }), _jsxs("div", { className: cn("space-y-3 rounded-xl border p-3", themePreset === "glass"
                                        ? "border-white/10 bg-white/5"
                                        : "border-border bg-secondary/40"), children: [_jsx("p", { className: "text-xs font-medium text-foreground", children: "\u53EF\u8BFB\u6027\u4E0E\u900F\u660E\u5EA6" }), _jsx(SliderRow, { label: "\u754C\u9762\u900F\u660E\u5EA6", hint: themePreset === "glass"
                                                ? "越高越透出壁纸；文字靠对比度补"
                                                : "主要作用于液态玻璃；其它主题保持实色", value: uiTransparency, onChange: setUiTransparency, left: "\u66F4\u5B9E", right: "\u66F4\u900F" }), _jsx(SliderRow, { label: "\u6587\u5B57\u5BF9\u6BD4\u5EA6", hint: "\u8D8A\u9AD8\u4E3B\u6587\u5B57\u8D8A\u4EAE\u3001\u6B21\u8981\u6587\u5B57\u8D8A\u6E05\u695A", value: textContrast, onChange: setTextContrast, left: "\u67D4\u548C", right: "\u9510\u5229" })] }), _jsxs("div", { className: cn("space-y-2 rounded-xl border p-3", themePreset === "glass"
                                        ? "border-white/10 bg-white/5"
                                        : "border-border bg-secondary/40"), children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-medium text-foreground", children: "\u6587\u5B57\u989C\u8272" }), _jsx("p", { className: "mt-0.5 text-[11px] text-muted-foreground", children: "\u900F\u660E\u78E8\u7802\u4E0B\u5EFA\u8BAE\u7528\u7EAF\u767D\u6216\u81EA\u5B9A\u4E49\u4EAE\u8272" })] }), _jsx("div", { className: "grid grid-cols-2 gap-1.5", children: TEXT_COLOR_TONES.map((tone) => {
                                                const active = textColorTone === tone.id;
                                                return (_jsxs("button", { type: "button", onClick: () => handleToneSelect(tone.id), className: cn("rounded-lg border px-2.5 py-2 text-left transition-colors", active
                                                        ? "border-primary bg-primary/15"
                                                        : themePreset === "glass"
                                                            ? "border-white/10 bg-white/5 hover:bg-white/10"
                                                            : "border-border bg-secondary/40 hover:bg-secondary/70"), children: [_jsx("p", { className: "text-xs font-medium text-foreground", children: tone.label }), _jsx("p", { className: "mt-0.5 text-[10px] text-muted-foreground", children: tone.hint })] }, tone.id));
                                            }) }), textColorTone === "custom" && (_jsxs("label", { className: "flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "\u81EA\u5B9A\u4E49\u8272" }), _jsx("input", { type: "color", value: customTextColor, onChange: (event) => setCustomTextColor(event.target.value), className: "h-8 w-12 cursor-pointer rounded border border-white/20 bg-transparent" })] }))] })] }) })] }))] }));
}
