import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserCollectionItem, VideoItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ChevronLeft,
  ChevronRight,
  Folder,
  Layers,
  Loader2,
} from "lucide-react";

const VIDEO_PAGE_SIZE = 30;

function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : "加载失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  if (message.startsWith("Error invoking remote method")) {
    return "加载失败，请完全重启应用后重试";
  }
  return message;
}

type CollectionTab = "created" | "subscribed";
type VideoSortOrder = "desc" | "asc";

export function MyCollectionsPanel({ mid }: { mid: number }) {
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listSentinelRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<CollectionTab>("subscribed");
  const [seasons, setSeasons] = useState<UserCollectionItem[]>([]);
  const [series, setSeries] = useState<UserCollectionItem[]>([]);
  const [subscribed, setSubscribed] = useState<UserCollectionItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UserCollectionItem | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoTotal, setVideoTotal] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [sortOrder, setSortOrder] = useState<VideoSortOrder>("desc");

  const loadList = useCallback(
    async (kind: CollectionTab, nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
        setSelected(null);
        setVideos([]);
        setVideoPage(1);
        setVideoTotal(0);
      }

      try {
        if (kind === "created") {
          const result = await window.biliDesk.bili.getUserCollections(
            mid,
            nextPage,
          );
          setSeasons((prev) =>
            append ? [...prev, ...result.seasons] : result.seasons,
          );
          setSeries((prev) =>
            append ? [...prev, ...result.series] : result.series,
          );
          setHasMore(result.hasMore);
        } else {
          const result =
            await window.biliDesk.bili.getSubscribedCollections(nextPage);
          setSubscribed((prev) =>
            append ? [...prev, ...result.seasons] : result.seasons,
          );
          setHasMore(result.hasMore);
        }
        setPage(nextPage);
      } catch (err) {
        setError(formatError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mid],
  );

  const loadVideos = useCallback(
    async (collection: UserCollectionItem, nextPage: number) => {
      setVideosLoading(true);
      setVideosError("");

      const ownerMid = collection.ownerMid ?? mid;

      try {
        const result =
          collection.kind === "season"
            ? await window.biliDesk.bili.getSeasonArchives(
                ownerMid,
                collection.id,
                nextPage,
              )
            : await window.biliDesk.bili.getSeriesArchives(
                collection.id,
                nextPage,
              );

        setVideos(result.videos);
        setVideoPage(result.page);
        setVideoTotal(
          result.total > 0
            ? result.total
            : collection.total || result.videos.length,
        );
      } catch (err) {
        setVideosError(formatError(err));
        setVideos([]);
      } finally {
        setVideosLoading(false);
      }
    },
    [mid],
  );

  const selectCollection = useCallback(
    (collection: UserCollectionItem) => {
      setSelected(collection);
      setSortOrder("desc");
      setVideoPage(1);
      void loadVideos(collection, 1);
    },
    [loadVideos],
  );

  const goToVideoPage = useCallback(
    (nextPage: number) => {
      if (!selected || nextPage < 1 || videosLoading) return;
      const totalPages = Math.max(1, Math.ceil(videoTotal / VIDEO_PAGE_SIZE));
      if (nextPage > totalPages) return;
      setVideoPage(nextPage);
      void loadVideos(selected, nextPage);
    },
    [selected, videosLoading, videoTotal, loadVideos],
  );

  useEffect(() => {
    setSeasons([]);
    setSeries([]);
    setSubscribed([]);
    setPage(1);
    setHasMore(false);
    void loadList(tab, 1, false);
  }, [tab, loadList]);

  useEffect(() => {
    const root = listScrollRef.current;
    const target = listSentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadList(tab, page + 1, true);
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, hasMore, loadList, loading, loadingMore, page]);

  const sortedVideos = useMemo(() => {
    const copy = [...videos];
    copy.sort((a, b) =>
      sortOrder === "desc" ? b.pubdate - a.pubdate : a.pubdate - b.pubdate,
    );
    return copy;
  }, [videos, sortOrder]);

  const videoTotalPages = Math.max(1, Math.ceil(videoTotal / VIDEO_PAGE_SIZE));

  const createdCollections = [
    ...seasons.map((item) => ({ ...item, label: "合集" })),
    ...series.map((item) => ({ ...item, label: "系列" })),
  ];
  const subscribedCollections = subscribed.map((item) => ({
    ...item,
    label: "订阅",
  }));
  const allCollections =
    tab === "created" ? createdCollections : subscribedCollections;

  if (loading && allCollections.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载合集...
      </p>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant={tab === "subscribed" ? "default" : "outline"}
          onClick={() => setTab("subscribed")}
        >
          我收藏的
        </Button>
        <Button
          size="sm"
          variant={tab === "created" ? "default" : "outline"}
          onClick={() => setTab("created")}
        >
          我创建的
        </Button>
      </div>

      {error && allCollections.length === 0 ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : allCollections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "created" ? "暂无自建合集或系列" : "暂无收藏/订阅的合集"}
        </p>
      ) : (
        <div className="grid h-[calc(100vh-15rem)] min-h-[480px] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/20">
            <div
              ref={listScrollRef}
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1 pr-0.5"
            >
              {allCollections.map((item) => (
                <button
                  key={`${item.source ?? tab}-${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => selectCollection(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-secondary",
                    selected?.kind === item.kind &&
                      selected?.id === item.id &&
                      selected?.source === item.source &&
                      "bg-secondary",
                  )}
                >
                  {item.cover ? (
                    <BiliImage
                      src={item.cover}
                      alt=""
                      className="h-10 w-16 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-muted">
                      {item.kind === "season" ? (
                        <Folder className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.label} · {item.total} 个内容
                    </p>
                  </div>
                </button>
              ))}
              <div
                ref={listSentinelRef}
                className="py-3 text-center text-xs text-muted-foreground"
              >
                {loadingMore
                  ? "加载更多..."
                  : hasMore
                    ? "继续下滑加载更多"
                    : "已经到底啦"}
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </div>

          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                选择左侧合集查看视频
              </p>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {selected.title}
                  </p>
                  {videoTotal > 0 && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant={sortOrder === "desc" ? "default" : "outline"}
                        className="gap-1"
                        onClick={() => setSortOrder("desc")}
                      >
                        <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                        最新优先
                      </Button>
                      <Button
                        size="sm"
                        variant={sortOrder === "asc" ? "default" : "outline"}
                        className="gap-1"
                        onClick={() => setSortOrder("asc")}
                      >
                        <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                        最早优先
                      </Button>
                    </div>
                  )}
                </div>

                {videosLoading && videos.length === 0 ? (
                  <p className="flex items-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    加载视频中...
                  </p>
                ) : videosError && videos.length === 0 ? (
                  <p className="text-sm text-red-400">{videosError}</p>
                ) : sortedVideos.length > 0 ? (
                  <>
                    <div
                      className={cn(
                        "min-h-0 flex-1 overflow-y-auto pr-1",
                        videosLoading && "pointer-events-none opacity-60",
                      )}
                    >
                      <div className="grid grid-cols-2 gap-4 pb-2 xl:grid-cols-3">
                        {sortedVideos.map((video) => (
                          <VideoCard
                            key={video.bvid}
                            video={video}
                            meta="stats"
                          />
                        ))}
                      </div>
                      {videosLoading && (
                        <p className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          加载中...
                        </p>
                      )}
                      {videosError && (
                        <p className="pb-2 text-sm text-red-400">
                          {videosError}
                        </p>
                      )}
                    </div>

                    {videoTotal > 0 && (
                      <div className="mt-auto shrink-0 border-t border-border bg-background pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            共 {videoTotal} 个视频 · 第 {videoPage} /{" "}
                            {videoTotalPages} 页
                          </p>
                          {videoTotalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={videoPage <= 1 || videosLoading}
                                onClick={() => goToVideoPage(videoPage - 1)}
                              >
                                <ChevronLeft className="h-4 w-4" />
                                上一页
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={
                                  videoPage >= videoTotalPages || videosLoading
                                }
                                onClick={() => goToVideoPage(videoPage + 1)}
                              >
                                下一页
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    该合集暂无视频
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
