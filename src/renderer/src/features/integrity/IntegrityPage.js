import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { integrityScanTask, useBackgroundTask } from "@/lib/background-task";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, Trash2, UserX, } from "lucide-react";
const TABS = [
    { id: "favorites", label: "失效收藏", scanLabel: "扫描失效收藏" },
    { id: "toview", label: "失效稍后再看", scanLabel: "扫描稍后再看" },
    { id: "following", label: "异常关注", scanLabel: "扫描异常关注" },
];
function sourceLabel(source) {
    if (source === "favorite")
        return "收藏";
    if (source === "toview")
        return "稍后再看";
    return "本地稍后再看";
}
function formatTime(ts) {
    if (!ts)
        return "尚未扫描";
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function emptyArchive() {
    return {
        invalidVideos: [],
        abnormalFollowings: [],
        scannedAt: 0,
        stats: {
            invalidFavorites: 0,
            invalidToView: 0,
            abnormalFollowings: 0,
        },
    };
}
export function IntegrityPage() {
    const user = useAppStore((s) => s.user);
    const scan = useBackgroundTask(integrityScanTask);
    const scanning = scan.running;
    const progress = scan.progress;
    const [tab, setTab] = useState(() => {
        const { running, meta } = integrityScanTask.getState();
        return running && meta ? meta : "favorites";
    });
    const [archive, setArchive] = useState(emptyArchive);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const loadArchive = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await window.biliDesk.bili.getIntegrityArchive();
            setArchive(data);
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "加载归档失败"));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void loadArchive();
    }, [loadArchive]);
    useEffect(() => {
        if (scan.running || scan.acknowledged)
            return;
        integrityScanTask.acknowledge();
        const result = scan.result;
        if (!result) {
            setError(scan.error || "扫描失败");
            return;
        }
        setArchive(result);
        if (result.warnings && result.warnings.length > 0) {
            setError(`扫描完成，但有 ${result.warnings.length} 处跳过：${result.warnings.slice(0, 3).join("；")}${result.warnings.length > 3 ? "…" : ""}`);
        }
    }, [scan]);
    const currentTab = TABS.find((item) => item.id === tab) ?? TABS[0];
    const runScan = () => {
        if (!user?.isLogin) {
            setError("请先登录");
            return;
        }
        setError("");
        const scanTab = tab;
        void integrityScanTask
            .run(() => window.biliDesk.bili.scanIntegrity(scanTab), {
            phase: scanTab,
            message: `开始${currentTab.scanLabel}…`,
            current: 0,
            total: 0,
        }, scanTab)
            .catch(() => undefined);
    };
    const favVideos = useMemo(() => archive.invalidVideos.filter((v) => v.source === "favorite"), [archive.invalidVideos]);
    const toviewVideos = useMemo(() => archive.invalidVideos.filter((v) => v.source === "toview" || v.source === "toview-local"), [archive.invalidVideos]);
    const dismissVideo = async (id) => {
        const next = await window.biliDesk.bili.dismissInvalidVideo(id);
        setArchive(next);
    };
    const dismissFollowing = async (mid) => {
        const next = await window.biliDesk.bili.dismissAbnormalFollowing(mid);
        setArchive(next);
    };
    const clearCurrent = async () => {
        const next = await window.biliDesk.bili.clearIntegrityArchive(tab);
        setArchive(next);
    };
    return (_jsxs("div", { className: "flex h-full flex-col gap-4 p-6", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h2", { className: "flex items-center gap-2 text-lg font-semibold", children: [_jsx(ShieldAlert, { className: "h-5 w-5 text-primary" }), "\u5931\u6548\u4E0E\u5F02\u5E38\u68C0\u6D4B"] }), _jsx("p", { className: "mt-1 max-w-2xl text-sm text-muted-foreground", children: "\u4E09\u4E2A\u5206\u7C7B\u4E92\u76F8\u72EC\u7ACB\uFF1A\u5207\u6362 Tab \u540E\u70B9\u300C\u626B\u63CF\u5F53\u524D\u5206\u7C7B\u300D\u53EA\u8DD1\u8FD9\u4E00\u9879\uFF0C\u4E0D\u4F1A\u6BCF\u6B21\u90FD\u4ECE\u6536\u85CF\u5F00\u59CB\u3002" }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: ["\u4E0A\u6B21\u626B\u63CF\uFF1A", formatTime(archive.scannedAt), archive.stats
                                        ? ` · 收藏失效 ${archive.stats.invalidFavorites} · 稍后再看 ${archive.stats.invalidToView} · 异常关注 ${archive.stats.abnormalFollowings}`
                                        : ""] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", disabled: scanning || loading, onClick: () => void clearCurrent(), children: "\u6E05\u7A7A\u5F53\u524D\u5206\u7C7B" }), _jsx(Button, { size: "sm", disabled: scanning, onClick: () => void runScan(), children: scanning ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-1.5 h-4 w-4 animate-spin" }), "\u626B\u63CF\u4E2D"] })) : (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "mr-1.5 h-4 w-4" }), currentTab.scanLabel] })) })] })] }), scanning && (_jsxs("div", { className: "rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2 text-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin text-primary" }), progress?.message ?? "扫描中…"] }), progress && progress.total > 0 && (_jsx("div", { className: "mt-2 h-1.5 overflow-hidden rounded-full bg-secondary", children: _jsx("div", { className: "h-full bg-primary transition-all", style: {
                                width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
                            } }) }))] })), error && (_jsx("div", { className: cn("rounded-xl border px-4 py-3 text-sm", error.startsWith("扫描完成")
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-destructive/40 bg-destructive/10 text-destructive"), children: error })), _jsx("div", { className: "flex gap-2 border-b border-border pb-2", children: TABS.map((item) => (_jsxs("button", { type: "button", disabled: scanning, onClick: () => {
                        setTab(item.id);
                        setError("");
                    }, className: cn("rounded-lg px-3 py-1.5 text-sm transition-colors", tab === item.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: [item.label, _jsx("span", { className: "ml-1.5 text-xs opacity-70", children: item.id === "favorites"
                                ? favVideos.length
                                : item.id === "toview"
                                    ? toviewVideos.length
                                    : archive.abnormalFollowings.length })] }, item.id))) }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto scrollbar-overlay", children: loading ? (_jsxs("div", { className: "flex h-40 items-center justify-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2D\u2026"] })) : tab === "following" ? (_jsx(FollowingList, { items: archive.abnormalFollowings, onDismiss: dismissFollowing })) : (_jsx(VideoList, { items: tab === "favorites" ? favVideos : toviewVideos, onDismiss: dismissVideo, emptyHint: tab === "favorites"
                        ? "暂无失效收藏。点右上角「扫描失效收藏」开始检测。"
                        : "暂无失效稍后再看。点右上角「扫描稍后再看」开始检测。" })) })] }));
}
function VideoList({ items, onDismiss, emptyHint, }) {
    if (items.length === 0) {
        return (_jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground", children: [_jsx(AlertTriangle, { className: "h-5 w-5 opacity-50" }), emptyHint] }));
    }
    return (_jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: items.map((item) => (_jsxs("article", { className: "flex gap-3 rounded-xl border border-border bg-card/40 p-3", children: [_jsx("div", { className: "relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-secondary", children: item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-full w-full object-cover" })) : (_jsx("div", { className: "flex h-full items-center justify-center text-xs text-muted-foreground", children: "\u65E0\u5C01\u9762" })) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("h3", { className: cn("line-clamp-2 text-sm font-medium", item.titlePlaceholder && "text-muted-foreground"), title: item.title, children: [item.title, item.titlePlaceholder ? "（原标题未知）" : ""] }), _jsxs("p", { className: "mt-1 truncate text-xs text-muted-foreground", children: [item.upperMid > 0 ? (_jsx(Link, { to: `/up/${item.upperMid}`, className: "hover:text-primary", children: item.upperName })) : (item.upperName), item.bvid ? ` · ${item.bvid}` : ""] }), _jsxs("p", { className: "mt-1 text-xs text-amber-500/90", children: [item.reason, item.folderTitle ? ` · ${item.folderTitle}` : "", ` · ${sourceLabel(item.source)}`] }), _jsx("div", { className: "mt-2", children: _jsxs(Button, { size: "sm", variant: "ghost", className: "h-7 px-2 text-xs text-muted-foreground", onClick: () => void onDismiss(item.id), children: [_jsx(Trash2, { className: "mr-1 h-3.5 w-3.5" }), "\u4ECE\u5F52\u6863\u79FB\u9664"] }) })] })] }, item.id))) }));
}
function FollowingList({ items, onDismiss, }) {
    if (items.length === 0) {
        return (_jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground", children: [_jsx(UserX, { className: "h-5 w-5 opacity-50" }), "\u6682\u65E0\u5F02\u5E38\u5173\u6CE8\u3002\u70B9\u53F3\u4E0A\u89D2\u300C\u626B\u63CF\u5F02\u5E38\u5173\u6CE8\u300D\u5F00\u59CB\u68C0\u6D4B\u3002"] }));
    }
    return (_jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: items.map((item) => (_jsxs("article", { className: "flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3", children: [_jsx(Link, { to: `/up/${item.mid}`, className: "shrink-0", children: item.face ? (_jsx(BiliImage, { src: item.face, alt: "", className: "h-12 w-12 rounded-full object-cover" })) : (_jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-xs", children: "UP" })) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx(Link, { to: `/up/${item.mid}`, className: "truncate text-sm font-medium hover:text-primary", children: item.name || `UID ${item.mid}` }), _jsx("p", { className: "mt-0.5 text-xs text-amber-500/90", children: item.reasonText }), item.sign ? (_jsx("p", { className: "mt-0.5 truncate text-xs text-muted-foreground", children: item.sign })) : null] }), _jsx(Button, { size: "sm", variant: "ghost", className: "shrink-0 text-xs text-muted-foreground", onClick: () => void onDismiss(item.mid), children: "\u79FB\u9664" })] }, item.mid))) }));
}
