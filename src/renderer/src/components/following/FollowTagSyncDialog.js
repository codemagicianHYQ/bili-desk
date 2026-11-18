import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { useFollowingStore } from "@/stores/following-store";
import { cn } from "@/lib/utils";
function formatDuration(seconds) {
    if (seconds < 60)
        return `${seconds} 秒`;
    return `${Math.ceil(seconds / 60)} 分钟`;
}
export function FollowTagSyncDialog({ open, onClose, }) {
    const [plan, setPlan] = useState(null);
    const [status, setStatus] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [error, setError] = useState("");
    const finishedRef = useRef(false);
    const running = status?.state === "running";
    const finished = status != null &&
        (status.state === "done" ||
            status.state === "failed" ||
            status.state === "cancelled");
    const preview = useCallback(async () => {
        setPreviewing(true);
        setError("");
        setPlan(null);
        try {
            const all = await useFollowingStore.getState().ensureAllFollowings();
            const next = await window.biliDesk.bili.previewFollowTagSync(all.map((up) => up.mid));
            setPlan(next);
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || "预览失败");
        }
        finally {
            setPreviewing(false);
        }
    }, []);
    useEffect(() => {
        if (!open)
            return;
        finishedRef.current = false;
        setStatus(null);
        void window.biliDesk.bili.getFollowTagSyncStatus().then((current) => {
            if (current.state === "running")
                setStatus(current);
            else
                void preview();
        });
    }, [open, preview]);
    useEffect(() => {
        if (!open || !running)
            return;
        const timer = window.setInterval(() => {
            void window.biliDesk.bili.getFollowTagSyncStatus().then(setStatus);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [open, running]);
    useEffect(() => {
        if (!finished || finishedRef.current)
            return;
        finishedRef.current = true;
        const store = useFollowingStore.getState();
        store.clearTagLists();
        void store.refreshFollowTags().catch(() => undefined);
    }, [finished]);
    const start = async () => {
        if (!plan)
            return;
        setError("");
        try {
            await window.biliDesk.bili.startFollowTagSync(plan.planId);
            setStatus(await window.biliDesk.bili.getFollowTagSyncStatus());
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || "启动整理失败");
        }
    };
    if (!open)
        return null;
    const nothingToDo = plan != null && plan.writeRequests === 0;
    const addTotal = plan?.groups.reduce((sum, g) => sum + g.addCount, 0) ?? 0;
    const percent = status && status.total > 0
        ? Math.min(100, Math.round((status.done / status.total) * 100))
        : 0;
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: cn("fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm", APP_OVERLAY_ZCLASS), "data-glass-scrim": true, onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "data-glass-panel": true, className: "bili-glass flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card/40 shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-start justify-between gap-3 px-5 pt-5", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-base font-semibold", children: "\u6574\u7406\u5230\u73B0\u6709 B \u7AD9\u5206\u7EC4" }), _jsx("p", { className: "mt-1 text-xs leading-relaxed text-muted-foreground", children: "\u672C\u5730\u5206\u7EC4\u548C B \u7AD9\u5206\u7EC4\u5206\u5F00\u4FDD\u7559\u3002\u8FD9\u91CC\u4E0D\u4F1A\u65B0\u5EFA\u5206\u7EC4\uFF08\u907F\u514D\u649E\u6570\u91CF\u4E0A\u9650\uFF09\uFF0C\u53EA\u7528\u672C\u5730\u5206\u7C7B\u7ED3\u679C\uFF0C\u628A\u4EBA\u52A0\u8FDB\u540D\u5B57\u5BF9\u5F97\u4E0A\u7684\u73B0\u6709\u5B98\u65B9\u5206\u7EC4\uFF0C\u4F8B\u5982\u672C\u5730\u300C\u7F8E\u98DF\u300D\u2192 B \u7AD9\u300C\u7F8E\u98DF\u300D\u3002" })] }), _jsx("button", { type: "button", onClick: onClose, className: "shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-3 text-sm", children: [error && (_jsx("p", { className: "mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400", children: error })), status ? (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "h-2 overflow-hidden rounded-full bg-secondary", children: _jsx("div", { className: cn("h-full rounded-full transition-all", status.state === "failed" ? "bg-red-400" : "bg-primary"), style: { width: `${percent}%` } }) }), _jsxs("p", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [running && _jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }), _jsxs("span", { children: [status.done, " / ", status.total, "\u3000", status.message] })] }), running && (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u6BCF\u4E2A\u8BF7\u6C42\u95F4\u9694\u7EA6 3\uFF5E5 \u79D2\uFF0C\u964D\u4F4E\u98CE\u63A7\u6982\u7387\u3002\u53EF\u4EE5\u5173\u6389\u7A97\u53E3\uFF0C\u6574\u7406\u4F1A\u5728\u540E\u53F0\u7EE7\u7EED\u3002" })), status.errors.length > 0 && (_jsx("ul", { className: "max-h-40 space-y-1 overflow-y-auto rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400", children: status.errors.map((item) => (_jsx("li", { children: item }, item))) }))] })) : previewing ? (_jsxs("p", { className: "flex items-center gap-2 py-6 text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u6B63\u5728\u8BFB\u53D6\u73B0\u6709 B \u7AD9\u5206\u7EC4\u5E76\u5BF9\u7167\u672C\u5730\u5206\u7C7B\u2026"] })) : plan ? (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "grid grid-cols-3 gap-2 text-center text-xs", children: [_jsxs("div", { className: "rounded-lg bg-secondary/60 px-2 py-2", children: [_jsx("div", { className: "text-base font-semibold text-foreground", children: plan.groups.length }), "\u6D89\u53CA\u5206\u7EC4"] }), _jsxs("div", { className: "rounded-lg bg-secondary/60 px-2 py-2", children: [_jsx("div", { className: "text-base font-semibold text-foreground", children: addTotal }), "\u5F85\u52A0\u5165"] }), _jsxs("div", { className: "rounded-lg bg-secondary/60 px-2 py-2", children: [_jsx("div", { className: "text-base font-semibold text-foreground", children: formatDuration(plan.estimatedSeconds) }), "\u9884\u8BA1\u8017\u65F6"] })] }), plan.warnings.map((warning) => (_jsxs("p", { className: "flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), warning] }, warning))), plan.skippedUnfollowed > 0 && (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u672C\u5730\u5206\u7EC4\u91CC\u6709 ", plan.skippedUnfollowed, " \u4E2A\u5DF2\u53D6\u5173\u7684 UP\uFF0C\u4E0D\u4F1A\u5904\u7406\u3002"] })), nothingToDo && (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u73B0\u6709 B \u7AD9\u5206\u7EC4\u91CC\u8BE5\u8FDB\u7684\u4EBA\u90FD\u5DF2\u7ECF\u5728\u4E86\uFF0C\u4E0D\u7528\u518D\u6574\u7406\u3002" })), _jsx("ul", { className: "divide-y divide-border/60 rounded-lg border border-border/60", children: plan.groups.map((group) => (_jsxs("li", { className: "flex items-center gap-2 px-3 py-1.5 text-xs", children: [_jsx("span", { className: "shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-primary", children: "\u52A0\u5165" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: group.tagName }), _jsxs("span", { className: "shrink-0 text-muted-foreground", children: ["\u76EE\u6807 ", group.total, " \u4EBA", _jsxs("span", { className: "ml-1.5 text-emerald-400", children: ["+", group.addCount] })] })] }, group.tagId ?? group.groupId))) })] })) : null] }), _jsx("div", { className: "flex gap-2 p-4 pt-2", children: running ? (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", className: "flex-1", onClick: onClose, children: "\u540E\u53F0\u7EE7\u7EED" }), _jsx(Button, { className: "flex-1 border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25", onClick: () => void window.biliDesk.bili.cancelFollowTagSync(), children: "\u505C\u6B62\u6574\u7406" })] })) : finished ? (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", className: "flex-1", onClick: () => {
                                        setStatus(null);
                                        void preview();
                                    }, children: "\u91CD\u65B0\u9884\u89C8" }), _jsx(Button, { className: "flex-1", onClick: onClose, children: "\u5B8C\u6210" })] })) : (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", className: "flex-1", onClick: onClose, children: "\u53D6\u6D88" }), _jsx(Button, { className: "flex-1", disabled: previewing || !plan || nothingToDo, onClick: () => void start(), children: "\u5F00\u59CB\u6574\u7406" })] })) })] }) }) }));
}
