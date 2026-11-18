import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
export function CollectionMoveDialog({ item, current, tree, onConfirm, onClose, }) {
    const [l1, setL1] = useState("");
    const [l2, setL2] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!item)
            return;
        setL1(current?.l1 ?? "");
        setL2(current?.l2 ?? "");
        setError("");
    }, [item, current]);
    useEffect(() => {
        if (!item)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape" && !busy)
                onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [item, busy, onClose]);
    if (!item)
        return null;
    const submit = async (group) => {
        setBusy(true);
        setError("");
        try {
            await onConfirm(group);
            onClose();
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "保存失败"));
        }
        finally {
            setBusy(false);
        }
    };
    const l2Options = tree.find((node) => node.name === l1.trim())?.children;
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: `fixed inset-0 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`, "data-glass-scrim": true, onClick: () => {
                if (!busy)
                    onClose();
            }, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "data-glass-panel": true, className: "bili-glass w-full max-w-md rounded-2xl border border-border bg-card/40 shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-start justify-between gap-3 border-b border-border px-5 py-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-base font-semibold", children: "\u79FB\u52A8\u5230\u672C\u5730\u5206\u7C7B" }), _jsx("p", { className: "mt-1 truncate text-xs text-muted-foreground", children: item.title })] }), _jsx("button", { type: "button", disabled: busy, onClick: onClose, className: "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50", "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: "space-y-4 p-5", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "\u4E00\u7EA7\u5206\u7C7B" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: tree.map((node) => (_jsx("button", { type: "button", onClick: () => {
                                                setL1(node.name);
                                                setL2("");
                                            }, className: cn("rounded-full px-2.5 py-1 text-xs transition-colors", l1 === node.name
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary/60 hover:bg-secondary"), children: node.name }, node.name))) }), _jsx("input", { value: l1, onChange: (event) => setL1(event.target.value), placeholder: "\u6216\u8F93\u5165\u65B0\u7684\u4E00\u7EA7\u5206\u7C7B\uFF0C\u5982 AI", className: "h-8 w-full rounded-md border border-border bg-background/60 px-2 text-sm outline-none focus:border-primary/60" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "\u4E8C\u7EA7\u5206\u7C7B" }), l2Options && l2Options.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1.5", children: l2Options.map((node) => (_jsx("button", { type: "button", onClick: () => setL2(node.name), className: cn("rounded-full px-2.5 py-1 text-xs transition-colors", l2 === node.name
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary/60 hover:bg-secondary"), children: node.name }, node.name))) })), _jsx("input", { value: l2, onChange: (event) => setL2(event.target.value), placeholder: "\u5982 AI\u89C6\u9891\uFF1B\u7559\u7A7A\u5F52\u5165\u300C\u7EFC\u5408\u300D", className: "h-8 w-full rounded-md border border-border bg-background/60 px-2 text-sm outline-none focus:border-primary/60" })] }), error && _jsx("p", { className: "text-xs text-red-400", children: error })] }), _jsxs("div", { className: "flex gap-2 border-t border-border p-4", children: [current && (_jsx(Button, { type: "button", variant: "ghost", disabled: busy, onClick: () => void submit(null), children: "\u79FB\u51FA\u5206\u7C7B" })), _jsx(Button, { type: "button", variant: "secondary", className: "ml-auto", disabled: busy, onClick: onClose, children: "\u53D6\u6D88" }), _jsxs(Button, { type: "button", disabled: busy || !l1.trim(), onClick: () => void submit({ l1: l1.trim(), l2: l2.trim() || "综合" }), children: [busy && _jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u4FDD\u5B58"] })] })] }) }) }));
}
