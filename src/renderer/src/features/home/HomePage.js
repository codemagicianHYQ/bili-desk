import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { useHomeFeedStore } from "@/stores/home-feed-store";
import { useHomeLiveStore } from "@/stores/home-live-store";
import { useHomeSearchStore } from "@/stores/home-search-store";
import { useHomeTabStore } from "@/stores/home-tab-store";
import { useAppStore } from "@/stores/app-store";
import { VideoCard } from "@/components/video/VideoCard";
import { LiveCard } from "@/components/live/LiveCard";
import { FollowingLiveList } from "@/components/live/FollowingLiveList";
import { SearchUserPanel } from "@/features/home/SearchUserPanel";
import { SearchArticlePanel } from "@/features/home/SearchArticlePanel";
import { SearchMediaPanel } from "@/features/home/SearchMediaPanel";
import { SearchLivePanel } from "@/features/home/SearchLivePanel";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Loader2, Search as SearchIcon, ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEARCH_PAGE_SIZE } from "@/lib/search-page-size";
import { useFollowedMidSet } from "@/lib/use-followed-mids";
const GRID_COLS_CLASS = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
};
const ORDER_OPTIONS = [
    { value: "totalrank", label: "综合排序" },
    { value: "click", label: "最多播放" },
    { value: "pubdate", label: "最新发布" },
    { value: "dm", label: "最多弹幕" },
    { value: "stow", label: "最多收藏" },
];
const SEARCH_CATEGORY_TABS = [
    { id: "all", label: "综合" },
    { id: "video", label: "视频", countKey: "video" },
    { id: "bangumi", label: "番剧", countKey: "bangumi" },
    { id: "media", label: "影视", countKey: "media" },
    { id: "live", label: "直播", countKey: "live" },
    { id: "article", label: "专栏", countKey: "article" },
    { id: "user", label: "用户", countKey: "user" },
];
function formatCountBadge(n) {
    if (!n || n <= 0)
        return "0";
    if (n > 9999)
        return "9999+";
    return n.toLocaleString();
}
function formatSearchError(err) {
    return formatDisplayedError(err, undefined, "搜索失败");
}
/** 前缀匹配高亮（官网 suggest 同款视觉） */
function highlightSuggest(text, term) {
    const q = term.trim();
    if (!q)
        return text;
    if (text.toLowerCase().startsWith(q.toLowerCase())) {
        return (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-primary", children: text.slice(0, q.length) }), text.slice(q.length)] }));
    }
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0)
        return text;
    return (_jsxs(_Fragment, { children: [text.slice(0, idx), _jsx("span", { className: "text-primary", children: text.slice(idx, idx + q.length) }), text.slice(idx + q.length)] }));
}
export function HomePage() {
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const liveSentinelRef = useRef(null);
    const searchLoadSeqRef = useRef(0);
    const searchCountsSeqRef = useRef(0);
    const searchPageCacheRef = useRef(new Map());
    const searchNextApiPageRef = useRef(new Map());
    const searchStableTotalRef = useRef(0);
    const homeGridColumns = useAppStore((state) => state.homeGridColumns);
    const followedMidSet = useFollowedMidSet();
    const homeTab = useHomeTabStore((state) => state.tab);
    const { videos: recommendVideos, hasMore: recommendHasMore, hydrated, loading: recommendLoading, loadingMore: recommendLoadingMore, refreshing, error: recommendError, fetchInitial, loadMore: loadMoreRecommend, dislike: dislikeRecommend, } = useHomeFeedStore();
    const [feedTip, setFeedTip] = useState("");
    const feedTipTimerRef = useRef(0);
    const handleDislike = useCallback(async (video, reason) => {
        const message = await dislikeRecommend(video, reason);
        window.clearTimeout(feedTipTimerRef.current);
        setFeedTip(message);
        feedTipTimerRef.current = window.setTimeout(() => setFeedTip(""), 2400);
    }, [dislikeRecommend]);
    useEffect(() => () => window.clearTimeout(feedTipTimerRef.current), []);
    const { rooms: liveRooms, following: followingLives, followingCount, hasMore: liveHasMore, hydrated: liveHydrated, loading: liveLoading, loadingMore: liveLoadingMore, refreshing: liveRefreshing, error: liveError, followingError, fetchInitial: fetchLiveInitial, loadMore: loadMoreLive, } = useHomeLiveStore();
    const [keyword, setKeyword] = useState("");
    const [query, setQuery] = useState("");
    const [order, setOrder] = useState("totalrank");
    const [searchCategory, setSearchCategory] = useState("all");
    const [searchTypeCounts, setSearchTypeCounts] = useState(null);
    const [searchVideos, setSearchVideos] = useState([]);
    const [searchPage, setSearchPage] = useState(1);
    const [searchHasMore, setSearchHasMore] = useState(false);
    const [searchTotal, setSearchTotal] = useState(0);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [suggests, setSuggests] = useState([]);
    const [hotItems, setHotItems] = useState([]);
    const [hotOpen, setHotOpen] = useState(false);
    const [showSuggest, setShowSuggest] = useState(false);
    const [suggestIndex, setSuggestIndex] = useState(-1);
    const suggestSeqRef = useRef(0);
    const suggestBoxRef = useRef(null);
    const skipSuggestOnceRef = useRef(false);
    const isLiveTab = homeTab === "live";
    const isSearchMode = !isLiveTab && query.length > 0;
    const isVideoSearchCategory = searchCategory === "all" || searchCategory === "video";
    const isUserSearchCategory = searchCategory === "user";
    const isArticleSearchCategory = searchCategory === "article";
    const isBangumiSearchCategory = searchCategory === "bangumi";
    const isMediaSearchCategory = searchCategory === "media";
    const isLiveSearchCategory = searchCategory === "live";
    useEffect(() => {
        void fetchInitial();
    }, [fetchInitial]);
    useEffect(() => {
        if (isLiveTab)
            void fetchLiveInitial();
    }, [isLiveTab, fetchLiveInitial]);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
            setShowBackToTop(false);
        }
    }, [homeTab]);
    // 切到直播时清空本地搜索输入（TopBar 已 clear store）
    useEffect(() => {
        if (!isLiveTab)
            return;
        searchLoadSeqRef.current += 1;
        suggestSeqRef.current += 1;
        setKeyword("");
        setQuery("");
        setSearchCategory("all");
        setSearchTypeCounts(null);
        setSearchVideos([]);
        setSearchError("");
        setSearchLoading(false);
        setSuggests([]);
        setShowSuggest(false);
        setSuggestIndex(-1);
        searchPageCacheRef.current.clear();
        searchNextApiPageRef.current.clear();
        searchStableTotalRef.current = 0;
    }, [isLiveTab]);
    useEffect(() => {
        if ((refreshing || liveRefreshing) && scrollRef.current && !isSearchMode) {
            scrollRef.current.scrollTop = 0;
            setShowBackToTop(false);
        }
    }, [refreshing, liveRefreshing, isSearchMode]);
    const loadSearchPage = useCallback(async (searchQuery, searchOrder, page, reset = false, pageSize = SEARCH_PAGE_SIZE) => {
        const trimmed = searchQuery.trim();
        if (!trimmed)
            return;
        const seq = ++searchLoadSeqRef.current;
        setSearchLoading(true);
        if (reset) {
            setSearchError("");
            setSearchVideos([]);
            setSearchPage(1);
            setSearchHasMore(false);
            setSearchTotal(0);
            searchStableTotalRef.current = 0;
            searchPageCacheRef.current.clear();
            searchNextApiPageRef.current.clear();
        }
        const cached = searchPageCacheRef.current.get(page);
        if (!reset && cached) {
            setSearchVideos(cached);
            setSearchPage(page);
            setSearchTotal(searchStableTotalRef.current);
            setSearchLoading(false);
            return;
        }
        try {
            for (let prev = 1; prev < page; prev += 1) {
                if (searchNextApiPageRef.current.has(prev))
                    continue;
                const prevApiStart = prev === 1 ? 1 : searchNextApiPageRef.current.get(prev - 1);
                if (prev > 1 && !prevApiStart)
                    break;
                const prevResult = await window.biliDesk.bili.searchVideos(trimmed, prev, searchOrder, prevApiStart ?? 1, pageSize);
                if (seq !== searchLoadSeqRef.current)
                    return;
                searchPageCacheRef.current.set(prev, prevResult.videos);
                if (prevResult.nextApiPage) {
                    searchNextApiPageRef.current.set(prev, prevResult.nextApiPage);
                }
                if (prevResult.total > 0 && searchStableTotalRef.current === 0) {
                    searchStableTotalRef.current = prevResult.total;
                }
            }
            const apiStartPage = page === 1 ? 1 : (searchNextApiPageRef.current.get(page - 1) ?? 1);
            const result = await window.biliDesk.bili.searchVideos(trimmed, page, searchOrder, apiStartPage, pageSize);
            if (seq !== searchLoadSeqRef.current)
                return;
            if (result.total > 0 && searchStableTotalRef.current === 0) {
                searchStableTotalRef.current = result.total;
            }
            searchPageCacheRef.current.set(page, result.videos);
            if (searchPageCacheRef.current.size > 10) {
                const keys = [...searchPageCacheRef.current.keys()].sort((a, b) => Math.abs(a - page) - Math.abs(b - page));
                const keep = new Set(keys.slice(0, 10));
                for (const key of [...searchPageCacheRef.current.keys()]) {
                    if (!keep.has(key)) {
                        searchPageCacheRef.current.delete(key);
                        searchNextApiPageRef.current.delete(key);
                    }
                }
            }
            if (result.nextApiPage) {
                searchNextApiPageRef.current.set(page, result.nextApiPage);
            }
            setSearchVideos(result.videos);
            setSearchPage(result.page);
            setSearchHasMore(result.hasMore);
            setSearchTotal(searchStableTotalRef.current);
        }
        catch (err) {
            if (seq !== searchLoadSeqRef.current)
                return;
            if (reset)
                setSearchVideos([]);
            setSearchError(formatSearchError(err));
        }
        finally {
            if (seq === searchLoadSeqRef.current) {
                setSearchLoading(false);
            }
        }
    }, []);
    const runSearch = useCallback((nextQuery, nextOrder) => {
        const trimmed = nextQuery.trim();
        if (!trimmed)
            return;
        skipSuggestOnceRef.current = true;
        setShowSuggest(false);
        setSuggests([]);
        setSuggestIndex(-1);
        setQuery(trimmed);
        setKeyword(trimmed);
        setOrder(nextOrder);
        setSearchCategory("all");
        useHomeSearchStore.getState().setSearch(trimmed, nextOrder);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
        setShowBackToTop(false);
        void loadSearchPage(trimmed, nextOrder, 1, true, SEARCH_PAGE_SIZE);
        const countsSeq = ++searchCountsSeqRef.current;
        void window.biliDesk.bili
            .getSearchTypeCounts(trimmed)
            .then((counts) => {
            if (countsSeq !== searchCountsSeqRef.current)
                return;
            setSearchTypeCounts(counts);
        })
            .catch(() => {
            if (countsSeq !== searchCountsSeqRef.current)
                return;
            setSearchTypeCounts(null);
        });
    }, [loadSearchPage]);
    // 搜索联想（官网 / 客户端同款 suggest 接口）
    useEffect(() => {
        if (skipSuggestOnceRef.current) {
            skipSuggestOnceRef.current = false;
            return;
        }
        const term = keyword.trim();
        if (!term) {
            suggestSeqRef.current += 1;
            setSuggests([]);
            setShowSuggest(false);
            setSuggestIndex(-1);
            return;
        }
        const seq = ++suggestSeqRef.current;
        const timer = window.setTimeout(() => {
            void window.biliDesk.bili
                .getSearchSuggest(term)
                .then((items) => {
                if (seq !== suggestSeqRef.current)
                    return;
                setSuggests(items);
                setShowSuggest(items.length > 0);
                setSuggestIndex(-1);
            })
                .catch(() => {
                if (seq !== suggestSeqRef.current)
                    return;
                setSuggests([]);
                setShowSuggest(false);
            });
        }, 180);
        return () => window.clearTimeout(timer);
    }, [keyword]);
    useEffect(() => {
        if (!showSuggest && !hotOpen)
            return;
        const onPointerDown = (event) => {
            const target = event.target;
            if (suggestBoxRef.current?.contains(target))
                return;
            setShowSuggest(false);
            setHotOpen(false);
            setSuggestIndex(-1);
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [showSuggest, hotOpen]);
    const searchTotalPages = Math.max(1, Math.ceil(searchTotal / SEARCH_PAGE_SIZE));
    const goToSearchPage = useCallback((page) => {
        if (!query || searchLoading)
            return;
        if (page < 1)
            return;
        if (page > searchTotalPages && !searchPageCacheRef.current.has(page))
            return;
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
        setShowBackToTop(false);
        void loadSearchPage(query, order, page, false, SEARCH_PAGE_SIZE);
    }, [query, order, searchLoading, searchTotalPages, loadSearchPage]);
    useEffect(() => {
        const onRefreshSearch = (event) => {
            const detail = event.detail;
            if (!detail?.query)
                return;
            runSearch(detail.query, detail.order);
        };
        window.addEventListener("bilidesk:refresh-search", onRefreshSearch);
        return () => window.removeEventListener("bilidesk:refresh-search", onRefreshSearch);
    }, [runSearch]);
    const clearSearch = useCallback(() => {
        searchLoadSeqRef.current += 1;
        suggestSeqRef.current += 1;
        setKeyword("");
        setQuery("");
        setSearchCategory("all");
        setSearchTypeCounts(null);
        setSearchVideos([]);
        setSearchError("");
        setSearchLoading(false);
        setSuggests([]);
        setShowSuggest(false);
        setSuggestIndex(-1);
        searchPageCacheRef.current.clear();
        searchNextApiPageRef.current.clear();
        searchStableTotalRef.current = 0;
        useHomeSearchStore.getState().clear();
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
        setShowBackToTop(false);
    }, []);
    const pickSuggest = useCallback((value) => {
        runSearch(value, order);
    }, [runSearch, order]);
    const handleSubmit = (event) => {
        event.preventDefault();
        if (showSuggest && suggestIndex >= 0 && suggests[suggestIndex]) {
            pickSuggest(suggests[suggestIndex].value);
            return;
        }
        runSearch(keyword, order);
    };
    const handleSuggestKeyDown = (event) => {
        if (!showSuggest || suggests.length === 0) {
            if (event.key === "Escape")
                setShowSuggest(false);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setSuggestIndex((prev) => (prev + 1) % suggests.length);
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setSuggestIndex((prev) => (prev <= 0 ? suggests.length - 1 : prev - 1));
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            setShowSuggest(false);
            setSuggestIndex(-1);
        }
    };
    const handleOrderChange = (nextOrder) => {
        if (nextOrder === order || !query) {
            setOrder(nextOrder);
            return;
        }
        runSearch(query, nextOrder);
    };
    const handleArticleTotalChange = useCallback((total) => {
        setSearchTypeCounts((prev) => prev
            ? { ...prev, article: total }
            : {
                video: 0,
                bangumi: 0,
                media: 0,
                live: 0,
                article: total,
                user: 0,
            });
    }, []);
    const patchSearchCount = useCallback((key, total) => {
        setSearchTypeCounts((prev) => prev
            ? { ...prev, [key]: total }
            : {
                video: 0,
                bangumi: key === "bangumi" ? total : 0,
                media: key === "media" ? total : 0,
                live: key === "live" ? total : 0,
                article: 0,
                user: 0,
            });
    }, []);
    const handleCategoryChange = (next) => {
        if (next === searchCategory)
            return;
        setSearchCategory(next);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
        setShowBackToTop(false);
        // 综合 / 视频共用视频结果；切回时若还没数据则补拉
        if ((next === "all" || next === "video") &&
            query &&
            searchVideos.length === 0 &&
            !searchLoading) {
            void loadSearchPage(query, order, 1, true, SEARCH_PAGE_SIZE);
        }
    };
    const displayVideos = isSearchMode ? searchVideos : recommendVideos;
    const displayHasMore = isSearchMode ? searchHasMore : recommendHasMore;
    const displayLoading = isSearchMode ? searchLoading : recommendLoading;
    const displayLoadingMore = recommendLoadingMore;
    const displayError = isSearchMode ? searchError : recommendError;
    const scrollToTop = useCallback(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, []);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el)
            return;
        const onScroll = () => {
            setShowBackToTop(el.scrollTop > 400);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => el.removeEventListener("scroll", onScroll);
    }, [
        displayVideos.length,
        liveRooms.length,
        isSearchMode,
        isLiveTab,
        hydrated,
        liveHydrated,
    ]);
    const handleLoadMore = useCallback(async () => {
        if (isSearchMode || isLiveTab)
            return;
        await loadMoreRecommend();
    }, [isSearchMode, isLiveTab, loadMoreRecommend]);
    const handleLoadMoreLive = useCallback(async () => {
        if (!isLiveTab)
            return;
        await loadMoreLive();
    }, [isLiveTab, loadMoreLive]);
    useEffect(() => {
        if (isSearchMode || isLiveTab)
            return;
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !displayHasMore || displayLoading || refreshing)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void handleLoadMore();
        }, { root, rootMargin: "240px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [
        handleLoadMore,
        displayHasMore,
        displayLoading,
        refreshing,
        isSearchMode,
        isLiveTab,
        displayVideos.length,
    ]);
    useEffect(() => {
        if (!isLiveTab)
            return;
        const root = scrollRef.current;
        const target = liveSentinelRef.current;
        if (!root ||
            !target ||
            !liveHasMore ||
            liveLoading ||
            liveLoadingMore ||
            liveRefreshing)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void handleLoadMoreLive();
        }, { root, rootMargin: "240px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [
        handleLoadMoreLive,
        liveHasMore,
        liveLoading,
        liveLoadingMore,
        liveRefreshing,
        isLiveTab,
        liveRooms.length,
    ]);
    const videoBootLoading = !isLiveTab && !isSearchMode && !hydrated && recommendLoading;
    const videoBootError = !isLiveTab && !isSearchMode && !hydrated && Boolean(recommendError);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [!isLiveTab && (_jsxs("div", { className: "shrink-0 space-y-3 border-b border-border px-6 py-3", children: [_jsxs("form", { onSubmit: handleSubmit, className: "flex gap-2", children: [_jsxs("div", { ref: suggestBoxRef, className: "relative min-w-0 flex-1", children: [_jsx(SearchIcon, { className: "pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" }), _jsx("input", { type: "text", value: keyword, onChange: (event) => setKeyword(event.target.value), onFocus: () => {
                                            if (keyword.trim()) {
                                                if (suggests.length > 0)
                                                    setShowSuggest(true);
                                                return;
                                            }
                                            setHotOpen(true);
                                            if (hotItems.length > 0)
                                                return;
                                            void window.biliDesk.bili
                                                .getHotSearch()
                                                .then(setHotItems)
                                                .catch(() => setHotItems([]));
                                        }, onKeyDown: handleSuggestKeyDown, placeholder: "\u641C\u7D22\u89C6\u9891\u3001\u7528\u6237...", autoComplete: "off", role: "combobox", "aria-expanded": showSuggest, "aria-autocomplete": "list", className: "h-9 w-full rounded-lg border border-border bg-secondary/30 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20" }), keyword && (_jsx("button", { type: "button", onClick: clearSearch, className: "absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", "aria-label": "\u6E05\u9664\u641C\u7D22", children: _jsx(X, { className: "h-3.5 w-3.5" }) })), hotOpen && !keyword.trim() && hotItems.length > 0 && (_jsxs("ul", { className: "bili-glass absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-card/40 py-1 shadow-2xl", children: [_jsx("li", { className: "px-3 py-1.5 text-xs text-muted-foreground", children: "\u70ED\u641C" }), hotItems.map((item, index) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary/80", onMouseDown: (event) => {
                                                        event.preventDefault();
                                                        setHotOpen(false);
                                                        pickSuggest(item.keyword);
                                                    }, children: [_jsx("span", { className: "w-5 text-xs text-muted-foreground", children: index + 1 }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.showName || item.keyword })] }) }, item.keyword)))] })), showSuggest && suggests.length > 0 && (_jsx("ul", { role: "listbox", className: "bili-glass absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-y-auto rounded-xl border border-border bg-card/40 py-1 shadow-2xl", children: suggests.map((item, index) => (_jsx("li", { role: "option", "aria-selected": index === suggestIndex, children: _jsx("button", { type: "button", className: cn("flex w-full items-center px-3 py-2 text-left text-sm transition-colors", index === suggestIndex
                                                    ? "bg-primary/15 text-foreground"
                                                    : "text-foreground hover:bg-secondary/80"), onMouseEnter: () => setSuggestIndex(index), onMouseDown: (event) => {
                                                    // 避免 input blur 抢在 click 前关掉下拉
                                                    event.preventDefault();
                                                    pickSuggest(item.value);
                                                }, children: highlightSuggest(item.value, keyword) }) }, item.value))) }))] }), _jsx(Button, { type: "submit", size: "sm", disabled: !keyword.trim() || searchLoading, children: searchLoading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u641C\u7D22\u4E2D"] })) : ("搜索") })] }), isSearchMode && (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "flex flex-wrap items-center gap-1 border-b border-border", children: SEARCH_CATEGORY_TABS.map((tab) => {
                                    const count = tab.countKey && searchTypeCounts
                                        ? searchTypeCounts[tab.countKey]
                                        : undefined;
                                    const active = searchCategory === tab.id;
                                    return (_jsxs("button", { type: "button", onClick: () => handleCategoryChange(tab.id), className: cn("relative px-3 py-2 text-sm transition-colors", active
                                            ? "text-primary"
                                            : "text-muted-foreground hover:text-foreground"), children: [_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [tab.label, typeof count === "number" && count > 0 && (_jsx("span", { className: cn("rounded px-1 text-[10px] leading-4", active
                                                            ? "bg-primary/15 text-primary"
                                                            : "bg-secondary text-muted-foreground"), children: formatCountBadge(count) }))] }), active && (_jsx("span", { className: "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" }))] }, tab.id));
                                }) }), isVideoSearchCategory && (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [ORDER_OPTIONS.map((option) => (_jsx("button", { type: "button", onClick: () => handleOrderChange(option.value), className: cn("rounded-full px-3 py-1 text-xs transition-colors", order === option.value
                                            ? "bg-primary/15 text-primary"
                                            : "bg-secondary text-muted-foreground hover:text-foreground"), children: option.label }, option.value))), searchTotal > 0 && !searchLoading && (_jsxs("span", { className: "text-xs text-muted-foreground", children: ["\u7EA6 ", searchTotal.toLocaleString(), " \u6761\u7ED3\u679C"] }))] }))] }))] })), _jsxs("div", { className: "relative min-h-0 flex-1", children: [_jsx("div", { ref: scrollRef, className: "scrollbar-overlay h-full overflow-y-auto", children: isLiveTab ? (!liveHydrated && liveLoading ? (_jsxs("div", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u76F4\u64AD\u4E2D..."] })) : !liveHydrated && liveError && followingLives.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-red-400", children: liveError })) : (_jsxs("div", { className: "space-y-6 p-6", children: [_jsx(FollowingLiveList, { rooms: followingLives, count: followingCount }), followingError && (_jsx("p", { className: "text-xs text-muted-foreground", children: followingError })), _jsxs("section", { className: "space-y-3", children: [_jsx("h2", { className: "text-sm font-semibold", children: "\u63A8\u8350\u76F4\u64AD" }), liveError && liveRooms.length === 0 ? (_jsx("p", { className: "py-8 text-center text-sm text-red-400", children: liveError })) : (_jsx("div", { className: cn("grid gap-4", GRID_COLS_CLASS[homeGridColumns]), children: liveRooms.map((room) => (_jsx(LiveCard, { room: room, showFollowedBadge: followedMidSet.has(room.uid) }, room.roomId))) }))] }), _jsx("div", { ref: liveSentinelRef, className: "flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground", children: liveRefreshing || liveLoadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), liveRefreshing ? "正在刷新..." : "加载更多..."] })) : liveHasMore ? ("继续下滑加载更多") : liveRooms.length > 0 ? ("已经到底啦") : liveError ? null : ("暂无直播推荐") }), liveError && liveHydrated && liveRooms.length > 0 && (_jsx("p", { className: "pb-2 text-center text-sm text-red-400", children: liveError }))] }))) : videoBootLoading ? (_jsxs("div", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u63A8\u8350\u4E2D..."] })) : videoBootError ? (_jsx("p", { className: "py-16 text-center text-sm text-red-400", children: recommendError })) : isUserSearchCategory && isSearchMode ? (_jsx(SearchUserPanel, { keyword: query, active: true })) : isArticleSearchCategory && isSearchMode ? (_jsx(SearchArticlePanel, { keyword: query, active: true, onTotalChange: handleArticleTotalChange })) : isBangumiSearchCategory && isSearchMode ? (_jsx(SearchMediaPanel, { keyword: query, kind: "bangumi", active: true, onTotalChange: (total) => patchSearchCount("bangumi", total) })) : isMediaSearchCategory && isSearchMode ? (_jsx(SearchMediaPanel, { keyword: query, kind: "media", active: true, onTotalChange: (total) => patchSearchCount("media", total) })) : isLiveSearchCategory && isSearchMode ? (_jsx(SearchLivePanel, { keyword: query, active: true, onTotalChange: (total) => patchSearchCount("live", total) })) : isSearchMode &&
                            isVideoSearchCategory &&
                            searchLoading &&
                            searchVideos.length === 0 ? (_jsxs("div", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u641C\u7D22\u4E2D..."] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("grid gap-4 p-6", GRID_COLS_CLASS[homeGridColumns], isSearchMode &&
                                        searchLoading &&
                                        searchVideos.length > 0 &&
                                        "opacity-60"), children: displayVideos.map((video) => (_jsx(VideoCard, { video: video, showFollowedBadge: !isSearchMode && followedMidSet.has(video.owner.mid), onDislike: isSearchMode
                                            ? undefined
                                            : (reason) => void handleDislike(video, reason) }, video.bvid))) }), isSearchMode ? (searchVideos.length > 0 ? (_jsx(PaginationBar, { page: searchPage, totalPages: searchTotalPages, disabled: searchLoading, disableNext: !searchHasMore && searchPage >= searchTotalPages, onPageChange: goToSearchPage, info: _jsxs(_Fragment, { children: ["\u7EA6 ", searchTotal.toLocaleString(), " \u6761\u7ED3\u679C \u00B7 \u672C\u9875", " ", searchVideos.length, " \u6761 \u00B7 \u7B2C ", searchPage, " /", " ", searchTotalPages, " \u9875\uFF08\u6BCF\u9875 ", SEARCH_PAGE_SIZE, " \u6761\uFF09"] }) })) : (!searchLoading && (_jsx("p", { className: "py-8 text-center text-sm text-muted-foreground", children: searchError || "没有找到相关视频" })))) : (_jsx("div", { ref: sentinelRef, className: "flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground", children: refreshing || displayLoadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), refreshing ? "正在刷新..." : "加载更多..."] })) : displayHasMore ? ("继续下滑加载更多") : displayVideos.length > 0 ? ("已经到底啦") : ("暂无推荐内容") })), displayError &&
                                    (hydrated || isSearchMode) &&
                                    displayVideos.length > 0 && (_jsx("p", { className: "pb-6 text-center text-sm text-red-400", children: displayError }))] })) }), feedTip && (_jsx("div", { className: "pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-sm text-white shadow-lg", children: feedTip })), showBackToTop && (_jsx(Button, { type: "button", size: "icon", variant: "secondary", className: "absolute bottom-6 right-6 z-10 h-10 w-10 rounded-full border border-border shadow-lg backdrop-blur-sm", onClick: scrollToTop, "aria-label": "\u56DE\u5230\u9876\u90E8", title: "\u56DE\u5230\u9876\u90E8", children: _jsx(ArrowUp, { className: "h-4 w-4" }) }))] })] }));
}
