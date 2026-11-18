import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { formatDisplayedError } from "@/lib/ipc-error";
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { ChargeCoverBadge, useCoverChargeBadge, } from "@/components/video/charge-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { savePlaybackProgress } from "@/lib/playback-progress";
import { cn } from "@/lib/utils";
import { parseBiliAppPath } from "@shared/utils/bili-app-link";
import { useAppStore } from "@/stores/app-store";
import { Check, ChevronDown, ChevronUp, Clock, ExternalLink, LayoutGrid, List, Loader2, Monitor, Radio, Search, Smartphone, Tablet, Trash2, Tv, } from "lucide-react";
const PAGE_SIZE = 20;
const TABS = [
    { id: "all", label: "综合" },
    { id: "archive", label: "视频" },
    { id: "live", label: "直播" },
    { id: "article", label: "专栏" },
];
const DURATION_OPTIONS = [
    { id: 0, label: "全部时长" },
    { id: 1, label: "10分钟以下" },
    { id: 2, label: "10-30分钟" },
    { id: 3, label: "30-60分钟" },
    { id: 4, label: "60分钟以上" },
];
const TIME_OPTIONS = [
    { id: "all", label: "全部时间" },
    { id: "today", label: "今天" },
    { id: "yesterday", label: "昨天" },
    { id: "week", label: "近一周" },
];
const DEVICE_OPTIONS = [
    { id: "all", label: "全部设备" },
    { id: "pc", label: "PC" },
    { id: "phone", label: "手机" },
    { id: "pad", label: "平板" },
    { id: "tv", label: "TV" },
];
function FilterChip({ active, onClick, children, }) {
    return (_jsx("button", { type: "button", onClick: onClick, className: cn("rounded-full px-2.5 py-1 text-xs transition-colors", active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: children }));
}
function resolveTimeRange(preset, fromDate, toDate) {
    const today = startOfLocalDay(Date.now());
    if (preset === "today") {
        return { fromTime: Math.floor(today / 1000) };
    }
    if (preset === "yesterday") {
        return {
            fromTime: Math.floor((today - 86400000) / 1000),
            toTime: Math.floor(today / 1000) - 1,
        };
    }
    if (preset === "week") {
        return { fromTime: Math.floor((Date.now() - 7 * 86400000) / 1000) };
    }
    if (preset === "custom") {
        const fromTime = fromDate
            ? Math.floor(new Date(`${fromDate}T00:00:00`).getTime() / 1000)
            : undefined;
        const toTime = toDate
            ? Math.floor(new Date(`${toDate}T23:59:59`).getTime() / 1000)
            : undefined;
        return { fromTime, toTime };
    }
    return {};
}
function DeviceIcon({ dt, className }) {
    const iconClass = cn("h-3 w-3", className);
    if (dt === 2)
        return _jsx(Monitor, { className: iconClass });
    if (dt === 4 || dt === 6)
        return _jsx(Tablet, { className: iconClass });
    if (dt === 33)
        return _jsx(Tv, { className: iconClass });
    if (dt === 1 || dt === 3 || dt === 5 || dt === 7) {
        return _jsx(Smartphone, { className: iconClass });
    }
    return null;
}
const MAX_HISTORY_PAGE_CACHE = 12;
function trimHistoryPageCache(cache, aroundPage) {
    if (cache.size <= MAX_HISTORY_PAGE_CACHE)
        return;
    const keys = [...cache.keys()].sort((a, b) => Math.abs(a - aroundPage) - Math.abs(b - aroundPage));
    const keep = new Set(keys.slice(0, MAX_HISTORY_PAGE_CACHE));
    for (const key of [...cache.keys()]) {
        if (!keep.has(key))
            cache.delete(key);
    }
}
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function padDuration(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function coverProgressLabel(item) {
    if (!(item.business === "archive" || item.bvid) || item.duration <= 0) {
        return "";
    }
    if (item.progress < 0) {
        return `${padDuration(item.duration)}/${padDuration(item.duration)}`;
    }
    const seen = Math.min(item.progress, item.duration);
    return `${padDuration(seen)}/${padDuration(item.duration)}`;
}
function startOfLocalDay(ms) {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}
function dateGroupLabel(viewAt) {
    if (!viewAt)
        return "更早";
    const day = startOfLocalDay(viewAt * 1000);
    const today = startOfLocalDay(Date.now());
    const yesterday = today - 24 * 60 * 60 * 1000;
    if (day === today)
        return "今天";
    if (day === yesterday)
        return "昨天";
    const date = new Date(viewAt * 1000);
    const nowYear = new Date().getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (date.getFullYear() === nowYear)
        return `${m}月${d}日`;
    return `${date.getFullYear()}年${m}月${d}日`;
}
function formatViewClock(viewAt) {
    if (!viewAt)
        return "";
    const date = new Date(viewAt * 1000);
    const day = startOfLocalDay(viewAt * 1000);
    const today = startOfLocalDay(Date.now());
    const yesterday = today - 24 * 60 * 60 * 1000;
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;
    if (day === today)
        return `今天 ${time}`;
    if (day === yesterday)
        return `昨天 ${time}`;
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (date.getFullYear() === new Date().getFullYear()) {
        return `${m}-${d} ${time}`;
    }
    return `${date.getFullYear()}-${m}-${d} ${time}`;
}
function resolveExternalUrl(item) {
    if (item.uri?.startsWith("http"))
        return item.uri;
    if (item.business === "live" && item.oid) {
        return `https://live.bilibili.com/${item.oid}`;
    }
    if ((item.business === "article" || item.business === "article-list") &&
        item.oid) {
        return `https://www.bilibili.com/read/cv${item.oid}`;
    }
    if (item.bvid)
        return `https://www.bilibili.com/video/${item.bvid}`;
    return "";
}
function resolveHistoryAppPath(item) {
    if (item.uri) {
        const fromUri = parseBiliAppPath(item.uri);
        if (fromUri)
            return fromUri;
    }
    const external = resolveExternalUrl(item);
    return external ? parseBiliAppPath(external) : null;
}
/** 历史续播链接：带上进度与分 P cid */
function resolveVideoResumePath(item) {
    if (!item.bvid)
        return null;
    const params = new URLSearchParams();
    if (item.cid)
        params.set("cid", String(item.cid));
    // progress < 0 表示已看完，从头播；> 0 则续播
    if (item.progress > 0) {
        params.set("t", String(Math.floor(item.progress)));
    }
    const query = params.toString();
    return query ? `/video/${item.bvid}?${query}` : `/video/${item.bvid}`;
}
function seedLocalResumeProgress(item) {
    if (!item.bvid || !item.cid || item.progress < 5)
        return;
    if (item.duration > 0 && item.progress >= item.duration - 15)
        return;
    savePlaybackProgress(item.bvid, item.cid, item.progress, item.duration);
}
function groupItemsByDate(items) {
    const groups = [];
    for (const item of items) {
        const label = dateGroupLabel(item.viewAt);
        const last = groups[groups.length - 1];
        if (last && last.label === label)
            last.items.push(item);
        else
            groups.push({ label, items: [item] });
    }
    return groups;
}
function HistoryCard({ item, deleting, onDelete, layout = "grid", editing = false, selected = false, onToggleSelect, }) {
    const isVideo = item.business === "archive" || Boolean(item.bvid);
    const isLive = item.business === "live";
    const isArticle = item.business === "article" || item.business === "article-list";
    const appPath = resolveHistoryAppPath(item);
    const external = resolveExternalUrl(item);
    const cover = item.cover || item.covers?.[0] || "";
    const knownCharge = item.badge && /充电|专属/.test(item.badge) ? item.badge : undefined;
    const chargeBadge = useCoverChargeBadge(isVideo ? item.bvid : undefined, knownCharge);
    const progressText = coverProgressLabel(item);
    const percent = item.progress < 0
        ? 100
        : item.duration > 0 && item.progress > 0
            ? Math.min(100, Math.round((item.progress / item.duration) * 100))
            : 0;
    const media = (_jsxs("div", { className: cn("relative overflow-hidden rounded-lg bg-secondary", layout === "list" && "w-[210px] shrink-0"), children: [cover ? (_jsx(BiliImage, { src: cover, alt: item.title, variant: "cover", className: "aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" })) : (_jsx("div", { className: "aspect-video w-full bg-secondary" })), isLive && (_jsxs("span", { className: "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white", children: [_jsx(Radio, { className: "h-3 w-3" }), item.liveStatus === 1 ? "直播中" : "直播"] })), isArticle && (_jsx("span", { className: "absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white", children: "\u4E13\u680F" })), item.badge && !isLive && !isArticle && (_jsx("span", { className: "absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white", children: item.badge })), _jsx(ChargeCoverBadge, { label: chargeBadge, className: "right-1.5 top-1.5" }), item.favorited && (_jsx("span", { className: cn("absolute right-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] text-primary-foreground", chargeBadge ? "top-8" : "top-1.5"), children: "\u5DF2\u6536\u85CF" })), progressText && (_jsx("span", { className: "absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] tabular-nums text-white", children: progressText })), percent > 0 && (_jsx("div", { className: "absolute inset-x-0 bottom-0 h-0.5 bg-black/35", children: _jsx("div", { className: "h-full bg-primary", style: { width: `${percent}%` } }) }))] }));
    const meta = (_jsxs("div", { className: cn("space-y-1.5", layout === "grid" ? "mt-2" : "min-w-0 flex-1 py-0.5"), children: [_jsxs("div", { className: "flex items-start gap-1", children: [_jsx("p", { className: "line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug group-hover:text-primary", children: item.title }), _jsx("button", { type: "button", title: "\u5220\u9664\u8FD9\u6761\u5386\u53F2", disabled: deleting, onClick: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onDelete(item);
                        }, className: "mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-colors hover:bg-secondary hover:text-red-400 disabled:opacity-40 group-hover:opacity-100", children: deleting ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Trash2, { className: "h-3.5 w-3.5" })) })] }), item.showTitle && (_jsx("p", { className: "truncate text-xs text-muted-foreground", children: item.showTitle })), _jsxs("div", { className: "flex items-center justify-between gap-2 text-xs text-muted-foreground", children: [_jsx("span", { className: "inline-flex min-w-0 items-center gap-1.5", children: item.authorName ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "rounded bg-secondary px-1 py-px text-[10px] font-medium text-muted-foreground", children: "UP" }), _jsx("span", { className: "truncate", children: item.authorName })] })) : isArticle ? (_jsxs("span", { className: "inline-flex items-center gap-1", children: ["\u4E13\u680F", _jsx(ExternalLink, { className: "h-3 w-3" })] })) : (_jsx("span", { children: isLive ? "直播" : "内容" })) }), _jsxs("span", { className: "inline-flex shrink-0 items-center gap-1", children: [_jsx(DeviceIcon, { dt: item.dt }), _jsx(Clock, { className: "h-3 w-3" }), formatViewClock(item.viewAt)] })] })] }));
    const body = (_jsxs("div", { className: cn("group", layout === "list" && "flex gap-3 rounded-xl p-2 hover:bg-secondary/60", editing &&
            selected &&
            "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"), children: [media, meta] }));
    if (editing) {
        return (_jsx("button", { type: "button", className: "block w-full text-left", onClick: onToggleSelect, children: body }));
    }
    if (isVideo && item.bvid) {
        const to = resolveVideoResumePath(item) ?? `/video/${item.bvid}`;
        return (_jsx(Link, { to: to, onClick: () => seedLocalResumeProgress(item), children: body }));
    }
    if (isLive && item.oid) {
        return _jsx(Link, { to: `/live/${item.oid}`, children: body });
    }
    if (appPath) {
        return _jsx(Link, { to: appPath, children: body });
    }
    if (external) {
        return (_jsx("a", { href: external, target: "_blank", rel: "noreferrer", className: "block", children: body }));
    }
    return body;
}
export function HistoryPage() {
    const user = useAppStore((state) => state.user);
    const scrollRef = useRef(null);
    const pageCacheRef = useRef(new Map());
    const loadSeqRef = useRef(0);
    const [tab, setTab] = useState("all");
    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [discoveredPages, setDiscoveredPages] = useState(1);
    const [totalKnown, setTotalKnown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState(null);
    const [clearOpen, setClearOpen] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [duration, setDuration] = useState(0);
    const [device, setDevice] = useState("all");
    const [timePreset, setTimePreset] = useState("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [layout, setLayout] = useState("grid");
    const [recording, setRecording] = useState(true);
    const [recordingBusy, setRecordingBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [batchDeleting, setBatchDeleting] = useState(false);
    const filters = useMemo(() => {
        const range = resolveTimeRange(timePreset, fromDate, toDate);
        return {
            keyword: keyword.trim() || undefined,
            duration,
            device,
            fromTime: range.fromTime,
            toTime: range.toTime,
        };
    }, [keyword, duration, device, timePreset, fromDate, toDate]);
    const filterKey = `${tab}|${keyword}|${duration}|${device}|${timePreset}|${fromDate}|${toDate}`;
    const isSearchMode = Boolean(keyword.trim());
    const hasExtraFilters = duration !== 0 ||
        device !== "all" ||
        timePreset !== "all" ||
        Boolean(fromDate || toDate);
    const groups = useMemo(() => groupItemsByDate(items), [items]);
    const totalPages = totalKnown
        ? Math.max(1, discoveredPages)
        : Math.max(1, discoveredPages, page);
    const syncPageMeta = useCallback(() => {
        const keys = [...pageCacheRef.current.keys()];
        if (keys.length === 0) {
            setDiscoveredPages(1);
            setTotalKnown(false);
            return;
        }
        const maxPage = Math.max(...keys);
        const last = pageCacheRef.current.get(maxPage);
        setDiscoveredPages(maxPage);
        setTotalKnown(Boolean(last && !last.hasMore));
    }, []);
    const resetCache = useCallback(() => {
        pageCacheRef.current = new Map();
        setDiscoveredPages(1);
        setTotalKnown(false);
    }, []);
    const applyPage = useCallback((targetPage, entry) => {
        setPage(targetPage);
        setItems(entry.items);
        setHasMore(entry.hasMore);
        syncPageMeta();
    }, [syncPageMeta]);
    const fetchPage = useCallback(async (targetPage, options) => {
        if (!user?.isLogin) {
            setItems([]);
            setHasMore(false);
            setLoading(false);
            setError("");
            return;
        }
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setError("");
        try {
            if (options?.force)
                resetCache();
            for (let p = 1; p <= targetPage; p++) {
                if (!options?.force && pageCacheRef.current.has(p))
                    continue;
                const prev = pageCacheRef.current.get(p - 1);
                if (p > 1 && prev && !prev.hasMore)
                    break;
                const cursor = p === 1 ? undefined : prev?.nextCursor;
                const result = await window.biliDesk.bili.getWatchHistory(tab, isSearchMode ? undefined : cursor, {
                    ...filters,
                    page: isSearchMode ? p : undefined,
                });
                if (seq !== loadSeqRef.current)
                    return;
                pageCacheRef.current.set(p, {
                    items: result.items,
                    nextCursor: result.cursor,
                    hasMore: result.hasMore,
                });
                trimHistoryPageCache(pageCacheRef.current, targetPage);
                if (!result.hasMore)
                    break;
            }
            const resolvedPage = pageCacheRef.current.has(targetPage)
                ? targetPage
                : Math.max(1, ...pageCacheRef.current.keys());
            const entry = pageCacheRef.current.get(resolvedPage);
            if (!entry) {
                setPage(1);
                setItems([]);
                setHasMore(false);
                return;
            }
            applyPage(resolvedPage, entry);
            scrollRef.current?.scrollTo({ top: 0 });
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            setError(formatError(err));
            if (!pageCacheRef.current.has(targetPage)) {
                setItems([]);
                setHasMore(false);
            }
        }
        finally {
            if (seq === loadSeqRef.current)
                setLoading(false);
        }
    }, [applyPage, filters, isSearchMode, resetCache, tab, user?.isLogin]);
    useEffect(() => {
        resetCache();
        setPage(1);
        setSelectedIds(new Set());
        void fetchPage(1, { force: true });
    }, [fetchPage, filterKey, resetCache]);
    useEffect(() => {
        if (!user?.isLogin)
            return;
        void window.biliDesk.bili
            .getHistoryShadow()
            .then(setRecording)
            .catch(() => { });
    }, [user?.isLogin]);
    useEffect(() => {
        const onRefresh = () => {
            void fetchPage(1, { force: true });
        };
        window.addEventListener("bilidesk:refresh-history", onRefresh);
        return () => window.removeEventListener("bilidesk:refresh-history", onRefresh);
    }, [fetchPage]);
    const handleDelete = useCallback(async (item) => {
        setDeletingId(item.id);
        setError("");
        try {
            await window.biliDesk.bili.deleteWatchHistory({
                business: item.business,
                oid: item.oid,
                kid: item.kid,
            });
            setItems((prev) => prev.filter((row) => row.id !== item.id));
            const cached = pageCacheRef.current.get(page);
            if (cached) {
                pageCacheRef.current.set(page, {
                    ...cached,
                    items: cached.items.filter((row) => row.id !== item.id),
                });
            }
            // 后续页缓存可能错位，清掉后面的页
            for (const key of [...pageCacheRef.current.keys()]) {
                if (key > page)
                    pageCacheRef.current.delete(key);
            }
            syncPageMeta();
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setDeletingId(null);
        }
    }, [page, syncPageMeta]);
    const handleClear = useCallback(async () => {
        setClearing(true);
        setError("");
        try {
            await window.biliDesk.bili.clearWatchHistory();
            resetCache();
            setPage(1);
            setItems([]);
            setHasMore(false);
            setClearOpen(false);
            setSelectedIds(new Set());
            setEditing(false);
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setClearing(false);
        }
    }, [resetCache]);
    const applySearch = () => {
        setKeyword(searchInput.trim());
    };
    const handleToggleRecording = async () => {
        if (recordingBusy)
            return;
        const next = !recording;
        setRecordingBusy(true);
        try {
            await window.biliDesk.bili.setHistoryShadow(next);
            setRecording(next);
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setRecordingBusy(false);
        }
    };
    const handleBatchDelete = async () => {
        if (selectedIds.size === 0)
            return;
        setBatchDeleting(true);
        setError("");
        const selected = items.filter((item) => selectedIds.has(item.id));
        try {
            for (const item of selected) {
                await window.biliDesk.bili.deleteWatchHistory({
                    business: item.business,
                    oid: item.oid,
                    kid: item.kid,
                });
            }
            const removed = new Set(selected.map((item) => item.id));
            setItems((prev) => prev.filter((row) => !removed.has(row.id)));
            setSelectedIds(new Set());
            void fetchPage(1, { force: true });
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setBatchDeleting(false);
        }
    };
    if (!user?.isLogin) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-6 text-center", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u767B\u5F55\u540E\u53EF\u67E5\u770B\u4E0E\u5B98\u65B9\u540C\u6B65\u7684\u89C2\u770B\u5386\u53F2" }), _jsx(Button, { asChild: true, children: _jsx(Link, { to: "/login", children: "\u53BB\u767B\u5F55" }) })] }));
    }
    return (_jsxs("div", { className: "flex h-full flex-col overflow-hidden", children: [_jsxs("div", { className: "shrink-0 border-b border-border px-6 py-3", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-1", children: [TABS.map((option) => (_jsxs("button", { type: "button", onClick: () => setTab(option.id), className: cn("relative rounded-md px-3 py-1.5 text-sm transition-colors", tab === option.id
                                            ? "text-primary"
                                            : "text-muted-foreground hover:text-foreground"), children: [option.label, tab === option.id && (_jsx("span", { className: "absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary" }))] }, option.id))), _jsxs("button", { type: "button", onClick: () => setFiltersOpen((open) => !open), className: cn("ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs", hasExtraFilters || filtersOpen
                                            ? "text-primary"
                                            : "text-muted-foreground hover:text-foreground"), children: ["\u66F4\u591A\u7B5B\u9009", filtersOpen ? (_jsx(ChevronUp, { className: "h-3.5 w-3.5" })) : (_jsx(ChevronDown, { className: "h-3.5 w-3.5" }))] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("label", { className: "inline-flex items-center gap-2 text-xs text-muted-foreground", children: [_jsx("button", { type: "button", role: "switch", "aria-checked": recording, disabled: recordingBusy, onClick: () => void handleToggleRecording(), className: cn("relative h-5 w-9 rounded-full transition-colors", recording ? "bg-primary" : "bg-muted"), children: _jsx("span", { className: cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", recording ? "left-4" : "left-0.5") }) }), "\u8BB0\u5F55\u6D4F\u89C8\u5386\u53F2"] }), _jsx("button", { type: "button", title: "\u7F51\u683C", onClick: () => setLayout("grid"), className: cn("rounded-md p-1.5", layout === "grid"
                                            ? "bg-secondary text-foreground"
                                            : "text-muted-foreground hover:text-foreground"), children: _jsx(LayoutGrid, { className: "h-4 w-4" }) }), _jsx("button", { type: "button", title: "\u5217\u8868", onClick: () => setLayout("list"), className: cn("rounded-md p-1.5", layout === "list"
                                            ? "bg-secondary text-foreground"
                                            : "text-muted-foreground hover:text-foreground"), children: _jsx(List, { className: "h-4 w-4" }) })] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-background px-2", children: [_jsx(Search, { className: "h-3.5 w-3.5 text-muted-foreground" }), _jsx("input", { value: searchInput, onChange: (event) => setSearchInput(event.target.value), onKeyDown: (event) => {
                                            if (event.key === "Enter")
                                                applySearch();
                                        }, placeholder: "\u641C\u7D22\u6807\u9898 / UP \u4E3B\u6635\u79F0", className: "h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" }), searchInput ? (_jsx("button", { type: "button", className: "text-xs text-muted-foreground", onClick: () => {
                                            setSearchInput("");
                                            setKeyword("");
                                        }, children: "\u6E05\u9664" })) : null] }), _jsx(Button, { size: "sm", variant: "secondary", onClick: applySearch, children: "\u641C\u7D22" }), _jsxs(Button, { type: "button", size: "sm", variant: "outline", className: "gap-1.5", disabled: loading || clearing || (items.length === 0 && !hasMore), onClick: () => setClearOpen(true), children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), "\u6E05\u7A7A\u5386\u53F2"] }), _jsxs(Button, { type: "button", size: "sm", variant: editing ? "default" : "outline", className: "gap-1.5", onClick: () => {
                                    setEditing((value) => !value);
                                    setSelectedIds(new Set());
                                }, children: [editing ? _jsx(Check, { className: "h-3.5 w-3.5" }) : null, "\u6279\u91CF\u7BA1\u7406"] }), editing ? (_jsxs(Button, { type: "button", size: "sm", variant: "outline", className: "gap-1.5 text-red-400", disabled: selectedIds.size === 0 || batchDeleting, onClick: () => void handleBatchDelete(), children: [batchDeleting ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Trash2, { className: "h-3.5 w-3.5" })), "\u5220\u9664 ", selectedIds.size || ""] })) : null] }), filtersOpen ? (_jsxs("div", { className: "mt-3 space-y-2 text-xs", children: [_jsx("div", { className: "flex flex-wrap items-center gap-1.5", children: DURATION_OPTIONS.map((option) => (_jsx(FilterChip, { active: duration === option.id, onClick: () => setDuration(option.id), children: option.label }, option.id))) }), _jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [TIME_OPTIONS.map((option) => (_jsx(FilterChip, { active: timePreset === option.id, onClick: () => setTimePreset(option.id), children: option.label }, option.id))), _jsx("span", { className: "ml-1 text-muted-foreground", children: "\u81EA\u5B9A\u4E49" }), _jsx("input", { type: "date", value: fromDate, onChange: (event) => {
                                            setFromDate(event.target.value);
                                            setTimePreset("custom");
                                        }, className: "h-7 rounded-md border border-border bg-background px-1.5 text-xs" }), _jsx("span", { className: "text-muted-foreground", children: "\u81F3" }), _jsx("input", { type: "date", value: toDate, onChange: (event) => {
                                            setToDate(event.target.value);
                                            setTimePreset("custom");
                                        }, className: "h-7 rounded-md border border-border bg-background px-1.5 text-xs" })] }), _jsx("div", { className: "flex flex-wrap items-center gap-1.5", children: DEVICE_OPTIONS.map((option) => (_jsx(FilterChip, { active: device === option.id, onClick: () => setDevice(option.id), children: option.label }, option.id))) })] })) : null] }), _jsx("div", { ref: scrollRef, className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: _jsx("div", { className: "mx-auto max-w-6xl px-6 py-5", children: loading && items.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u5386\u53F2\u8BB0\u5F55..."] })) : error && items.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void fetchPage(page, { force: true }), children: "\u91CD\u8BD5" })] })) : items.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-muted-foreground", children: keyword || hasExtraFilters
                            ? "没有符合筛选条件的历史记录"
                            : "暂无历史记录" })) : (_jsxs("div", { className: cn("space-y-8", loading && "opacity-60"), children: [groups.map((group) => (_jsxs("section", { className: "relative pl-6", children: [_jsx("div", { className: "absolute bottom-0 left-[7px] top-2 w-px bg-border" }), _jsx("div", { className: "absolute left-0 top-1.5 flex items-center gap-2", children: _jsx("span", { className: "relative z-10 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background" }) }), _jsx("h3", { className: "mb-4 text-sm font-medium text-foreground", children: group.label }), _jsx("div", { className: cn(layout === "list"
                                            ? "grid grid-cols-1 gap-1 xl:grid-cols-2"
                                            : "grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4"), children: group.items.map((item) => (_jsx(HistoryCard, { item: item, layout: layout, editing: editing, selected: selectedIds.has(item.id), deleting: deletingId === item.id, onToggleSelect: () => {
                                                setSelectedIds((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(item.id))
                                                        next.delete(item.id);
                                                    else
                                                        next.add(item.id);
                                                    return next;
                                                });
                                            }, onDelete: (row) => void handleDelete(row) }, item.id))) })] }, group.label))), error && (_jsx("p", { className: "text-center text-sm text-red-400", children: error }))] })) }) }), (items.length > 0 || page > 1) && (_jsx(PaginationBar, { page: page, totalPages: totalPages, openEnded: !totalKnown, disabled: loading || clearing, disableNext: !hasMore, onPageChange: (next) => void fetchPage(next), info: totalKnown ? (_jsxs(_Fragment, { children: ["\u7B2C ", page, " / ", discoveredPages, " \u9875 \u00B7 \u672C\u9875 ", items.length, " \u6761", _jsxs("span", { className: "ml-1 text-muted-foreground/70", children: ["\uFF08\u6BCF\u9875\u7EA6 ", PAGE_SIZE, " \u6761 \u00B7 \u5171 ", discoveredPages, " \u9875\uFF09"] })] })) : (_jsxs(_Fragment, { children: ["\u7B2C ", page, " \u9875 \u00B7 \u672C\u9875 ", items.length, " \u6761 \u00B7 \u5DF2\u63A2\u77E5 ", discoveredPages, " ", "\u9875\uFF08\u8FD8\u6709\u66F4\u591A\uFF0C\u53EF\u76F4\u63A5\u8F93\u5165\u9875\u7801\u8DF3\u8F6C\uFF09", _jsxs("span", { className: "ml-1 text-muted-foreground/70", children: ["\uFF08\u6BCF\u9875\u7EA6 ", PAGE_SIZE, " \u6761\uFF09"] })] })) })), _jsx(ConfirmDialog, { open: clearOpen, title: "\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55\uFF1F", description: "\u5C06\u540C\u6B65\u6E05\u7A7A B \u7AD9\u8D26\u53F7\u4E0B\u7684\u5168\u90E8\u89C2\u770B\u5386\u53F2\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002", confirmLabel: "\u5168\u90E8\u6E05\u7A7A", destructive: true, loading: clearing, onConfirm: () => void handleClear(), onCancel: () => {
                    if (!clearing)
                        setClearOpen(false);
                } })] }));
}
