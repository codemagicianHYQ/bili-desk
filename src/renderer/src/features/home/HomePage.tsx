import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchOrder, VideoItem } from "@shared/types";
import { useHomeFeedStore } from "@/stores/home-feed-store";
import { useHomeSearchStore } from "@/stores/home-search-store";
import { useAppStore } from "@/stores/app-store";
import { VideoCard } from "@/components/video/VideoCard";
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
  const searchLoadSeqRef = useRef(0);
  const searchPageCacheRef = useRef(new Map<number, VideoItem[]>());
  const searchNextApiPageRef = useRef(new Map<number, number>());
  const searchStableTotalRef = useRef(0);
  const homeGridColumns = useAppStore((state) => state.homeGridColumns);
  const followedMidSet = useFollowedMidSet();

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

  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<SearchOrder>("totalrank");
  const [searchVideos, setSearchVideos] = useState<VideoItem[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);

  const isSearchMode = query.length > 0;

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (refreshing && scrollRef.current && !isSearchMode) {
      scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
    }
  }, [refreshing, isSearchMode]);

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
      useHomeSearchStore.getState().setSearch(trimmed, nextOrder);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
      void loadSearchPage(trimmed, nextOrder, 1, true, SEARCH_PAGE_SIZE);
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
  }, [displayVideos.length, isSearchMode, hydrated]);

  const handleLoadMore = useCallback(async () => {
    if (isSearchMode) return;
    await loadMoreRecommend();
  }, [isSearchMode, loadMoreRecommend]);

  useEffect(() => {
    if (isSearchMode) return;

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
    displayVideos.length,
  ]);

  if (!isSearchMode && !hydrated && recommendLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载推荐中...
      </div>
    );
  }

  if (!isSearchMode && !hydrated && recommendError) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {recommendError}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-border px-6 py-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索视频..."
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

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="scrollbar-overlay h-full overflow-y-auto"
        >
          {isSearchMode && searchLoading && searchVideos.length === 0 ? (
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
