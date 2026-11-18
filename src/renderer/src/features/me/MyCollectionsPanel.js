import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UNGROUPED_COLLECTION_L1, collectionGroupKey, } from "@shared/utils/collection-groups";
import { CollectionGroupTree, buildCollectionTree, buildTreeFromGroups, matchesCollectionSelection, } from "@/components/collections/CollectionGroupTree";
import { CollectionMoveDialog } from "@/components/collections/CollectionMoveDialog";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { collectionClassifyTask, useBackgroundTask, } from "@/lib/background-task";
import { formatDisplayedError } from "@/lib/ipc-error";
import { notifyRefreshDone } from "@/lib/page-refresh";
import { cn, formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Bookmark, Folder, FolderInput, Layers, Loader2, PenSquare, RefreshCw, Sparkles, } from "lucide-react";
const VIDEO_PAGE_SIZE = 30;
const MODE_STORAGE_KEY = "bilidesk:collections-mode";
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function itemLabel(item) {
    if (item.kind === "series")
        return "系列";
    return item.source === "created" ? "我的合集" : "合集";
}
function sectionize(items, groups, by) {
    const buckets = new Map();
    for (const item of items) {
        const group = groups[collectionGroupKey(item)];
        const name = group
            ? by === "l1"
                ? group.l1
                : group.l2
            : UNGROUPED_COLLECTION_L1;
        const bucket = buckets.get(name);
        if (bucket)
            bucket.push(item);
        else
            buckets.set(name, [item]);
    }
    return Array.from(buckets, ([name, list]) => ({ name, items: list })).sort((a, b) => Number(a.name === UNGROUPED_COLLECTION_L1) -
        Number(b.name === UNGROUPED_COLLECTION_L1) ||
        b.items.length - a.items.length);
}
export function MyCollectionsPanel({ mid, layout = "embedded", }) {
    const selfMid = useAppStore((s) => s.user?.mid) ?? 0;
    const isSelf = mid > 0 && Number(mid) === Number(selfMid);
    const listScrollRef = useRef(null);
    const listSentinelRef = useRef(null);
    const [mode, setMode] = useState(() => localStorage.getItem(MODE_STORAGE_KEY) === "local" ? "local" : "bilibili");
    const localMode = isSelf && mode === "local";
    const [tab, setTab] = useState("subscribed");
    const [seasons, setSeasons] = useState([]);
    const [series, setSeries] = useState([]);
    const [subscribed, setSubscribed] = useState([]);
    const [pageByTab, setPageByTab] = useState({
        created: 1,
        subscribed: 1,
    });
    const [hasMoreByTab, setHasMoreByTab] = useState({ created: false, subscribed: false });
    const [loadedTabs, setLoadedTabs] = useState(() => new Set());
    const page = pageByTab[tab];
    const hasMore = hasMoreByTab[tab];
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [localItems, setLocalItems] = useState(null);
    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState("");
    const [groups, setGroups] = useState({});
    const [groupSelection, setGroupSelection] = useState({ l1: null, l2: null });
    const classifyTask = useBackgroundTask(collectionClassifyTask);
    const classifying = classifyTask.running;
    const classifyProgress = classifyTask.progress;
    const classifyPercent = classifying && classifyProgress && classifyProgress.total > 0
        ? Math.round((classifyProgress.done / classifyProgress.total) * 100)
        : 0;
    const [resultMessage, setClassifyMessage] = useState("");
    const classifyMessage = classifying
        ? (classifyProgress?.message ?? "正在启动整理…")
        : resultMessage;
    const [moveItem, setMoveItem] = useState(null);
    const [selected, setSelected] = useState(null);
    const [videos, setVideos] = useState([]);
    const [videoPage, setVideoPage] = useState(1);
    const [videoTotal, setVideoTotal] = useState(0);
    const [videosLoading, setVideosLoading] = useState(false);
    const [videosError, setVideosError] = useState("");
    const [sortOrder, setSortOrder] = useState("desc");
    const [subscribedIds, setSubscribedIds] = useState(() => new Set());
    const [subBusy, setSubBusy] = useState(false);
    const [subError, setSubError] = useState("");
    const clearDetail = useCallback(() => {
        setSelected(null);
        setVideos([]);
        setVideoPage(1);
        setVideoTotal(0);
        setSubError("");
    }, []);
    const loadList = useCallback(async (kind, nextPage, append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
            clearDetail();
        }
        try {
            if (kind === "created") {
                const result = await window.biliDesk.bili.getUserCollections(mid, nextPage);
                setSeasons((prev) => append ? [...prev, ...result.seasons] : result.seasons);
                setSeries((prev) => append ? [...prev, ...result.series] : result.series);
                setHasMoreByTab((prev) => ({ ...prev, created: result.hasMore }));
            }
            else {
                const result = await window.biliDesk.bili.getSubscribedCollections(nextPage);
                setSubscribed((prev) => append ? [...prev, ...result.seasons] : result.seasons);
                setHasMoreByTab((prev) => ({ ...prev, subscribed: result.hasMore }));
            }
            setPageByTab((prev) => ({ ...prev, [kind]: nextPage }));
            setLoadedTabs((prev) => new Set(prev).add(`${mid}:${kind}`));
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [mid, clearDetail]);
    const loadLocal = useCallback(async () => {
        setLocalLoading(true);
        setLocalError("");
        try {
            setLocalItems(await window.biliDesk.bili.getLocalCollections());
        }
        catch (err) {
            setLocalError(formatError(err));
        }
        finally {
            setLocalLoading(false);
        }
    }, []);
    useEffect(() => {
        void window.biliDesk.bili
            .getCollectionGroups()
            .then(setGroups)
            .catch(() => setGroups({}));
    }, []);
    useEffect(() => {
        if (classifyTask.running || classifyTask.acknowledged)
            return;
        collectionClassifyTask.acknowledge();
        const result = classifyTask.result;
        if (!result) {
            setClassifyMessage(classifyTask.error || "整理失败");
            return;
        }
        setLocalItems(result.items);
        setGroups(result.groups);
        setClassifyMessage(result.message);
    }, [classifyTask]);
    const loadGroups = useCallback(() => window.biliDesk.bili
        .getCollectionGroups()
        .then(setGroups)
        .catch(() => setGroups({})), []);
    useEffect(() => {
        if (localMode || loadedTabs.has(`${mid}:${tab}`))
            return;
        void loadList(tab, 1, false);
    }, [tab, mid, loadList, localMode, loadedTabs]);
    useEffect(() => {
        if (layout !== "page")
            return;
        const onRefresh = () => {
            const job = localMode
                ? Promise.allSettled([loadLocal(), loadGroups()])
                : loadList(tab, 1, false);
            void job.then(notifyRefreshDone);
        };
        window.addEventListener("bilidesk:refresh-collections", onRefresh);
        return () => window.removeEventListener("bilidesk:refresh-collections", onRefresh);
    }, [layout, localMode, tab, loadList, loadLocal, loadGroups]);
    useEffect(() => {
        if (localMode && localItems == null && !localLoading)
            void loadLocal();
    }, [localMode, localItems, localLoading, loadLocal]);
    useEffect(() => {
        if (tab !== "subscribed")
            return;
        setSubscribedIds(new Set(subscribed.map((item) => item.id)));
    }, [tab, subscribed]);
    useEffect(() => {
        const root = listScrollRef.current;
        const target = listSentinelRef.current;
        if (localMode || !root || !target || !hasMore || loading || loadingMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void loadList(tab, page + 1, true);
        }, { root, rootMargin: "120px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [tab, hasMore, loadList, loading, loadingMore, page, localMode]);
    const switchMode = (next) => {
        if (next === mode)
            return;
        localStorage.setItem(MODE_STORAGE_KEY, next);
        setMode(next);
        clearDetail();
    };
    const switchTab = (next) => {
        if (next === tab)
            return;
        clearDetail();
        setError("");
        setTab(next);
    };
    const selectGroup = (next) => {
        setGroupSelection(next);
        clearDetail();
        if (listScrollRef.current)
            listScrollRef.current.scrollTop = 0;
    };
    const runClassify = (classifyMode) => {
        if (classifying)
            return;
        setClassifyMessage("");
        void collectionClassifyTask
            .run(() => window.biliDesk.bili.classifyCollections(classifyMode), null)
            .catch(() => undefined);
    };
    const renameGroup = async (l1, l2, name) => {
        try {
            const next = await window.biliDesk.bili.renameCollectionGroup(l1, l2, name);
            setGroups(next);
            setGroupSelection((prev) => {
                if (prev.l1 !== l1)
                    return prev;
                if (l2 == null)
                    return { ...prev, l1: name };
                return prev.l2 === l2 ? { ...prev, l2: name } : prev;
            });
        }
        catch (err) {
            setClassifyMessage(formatError(err));
        }
    };
    const loadVideos = useCallback(async (collection, nextPage) => {
        setVideosLoading(true);
        setVideosError("");
        const ownerMid = collection.ownerMid ?? mid;
        try {
            const result = collection.kind === "season"
                ? await window.biliDesk.bili.getSeasonArchives(ownerMid, collection.id, nextPage)
                : await window.biliDesk.bili.getSeriesArchives(collection.id, nextPage);
            setVideos(result.videos);
            setVideoPage(result.page);
            setVideoTotal(result.total > 0
                ? result.total
                : collection.total || result.videos.length);
        }
        catch (err) {
            setVideosError(formatError(err));
            setVideos([]);
        }
        finally {
            setVideosLoading(false);
        }
    }, [mid]);
    const selectCollection = useCallback((collection) => {
        setSelected(collection);
        setSortOrder("desc");
        setVideoPage(1);
        setSubError("");
        void loadVideos(collection, 1);
        if (collection.kind === "season" && collection.source === "subscribed") {
            setSubscribedIds((prev) => new Set(prev).add(collection.id));
        }
        else if (collection.kind === "season" &&
            Number(collection.ownerMid ?? mid) !== Number(selfMid)) {
            void window.biliDesk.bili
                .getUgcSeasonSubscribed(collection.id)
                .then((value) => {
                setSubscribedIds((prev) => {
                    const next = new Set(prev);
                    if (value)
                        next.add(collection.id);
                    else
                        next.delete(collection.id);
                    return next;
                });
            })
                .catch(() => { });
        }
    }, [loadVideos, mid, selfMid]);
    const goToVideoPage = useCallback((nextPage) => {
        if (!selected || nextPage < 1 || videosLoading)
            return;
        const totalPages = Math.max(1, Math.ceil(videoTotal / VIDEO_PAGE_SIZE));
        if (nextPage > totalPages)
            return;
        setVideoPage(nextPage);
        void loadVideos(selected, nextPage);
    }, [selected, videosLoading, videoTotal, loadVideos]);
    const isOwnSelected = Boolean(selected &&
        (selected.source === "created" ||
            Number(selected.ownerMid ?? 0) === Number(selfMid)));
    const canSubscribeSelected = Boolean(selected && selected.kind === "season" && !isOwnSelected);
    const selectedSubscribed = Boolean(selected && subscribedIds.has(selected.id));
    const removeFromLists = (item) => {
        setSubscribed((prev) => prev.filter((entry) => entry.id !== item.id));
        setLocalItems((prev) => prev
            ? prev.filter((entry) => !(entry.source === "subscribed" &&
                collectionGroupKey(entry) === collectionGroupKey(item)))
            : prev);
    };
    const handleToggleSubscribe = async () => {
        if (!selected || selected.kind !== "season" || subBusy)
            return;
        if (!selfMid) {
            setSubError("请先登录后再订阅合集");
            return;
        }
        const next = !selectedSubscribed;
        const snapshot = selected;
        setSubBusy(true);
        setSubError("");
        setSubscribedIds((prev) => {
            const copy = new Set(prev);
            if (next)
                copy.add(snapshot.id);
            else
                copy.delete(snapshot.id);
            return copy;
        });
        try {
            await window.biliDesk.bili.setUgcSeasonSubscribe(snapshot.id, next);
            if (!next && snapshot.source === "subscribed") {
                removeFromLists(snapshot);
                clearDetail();
            }
        }
        catch (err) {
            setSubscribedIds((prev) => {
                const copy = new Set(prev);
                if (next)
                    copy.delete(snapshot.id);
                else
                    copy.add(snapshot.id);
                return copy;
            });
            const message = formatError(err);
            if (next &&
                (message.includes("已订阅") ||
                    message.includes("已经收藏") ||
                    message.includes("重复"))) {
                setSubscribedIds((prev) => new Set(prev).add(snapshot.id));
            }
            else {
                setSubError(message);
            }
        }
        finally {
            setSubBusy(false);
        }
    };
    const sortedVideos = useMemo(() => {
        const copy = [...videos];
        copy.sort((a, b) => sortOrder === "desc" ? b.pubdate - a.pubdate : a.pubdate - b.pubdate);
        return copy;
    }, [videos, sortOrder]);
    const videoTotalPages = Math.max(1, Math.ceil(videoTotal / VIDEO_PAGE_SIZE));
    const officialItems = useMemo(() => (tab === "created" ? [...seasons, ...series] : subscribed), [tab, seasons, series, subscribed]);
    const { tree, ungrouped } = useMemo(() => buildCollectionTree(localItems ?? [], groups), [localItems, groups]);
    const moveTree = useMemo(() => buildTreeFromGroups(groups), [groups]);
    const listSections = useMemo(() => {
        if (!localMode)
            return [{ name: "", items: officialItems }];
        const filtered = (localItems ?? []).filter((item) => matchesCollectionSelection(item, groups, groupSelection));
        if (groupSelection.l1 == null)
            return sectionize(filtered, groups, "l1");
        if (groupSelection.l2 == null &&
            groupSelection.l1 !== UNGROUPED_COLLECTION_L1) {
            return sectionize(filtered, groups, "l2");
        }
        return [{ name: "", items: filtered }];
    }, [localMode, officialItems, localItems, groups, groupSelection]);
    const listCount = listSections.reduce((sum, section) => sum + section.items.length, 0);
    const listTitle = localMode
        ? groupSelection.l1 == null
            ? "全部合集"
            : groupSelection.l2
                ? `${groupSelection.l1} / ${groupSelection.l2}`
                : groupSelection.l1
        : tab === "created"
            ? "我创建的"
            : "我收藏的";
    const listBusy = localMode
        ? localLoading && localItems == null
        : loading && officialItems.length === 0;
    const listError = localMode ? localError : error;
    const sidebarRow = (active) => cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors", active ? "bg-primary/10 text-primary" : "hover:bg-secondary");
    return (_jsxs("div", { className: cn("grid min-h-0 gap-4 lg:grid-cols-[220px_300px_minmax(0,1fr)]", layout === "page" ? "h-full" : "h-[calc(100vh-13rem)] min-h-[520px]"), children: [_jsxs("aside", { className: "bili-glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/25", children: [isSelf && (_jsx("div", { className: "border-b border-border/60 p-3", children: _jsx("div", { className: "flex rounded-lg bg-secondary p-1", children: [
                                ["bilibili", "B 站合集"],
                                ["local", "本地分类"],
                            ].map(([value, label]) => (_jsx("button", { type: "button", onClick: () => switchMode(value), className: cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors", mode === value
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"), children: label }, value))) }) })), localMode && (_jsxs("div", { className: "space-y-2 border-b border-border/60 p-3", children: [_jsx("p", { className: "text-[11px] leading-relaxed text-muted-foreground", children: "\u5408\u5E76\u300C\u6211\u6536\u85CF\u7684\u300D\u548C\u300C\u6211\u521B\u5EFA\u7684\u300D\uFF0C\u6309\u6807\u9898\u4E0E\u7B80\u4ECB\u7528\u89C4\u5219 + AI \u5206\u6210\u4E24\u7EA7\u76EE\u5F55\u3002\u624B\u52A8\u79FB\u52A8\u8FC7\u7684\u4E0D\u4F1A\u88AB\u8986\u76D6\uFF0C\u53CC\u51FB\u5206\u7C7B\u53EF\u91CD\u547D\u540D\u3002" }), _jsxs("div", { className: "flex gap-1.5", children: [_jsxs(Button, { type: "button", size: "sm", variant: "secondary", className: "flex-1 gap-1.5", disabled: classifying, onClick: () => void runClassify("new"), title: "\u53EA\u6574\u7406\u8FD8\u6CA1\u6709\u5206\u7C7B\u7684\u5408\u96C6", children: [classifying ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Sparkles, { className: "h-3.5 w-3.5" })), "\u6574\u7406\u65B0\u589E"] }), _jsxs(Button, { type: "button", size: "sm", variant: "ghost", className: "gap-1 px-2", disabled: classifying, onClick: () => void runClassify("all"), title: "\u9664\u624B\u52A8\u79FB\u52A8\u7684\u4EE5\u5916\uFF0C\u5168\u90E8\u91CD\u65B0\u5206\u7C7B", children: [_jsx(RefreshCw, { className: "h-3.5 w-3.5" }), "\u5168\u90E8\u91CD\u6574"] })] }), classifying && classifyPercent > 0 && (_jsx("div", { className: "h-1.5 overflow-hidden rounded-full bg-secondary", children: _jsx("div", { className: "h-full rounded-full bg-primary transition-all duration-300", style: { width: `${classifyPercent}%` } }) })), classifyMessage && (_jsx("p", { className: "text-[11px] text-muted-foreground", children: classifyMessage }))] })), _jsx("div", { className: "scrollbar-none min-h-0 flex-1 overflow-y-auto p-2", children: localMode ? (_jsx(CollectionGroupTree, { tree: tree, total: localItems?.length ?? 0, ungrouped: ungrouped, selection: groupSelection, onSelect: selectGroup, onRename: (l1, l2, name) => void renameGroup(l1, l2, name) })) : (_jsxs("div", { className: "space-y-0.5", children: [_jsxs("button", { type: "button", className: sidebarRow(tab === "subscribed"), onClick: () => switchTab("subscribed"), children: [_jsx(Bookmark, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "flex-1", children: "\u6211\u6536\u85CF\u7684" })] }), _jsxs("button", { type: "button", className: sidebarRow(tab === "created"), onClick: () => switchTab("created"), children: [_jsx(PenSquare, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "flex-1", children: "\u6211\u521B\u5EFA\u7684" })] })] })) })] }), _jsxs("div", { className: "bili-glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/25", children: [_jsxs("div", { className: "flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5", children: [_jsx("p", { className: "min-w-0 truncate text-sm font-medium", children: listTitle }), _jsxs("span", { className: "shrink-0 text-xs text-muted-foreground", children: [listCount, !localMode && hasMore ? "+" : "", " \u4E2A"] })] }), _jsxs("div", { ref: listScrollRef, className: "min-h-0 flex-1 space-y-1 overflow-y-auto p-2", children: [listBusy ? (_jsxs("p", { className: "flex items-center px-2 py-6 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), localMode ? "正在拉取全部合集…" : "加载合集..."] })) : listError && listCount === 0 ? (_jsx("p", { className: "px-2 py-6 text-sm text-red-400", children: listError })) : listCount === 0 ? (_jsx("p", { className: "px-2 py-6 text-center text-sm text-muted-foreground", children: localMode
                                    ? "这个分类下还没有合集"
                                    : tab === "created"
                                        ? "暂无自建合集或系列"
                                        : "暂无收藏/订阅的合集" })) : (listSections.map((section) => (_jsxs("div", { className: "space-y-1", children: [section.name && (_jsxs("p", { className: "sticky top-0 z-[1] flex items-center justify-between rounded-md bg-card/90 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur", children: [_jsx("span", { className: "truncate", children: section.name }), _jsx("span", { children: section.items.length })] })), section.items.map((item) => {
                                        const active = selected != null &&
                                            collectionGroupKey(selected) === collectionGroupKey(item);
                                        const group = groups[collectionGroupKey(item)];
                                        return (_jsxs("div", { role: "button", tabIndex: 0, onClick: () => selectCollection(item), onKeyDown: (event) => {
                                                if (event.key === "Enter")
                                                    selectCollection(item);
                                            }, className: cn("group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", active
                                                ? "bg-primary/15 ring-1 ring-primary/35"
                                                : "hover:bg-secondary/70"), children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-12 w-[4.5rem] shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-12 w-[4.5rem] shrink-0 items-center justify-center rounded-lg bg-muted", children: item.kind === "season" ? (_jsx(Folder, { className: "h-4 w-4 text-muted-foreground" })) : (_jsx(Layers, { className: "h-4 w-4 text-muted-foreground" })) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium", children: item.title }), _jsxs("p", { className: "mt-0.5 truncate text-xs text-muted-foreground", children: [itemLabel(item), " \u00B7 ", formatCount(item.total), " \u4E2A", group && (!localMode || groupSelection.l1 == null)
                                                                    ? ` · ${group.l1}/${group.l2}`
                                                                    : ""] })] }), isSelf && (_jsx("button", { type: "button", title: "\u79FB\u52A8\u5230\u672C\u5730\u5206\u7C7B", className: "shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100", onClick: (event) => {
                                                        event.stopPropagation();
                                                        setMoveItem(item);
                                                    }, children: _jsx(FolderInput, { className: "h-4 w-4" }) }))] }, `${item.source ?? tab}-${collectionGroupKey(item)}`));
                                    })] }, section.name || "__all")))), !localMode && officialItems.length > 0 && (_jsx("div", { ref: listSentinelRef, className: "py-3 text-center text-xs text-muted-foreground", children: loadingMore
                                    ? "加载更多..."
                                    : hasMore
                                        ? "继续下滑加载更多"
                                        : "已经到底啦" }))] })] }), _jsx("div", { className: "bili-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/20", children: !selected ? (_jsxs("div", { className: "flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground", children: [_jsx(Layers, { className: "h-8 w-8 opacity-40" }), _jsx("p", { children: "\u9009\u62E9\u4E2D\u95F4\u7684\u5408\u96C6\u67E5\u770B\u89C6\u9891" })] })) : (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: [_jsxs("div", { className: "relative shrink-0 overflow-hidden border-b border-border/60", children: [selected.cover ? (_jsx(BiliImage, { src: selected.cover, alt: "", className: "absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl" })) : null, _jsxs("div", { className: "relative flex flex-wrap items-start gap-4 px-4 py-4", children: [selected.cover ? (_jsx(BiliImage, { src: selected.cover, alt: "", className: "h-20 w-[7.5rem] shrink-0 rounded-xl object-cover shadow-lg" })) : (_jsx("div", { className: "flex h-20 w-[7.5rem] shrink-0 items-center justify-center rounded-xl bg-muted", children: _jsx(Folder, { className: "h-6 w-6 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1 space-y-2", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "truncate text-lg font-semibold tracking-tight", children: selected.title }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [selected.kind === "season" ? "合集" : "系列", " \u00B7", " ", formatCount(selected.total || videoTotal), " \u4E2A\u5185\u5BB9", groups[collectionGroupKey(selected)]
                                                                            ? ` · ${groups[collectionGroupKey(selected)].l1}/${groups[collectionGroupKey(selected)].l2}`
                                                                            : ""] })] }), _jsxs("div", { className: "flex shrink-0 flex-wrap items-center gap-2", children: [canSubscribeSelected && (_jsx(Button, { size: "sm", variant: selectedSubscribed ? "outline" : "default", disabled: subBusy, onClick: () => void handleToggleSubscribe(), children: subBusy
                                                                        ? "处理中..."
                                                                        : selectedSubscribed
                                                                            ? "取消订阅"
                                                                            : "订阅合集" })), videoTotal > 0 && (_jsxs(_Fragment, { children: [_jsxs(Button, { size: "sm", variant: sortOrder === "desc" ? "default" : "outline", className: "gap-1", onClick: () => setSortOrder("desc"), children: [_jsx(ArrowDownWideNarrow, { className: "h-3.5 w-3.5" }), "\u6700\u65B0"] }), _jsxs(Button, { size: "sm", variant: sortOrder === "asc" ? "default" : "outline", className: "gap-1", onClick: () => setSortOrder("asc"), children: [_jsx(ArrowUpWideNarrow, { className: "h-3.5 w-3.5" }), "\u6700\u65E9"] })] }))] })] }), selected.description ? (_jsx("p", { className: "line-clamp-2 text-xs leading-relaxed text-muted-foreground", children: selected.description })) : null, subError ? (_jsx("p", { className: "text-xs text-red-400", children: subError })) : null] })] })] }), videosLoading && videos.length === 0 ? (_jsxs("p", { className: "flex items-center px-4 py-8 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u89C6\u9891\u4E2D..."] })) : videosError && videos.length === 0 ? (_jsx("p", { className: "px-4 py-8 text-sm text-red-400", children: videosError })) : sortedVideos.length > 0 ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: cn("min-h-0 flex-1 overflow-y-auto px-4 pt-4", videosLoading && "pointer-events-none opacity-60"), children: [_jsx("div", { className: "grid grid-cols-2 gap-4 pb-2 xl:grid-cols-3", children: sortedVideos.map((video) => (_jsx(VideoCard, { video: video, meta: "stats" }, video.bvid))) }), videosLoading && (_jsxs("p", { className: "flex items-center justify-center py-4 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2D..."] })), videosError && (_jsx("p", { className: "pb-2 text-sm text-red-400", children: videosError }))] }), videoTotal > 0 && (_jsx(PaginationBar, { page: videoPage, totalPages: videoTotalPages, disabled: videosLoading, onPageChange: goToVideoPage, className: "mt-auto shrink-0 border-t border-border/60 bg-transparent px-4 py-3", info: _jsxs(_Fragment, { children: ["\u5171 ", videoTotal, " \u4E2A\u89C6\u9891 \u00B7 \u7B2C ", videoPage, " /", " ", videoTotalPages, " \u9875"] }) }))] })) : (_jsx("p", { className: "px-4 py-8 text-sm text-muted-foreground", children: "\u8BE5\u5408\u96C6\u6682\u65E0\u89C6\u9891" }))] })) }), _jsx(CollectionMoveDialog, { item: moveItem, current: moveItem ? groups[collectionGroupKey(moveItem)] : undefined, tree: moveTree, onClose: () => setMoveItem(null), onConfirm: async (group) => {
                    if (!moveItem)
                        return;
                    const next = await window.biliDesk.bili.setCollectionGroup(collectionGroupKey(moveItem), group);
                    setGroups(next);
                } })] }));
}
