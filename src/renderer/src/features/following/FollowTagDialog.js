import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Button } from "@/components/ui/button";
import { CreateFollowTagControl } from "@/components/following/CreateFollowTagControl";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
export function FollowTagDialog({ up, tags, onClose, onSaved, }) {
    const [selected, setSelected] = useState(new Set());
    const [initialTagIds, setInitialTagIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!up)
            return;
        setError("");
        setLoading(true);
        void window.biliDesk.bili
            .getUserFollowTags(up.mid)
            .then((tagIds) => {
            const next = new Set(tagIds);
            if (next.size === 0)
                next.add(0);
            setSelected(next);
            setInitialTagIds([...next]);
        })
            .catch((err) => {
            setError(formatDisplayedError(err, undefined, "加载分组失败"));
        })
            .finally(() => setLoading(false));
    }, [up]);
    if (!up)
        return null;
    const toggleTag = (tagId) => {
        if (tagId === 0)
            return;
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(tagId))
                next.delete(tagId);
            else
                next.add(tagId);
            if (!next.has(0))
                next.add(0);
            return next;
        });
    };
    const handleSave = async () => {
        setSaving(true);
        setError("");
        try {
            await window.biliDesk.bili.setUserFollowTags(up.mid, [...selected]);
            onSaved({ prevTagIds: initialTagIds, nextTagIds: [...selected] });
            onClose();
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "保存分组失败"));
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: cn("fixed inset-0 flex items-end justify-center bg-black/50 p-4 sm:items-center", APP_OVERLAY_ZCLASS), children: _jsxs("div", { className: "w-full max-w-md rounded-2xl border border-border bg-card shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: "\u8BBE\u7F6E\u5206\u7EC4" }), _jsx("p", { className: "text-xs text-muted-foreground", children: up.uname })] }), _jsx("button", { type: "button", onClick: onClose, className: "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsx("div", { className: "px-4 pt-3", children: _jsx(CreateFollowTagControl, { disabled: loading || saving, className: "w-full justify-center", onCreated: (tag) => {
                                setSelected((prev) => {
                                    const next = new Set(prev);
                                    next.add(tag.tagId);
                                    if (!next.has(0))
                                        next.add(0);
                                    return next;
                                });
                                setError("");
                            } }) }), _jsx("div", { className: "max-h-80 overflow-y-auto p-2", children: loading ? (_jsxs("div", { className: "flex items-center justify-center py-10 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u5206\u7EC4..."] })) : (_jsx("div", { className: "space-y-1", children: tags
                                .filter((tag) => tag.tagId >= 0)
                                .map((tag) => {
                                const checked = selected.has(tag.tagId);
                                const disabled = tag.tagId === 0;
                                return (_jsxs("label", { className: cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary", disabled && "cursor-default opacity-80"), children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-primary", checked: checked, disabled: disabled, onChange: () => toggleTag(tag.tagId) }), _jsx("span", { className: "flex-1 text-sm", children: tag.name }), _jsx("span", { className: "text-xs text-muted-foreground", children: tag.count })] }, tag.tagId));
                            }) })) }), error && _jsx("p", { className: "px-4 pb-2 text-xs text-red-400", children: error }), _jsxs("div", { className: "flex gap-2 border-t border-border p-3", children: [_jsx(Button, { type: "button", variant: "secondary", className: "flex-1", onClick: onClose, children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", className: "flex-1", disabled: loading || saving, onClick: () => void handleSave(), children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u4FDD\u5B58\u4E2D..."] })) : ("确定") })] })] }) }) }));
}
