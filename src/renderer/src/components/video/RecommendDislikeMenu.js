import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState } from "react";
import { EyeOff, MoreVertical, UserX } from "lucide-react";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
export function RecommendDislikeMenu({ video, onDislike, }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, right: 8 });
    const anchorRef = useRef(null);
    const panelRef = useRef(null);
    useLayoutEffect(() => {
        if (!open)
            return;
        const place = () => {
            const anchor = anchorRef.current?.getBoundingClientRect();
            if (!anchor)
                return;
            const height = panelRef.current?.offsetHeight ?? 88;
            const gap = 6;
            let top = anchor.bottom + gap;
            if (top + height > window.innerHeight - 8 &&
                anchor.top - gap - height > 8) {
                top = anchor.top - gap - height;
            }
            setPos({ top, right: Math.max(8, window.innerWidth - anchor.right) });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open]);
    const pick = (reason) => {
        setOpen(false);
        onDislike(reason);
    };
    const row = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#e3e5e7] transition-colors hover:bg-white/5";
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: anchorRef, type: "button", "aria-label": "\u63A8\u8350\u53CD\u9988", className: cn("shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground", open ? "opacity-100" : "opacity-0 group-hover:opacity-100"), onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen((prev) => !prev);
                }, children: _jsx(MoreVertical, { className: "h-4 w-4" }) }), open && (_jsx(OverlayPortal, { children: _jsxs("div", { className: "contents", onClick: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }, children: [_jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u63A8\u8350\u53CD\u9988", className: cn("fixed inset-0 cursor-default border-0 bg-transparent p-0", APP_OVERLAY_ZCLASS), onMouseDown: (event) => {
                                event.preventDefault();
                                setOpen(false);
                            } }), _jsxs("div", { ref: panelRef, role: "menu", className: cn("fixed w-48 overflow-hidden rounded-xl bg-[#2b2d31] py-1 shadow-2xl ring-1 ring-white/10", APP_OVERLAY_ZCLASS), style: { top: pos.top, right: pos.right }, onMouseDown: (event) => event.stopPropagation(), children: [_jsxs("button", { type: "button", className: row, onClick: () => pick(1), children: [_jsx(EyeOff, { className: "h-4 w-4 text-[#fb7299]" }), "\u4E0D\u611F\u5174\u8DA3"] }), video.owner.mid > 0 && (_jsxs("button", { type: "button", className: row, onClick: () => pick(4), children: [_jsx(UserX, { className: "h-4 w-4 text-[#fb7299]" }), _jsxs("span", { className: "min-w-0 truncate", children: ["\u4E0D\u60F3\u770B UP\uFF1A", video.owner.name] })] }))] })] }) }))] }));
}
