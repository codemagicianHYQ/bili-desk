import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { useFollowingStore } from "@/stores/following-store";
const TITLE_MAX = 16;
function formatCreateError(err) {
    const message = extractIpcErrorMessage(err) || "创建失败";
    if (message.includes("412") || message.includes("安全策略")) {
        return "请求被 B 站安全策略拦截，请稍后重试";
    }
    return message;
}
export function CreateFollowTagControl({ disabled = false, className, onCreated, }) {
    const addFollowTag = useFollowingStore((state) => state.addFollowTag);
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [open]);
    const reset = () => {
        setOpen(false);
        setTitle("");
        setError("");
    };
    const handleCreate = async () => {
        const nextTitle = title.trim();
        if (!nextTitle) {
            setError("请输入分组名称");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const tag = await window.biliDesk.bili.createFollowTag(nextTitle);
            addFollowTag(tag);
            onCreated?.(tag);
            reset();
        }
        catch (err) {
            setError(formatCreateError(err));
        }
        finally {
            setSaving(false);
        }
    };
    if (!open) {
        return (_jsxs("button", { type: "button", disabled: disabled, onClick: () => {
                setError("");
                setOpen(true);
            }, className: cn("inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground disabled:opacity-50", className), children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), "\u65B0\u5EFA\u5206\u7EC4"] }));
    }
    return (_jsxs("div", { className: cn("space-y-2 rounded-lg border border-border bg-secondary/30 p-2.5", className), children: [_jsx("input", { ref: inputRef, type: "text", value: title, maxLength: TITLE_MAX, disabled: saving, placeholder: "\u5206\u7EC4\u540D\u79F0", autoComplete: "off", onChange: (event) => {
                    setTitle(event.target.value);
                    setError("");
                }, onKeyDown: (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCreate();
                    }
                    if (event.key === "Escape" && !saving) {
                        event.preventDefault();
                        event.stopPropagation();
                        reset();
                    }
                }, className: "h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20" }), _jsx("div", { className: "flex items-center justify-end", children: _jsxs("span", { className: "text-[11px] text-muted-foreground", children: [title.trim().length, "/", TITLE_MAX] }) }), error && _jsx("p", { className: "text-xs text-red-400", children: error }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { type: "button", size: "sm", variant: "secondary", className: "flex-1", disabled: saving, onClick: reset, children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", size: "sm", className: "flex-1", disabled: saving || !title.trim(), onClick: () => void handleCreate(), children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }), "\u521B\u5EFA\u4E2D"] })) : ("创建") })] })] }));
}
