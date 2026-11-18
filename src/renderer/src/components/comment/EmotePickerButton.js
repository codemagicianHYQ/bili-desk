import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { createPortal } from "react-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { loadReplyEmotePackages } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Smile, X } from "lucide-react";
let lastPackId = 0;
function isKaomoji(item, packType) {
    return item.type === 4 || packType === 4;
}
export function EmotePickerButton({ onPick, className, variant = "dialog", }) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef(null);
    const [popoverBox, setPopoverBox] = useState({ left: 8, bottom: 8 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [packs, setPacks] = useState([]);
    const [activeId, setActiveId] = useState(lastPackId);
    const tabRowRef = useRef(null);
    const gridRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        let cancelled = false;
        setLoading(true);
        setError("");
        void loadReplyEmotePackages()
            .then((panel) => {
            if (cancelled)
                return;
            const next = panel.packages ?? [];
            setPacks(next);
            const preferred = next.find((pack) => pack.id === lastPackId)?.id ?? next[0]?.id ?? 0;
            setActiveId(preferred);
            lastPackId = preferred;
        })
            .catch((err) => {
            if (!cancelled) {
                setError(formatDisplayedError(err, undefined, "表情加载失败"));
            }
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const onKey = (event) => {
            if (event.key === "Escape")
                setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);
    useLayoutEffect(() => {
        if (!open || variant !== "popover")
            return;
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect)
            return;
        const width = 420;
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
        setPopoverBox({ left, bottom: window.innerHeight - rect.top + 8 });
    }, [open, variant]);
    const active = packs.find((pack) => pack.id === activeId) ?? packs[0];
    const large = active?.emotes.some((item) => item.size === 2) ?? false;
    const selectPack = (id) => {
        lastPackId = id;
        setActiveId(id);
        gridRef.current?.scrollTo({ top: 0 });
    };
    const stepPack = (dir) => {
        if (packs.length === 0)
            return;
        const index = packs.findIndex((pack) => pack.id === activeId);
        const from = index >= 0 ? index : 0;
        const next = packs[(from + dir + packs.length) % packs.length];
        if (next)
            selectPack(next.id);
    };
    useEffect(() => {
        if (!open)
            return;
        const tab = tabRowRef.current?.querySelector(`[data-pack-id="${activeId}"]`);
        tab?.scrollIntoView({
            inline: "nearest",
            block: "nearest",
            behavior: "smooth",
        });
    }, [activeId, open]);
    const dialog = open
        ? createPortal(_jsxs("div", { className: variant === "popover"
                ? "contents"
                : `fixed inset-0 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`, "data-glass-scrim": variant === "dialog" ? "" : undefined, onClick: variant === "popover" ? undefined : () => setOpen(false), children: [variant === "popover" && (_jsx("button", { type: "button", className: `fixed inset-0 cursor-default ${APP_OVERLAY_ZCLASS}`, "aria-label": "\u5173\u95ED\u8868\u60C5", onClick: () => setOpen(false) })), _jsxs("div", { "data-glass-panel": true, className: cn("bili-glass relative z-[20001] flex flex-col overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl", variant === "popover" ? "fixed w-[420px]" : "w-full max-w-xl"), style: variant === "popover"
                        ? { left: popoverBox.left, bottom: popoverBox.bottom }
                        : undefined, onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: active?.name || "插入表情" }), _jsx("p", { className: "text-xs text-muted-foreground", children: variant === "popover"
                                                ? "和评论区同一套表情，点一下插入到输入框"
                                                : "点击表情会插入到评论输入框" })] }), _jsx("button", { type: "button", onClick: () => setOpen(false), className: "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsx("div", { ref: gridRef, className: "scrollbar-overlay h-72 overflow-y-auto p-3", children: loading ? (_jsxs("p", { className: "flex items-center justify-center py-10 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u8868\u60C5..."] })) : error ? (_jsx("p", { className: "py-10 text-center text-sm text-red-400", children: error })) : !active ? (_jsx("p", { className: "py-10 text-center text-sm text-muted-foreground", children: "\u6682\u65E0\u53EF\u7528\u8868\u60C5" })) : (_jsx("div", { className: cn("grid gap-1.5", large
                                    ? "grid-cols-5 sm:grid-cols-6"
                                    : "grid-cols-8 sm:grid-cols-10"), children: active.emotes.map((item) => {
                                    const kaomoji = isKaomoji(item, active.type);
                                    return (_jsx("button", { type: "button", title: item.text, onClick: () => {
                                            onPick(item.text, kaomoji ? undefined : item.url);
                                            if (variant !== "popover")
                                                setOpen(false);
                                        }, className: cn("flex items-center justify-center rounded-lg transition-colors hover:bg-secondary", large ? "h-14" : "h-10", kaomoji && "px-1"), children: kaomoji ? (_jsx("span", { className: "truncate text-[11px] leading-tight text-foreground", children: item.text })) : (_jsx(BiliImage, { src: item.url, alt: item.text, className: cn("object-contain", large ? "h-12 w-12" : "h-7 w-7") })) }, `${active.id}-${item.text}`));
                                }) })) }), packs.length > 1 ? (_jsxs("div", { className: "flex items-center gap-1 border-t border-border px-1.5 py-1.5", children: [_jsx("button", { type: "button", className: "shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", onClick: () => stepPack(-1), "aria-label": "\u4E0A\u4E00\u7EC4\u8868\u60C5\u5305", children: _jsx(ChevronLeft, { className: "h-4 w-4" }) }), _jsx("div", { ref: tabRowRef, className: "scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto", children: packs.map((pack) => {
                                        const selected = pack.id === active?.id;
                                        return (_jsx("button", { "data-pack-id": pack.id, type: "button", title: pack.name, onClick: () => selectPack(pack.id), className: cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", selected
                                                ? "bg-secondary ring-1 ring-border"
                                                : "hover:bg-secondary/70"), children: pack.type === 4 ? (_jsx("span", { className: "text-[10px] text-muted-foreground", children: "Aa" })) : pack.icon ? (_jsx(BiliImage, { src: pack.icon, alt: pack.name, className: "h-6 w-6 object-contain" })) : (_jsx(Smile, { className: "h-4 w-4 text-muted-foreground" })) }, pack.id));
                                    }) }), _jsx("button", { type: "button", className: "shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", onClick: () => stepPack(1), "aria-label": "\u4E0B\u4E00\u7EC4\u8868\u60C5\u5305", children: _jsx(ChevronRight, { className: "h-4 w-4" }) })] })) : null] })] }), document.body)
        : null;
    return (_jsxs(_Fragment, { children: [_jsxs(Button, { ref: anchorRef, type: "button", size: variant === "popover" ? "icon" : "sm", variant: "ghost", className: cn("text-muted-foreground", variant === "popover" ? "h-8 w-8" : "gap-1.5", className), onClick: () => setOpen((value) => !value), title: "\u8868\u60C5", children: [_jsx(Smile, { className: "h-4 w-4" }), variant === "popover" ? null : "表情"] }), dialog] }));
}
