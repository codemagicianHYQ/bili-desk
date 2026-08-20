import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SearchCategory,
  SearchOrder,
  SearchTypeCounts,
  VideoItem,
} from "@shared/types";
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
} as const;

const ORDER_OPTIONS: Array<{ value: SearchOrder; label: string }> = [
  { value: "totalrank", label: "综合排序" },
  { value: "click", label: "最多播放" },
  { value: "pubdate", label: "最新发布" },
  { value: "dm", label: "最多弹幕" },
  { value: "stow", label: "最多收藏" },
];

const SEARCH_CATEGORY_TABS: Array<{
  id: SearchCategory;
  label: string;
  countKey?: keyof SearchTypeCounts;
}> = [
  { id: "all", label: "综合" },
  { id: "video", label: "视频", countKey: "video" },
  { id: "bangumi", label: "番剧", countKey: "bangumi" },
  { id: "media", label: "影视", countKey: "media" },
  { id: "live", label: "直播", countKey: "live" },
  { id: "article", label: "专栏", countKey: "article" },
  { id: "user", label: "用户", countKey: "user" },
];

function formatCountBadge(n: number): string {
  if (!n || n <= 0) return "0";
  if (n > 99) return "99+";
  return String(n);
}

function formatSearchError(err: unknown): string {
  const message = err instanceof Error ? err.message : "搜索失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

export function HomePage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const liveSentinelRef = useRef<HTMLDivElement>(null);
  const searchLoadSeqRef = useRef(0);
  const searchCountsSeqRef = useRef(0);
  const searchPageCacheRef = useRef(new Map<number, VideoItem[]>());
  const searchNextApiPageRef = useRef(new Map<number, number>());
  const searchStableTotalRef = useRef(0);
  const homeGridColumns = useAppStore((state) => state.homeGridColumns);
  const followedMidSet = useFollowedMidSet();
  const homeTab = useHomeTabStore((state) => state.tab);

  const {
    videos: recommendVideos,
    hasMore: recommendHasMore,
    hydrated,
    loading: recommendLoading,
    loadingMore: recommendLoadingMore,
    refreshing,
    error: recommendError,
    fetchInitial,
    loadMore: loadMoreRecommend,
  } = useHomeFeedStore();

  const {
    rooms: liveRooms,
    following: followingLives,
    followingCount,
    hasMore: liveHasMore,
    hydrated: liveHydrated,
    loading: liveLoading,
    loadingMore: liveLoadingMore,
    refreshing: liveRefreshing,
    error: liveError,
    followingError,
    fetchInitial: fetchLiveInitial,
    loadMore: loadMoreLive,
  } = useHomeLiveStore();

  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<SearchOrder>("totalrank");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const [searchTypeCounts, setSearchTypeCounts] =
    useState<SearchTypeCounts | null>(null);
  const [searchVideos, setSearchVideos] = useState<VideoItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);

  const isLiveTab = homeTab === "live";
  const isSearchMode = !isLiveTab && query.length > 0;
  const isVideoSearchCategory =
    searchCategory === "all" || searchCategory === "video";
  const isUserSearchCategory = searchCategory === "user";
  const isArticleSearchCategory = searchCategory === "article";
  const isPendingSearchCategory =
    isSearchMode &&
    !isVideoSearchCategory &&
    !isUserSearchCategory &&
    !isArticleSearchCategory;

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (isLiveTab) void fetchLiveInitial();
  }, [isLiveTab, fetchLiveInitial]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
    }
  }, [homeTab]);

  // 切到直播时清空本地搜索输入（TopBar 已 clear store）
  useEffect(() => {
    if (!isLiveTab) return;
    searchLoadSeqRef.current += 1;
    setKeyword("");
    setQuery("");
    setSearchCategory("all");
    setSearchTypeCounts(null);
    setSearchVideos([]);
    setSearchError("");
    setSearchLoading(false);
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

  const loadSearchPage = useCallback(
    async (
      searchQuery: string,
      searchOrder: SearchOrder,
      page: number,
      reset = false,
      pageSize = SEARCH_PAGE_SIZE,
    ) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

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
          if (searchNextApiPageRef.current.has(prev)) continue;

          const prevApiStart =
            prev === 1 ? 1 : searchNextApiPageRef.current.get(prev - 1);
          if (prev > 1 && !prevApiStart) break;

          const prevResult = await window.biliDesk.bili.searchVideos(
            trimmed,
            prev,
            searchOrder,
            prevApiStart ?? 1,
            pageSize,
          );
          if (seq !== searchLoadSeqRef.current) return;

          searchPageCacheRef.current.set(prev, prevResult.videos);
          if (prevResult.nextApiPage) {
            searchNextApiPageRef.current.set(prev, prevResult.nextApiPage);
          }
          if (prevResult.total > 0 && searchStableTotalRef.current === 0) {
            searchStableTotalRef.current = prevResult.total;
          }
        }

        const apiStartPage =
          page === 1 ? 1 : (searchNextApiPageRef.current.get(page - 1) ?? 1);

        const result = await window.biliDesk.bili.searchVideos(
          trimmed,
          page,
          searchOrder,
          apiStartPage,
          pageSize,
        );
        if (seq !== searchLoadSeqRef.current) return;

        if (result.total > 0 && searchStableTotalRef.current === 0) {
          searchStableTotalRef.current = result.total;
        }

        searchPageCacheRef.current.set(page, result.videos);
        if (searchPageCacheRef.current.size > 10) {
          const keys = [...searchPageCacheRef.current.keys()].sort(
            (a, b) => Math.abs(a - page) - Math.abs(b - page),
          );
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
      } catch (err) {
        if (seq !== searchLoadSeqRef.current) return;
        if (reset) setSearchVideos([]);
        setSearchError(formatSearchError(err));
      } finally {
        if (seq === searchLoadSeqRef.current) {
          setSearchLoading(false);
        }
      }
    },
    [],
  );

  const runSearch = useCallback(
    (nextQuery: string, nextOrder: SearchOrder) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setKeyword(trimmed);
      setOrder(nextOrder);
      setSearchCategory("all");
      useHomeSearchStore.getState().setSearch(trimmed, nextOrder);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
      void loadSearchPage(trimmed, nextOrder, 1, true, SEARCH_PAGE_SIZE);
      const countsSeq = ++searchCountsSeqRef.current;
      void window.biliDesk.bili
        .getSearchTypeCounts(trimmed)
        .then((counts) => {
          if (countsSeq !== searchCountsSeqRef.current) return;
          setSearchTypeCounts(counts);
        })
        .catch(() => {
          if (countsSeq !== searchCountsSeqRef.current) return;
          setSearchTypeCounts(null);
        });
    },
    [loadSearchPage],
  );

  const searchTotalPages = Math.max(
    1,
    Math.ceil(searchTotal / SEARCH_PAGE_SIZE),
  );

  const goToSearchPage = useCallback(
    (page: number) => {
      if (!query || searchLoading) return;
      if (page < 1) return;
      if (page > searchTotalPages && !searchPageCacheRef.current.has(page))
        return;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
      void loadSearchPage(query, order, page, false, SEARCH_PAGE_SIZE);
    },
    [query, order, searchLoading, searchTotalPages, loadSearchPage],
  );

  useEffect(() => {
    const onRefreshSearch = (event: Event) => {
      const detail = (
        event as CustomEvent<{ query: string; order: SearchOrder }>
      ).detail;
      if (!detail?.query) return;
      runSearch(detail.query, detail.order);
    };

    window.addEventListener("bilidesk:refresh-search", onRefreshSearch);
    return () =>
      window.removeEventListener("bilidesk:refresh-search", onRefreshSearch);
  }, [runSearch]);

  const clearSearch = useCallback(() => {
    searchLoadSeqRef.current += 1;
    setKeyword("");
    setQuery("");
    setSearchCategory("all");
    setSearchTypeCounts(null);
    setSearchVideos([]);
    setSearchError("");
    setSearchLoading(false);
    searchPageCacheRef.current.clear();
    searchNextApiPageRef.current.clear();
    searchStableTotalRef.current = 0;
    useHomeSearchStore.getState().clear();
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setShowBackToTop(false);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    runSearch(keyword, order);
  };

  const handleOrderChange = (nextOrder: SearchOrder) => {
    if (nextOrder === order || !query) {
      setOrder(nextOrder);
      return;
    }
    runSearch(query, nextOrder);
  };

  const handleArticleTotalChange = useCallback((total: number) => {
    setSearchTypeCounts((prev) =>
      prev
        ? { ...prev, article: total }
        : {
            video: 0,
            bangumi: 0,
            media: 0,
            live: 0,
            article: total,
            user: 0,
          },
    );
  }, []);

  const handleCategoryChange = (next: SearchCategory) => {
    if (next === searchCategory) return;
    setSearchCategory(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setShowBackToTop(false);
    // 综合 / 视频共用视频结果；切回时若还没数据则补拉
    if (
      (next === "all" || next === "video") &&
      query &&
      searchVideos.length === 0 &&
      !searchLoading
    ) {
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
    if (!el) return;

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
    if (isSearchMode || isLiveTab) return;
    await loadMoreRecommend();
  }, [isSearchMode, isLiveTab, loadMoreRecommend]);

  const handleLoadMoreLive = useCallback(async () => {
    if (!isLiveTab) return;
    await loadMoreLive();
  }, [isLiveTab, loadMoreLive]);

  useEffect(() => {
    if (isSearchMode || isLiveTab) return;

    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !displayHasMore || displayLoading || refreshing)
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void handleLoadMore();
      },
      { root, rootMargin: "240px" },
    );

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
    if (!isLiveTab) return;

    const root = scrollRef.current;
    const target = liveSentinelRef.current;
    if (
      !root ||
      !target ||
      !liveHasMore ||
      liveLoading ||
      liveLoadingMore ||
      liveRefreshing
    )
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void handleLoadMoreLive();
      },
      { root, rootMargin: "240px" },
    );

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

  const videoBootLoading =
    !isLiveTab && !isSearchMode && !hydrated && recommendLoading;
  const videoBootError =
    !isLiveTab && !isSearchMode && !hydrated && Boolean(recommendError);

  return (
    <div className="flex h-full flex-col">
      {!isLiveTab && (
        <div className="shrink-0 space-y-3 border-b border-border px-6 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索视频、用户..."
                autoComplete="off"
                className="h-9 w-full rounded-lg border border-border bg-secondary/30 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="清除搜索"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!keyword.trim() || searchLoading}
            >
              {searchLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  搜索中
                </>
              ) : (
                "搜索"
              )}
            </Button>
          </form>

          {isSearchMode && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1 border-b border-border">
                {SEARCH_CATEGORY_TABS.map((tab) => {
                  const count =
                    tab.countKey && searchTypeCounts
                      ? searchTypeCounts[tab.countKey]
                      : undefined;
                  const active = searchCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleCategoryChange(tab.id)}
                      className={cn(
                        "relative px-3 py-2 text-sm transition-colors",
                        active
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {tab.label}
                        {typeof count === "number" && count > 0 && (
                          <span
                            className={cn(
                              "rounded px-1 text-[10px] leading-4",
                              active
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary text-muted-foreground",
                            )}
                          >
                            {formatCountBadge(count)}
                          </span>
                        )}
                      </span>
                      {active && (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>

              {isVideoSearchCategory && (
                <div className="flex flex-wrap items-center gap-2">
                  {ORDER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleOrderChange(option.value)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs transition-colors",
                        order === option.value
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                  {searchTotal > 0 && !searchLoading && (
                    <span className="text-xs text-muted-foreground">
                      约 {searchTotal.toLocaleString()} 条结果
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="scrollbar-overlay h-full overflow-y-auto"
        >
          {isLiveTab ? (
            !liveHydrated && liveLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载直播中...
              </div>
            ) : !liveHydrated && liveError && followingLives.length === 0 ? (
              <p className="py-16 text-center text-sm text-red-400">
                {liveError}
              </p>
            ) : (
              <div className="space-y-6 p-6">
                <FollowingLiveList
                  rooms={followingLives}
                  count={followingCount}
                />
                {followingError && (
                  <p className="text-xs text-muted-foreground">
                    {followingError}
                  </p>
                )}

                <section className="space-y-3">
                  <h2 className="text-sm font-semibold">推荐直播</h2>
                  {liveError && liveRooms.length === 0 ? (
                    <p className="py-8 text-center text-sm text-red-400">
                      {liveError}
                    </p>
                  ) : (
                    <div
                      className={cn(
                        "grid gap-4",
                        GRID_COLS_CLASS[homeGridColumns],
                      )}
                    >
                      {liveRooms.map((room) => (
                        <LiveCard
                          key={room.roomId}
                          room={room}
                          showFollowedBadge={followedMidSet.has(room.uid)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <div
                  ref={liveSentinelRef}
                  className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"
                >
                  {liveRefreshing || liveLoadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {liveRefreshing ? "正在刷新..." : "加载更多..."}
                    </>
                  ) : liveHasMore ? (
                    "继续下滑加载更多"
                  ) : liveRooms.length > 0 ? (
                    "已经到底啦"
                  ) : liveError ? null : (
                    "暂无直播推荐"
                  )}
                </div>

                {liveError && liveHydrated && liveRooms.length > 0 && (
                  <p className="pb-2 text-center text-sm text-red-400">
                    {liveError}
                  </p>
                )}
              </div>
            )
          ) : videoBootLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载推荐中...
            </div>
          ) : videoBootError ? (
            <p className="py-16 text-center text-sm text-red-400">
              {recommendError}
            </p>
          ) : isUserSearchCategory && isSearchMode ? (
            <SearchUserPanel keyword={query} active />
          ) : isArticleSearchCategory && isSearchMode ? (
            <SearchArticlePanel
              keyword={query}
              active
              onTotalChange={handleArticleTotalChange}
            />
          ) : isPendingSearchCategory ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              「
              {SEARCH_CATEGORY_TABS.find((t) => t.id === searchCategory)
                ?.label ?? "该分类"}
              」搜索即将支持，可先查看「综合 / 视频 / 专栏 / 用户」
            </p>
          ) : isSearchMode &&
            isVideoSearchCategory &&
            searchLoading &&
            searchVideos.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              搜索中...
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "grid gap-4 p-6",
                  GRID_COLS_CLASS[homeGridColumns],
                  isSearchMode &&
                    searchLoading &&
                    searchVideos.length > 0 &&
                    "opacity-60",
                )}
              >
                {displayVideos.map((video) => (
                  <VideoCard
                    key={video.bvid}
                    video={video}
                    showFollowedBadge={
                      !isSearchMode && followedMidSet.has(video.owner.mid)
                    }
                  />
                ))}
              </div>

              {isSearchMode ? (
                searchVideos.length > 0 ? (
                  <PaginationBar
                    page={searchPage}
                    totalPages={searchTotalPages}
                    disabled={searchLoading}
                    disableNext={
                      !searchHasMore && searchPage >= searchTotalPages
                    }
                    onPageChange={goToSearchPage}
                    info={
                      <>
                        约 {searchTotal.toLocaleString()} 条结果 · 本页{" "}
                        {searchVideos.length} 条 · 第 {searchPage} /{" "}
                        {searchTotalPages} 页（每页 {SEARCH_PAGE_SIZE} 条）
                      </>
                    }
                  />
                ) : (
                  !searchLoading && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {searchError || "没有找到相关视频"}
                    </p>
                  )
                )
              ) : (
                <div
                  ref={sentinelRef}
                  className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
                >
                  {refreshing || displayLoadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {refreshing ? "正在刷新..." : "加载更多..."}
                    </>
                  ) : displayHasMore ? (
                    "继续下滑加载更多"
                  ) : displayVideos.length > 0 ? (
                    "已经到底啦"
                  ) : (
                    "暂无推荐内容"
                  )}
                </div>
              )}

              {displayError &&
                (hydrated || isSearchMode) &&
                displayVideos.length > 0 && (
                  <p className="pb-6 text-center text-sm text-red-400">
                    {displayError}
                  </p>
                )}
            </>
          )}
        </div>

        {showBackToTop && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute bottom-6 right-6 z-10 h-10 w-10 rounded-full border border-border shadow-lg backdrop-blur-sm"
            onClick={scrollToTop}
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
