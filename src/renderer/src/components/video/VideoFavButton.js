import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { createPortal } from "react-dom";
import { CreateFavFolderControl } from "@/components/favorites/CreateFavFolderControl";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { cn, formatCount } from "@/lib/utils";
import { Bookmark, Folder, Loader2, Sparkles, X } from "lucide-react";
import { useFavoritesStore } from "@/stores/favorites-store";
import { ChargeRing } from "@/components/video/ChargeRing";
function formatFavError(err) {
    const message = formatDisplayedError(err, undefined, "操作失败");
    if (message.includes("412") || message.includes("安全策略")) {
        return "请求被 B 站安全策略拦截，请稍后重试";
    }
    return message;
}
export function VideoFavButton({ aid, title = "", intro, ownerName, count, className, appearance = "default", chargeProgress = 0, pop = false, collected, reloadToken = 0, onCollectedChange, }) {
    const invalidateFolders = useFavoritesStore((state) => state.invalidateFolders);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState("pick");
    const [suggested, setSuggested] = useState(null);
    const [folders, setFolders] = useState([]);
    const [initialSelected, setInitialSelected] = useState(new Set());
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const isCollected = collected === true || folders.some((folder) => folder.collected);
    const persistSelection = async (nextSelected, options) => {
        const addMediaIds = [...nextSelected].filter((id) => !initialSelected.has(id));
        const delMediaIds = [...initialSelected].filter((id) => !nextSelected.has(id));
        if (addMediaIds.length === 0 && delMediaIds.length === 0) {
            if (options?.closeOnSuccess !== false)
                setOpen(false);
            return;
        }
        if (nextSelected.size === 0 && initialSelected.size === 0) {
            setError("请至少选择一个收藏夹");
            return;
        }
        setSaving(true);
        setError("");
        try {
            await window.biliDesk.bili.setVideoFavFolders(aid, addMediaIds, delMediaIds);
            invalidateFolders();
            const wasCollected = initialSelected.size > 0;
            const nowCollected = nextSelected.size > 0;
            setFolders((prev) => prev.map((folder) => ({
                ...folder,
                collected: nextSelected.has(folder.id),
            })));
            setSelected(new Set(nextSelected));
            setInitialSelected(new Set(nextSelected));
            if (wasCollected !== nowCollected) {
                onCollectedChange?.(nowCollected);
            }
            if (options?.closeOnSuccess !== false)
                setOpen(false);
        }
        catch (err) {
            setError(formatFavError(err));
        }
        finally {
            setSaving(false);
        }
    };
    const loadFolders = useCallback(async (preferRecommend) => {
        setLoading(true);
        setError("");
        try {
            const list = await window.biliDesk.bili.getVideoFavFolders(aid);
            setFolders(list);
            const collectedIds = new Set(list.filter((folder) => folder.collected).map((folder) => folder.id));
            setInitialSelected(collectedIds);
            setSelected(new Set(collectedIds));
            const alreadyCollected = collectedIds.size > 0;
            if (!preferRecommend || alreadyCollected || !title.trim()) {
                setSuggested(null);
                setMode("pick");
                return;
            }
            try {
                const result = await window.biliDesk.bili.suggestFavFolder({
                    aid,
                    title,
                    intro,
                    ownerName,
                    folderTitles: list.map((folder) => folder.title),
                });
                const folder = result?.title
                    ? list.find((item) => item.title === result.title)
                    : undefined;
                if (folder && !collectedIds.has(folder.id)) {
                    setSuggested(folder);
                    setMode("recommend");
                }
                else {
                    setSuggested(null);
                    setMode("pick");
                }
            }
            catch {
                setSuggested(null);
                setMode("pick");
            }
        }
        catch (err) {
            setError(formatFavError(err));
            setFolders([]);
            setInitialSelected(new Set());
            setSelected(new Set());
            setSuggested(null);
            setMode("pick");
        }
        finally {
            setLoading(false);
        }
    }, [aid, intro, ownerName, title]);
    useEffect(() => {
        void loadFolders(false);
    }, [loadFolders, reloadToken]);
    useEffect(() => {
        if (collected !== true)
            return;
        setFolders((prev) => {
            if (prev.some((folder) => folder.collected))
                return prev;
            const defaultId = prev.find((folder) => folder.isDefault)?.id ?? prev[0]?.id;
            if (defaultId == null)
                return prev;
            return prev.map((folder) => folder.id === defaultId ? { ...folder, collected: true } : folder);
        });
    }, [collected]);
    useEffect(() => {
        if (!open)
            return;
        const handleKeyDown = (event) => {
            if (event.key === "Escape" && !saving)
                setOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, saving]);
    const toggleFolder = (folderId) => {
        setError("");
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(folderId))
                next.delete(folderId);
            else
                next.add(folderId);
            return next;
        });
    };
    const handleOpen = () => {
        setError("");
        setSuggested(null);
        const alreadyCollected = collected === true || folders.some((folder) => folder.collected);
        setMode(alreadyCollected ? "pick" : "recommend");
        setOpen(true);
        void loadFolders(true);
    };
    const handleRejectSuggest = () => {
        setMode("pick");
        setError("");
    };
    const picker = (_jsxs(_Fragment, { children: [_jsx("div", { className: "px-4 pt-3", children: _jsx(CreateFavFolderControl, { disabled: saving, onCreated: (folder) => {
                        setFolders((prev) => {
                            if (prev.some((item) => item.id === folder.id))
                                return prev;
                            return [
                                ...prev,
                                { ...folder, collected: false, isDefault: false },
                            ];
                        });
                        setSelected((prev) => new Set(prev).add(folder.id));
                        setError("");
                    } }) }), _jsx("div", { className: "scrollbar-overlay max-h-80 overflow-y-auto p-2", children: loading ? (_jsxs("div", { className: "flex items-center justify-center py-10 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u6536\u85CF\u5939..."] })) : folders.length === 0 ? (_jsx("p", { className: "px-3 py-8 text-center text-sm text-muted-foreground", children: error || "暂无收藏夹，点击左上角新建" })) : (_jsx("div", { className: "space-y-1", children: folders.map((folder) => {
                        const checked = selected.has(folder.id);
                        return (_jsxs("label", { className: "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-primary", checked: checked, disabled: saving, onChange: () => toggleFolder(folder.id) }), _jsx(Folder, { className: "h-4 w-4 shrink-0 text-muted-foreground" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-sm", children: folder.title }), _jsx("span", { className: "shrink-0 text-xs text-muted-foreground", children: folder.mediaCount })] }, folder.id));
                    }) })) }), error && folders.length > 0 && (_jsx("p", { className: "px-4 pb-2 text-xs text-red-400", children: error })), _jsxs("div", { className: "flex gap-2 border-t border-border p-3", children: [_jsx(Button, { type: "button", variant: "secondary", className: "flex-1", disabled: saving, onClick: () => setOpen(false), children: "\u53D6\u6D88" }), _jsx(Button, { type: "button", className: "flex-1", disabled: loading || saving || folders.length === 0, onClick: () => void persistSelection(selected), children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u4FDD\u5B58\u4E2D..."] })) : ("确定") })] })] }));
    const recommend = suggested ? (_jsxs("div", { className: "space-y-4 px-4 py-4", children: [_jsxs("div", { className: "rounded-xl border border-primary/30 bg-primary/10 px-3 py-3", children: [_jsxs("p", { className: "mb-2 flex items-center gap-1.5 text-xs text-primary", children: [_jsx(Sparkles, { className: "h-3.5 w-3.5" }), "\u63A8\u8350\u6536\u85CF\u5939"] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Folder, { className: "h-5 w-5 shrink-0 text-primary" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium", children: suggested.title }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [suggested.mediaCount, " \u4E2A\u5185\u5BB9"] })] })] })] }), _jsx("p", { className: "text-xs leading-relaxed text-muted-foreground", children: "\u6839\u636E\u6807\u9898\u5339\u914D\u4F60\u5DF2\u6709\u7684\u5939\u3002\u786E\u5B9A\u5C31\u653E\u8FDB\u53BB\uFF1B\u62D2\u7EDD\u540E\u53EF\u4EE5\u81EA\u5DF1\u52FE\u9009\u3002" }), error && _jsx("p", { className: "text-xs text-red-400", children: error }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { type: "button", variant: "secondary", className: "flex-1", disabled: saving, onClick: handleRejectSuggest, children: "\u62D2\u7EDD\uFF0C\u81EA\u5DF1\u9009" }), _jsx(Button, { type: "button", className: "flex-1", disabled: saving, onClick: () => void persistSelection(new Set([suggested.id])), children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u6536\u85CF\u4E2D..."] })) : ("确定") })] })] })) : (_jsxs("div", { className: "flex items-center justify-center py-10 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u6B63\u5728\u5339\u914D\u6536\u85CF\u5939..."] }));
    const dialog = open ? (_jsx("div", { className: `fixed inset-0 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`, "data-glass-scrim": true, onClick: () => {
            if (!saving)
                setOpen(false);
        }, children: _jsxs("div", { "data-glass-panel": true, className: "bili-glass relative z-[10000] w-full max-w-md rounded-2xl border border-border bg-card/40 shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: mode === "recommend" ? "推荐收藏夹" : "添加到收藏夹" }), _jsx("p", { className: "text-xs text-muted-foreground", children: mode === "recommend"
                                        ? "先看推荐，也可以拒绝后自己分类"
                                        : "选择要收录此视频的 B 站收藏夹" })] }), _jsx("button", { type: "button", disabled: saving, onClick: () => setOpen(false), className: "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50", children: _jsx(X, { className: "h-4 w-4" }) })] }), mode === "recommend" ? recommend : picker] }) })) : null;
    return (_jsxs(_Fragment, { children: [appearance === "toolbar" ? (_jsxs("button", { type: "button", className: cn("bili-toolbar-action", isCollected && "is-fav-active", pop && "is-pop", className), onClick: handleOpen, title: isCollected ? "已收藏" : "收藏", children: [_jsxs("span", { className: "relative inline-flex h-6 w-6 items-center justify-center", children: [_jsx(ChargeRing, { progress: chargeProgress }), _jsx(Bookmark, { className: cn("bili-toolbar-icon h-6 w-6", isCollected && "fill-current") })] }), _jsx("span", { className: "bili-toolbar-count", children: count != null
                            ? formatCount(count)
                            : isCollected
                                ? "已收藏"
                                : "收藏" })] })) : (_jsxs(Button, { type: "button", size: "sm", variant: "outline", className: cn("gap-1.5", isCollected ? "bili-action-btn-active" : "bili-action-btn", className), onClick: handleOpen, children: [_jsx(Bookmark, { className: cn("h-4 w-4", isCollected && "fill-current") }), count != null ? formatCount(count) : isCollected ? "已收藏" : "收藏"] })), dialog && createPortal(dialog, document.body)] }));
}
