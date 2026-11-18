import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link, useLocation } from "react-router-dom";
import { DynamicFeedCard } from "@/components/dynamic/DynamicFeedCard";
import { PublishDynamicDialog } from "@/components/dynamic/PublishDynamicDialog";
import { FollowingLiveList } from "@/components/live/FollowingLiveList";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { dynamicsLiveCache, dynamicsTabCache, } from "@/lib/session-data-cache";
import { Loader2 } from "lucide-react";
/** 过滤 Tab 连续空页上限，避免 IntersectionObserver 死循环狂拉 */
const MAX_EMPTY_FILTER_PAGES = 8;
const MAX_DYNAMIC_ITEMS = 300;
const TABS = [
    { id: "all", label: "全部" },
    { id: "video", label: "视频" },
    { id: "live", label: "直播" },
    { id: "text", label: "图文" },
];
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function matchesTab(item, tab) {
    if (tab === "all")
        return true;
    if (tab === "video")
        return item.kind === "video";
    if (tab === "live")
        return item.kind === "live";
    return (item.kind === "text" ||
        item.kind === "draw" ||
        item.kind === "opus" ||
        item.kind === "forward" ||
        item.kind === "article" ||
        item.kind === "upower");
}
function apiTypeForTab(tab) {
    if (tab === "video")
        return "video";
    return "all";
}
function rewriteDynamicsCache(mutate) {
    for (const key of dynamicsTabCache.keys()) {
        const cached = dynamicsTabCache.get(key);
        if (!cached)
            continue;
        dynamicsTabCache.set(key, {
            ...cached,
            items: mutate(cached.items),
        });
    }
}
export function DynamicsPage() {
    const user = useAppStore((state) => state.user);
    const location = useLocation();
    const isActive = location.pathname === "/dynamics";
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const offsetRef = useRef("");
    const emptyFilterPagesRef = useRef(0);
    const tabRef = useRef("all");
    const wasActiveRef = useRef(isActive);
    const [tab, setTab] = useState("all");
    const [publishOpen, setPublishOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    tabRef.current = tab;
    // 直播 Tab：与首页一致，展示关注 UP 当前开播状态（非动态流）
    const [liveRooms, setLiveRooms] = useState([]);
    const [liveCount, setLiveCount] = useState(0);
    const [liveLoading, setLiveLoading] = useState(false);
    const [liveError, setLiveError] = useState("");
    const loadLives = useCallback(async () => {
        if (!user?.isLogin) {
            setLiveRooms([]);
            setLiveCount(0);
            setLiveLoading(false);
            setLiveError("");
            return;
        }
        setLiveLoading(true);
        setLiveError("");
        try {
            const result = await window.biliDesk.bili.getFollowingLives();
            setLiveRooms(result.rooms);
            setLiveCount(result.count);
            dynamicsLiveCache.set("following", {
                rooms: result.rooms,
                count: result.count,
            });
        }
        catch (err) {
            setLiveError(formatError(err));
            setLiveRooms([]);
            setLiveCount(0);
        }
        finally {
            setLiveLoading(false);
        }
    }, [user?.isLogin]);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const load = useCallback(async (nextTab, append) => {
        if (nextTab === "live")
            return;
        if (!user?.isLogin) {
            setItems([]);
            setHasMore(false);
            setLoading(false);
            setError("");
            return;
        }
        const isCurrent = () => tabRef.current === nextTab;
        const cached = dynamicsTabCache.get(nextTab);
        const offset = append ? cached?.offset || offsetRef.current : "";
        if (isCurrent()) {
            if (append)
                setLoadingMore(true);
            else {
                setLoading(true);
                setError("");
                emptyFilterPagesRef.current = 0;
            }
        }
        try {
            const result = await window.biliDesk.bili.getFollowDynamics(offset, apiTypeForTab(nextTab));
            const filtered = result.items.filter((item) => matchesTab(item, nextTab));
            const prevItems = append
                ? (cached?.items ?? (isCurrent() ? itemsRef.current : []))
                : [];
            const merged = (append ? [...prevItems, ...filtered] : filtered).slice(0, MAX_DYNAMIC_ITEMS);
            const emptyPages = filtered.length === 0
                ? append
                    ? (cached?.emptyFilterPages ?? 0) + 1
                    : 1
                : 0;
            const nextHasMore = result.hasMore &&
                merged.length < MAX_DYNAMIC_ITEMS &&
                emptyPages < MAX_EMPTY_FILTER_PAGES;
            const nextCache = {
                items: merged,
                offset: result.offset,
                hasMore: nextHasMore,
                emptyFilterPages: emptyPages,
            };
            if (merged.length > 0)
                dynamicsTabCache.set(nextTab, nextCache);
            else
                dynamicsTabCache.delete(nextTab);
            if (!isCurrent())
                return;
            offsetRef.current = result.offset;
            emptyFilterPagesRef.current = emptyPages;
            setItems(merged);
            setHasMore(nextHasMore);
            setError("");
        }
        catch (err) {
            if (!isCurrent())
                return;
            setError(formatError(err));
            if (!append)
                setItems([]);
            setHasMore(false);
        }
        finally {
            if (isCurrent()) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [user?.isLogin]);
    useEffect(() => {
        if (tab === "live") {
            const liveCached = dynamicsLiveCache.get("following");
            if (liveCached) {
                setLiveRooms(liveCached.rooms);
                setLiveCount(liveCached.count);
                setLiveLoading(false);
                setLiveError("");
                return;
            }
            void loadLives();
            return;
        }
        const cached = dynamicsTabCache.get(tab);
        if (cached && cached.items.length > 0) {
            offsetRef.current = cached.offset;
            emptyFilterPagesRef.current = cached.emptyFilterPages;
            setItems(cached.items);
            setHasMore(cached.hasMore);
            setLoading(false);
            setLoadingMore(false);
            setError("");
            return;
        }
        offsetRef.current = "";
        emptyFilterPagesRef.current = 0;
        void load(tab, false);
    }, [load, loadLives, tab]);
    useEffect(() => {
        const becameVisible = !wasActiveRef.current && isActive;
        wasActiveRef.current = isActive;
        if (!becameVisible || tab === "live" || !user?.isLogin)
            return;
        if (itemsRef.current.length > 0)
            return;
        dynamicsTabCache.delete(tab);
        offsetRef.current = "";
        emptyFilterPagesRef.current = 0;
        void load(tab, false);
    }, [isActive, load, tab, user?.isLogin]);
    useEffect(() => {
        const onRefresh = () => {
            scrollRef.current?.scrollTo({ top: 0 });
            if (tab === "live") {
                dynamicsLiveCache.delete("following");
                void loadLives();
                return;
            }
            dynamicsTabCache.delete(tab);
            offsetRef.current = "";
            emptyFilterPagesRef.current = 0;
            void load(tab, false);
        };
        window.addEventListener("bilidesk:refresh-dynamics", onRefresh);
        return () => window.removeEventListener("bilidesk:refresh-dynamics", onRefresh);
    }, [load, loadLives, tab]);
    useEffect(() => {
        if (tab === "live")
            return;
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore || loading || loadingMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void load(tab, true);
        }, { root, rootMargin: "240px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, load, loading, loadingMore, tab]);
    if (!user?.isLogin) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-6 text-center", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u767B\u5F55\u540E\u53EF\u67E5\u770B\u5173\u6CE8\u7684 UP \u4E3B\u52A8\u6001\u66F4\u65B0" }), _jsx(Button, { asChild: true, children: _jsx(Link, { to: "/login", children: "\u53BB\u767B\u5F55" }) })] }));
    }
    return (_jsxs("div", { className: "flex h-full flex-col overflow-hidden", children: [_jsxs("div", { className: "flex shrink-0 items-center gap-2 border-b border-border px-6 py-3", children: [TABS.map((option) => (_jsx("button", { type: "button", onClick: () => setTab(option.id), className: cn("rounded-full px-3 py-1.5 text-sm transition-colors", tab === option.id
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: option.label }, option.id))), _jsx("button", { type: "button", className: "ml-auto rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary", onClick: () => setPublishOpen(true), children: "\u53D1\u52A8\u6001" }), _jsx(PublishDynamicDialog, { open: publishOpen, onClose: () => setPublishOpen(false), onPublished: () => void load(tab, false) })] }), _jsx("div", { ref: scrollRef, className: "scrollbar-overlay flex-1 overflow-y-auto", children: tab === "live" ? (_jsx("div", { className: "mx-auto max-w-3xl p-6", children: liveLoading && liveRooms.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u5173\u6CE8\u76F4\u64AD..."] })) : liveError && liveRooms.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: liveError }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void loadLives(), children: "\u91CD\u8BD5" })] })) : liveRooms.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-muted-foreground", children: "\u5173\u6CE8\u7684 UP \u6682\u65E0\u5F00\u64AD" })) : (_jsx(FollowingLiveList, { rooms: liveRooms, count: liveCount })) })) : (_jsx("div", { className: "mx-auto max-w-2xl space-y-4 p-6", children: loading && items.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u52A8\u6001..."] })) : error && items.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void load(tab, false), children: "\u91CD\u8BD5" })] })) : items.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-muted-foreground", children: "\u6682\u65E0\u76F8\u5173\u52A8\u6001" })) : (_jsxs(_Fragment, { children: [items.map((item) => (_jsx(DynamicFeedCard, { item: item, onRemoved: (id) => {
                                    setItems((prev) => prev.filter((entry) => entry.id !== id));
                                    rewriteDynamicsCache((list) => list.filter((entry) => entry.id !== id));
                                }, onUnfollowed: (mid) => {
                                    setItems((prev) => prev.filter((entry) => entry.authorMid !== mid));
                                    rewriteDynamicsCache((list) => list.filter((entry) => entry.authorMid !== mid));
                                } }, item.id))), _jsx("div", { ref: sentinelRef, className: "py-4 text-center text-sm text-muted-foreground", children: loadingMore
                                    ? "加载更多..."
                                    : hasMore
                                        ? "继续下滑加载更多"
                                        : "已经到底啦" }), error && _jsx("p", { className: "text-sm text-red-400", children: error })] })) })) })] }));
}
