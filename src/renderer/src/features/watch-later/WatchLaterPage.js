import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CategoryTree } from "@/components/taxonomy/CategoryTree";
import { buildWatchLaterTree, filterBySelection, OTHER_CATEGORY, } from "./watch-later-categories";
import { useAppStore } from "@/stores/app-store";
import { TOVIEW_MAX, useWatchLaterStore } from "@/stores/watch-later-store";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn, formatDuration } from "@/lib/utils";
import { Check, Clock, FolderTree, Loader2, Trash2 } from "lucide-react";
const PAGE_SIZE = 30;
const CLASSIFY_CHUNK = 200;
const SHOW_CATEGORIES_KEY = "bilidesk.watchLater.showCategories";
const ALL_SELECTION = { level: "all", id: null };
const GRID_COLS_CLASS = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
};
function WatchLaterCard({ item, editing, selected, onToggleSelect, onRemove, }) {
    const [removing, setRemoving] = useState(false);
    const progressPercent = item.duration > 0
        ? Math.min(100, Math.round((item.progress / item.duration) * 100))
        : 0;
    const handleRemove = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setRemoving(true);
        try {
            await onRemove();
        }
        finally {
            setRemoving(false);
        }
    };
    const handleSelect = (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleSelect();
    };
    return (_jsxs("div", { className: "group relative", children: [_jsx("div", { className: cn(editing &&
                    selected &&
                    "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"), children: _jsx(VideoCard, { video: item, hideWatchLater: true, interactive: !editing, onCardClick: editing ? onToggleSelect : undefined, progressPercent: editing ? 0 : progressPercent, progressLabel: !editing && progressPercent > 0
                        ? `看到 ${formatDuration(item.progress)}`
                        : undefined }) }), editing ? (_jsx("button", { type: "button", title: selected ? "取消选择" : "选择", onClick: handleSelect, className: cn("absolute left-5 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors", selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/80 bg-black/60 text-white hover:bg-black/80"), children: selected && _jsx(Check, { className: "h-4 w-4" }) })) : (_jsx("button", { type: "button", title: "\u4ECE\u7A0D\u540E\u518D\u770B\u79FB\u9664", disabled: removing, onClick: (event) => void handleRemove(event), className: "absolute right-5 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500/80 group-hover:opacity-100", children: removing ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : (_jsx(Trash2, { className: "h-4 w-4" })) }))] }));
}
export function WatchLaterPage() {
    const user = useAppStore((state) => state.user);
    const homeGridColumns = useAppStore((state) => state.homeGridColumns);
    const officialVideos = useWatchLaterStore((state) => state.videos);
    const officialCount = useWatchLaterStore((state) => state.count);
    const localVideos = useWatchLaterStore((state) => state.localVideos);
    const localCount = useWatchLaterStore((state) => state.localCount);
    const loading = useWatchLaterStore((state) => state.loading);
    const ready = useWatchLaterStore((state) => state.ready);
    const error = useWatchLaterStore((state) => state.error);
    const fetch = useWatchLaterStore((state) => state.fetch);
    const ensureLoaded = useWatchLaterStore((state) => state.ensureLoaded);
    const remove = useWatchLaterStore((state) => state.remove);
    const removeMany = useWatchLaterStore((state) => state.removeMany);
    const clearOfficial = useWatchLaterStore((state) => state.clearOfficial);
    const [tab, setTab] = useState("official");
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(false);
    const [selectedBvids, setSelectedBvids] = useState(new Set());
    const [batchRemoving, setBatchRemoving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [showCategories, setShowCategories] = useState(() => localStorage.getItem(SHOW_CATEGORIES_KEY) !== "0");
    const [categoryPaths, setCategoryPaths] = useState(() => new Map());
    const [classifying, setClassifying] = useState(false);
    const [selectionByTab, setSelectionByTab] = useState({ official: ALL_SELECTION, local: ALL_SELECTION });
    const requestedRef = useRef(new Set());
    const pathsRef = useRef(categoryPaths);
    pathsRef.current = categoryPaths;
    const isLocalTab = tab === "local";
    const tabVideos = isLocalTab ? localVideos : officialVideos;
    const count = isLocalTab ? localCount : officialCount;
    const officialFull = officialCount >= TOVIEW_MAX;
    const selection = selectionByTab[tab];
    const { tree, idsByBvid } = useMemo(() => buildWatchLaterTree(tabVideos, categoryPaths), [tabVideos, categoryPaths]);
    const videos = useMemo(() => showCategories
        ? filterBySelection(tabVideos, idsByBvid, selection)
        : tabVideos, [showCategories, tabVideos, idsByBvid, selection]);
    useEffect(() => {
        const pending = [...officialVideos, ...localVideos].filter((item) => !requestedRef.current.has(item.bvid));
        if (pending.length === 0)
            return;
        for (const item of pending)
            requestedRef.current.add(item.bvid);
        let cancelled = false;
        setClassifying(true);
        void (async () => {
            for (let start = 0; start < pending.length; start += CLASSIFY_CHUNK) {
                const chunk = pending.slice(start, start + CLASSIFY_CHUNK);
                let result = {};
                try {
                    result = await window.biliDesk.bili.classifyTitles(chunk.map((item) => ({
                        key: item.bvid,
                        title: item.title,
                        upper: item.owner?.name ?? "",
                    })));
                }
                catch {
                    result = {};
                }
                if (cancelled)
                    return;
                setCategoryPaths((prev) => {
                    const next = new Map(prev);
                    for (const item of chunk) {
                        next.set(item.bvid, result[item.bvid] ?? { l1: OTHER_CATEGORY });
                    }
                    return next;
                });
            }
            if (!cancelled)
                setClassifying(false);
        })();
        return () => {
            cancelled = true;
            for (const item of pending) {
                if (!pathsRef.current.has(item.bvid)) {
                    requestedRef.current.delete(item.bvid);
                }
            }
            setClassifying(false);
        };
    }, [officialVideos, localVideos]);
    const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
    const pageVideos = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return videos.slice(start, start + PAGE_SIZE);
    }, [videos, page]);
    useEffect(() => {
        if (user?.isLogin)
            void ensureLoaded();
    }, [user?.isLogin, ensureLoaded]);
    useEffect(() => {
        if (page > totalPages)
            setPage(totalPages);
    }, [page, totalPages]);
    useEffect(() => {
        setPage(1);
        setEditing(false);
        setSelectedBvids(new Set());
    }, [tab]);
    useEffect(() => {
        if (!editing)
            setSelectedBvids(new Set());
    }, [editing]);
    useEffect(() => {
        setPage(1);
        setSelectedBvids(new Set());
    }, [selection]);
    useEffect(() => {
        if (selection.level === "all" || videos.length > 0 || classifying)
            return;
        setSelectionByTab((prev) => ({ ...prev, [tab]: ALL_SELECTION }));
    }, [selection, videos.length, classifying, tab]);
    useEffect(() => {
        localStorage.setItem(SHOW_CATEGORIES_KEY, showCategories ? "1" : "0");
    }, [showCategories]);
    const selectCategory = (next) => {
        setSelectionByTab((prev) => ({ ...prev, [tab]: next }));
    };
    const toggleSelect = (bvid) => {
        setSelectedBvids((prev) => {
            const next = new Set(prev);
            if (next.has(bvid))
                next.delete(bvid);
            else
                next.add(bvid);
            return next;
        });
    };
    const selectAllOnPage = () => {
        setSelectedBvids(new Set(pageVideos.map((item) => item.bvid)));
    };
    const clearSelection = () => {
        setSelectedBvids(new Set());
    };
    const handleBatchRemove = async () => {
        if (selectedBvids.size === 0)
            return;
        setBatchRemoving(true);
        try {
            const targets = videos
                .filter((item) => selectedBvids.has(item.bvid))
                .map((item) => ({ aid: item.aid, bvid: item.bvid }));
            await removeMany(targets);
            setSelectedBvids(new Set());
            setEditing(false);
        }
        finally {
            setBatchRemoving(false);
        }
    };
    if (!user?.isLogin) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 text-muted-foreground", children: [_jsx(Clock, { className: "h-10 w-10 opacity-40" }), _jsx("p", { className: "text-sm", children: "\u767B\u5F55\u540E\u67E5\u770B\u7A0D\u540E\u518D\u770B" }), _jsx(Link, { to: "/login", children: _jsx(Button, { size: "sm", children: "\u53BB\u767B\u5F55" }) })] }));
    }
    if (!ready && loading) {
        return (_jsxs("div", { className: "flex h-full items-center justify-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u7A0D\u540E\u518D\u770B..."] }));
    }
    return (_jsxs("div", { className: "flex h-full flex-col overflow-hidden", children: [_jsxs("div", { className: "shrink-0 space-y-3 border-b border-border px-6 py-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsxs("div", { className: "flex rounded-lg bg-secondary p-1", children: [_jsxs("button", { type: "button", onClick: () => setTab("official"), className: cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "official"
                                                    ? "bg-background text-foreground shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground"), children: ["B \u7AD9\u5B98\u65B9", officialCount > 0 ? ` ${officialCount}` : ""] }), _jsxs("button", { type: "button", onClick: () => setTab("local"), className: cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "local"
                                                    ? "bg-background text-foreground shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground"), children: ["\u672C\u5730", localCount > 0 ? ` ${localCount}` : ""] })] }), _jsx("p", { className: "text-sm text-muted-foreground", children: isLocalTab
                                            ? `共 ${count} 个视频 · 保存在本机，不占用官方 1000 上限`
                                            : `共 ${count} 个视频 · 最多 ${TOVIEW_MAX} 个 · 与 B 站账号同步` })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [tabVideos.length > 0 && (_jsxs(Button, { size: "sm", variant: showCategories ? "secondary" : "outline", className: "gap-1", title: "\u6309\u6536\u85CF\u5939\u540C\u4E00\u5957\u6807\u51C6\u81EA\u52A8\u5206\u7C7B", onClick: () => setShowCategories((prev) => !prev), children: [_jsx(FolderTree, { className: "h-4 w-4" }), showCategories ? "隐藏分类" : "自动分类"] })), !isLocalTab && officialCount > 0 && (_jsx(Button, { size: "sm", variant: "outline", disabled: clearing, onClick: () => {
                                            if (!window.confirm("清空 B 站官方稍后再看？本地列表不受影响。")) {
                                                return;
                                            }
                                            setClearing(true);
                                            void clearOfficial()
                                                .catch(() => undefined)
                                                .finally(() => setClearing(false));
                                        }, children: clearing ? "清空中..." : "清空官方" })), tabVideos.length > 0 && (_jsx("div", { className: "flex flex-wrap items-center gap-2", children: editing ? (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "outline", onClick: selectAllOnPage, disabled: batchRemoving, children: "\u5168\u9009\u672C\u9875" }), _jsx(Button, { size: "sm", variant: "outline", onClick: clearSelection, disabled: batchRemoving || selectedBvids.size === 0, children: "\u53D6\u6D88\u9009\u62E9" }), _jsxs(Button, { size: "sm", variant: "destructive", className: "gap-1", disabled: batchRemoving || selectedBvids.size === 0, onClick: () => void handleBatchRemove(), children: [batchRemoving ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : (_jsx(Trash2, { className: "h-4 w-4" })), "\u5220\u9664", selectedBvids.size > 0 ? ` (${selectedBvids.size})` : ""] }), _jsx(Button, { size: "sm", variant: "secondary", disabled: batchRemoving, onClick: () => setEditing(false), children: "\u5B8C\u6210" })] })) : (_jsx(Button, { size: "sm", variant: "outline", onClick: () => setEditing(true), children: "\u7F16\u8F91" })) }))] })] }), officialFull && (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u5B98\u65B9\u7A0D\u540E\u518D\u770B\u5DF2\u6EE1 ", TOVIEW_MAX, " \u4E2A\uFF0C\u518D\u6DFB\u52A0\u4F1A\u81EA\u52A8\u8FDB\u300C\u672C\u5730\u300D"] }))] }), _jsxs("div", { className: "flex min-h-0 flex-1", children: [showCategories && tabVideos.length > 0 && (_jsxs("aside", { className: "flex w-56 shrink-0 flex-col border-r border-border", children: [_jsxs("div", { className: "flex items-center justify-between px-3 pb-1 pt-3 text-xs text-muted-foreground", children: [_jsx("span", { children: isLocalTab ? "本地 · 分类" : "官方 · 分类" }), classifying && (_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), "\u5206\u7C7B\u4E2D"] }))] }), _jsx("div", { className: "scrollbar-none min-h-0 flex-1 overflow-y-auto p-2", children: _jsx(CategoryTree, { tree: tree, selection: selection, onSelect: selectCategory, allLabel: "\u5168\u90E8", allCount: tabVideos.length, showCollapseAll: true }, tab) })] })), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsx("div", { className: "min-h-0 flex-1 overflow-y-auto", children: _jsx("div", { className: "p-6", children: !isLocalTab && error && tabVideos.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-3 py-16 text-sm text-red-400", children: [_jsx("p", { children: error }), _jsx(Button, { size: "sm", variant: "secondary", onClick: () => void fetch(), children: "\u91CD\u8BD5" })] })) : tabVideos.length > 0 && videos.length === 0 ? (_jsx("div", { className: "flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground", children: "\u8FD9\u4E2A\u5206\u7C7B\u4E0B\u6682\u65F6\u6CA1\u6709\u89C6\u9891" })) : videos.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground", children: [_jsx(Clock, { className: "h-10 w-10 opacity-40" }), _jsx("p", { className: "text-sm", children: isLocalTab ? "本地稍后再看还是空的" : "暂无稍后再看视频" }), _jsx("p", { className: "text-xs", children: isLocalTab
                                                    ? "官方满员后，新添加的视频会自动出现在这里"
                                                    : "在视频卡片或播放页点击时钟图标即可添加" })] })) : (_jsx("div", { className: cn("grid gap-4", GRID_COLS_CLASS[homeGridColumns]), children: pageVideos.map((item) => (_jsx(WatchLaterCard, { item: item, editing: editing, selected: selectedBvids.has(item.bvid), onToggleSelect: () => toggleSelect(item.bvid), onRemove: () => remove(item.aid, item.bvid) }, item.bvid))) })) }) }), videos.length > 0 && (_jsx(PaginationBar, { className: "shrink-0 bg-background", page: page, totalPages: totalPages, disabled: batchRemoving, onPageChange: setPage, info: _jsxs(_Fragment, { children: [showCategories && selection.level !== "all"
                                            ? `本分类 ${videos.length} 个 · `
                                            : "", "\u7B2C ", page, " / ", totalPages, " \u9875 \u00B7 \u672C\u9875 ", pageVideos.length, " \u4E2A"] }) }))] })] })] }));
}
