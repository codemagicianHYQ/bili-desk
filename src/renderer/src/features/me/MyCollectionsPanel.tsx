import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserCollectionItem, VideoItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Folder,
  Layers,
  Loader2,
} from "lucide-react";

const VIDEO_PAGE_SIZE = 30;

function formatError(err: unknown): string {
  const message = extractIpcErrorMessage(err) || "加载失败";
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

interface MyCollectionsPanelProps {
  mid: number;
  /** page：侧栏独立页满高；embedded：嵌在「我的」里 */
  layout?: "page" | "embedded";
}

export function MyCollectionsPanel({
  mid,
  layout = "embedded",
}: MyCollectionsPanelProps) {
  const selfMid = useAppStore((s) => s.user?.mid) ?? 0;
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
  const [subscribedIds, setSubscribedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState("");

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
        setSubError("");
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
      setSubError("");
      void loadVideos(collection, 1);
      if (
        collection.kind === "season" &&
        collection.source !== "subscribed" &&
        Number(collection.ownerMid ?? mid) !== Number(selfMid)
      ) {
        void window.biliDesk.bili
          .getUgcSeasonSubscribed(collection.id)
          .then((value) => {
            setSubscribedIds((prev) => {
              const next = new Set(prev);
              if (value) next.add(collection.id);
              else next.delete(collection.id);
              return next;
            });
          })
          .catch(() => {});
      }
    },
    [loadVideos, mid, selfMid],
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

  const isOwnSelected = Boolean(
    selected &&
    (tab === "created" ||
      selected.source === "created" ||
      Number(selected.ownerMid ?? 0) === Number(selfMid)),
  );
  const canSubscribeSelected = Boolean(
    selected && selected.kind === "season" && !isOwnSelected,
  );
  const selectedSubscribed = Boolean(
    selected && subscribedIds.has(selected.id),
  );

  const handleToggleSubscribe = async () => {
    if (!selected || selected.kind !== "season" || subBusy) return;
    if (!selfMid) {
      setSubError("请先登录后再订阅合集");
      return;
    }
    const next = !selectedSubscribed;
    setSubBusy(true);
    setSubError("");
    setSubscribedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(selected.id);
      else copy.delete(selected.id);
      return copy;
    });
    const snapshot = selected;
    try {
      await window.biliDesk.bili.setUgcSeasonSubscribe(selected.id, next);
      if (!next && tab === "subscribed") {
        setSubscribed((prev) => prev.filter((item) => item.id !== selected.id));
        setSelected(null);
        setVideos([]);
        setVideoTotal(0);
      }
    } catch (err) {
      setSubscribedIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(selected.id);
        else copy.add(selected.id);
        return copy;
      });
      if (!next && tab === "subscribed") {
        setSubscribed((prev) =>
          prev.some((item) => item.id === snapshot.id)
            ? prev
            : [snapshot, ...prev],
        );
      }
      const message = formatError(err);
      if (
        next &&
        (message.includes("已订阅") ||
          message.includes("已经收藏") ||
          message.includes("重复"))
      ) {
        setSubscribedIds((prev) => new Set(prev).add(selected.id));
      } else {
        setSubError(message);
      }
    } finally {
      setSubBusy(false);
    }
  };

  useEffect(() => {
    setSeasons([]);
    setSeries([]);
    setSubscribed([]);
    setSubscribedIds(new Set());
    setPage(1);
    setHasMore(false);
    void loadList(tab, 1, false);
  }, [tab, mid, loadList]);

  useEffect(() => {
    if (tab !== "subscribed") return;
    setSubscribedIds(new Set(subscribed.map((item) => item.id)));
  }, [tab, subscribed]);

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

  const shellClass =
    layout === "page"
      ? "flex h-full min-h-0 flex-col gap-4"
      : "flex flex-col space-y-4";

  if (loading && allCollections.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载合集...
      </p>
    );
  }

  return (
    <div className={shellClass}>
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
        <div
          className={cn(
            "grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]",
            layout === "page"
              ? "h-full"
              : "h-[calc(100vh-15rem)] min-h-[480px]",
          )}
        >
          <div className="bili-glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/25">
            <div
              ref={listScrollRef}
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
            >
              {allCollections.map((item) => {
                const active =
                  selected?.kind === item.kind &&
                  selected?.id === item.id &&
                  selected?.source === item.source;
                return (
                  <button
                    key={`${item.source ?? tab}-${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => selectCollection(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                      active
                        ? "bg-primary/15 ring-1 ring-primary/35"
                        : "hover:bg-secondary/70",
                    )}
                  >
                    {item.cover ? (
                      <BiliImage
                        src={item.cover}
                        alt=""
                        className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-[4.5rem] shrink-0 items-center justify-center rounded-lg bg-muted">
                        {item.kind === "season" ? (
                          <Folder className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Layers className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.label} · {formatCount(item.total)} 个内容
                      </p>
                    </div>
                  </button>
                );
              })}
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
              {error && <p className="px-2 text-sm text-red-400">{error}</p>}
            </div>
          </div>

          <div className="bili-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/20">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                <Layers className="h-8 w-8 opacity-40" />
                <p>选择左侧合集查看视频</p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="relative shrink-0 overflow-hidden border-b border-border/60">
                  {selected.cover ? (
                    <BiliImage
                      src={selected.cover}
                      alt=""
                      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
                    />
                  ) : null}
                  <div className="relative flex flex-wrap items-start gap-4 px-4 py-4">
                    {selected.cover ? (
                      <BiliImage
                        src={selected.cover}
                        alt=""
                        className="h-20 w-[7.5rem] shrink-0 rounded-xl object-cover shadow-lg"
                      />
                    ) : (
                      <div className="flex h-20 w-[7.5rem] shrink-0 items-center justify-center rounded-xl bg-muted">
                        <Folder className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold tracking-tight">
                            {selected.title}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selected.kind === "season" ? "合集" : "系列"} ·{" "}
                            {formatCount(selected.total || videoTotal)} 个内容
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {canSubscribeSelected && (
                            <Button
                              size="sm"
                              variant={
                                selectedSubscribed ? "outline" : "default"
                              }
                              disabled={subBusy}
                              onClick={() => void handleToggleSubscribe()}
                            >
                              {subBusy
                                ? "处理中..."
                                : selectedSubscribed
                                  ? "取消订阅"
                                  : "订阅合集"}
                            </Button>
                          )}
                          {videoTotal > 0 && (
                            <>
                              <Button
                                size="sm"
                                variant={
                                  sortOrder === "desc" ? "default" : "outline"
                                }
                                className="gap-1"
                                onClick={() => setSortOrder("desc")}
                              >
                                <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                                最新
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  sortOrder === "asc" ? "default" : "outline"
                                }
                                className="gap-1"
                                onClick={() => setSortOrder("asc")}
                              >
                                <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                                最早
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {selected.description ? (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {selected.description}
                        </p>
                      ) : null}
                      {subError ? (
                        <p className="text-xs text-red-400">{subError}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {videosLoading && videos.length === 0 ? (
                  <p className="flex items-center px-4 py-8 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    加载视频中...
                  </p>
                ) : videosError && videos.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-red-400">
                    {videosError}
                  </p>
                ) : sortedVideos.length > 0 ? (
                  <>
                    <div
                      className={cn(
                        "min-h-0 flex-1 overflow-y-auto px-4 pt-4",
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
                      <PaginationBar
                        page={videoPage}
                        totalPages={videoTotalPages}
                        disabled={videosLoading}
                        onPageChange={goToVideoPage}
                        className="mt-auto shrink-0 border-t border-border/60 bg-transparent px-4 py-3"
                        info={
                          <>
                            共 {videoTotal} 个视频 · 第 {videoPage} /{" "}
                            {videoTotalPages} 页
                          </>
                        }
                      />
                    )}
                  </>
                ) : (
                  <p className="px-4 py-8 text-sm text-muted-foreground">
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
