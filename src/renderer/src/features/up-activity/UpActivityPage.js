import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { FollowActionButton } from "@/components/video/FollowActionButton";
import { useAppStore } from "@/stores/app-store";
import { useFollowingStore } from "@/stores/following-store";
import { upActivityScanTask, useBackgroundTask } from "@/lib/background-task";
import { cn } from "@/lib/utils";
import { Activity, Clapperboard, Loader2, MessageSquareText, RefreshCw, Trash2, } from "lucide-react";
const SOURCE_OPTIONS = [
    { id: "video", label: "稿件" },
    { id: "dynamic", label: "动态" },
];
/** 互斥时间桶：每个 UP 只会出现在恰好一个区间里 */
const TIME_OPTIONS = [
    { id: "age0_3", label: "3 天内有更新" },
    { id: "age3_7", label: "超过 3～7 天未更新" },
    { id: "age7_30", label: "超过 7～30 天未更新" },
    { id: "age30_90", label: "超过 30～90 天未更新" },
    { id: "age90_180", label: "超过 90 天～半年未更新" },
    { id: "age180_365", label: "超过半年～一年未更新" },
    { id: "age365_plus", label: "超过一年未更新" },
    { id: "never", label: "暂无稿件/动态" },
];
const DAY_SEC = 86400;
const PAGE_SIZE = 36;
/** 互斥区间上界（天）：(prev, bound]，最后一档 >365 */
const AGE_BUCKETS = [
    { id: "age0_3", maxDays: 3 },
    { id: "age3_7", maxDays: 7 },
    { id: "age7_30", maxDays: 30 },
    { id: "age30_90", maxDays: 90 },
    { id: "age90_180", maxDays: 180 },
    { id: "age180_365", maxDays: 365 },
];
function formatTime(ts) {
    if (!ts)
        return "—";
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatScanAt(ts) {
    if (!ts)
        return "尚未扫描";
    const d = new Date(ts * 1000);
    return `${formatTime(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatRelative(ts, now) {
    if (!ts)
        return "无记录";
    const days = Math.floor((now - ts) / DAY_SEC);
    if (days <= 0)
        return "今天";
    if (days === 1)
        return "昨天";
    if (days < 7)
        return `${days} 天前`;
    if (days < 30)
        return `${Math.floor(days / 7)} 周前`;
    if (days < 365)
        return `${Math.floor(days / 30)} 个月前`;
    return `${Math.floor(days / 365)} 年前`;
}
function effectiveAt(item, sources) {
    const times = [];
    if (sources.has("video") && item.latestVideoAt > 0) {
        times.push(item.latestVideoAt);
    }
    if (sources.has("dynamic") && item.latestDynamicAt > 0) {
        times.push(item.latestDynamicAt);
    }
    return times.length > 0 ? Math.max(...times) : 0;
}
function matchTimeFilter(at, filter, now) {
    if (filter === "never")
        return at <= 0;
    if (at <= 0)
        return false;
    const ageDays = (now - at) / DAY_SEC;
    if (filter === "age365_plus")
        return ageDays > 365;
    let prev = 0;
    for (const bucket of AGE_BUCKETS) {
        if (bucket.id === filter) {
            return ageDays > prev && ageDays <= bucket.maxDays;
        }
        prev = bucket.maxDays;
    }
    return false;
}
function emptyArchive() {
    return { items: [], scannedAt: 0 };
}
export function UpActivityPage() {
    const user = useAppStore((s) => s.user);
    const [archive, setArchive] = useState(emptyArchive);
    const [loading, setLoading] = useState(true);
    const scan = useBackgroundTask(upActivityScanTask);
    const scanning = scan.running;
    const progress = scan.progress;
    const [error, setError] = useState("");
    const [sources, setSources] = useState(() => new Set(["video", "dynamic"]));
    const [timeFilter, setTimeFilter] = useState("age0_3");
    const [page, setPage] = useState(1);
    const now = Math.floor(Date.now() / 1000);
    const ensureAllFollowings = useFollowingStore((s) => s.ensureAllFollowings);
    const loadArchive = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            let data = await window.biliDesk.bili.getUpActivityArchive();
            // 取关后若只改了关注关系、缓存未剔，再进页会冒回来；对照当前关注列表清掉
            try {
                const followings = await ensureAllFollowings();
                const still = new Set(followings.map((u) => u.mid));
                const stale = data.items
                    .filter((item) => !still.has(item.mid))
                    .map((item) => item.mid);
                if (stale.length > 0) {
                    data = await window.biliDesk.bili.removeUpActivityRecords(stale);
                }
            }
            catch {
                // 关注列表拉失败时仍展示缓存，取关时会单独剔缓存
            }
            setArchive(data);
            setPage(1);
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "加载失败"));
        }
        finally {
            setLoading(false);
        }
    }, [ensureAllFollowings]);
    useEffect(() => {
        void loadArchive();
    }, [loadArchive]);
    useEffect(() => {
        if (scan.running || scan.acknowledged)
            return;
        upActivityScanTask.acknowledge();
        const result = scan.result;
        if (!result) {
            setError(scan.error || "扫描失败");
            return;
        }
        setArchive(result);
        setPage(1);
        if (result.warnings?.length) {
            setError(`扫描完成，部分 UP 失败 ${result.warnings.length} 个：${result.warnings.slice(0, 2).join("；")}${result.warnings.length > 2 ? "…" : ""}`);
        }
    }, [scan]);
    const toggleSource = (id) => {
        setSources((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                if (next.size === 1)
                    return prev; // 至少保留一个
                next.delete(id);
            }
            else {
                next.add(id);
            }
            return next;
        });
        setPage(1);
    };
    const runScan = () => {
        if (!user?.isLogin) {
            setError("请先登录");
            return;
        }
        setError("");
        void upActivityScanTask
            .run(() => window.biliDesk.bili.scanUpActivity(), {
            phase: "followings",
            message: "开始扫描…",
            current: 0,
            total: 0,
        })
            .catch(() => undefined);
    };
    const filtered = useMemo(() => {
        const list = archive.items
            .map((item) => ({
            item,
            at: effectiveAt(item, sources),
        }))
            .filter(({ at }) => matchTimeFilter(at, timeFilter, now));
        list.sort((a, b) => b.at - a.at);
        return list;
    }, [archive.items, sources, timeFilter, now]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, safePage]);
    useEffect(() => {
        if (page > totalPages)
            setPage(totalPages);
    }, [page, totalPages]);
    return (_jsxs("div", { className: "flex h-full flex-col gap-4 p-6", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h2", { className: "flex items-center gap-2 text-lg font-semibold", children: [_jsx(Activity, { className: "h-5 w-5 text-primary" }), "UP \u6D3B\u8DC3\u72B6\u6001"] }), _jsx("p", { className: "mt-1 max-w-2xl text-sm text-muted-foreground", children: "\u62C9\u53D6\u5173\u6CE8\u5217\u8868\u540E\uFF0C\u5206\u522B\u53D6\u6BCF\u4F4D UP \u6700\u65B0\u7A3F\u4EF6\u4E0E\u6700\u65B0\u52A8\u6001\u65F6\u95F4\u3002\u6765\u6E90\u53EF\u53E0\u52A0\uFF1B\u65F6\u95F4\u6863\u4E3A\u4E92\u65A5\u533A\u95F4\uFF08\u65E0\u91CD\u53E0\uFF09\u3002\u626B\u63CF\u7ED3\u679C\u4F1A\u5199\u5165\u672C\u5730\u7F13\u5B58\uFF0C\u4E0B\u6B21\u6253\u5F00\u76F4\u63A5\u8BFB\uFF0C\u4E0D\u5FC5\u91CD\u626B\u3002" }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: ["\u4E0A\u6B21\u626B\u63CF\uFF1A", formatScanAt(archive.scannedAt), " \u00B7 \u5171", " ", archive.items.length, " \u4F4D \u00B7 \u5F53\u524D\u7B5B\u9009 ", filtered.length, " \u4F4D"] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs(Button, { variant: "outline", size: "sm", disabled: scanning || loading, onClick: async () => {
                                    const next = await window.biliDesk.bili.clearUpActivityArchive();
                                    setArchive(next);
                                    setPage(1);
                                }, children: [_jsx(Trash2, { className: "mr-1.5 h-3.5 w-3.5" }), "\u6E05\u7A7A"] }), _jsx(Button, { size: "sm", disabled: scanning, onClick: () => void runScan(), children: scanning ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-1.5 h-4 w-4 animate-spin" }), "\u626B\u63CF\u4E2D"] })) : (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "mr-1.5 h-4 w-4" }), "\u626B\u63CF\u6D3B\u8DC3\u5EA6"] })) })] })] }), _jsxs("div", { className: "space-y-3 rounded-xl border border-border bg-secondary/20 p-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "\u6765\u6E90\uFF08\u53EF\u53E0\u52A0\uFF09" }), SOURCE_OPTIONS.map((opt) => {
                                const active = sources.has(opt.id);
                                return (_jsxs("button", { type: "button", onClick: () => toggleSource(opt.id), className: cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors", active
                                        ? "bg-primary/15 text-primary"
                                        : "bg-secondary/60 text-muted-foreground hover:text-foreground"), children: [opt.id === "video" ? (_jsx(Clapperboard, { className: "h-3.5 w-3.5" })) : (_jsx(MessageSquareText, { className: "h-3.5 w-3.5" })), opt.label] }, opt.id));
                            })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "text-xs text-muted-foreground", children: "\u65F6\u95F4\uFF08\u4E92\u65A5\uFF09" }), TIME_OPTIONS.map((opt) => (_jsx("button", { type: "button", onClick: () => {
                                    setTimeFilter(opt.id);
                                    setPage(1);
                                }, className: cn("rounded-lg px-3 py-1.5 text-sm transition-colors", timeFilter === opt.id
                                    ? "bg-primary/15 text-primary"
                                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"), children: opt.label }, opt.id)))] })] }), scanning && (_jsxs("div", { className: "rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin text-primary" }), progress?.message ?? "扫描中…"] }), progress && progress.total > 0 && (_jsx("div", { className: "mt-2 h-1.5 overflow-hidden rounded-full bg-secondary", children: _jsx("div", { className: "h-full bg-primary transition-all", style: {
                                width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
                            } }) }))] })), error && (_jsx("div", { className: cn("rounded-xl border px-4 py-3 text-sm", error.startsWith("扫描完成")
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-destructive/40 bg-destructive/10 text-destructive"), children: error })), _jsxs("div", { "data-up-activity-scroll": true, className: "min-h-0 flex-1 overflow-y-auto scrollbar-overlay", children: [" ", loading ? (_jsxs("div", { className: "flex h-40 items-center justify-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2D\u2026"] })) : filtered.length === 0 ? (_jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground", children: [_jsx(Activity, { className: "h-5 w-5 opacity-50" }), archive.items.length === 0
                                ? "还没有数据，点右上角「扫描活跃度」开始。"
                                : "当前筛选条件下没有 UP，试试换时间窗或来源。"] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: paged.map(({ item, at }) => (_jsx(ActivityCard, { item: item, effectiveAt: at, sources: sources, now: now, onRemoved: async (mid) => {
                                        const next = await window.biliDesk.bili.removeUpActivityRecords([mid]);
                                        setArchive(next);
                                    }, onError: setError }, item.mid))) }), filtered.length > PAGE_SIZE && (_jsx(PaginationBar, { variant: "pages", className: "mt-3 rounded-xl border border-border bg-card/30 px-4", page: safePage, totalPages: totalPages, totalCount: filtered.length, onPageChange: (next) => {
                                    setPage(next);
                                    const scroller = document.querySelector("[data-up-activity-scroll]");
                                    if (scroller instanceof HTMLElement) {
                                        scroller.scrollTop = 0;
                                    }
                                } }))] }))] })] }));
}
function ActivityCard({ item, effectiveAt: at, sources, now, onRemoved, onError, }) {
    const [following, setFollowing] = useState(true);
    const storeEntry = useFollowingStore((state) => state.allFollowings?.find((up) => up.mid === item.mid));
    const [special, setSpecial] = useState(Boolean(storeEntry?.special));
    useEffect(() => {
        if (storeEntry?.special != null) {
            setSpecial(Boolean(storeEntry.special));
        }
    }, [storeEntry?.special]);
    if (!following)
        return null;
    return (_jsxs("article", { className: "flex gap-3 rounded-xl border border-border bg-card/40 p-3", children: [_jsx(Link, { to: `/up/${item.mid}`, className: "shrink-0", children: item.face ? (_jsx(BiliImage, { src: item.face, alt: "", className: "h-12 w-12 rounded-full object-cover" })) : (_jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-xs", children: "UP" })) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsx(Link, { to: `/up/${item.mid}`, className: "truncate text-sm font-medium hover:text-primary", children: item.name || `UID ${item.mid}` }), _jsxs("div", { className: "flex shrink-0 flex-col items-end gap-1.5", children: [_jsx("span", { className: cn("rounded-md px-1.5 py-0.5 text-[11px]", at <= 0
                                            ? "bg-secondary text-muted-foreground"
                                            : now - at > 90 * DAY_SEC
                                                ? "bg-amber-500/15 text-amber-300"
                                                : "bg-emerald-500/15 text-emerald-300"), children: formatRelative(at, now) }), _jsx(FollowActionButton, { mid: item.mid, uname: item.name || `UID ${item.mid}`, face: item.face, isFollowing: following, isSpecial: special, size: "sm", onFollowingChange: (next) => {
                                            setFollowing(next);
                                            if (!next)
                                                void onRemoved(item.mid);
                                        }, onSpecialChange: setSpecial, onError: onError })] })] }), sources.has("video") && (_jsxs("p", { className: "mt-1.5 truncate text-xs text-muted-foreground pr-[7.5rem]", children: [_jsx(Clapperboard, { className: "mr-1 inline h-3 w-3" }), "\u7A3F\u4EF6 ", formatTime(item.latestVideoAt), item.latestVideoTitle ? ` · ${item.latestVideoTitle}` : " · 无"] })), sources.has("dynamic") && (_jsxs("p", { className: "mt-0.5 truncate text-xs text-muted-foreground pr-[7.5rem]", children: [_jsx(MessageSquareText, { className: "mr-1 inline h-3 w-3" }), "\u52A8\u6001 ", formatTime(item.latestDynamicAt), item.latestDynamicText ? ` · ${item.latestDynamicText}` : " · 无"] })), item.latestVideoBvid && sources.has("video") ? (_jsx(Link, { to: `/video/${item.latestVideoBvid}`, className: "mt-1 inline-block text-xs text-primary hover:underline", children: "\u770B\u6700\u65B0\u7A3F\u4EF6" })) : null, item.error ? (_jsx("p", { className: "mt-1 text-xs text-destructive", children: item.error })) : null] })] }));
}
