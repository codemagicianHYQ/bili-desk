import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { Folder, Loader2, X } from "lucide-react";
export function FavMoveDialog({ open, folders, sourceFolderId, selectedCount, loading = false, error = "", onConfirm, onClose, }) {
    const [targetId, setTargetId] = useState(null);
    useEffect(() => {
        if (!open) {
            setTargetId(null);
            return;
        }
        const firstOther = folders.find((folder) => folder.id !== sourceFolderId);
        setTargetId(firstOther?.id ?? null);
    }, [open, folders, sourceFolderId]);
    useEffect(() => {
        if (!open)
            return;
        const handleKeyDown = (event) => {
            if (event.key === "Escape" && !loading)
                onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, loading, onClose]);
    if (!open)
        return null;
    const targets = folders.filter((folder) => folder.id !== sourceFolderId);
    const sourceTitle = folders.find((folder) => folder.id === sourceFolderId)?.title ??
        "当前收藏夹";
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: `fixed inset-0 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`, "data-glass-scrim": true, onClick: () => {
                if (!loading)
                    onClose();
            }, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "data-glass-panel": true, className: "bili-glass w-full max-w-md rounded-2xl border border-border bg-card/40 shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-start justify-between gap-3 border-b border-border px-5 py-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-semibold", children: "\u6279\u91CF\u79FB\u52A8\u5230\u6536\u85CF\u5939" }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: ["\u5DF2\u9009 ", selectedCount, " \u4E2A\u89C6\u9891 \u00B7 \u4ECE\u300C", sourceTitle, "\u300D\u79FB\u51FA"] })] }), _jsx("button", { type: "button", disabled: loading, onClick: onClose, className: "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50", "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsx("div", { className: "max-h-[50vh] space-y-1 overflow-y-auto p-3", children: targets.length === 0 ? (_jsx("p", { className: "px-2 py-8 text-center text-sm text-muted-foreground", children: "\u6CA1\u6709\u5176\u4ED6\u53EF\u79FB\u52A8\u5230\u7684\u6536\u85CF\u5939" })) : (targets.map((folder) => {
                            const active = targetId === folder.id;
                            return (_jsxs("button", { type: "button", disabled: loading, onClick: () => setTargetId(folder.id), className: cn("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", active
                                    ? "bg-primary/15 text-primary"
                                    : "hover:bg-secondary"), children: [_jsx(Folder, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: folder.title }), _jsx("span", { className: "shrink-0 text-xs text-muted-foreground", children: folder.mediaCount })] }, folder.id));
                        })) }), error && _jsx("p", { className: "px-5 pb-2 text-xs text-red-400", children: error }), _jsxs("div", { className: "flex gap-2 border-t border-border p-4", children: [_jsx(Button, { type: "button", variant: "secondary", className: "flex-1", disabled: loading, onClick: onClose, children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", className: "flex-1", disabled: loading || targetId == null || targets.length === 0, onClick: () => {
                                    if (targetId != null)
                                        onConfirm(targetId);
                                }, children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u79FB\u52A8\u4E2D..."] })) : ("确认移动") })] })] }) }) }));
}
