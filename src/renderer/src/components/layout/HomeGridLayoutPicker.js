import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { useAppStore, } from "@/stores/app-store";
const HOME_OPTIONS = [2, 3, 4, 5];
const FAV_OPTIONS = [1, 2, 3, 4];
export function HomeGridLayoutPicker({ target = "home", }) {
    const wrapRef = useRef(null);
    const panelRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, right: 0 });
    const homeColumns = useAppStore((state) => state.homeGridColumns);
    const favColumns = useAppStore((state) => state.favGridColumns);
    const setHomeColumns = useAppStore((state) => state.setHomeGridColumns);
    const setFavColumns = useAppStore((state) => state.setFavGridColumns);
    const isFav = target === "favorites";
    const homeGridColumns = isFav ? favColumns : homeColumns;
    const options = isFav ? FAV_OPTIONS : HOME_OPTIONS;
    const setHomeGridColumns = (value) => {
        if (isFav)
            setFavColumns(value);
        else
            setHomeColumns(value);
    };
    useEffect(() => {
        if (!open)
            return;
        const updatePos = () => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (!rect)
                return;
            setPos({
                top: rect.bottom + 6,
                right: Math.max(8, window.innerWidth - rect.right),
            });
        };
        const handleClickOutside = (event) => {
            const target = event.target;
            if (wrapRef.current?.contains(target) ||
                panelRef.current?.contains(target)) {
                return;
            }
            setOpen(false);
        };
        updatePos();
        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("resize", updatePos);
        window.addEventListener("scroll", updatePos, true);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("resize", updatePos);
            window.removeEventListener("scroll", updatePos, true);
        };
    }, [open]);
    return (_jsxs("div", { ref: wrapRef, className: "relative", children: [_jsx(Button, { variant: "ghost", size: "icon", "aria-label": "\u5E03\u5C40\u8BBE\u7F6E", title: `当前 ${homeGridColumns} 列布局`, onClick: () => setOpen((value) => !value), children: _jsx(LayoutGrid, { className: "h-4 w-4" }) }), open && (_jsx(OverlayPortal, { children: _jsxs("div", { ref: panelRef, "data-glass-panel": true, className: cn("bili-glass fixed w-36 overflow-hidden rounded-xl border border-border bg-card/40 py-1 shadow-2xl", APP_OVERLAY_ZCLASS), style: { top: pos.top, right: pos.right }, children: [_jsx("p", { className: "px-3 py-1.5 text-xs text-muted-foreground", children: "\u6BCF\u884C\u663E\u793A" }), options.map((value) => {
                            const option = { value, label: `${value} 列` };
                            const active = homeGridColumns === option.value;
                            return (_jsxs("button", { type: "button", className: cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-secondary", active && "text-primary"), onClick: () => {
                                    setHomeGridColumns(option.value);
                                    setOpen(false);
                                }, children: [_jsx("span", { children: option.label }), active && _jsx(Check, { className: "h-4 w-4" })] }, option.value));
                        })] }) }))] }));
}
