import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchOrder, VideoItem } from "@shared/types";
import { useHomeFeedStore } from "@/stores/home-feed-store";
import { useAppStore } from "@/stores/app-store";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { Loader2, Search as SearchIcon, ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const homeGridColumns = useAppStore((state) => state.homeGridColumns);

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
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
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
      nextPage: number,
      append: boolean,
    ) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      const seq = ++searchLoadSeqRef.current;

      if (append) {
        setSearchLoadingMore(true);
      } else {
        setSearchLoading(true);
        setSearchError("");
        setSearchVideos([]);
        setSearchPage(1);
        setSearchHasMore(false);
        setSearchTotal(0);
      }

      try {
        const result = await window.biliDesk.bili.searchVideos(
          trimmed,
          nextPage,
          searchOrder,
        );
        if (seq !== searchLoadSeqRef.current) return;

        setSearchVideos((prev) =>
          append ? [...prev, ...result.videos] : result.videos,
        );
        setSearchPage(result.page);
        setSearchHasMore(result.hasMore);
        setSearchTotal(result.total);
      } catch (err) {
        if (seq !== searchLoadSeqRef.current) return;
        if (!append) setSearchVideos([]);
        setSearchError(formatSearchError(err));
      } finally {
        if (seq === searchLoadSeqRef.current) {
          setSearchLoading(false);
          setSearchLoadingMore(false);
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
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
      void loadSearchPage(trimmed, nextOrder, 1, false);
    },
    [loadSearchPage],
  );

  const clearSearch = useCallback(() => {
    searchLoadSeqRef.current += 1;
    setKeyword("");
    setQuery("");
    setSearchVideos([]);
    setSearchError("");
    setSearchLoading(false);
    setSearchLoadingMore(false);
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
  const displayLoadingMore = isSearchMode
    ? searchLoadingMore
    : recommendLoadingMore;
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
    if (isSearchMode) {
      if (!query || !searchHasMore || searchLoadingMore || searchLoading)
        return;
      await loadSearchPage(query, order, searchPage + 1, true);
      return;
    }
    await loadMoreRecommend();
  }, [
    isSearchMode,
    query,
    order,
    searchPage,
    searchHasMore,
    searchLoadingMore,
    searchLoading,
    loadSearchPage,
    loadMoreRecommend,
  ]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !displayHasMore || displayLoading || refreshing)
      return;
    if (isSearchMode && searchLoading) return;

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
    searchLoading,
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
            {searchLoading && !searchLoadingMore ? (
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
                )}
              >
                {displayVideos.map((video) => (
                  <VideoCard key={video.bvid} video={video} />
                ))}
              </div>

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
                ) : isSearchMode ? (
                  searchError || "没有找到相关视频"
                ) : (
                  "暂无推荐内容"
                )}
              </div>

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
