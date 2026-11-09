import { useCallback, useEffect, useState } from "react";
import type { UserCollectionItem, VideoItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video/VideoCard";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { extractIpcErrorMessage, formatUserSpaceError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Folder, Layers, Loader2 } from "lucide-react";

function looksLikeCharge(item: UserCollectionItem): boolean {
  return /充电|专属|upower/i.test(`${item.title} ${item.description}`);
}

export function UpSpaceCollectionsPanel({
  mid,
  preview,
  onlyCharge,
}: {
  mid: number;
  preview?: boolean;
  onlyCharge?: boolean;
}) {
  const selfMid = useAppStore((state) => state.user?.mid);
  const isOwnSpace = Boolean(selfMid) && Number(selfMid) === Number(mid);
  const [items, setItems] = useState<UserCollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UserCollectionItem | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoTotal, setVideoTotal] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);
  const [subscribedIds, setSubscribedIds] = useState<Set<number>>(new Set());
  const [subBusyId, setSubBusyId] = useState<number | null>(null);
  const [subError, setSubError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected(null);
    setVideos([]);
    setSubscribedIds(new Set());
    setSubError("");
    void window.biliDesk.bili
      .getUserCollections(mid, 1)
      .then((result) => {
        if (cancelled) return;
        const next = [...result.seasons, ...result.series];
        setItems(next);
        // 只查合集订阅态；系列（series）没有同一套订阅接口
        if (!selfMid || Number(selfMid) === Number(mid)) return;
        const seasons = next.filter((item) => item.kind === "season");
        void Promise.all(
          seasons.map(async (item) => {
            try {
              const subscribed =
                await window.biliDesk.bili.getUgcSeasonSubscribed(item.id);
              return subscribed ? item.id : null;
            } catch {
              return null;
            }
          }),
        ).then((ids) => {
          if (cancelled) return;
          setSubscribedIds(
            new Set(ids.filter((id): id is number => id != null)),
          );
        });
      })
      .catch((err) => {
        if (!cancelled) setError(formatUserSpaceError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mid, selfMid]);

  const handleToggleSubscribe = useCallback(
    async (item: UserCollectionItem) => {
      if (item.kind !== "season" || subBusyId != null || isOwnSpace) return;
      if (!selfMid) {
        setSubError("请先登录后再订阅合集");
        return;
      }
      const next = !subscribedIds.has(item.id);
      setSubBusyId(item.id);
      setSubError("");
      setSubscribedIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(item.id);
        else copy.delete(item.id);
        return copy;
      });
      try {
        await window.biliDesk.bili.setUgcSeasonSubscribe(item.id, next);
      } catch (err) {
        const message = extractIpcErrorMessage(err) || "操作失败";
        setSubscribedIds((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(item.id);
          else copy.add(item.id);
          return copy;
        });
        if (
          next &&
          (message.includes("已订阅") ||
            message.includes("已经收藏") ||
            message.includes("重复"))
        ) {
          setSubscribedIds((prev) => new Set(prev).add(item.id));
        } else {
          setSubError(message);
        }
      } finally {
        setSubBusyId(null);
      }
    },
    [isOwnSpace, selfMid, subBusyId, subscribedIds],
  );

  const openCollection = useCallback(
    async (item: UserCollectionItem, page = 1) => {
      setSelected(item);
      setVideosLoading(true);
      try {
        const result =
          item.kind === "season"
            ? await window.biliDesk.bili.getSeasonArchives(mid, item.id, page)
            : await window.biliDesk.bili.getSeriesArchives(item.id, page);
        setVideos(result.videos);
        setVideoPage(result.page);
        setVideoTotal(result.total);
      } catch (err) {
        setError(formatUserSpaceError(err));
      } finally {
        setVideosLoading(false);
      }
    },
    [mid],
  );

  if (loading) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载合集...
      </p>
    );
  }

  if (error && items.length === 0) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">该 UP 暂无公开合集或系列</p>
    );
  }

  const filtered = onlyCharge ? items.filter(looksLikeCharge) : items;
  const shown = preview ? filtered.slice(0, 4) : filtered;

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {onlyCharge ? "该 UP 暂无公开充电专属" : "该 UP 暂无公开合集或系列"}
      </p>
    );
  }

  if (selected && !preview) {
    const totalPages = Math.max(1, Math.ceil(videoTotal / 30));
    const canSubscribe =
      selected.kind === "season" && !isOwnSpace && Boolean(selfMid);
    const subscribed = subscribedIds.has(selected.id);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected.kind === "season" ? "合集" : "系列"} · {selected.total}{" "}
              个内容
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canSubscribe && (
              <Button
                size="sm"
                variant={subscribed ? "outline" : "default"}
                disabled={subBusyId === selected.id}
                onClick={() => void handleToggleSubscribe(selected)}
              >
                {subBusyId === selected.id
                  ? "处理中..."
                  : subscribed
                    ? "已订阅"
                    : "订阅合集"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setVideos([]);
                setSubError("");
              }}
            >
              返回合集
            </Button>
          </div>
        </div>
        {subError && <p className="text-xs text-red-400">{subError}</p>}
        {videosLoading && videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">加载视频...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <VideoCard key={video.bvid} video={video} />
            ))}
          </div>
        )}
        {videoTotal > 30 && (
          <PaginationBar
            page={videoPage}
            totalPages={totalPages}
            onPageChange={(page) => void openCollection(selected, page)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subError && <p className="text-xs text-red-400">{subError}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {shown.map((item) => {
          const canSubscribe =
            !preview &&
            item.kind === "season" &&
            !isOwnSpace &&
            Boolean(selfMid);
          const subscribed = subscribedIds.has(item.id);
          return (
            <div
              key={`${item.kind}-${item.id}`}
              className={cn(
                "overflow-hidden rounded-xl border border-border bg-card text-left transition-colors",
                !preview && "hover:bg-secondary/40",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (!preview) void openCollection(item);
                }}
                className="block w-full text-left"
              >
                {item.cover ? (
                  <BiliImage
                    src={item.cover}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    {item.kind === "season" ? (
                      <Folder className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <Layers className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                )}
              </button>
              <div className="space-y-2 p-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!preview) void openCollection(item);
                  }}
                  className="block w-full text-left"
                >
                  <p className="line-clamp-2 text-sm font-medium">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.kind === "season" ? "合集" : "系列"} · {item.total}{" "}
                    个内容
                  </p>
                </button>
                {canSubscribe && (
                  <Button
                    type="button"
                    size="sm"
                    variant={subscribed ? "outline" : "default"}
                    className="h-7 w-full px-2 text-xs"
                    disabled={subBusyId === item.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggleSubscribe(item);
                    }}
                  >
                    {subBusyId === item.id
                      ? "处理中..."
                      : subscribed
                        ? "已订阅"
                        : "订阅合集"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
