import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { FavMediaItem, OpusFavItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { cn, formatCount } from "@/lib/utils";
import { FileText, Loader2, Video } from "lucide-react";

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

type FavTab = "video" | "opus";

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MyFavoritesPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<FavTab>("video");
  const [videos, setVideos] = useState<FavMediaItem[]>([]);
  const [opusItems, setOpusItems] = useState<OpusFavItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (kind: FavTab, nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }

      try {
        if (kind === "video") {
          const result = await window.biliDesk.bili.getFavVideoMedias(nextPage);
          setVideos((prev) =>
            append ? [...prev, ...result.items] : result.items,
          );
          setPage(result.page);
          setHasMore(result.hasMore);
        } else {
          const result = await window.biliDesk.bili.getOpusFavorites(nextPage);
          setOpusItems((prev) =>
            append ? [...prev, ...result.items] : result.items,
          );
          setPage(result.page);
          setHasMore(result.hasMore);
        }
      } catch (err) {
        setError(formatError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setVideos([]);
    setOpusItems([]);
    setPage(1);
    setHasMore(false);
    void load(tab, 1, false);
  }, [tab, load]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(tab, page + 1, true);
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, hasMore, load, loading, loadingMore, page]);

  const videoCount = videos.length;
  const opusCount = opusItems.length;
  const isEmpty = tab === "video" ? videoCount === 0 : opusCount === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "video" ? "default" : "outline"}
            onClick={() => setTab("video")}
            className="gap-1.5"
          >
            <Video className="h-4 w-4" />
            视频
          </Button>
          <Button
            size="sm"
            variant={tab === "opus" ? "default" : "outline"}
            onClick={() => setTab("opus")}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" />
            图文
          </Button>
        </div>
        <Link to="/favorites">
          <Button size="sm" variant="secondary">
            打开收藏管理
          </Button>
        </Link>
      </div>

      {loading && isEmpty ? (
        <p className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </p>
      ) : error && isEmpty ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : isEmpty ? (
        <p className="text-sm text-muted-foreground">
          {tab === "video" ? "暂无收藏视频" : "暂无收藏图文"}
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-[60vh] space-y-2 overflow-y-auto pr-1"
        >
          {tab === "video"
            ? videos.map((item) => (
                <Link
                  key={`${item.id}-${item.favTime}`}
                  to={item.bvid ? `/video/${item.bvid}` : "#"}
                  className={cn(
                    "flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50",
                    !item.bvid && "pointer-events-none opacity-60",
                  )}
                >
                  {item.cover ? (
                    <BiliImage
                      src={item.cover}
                      alt=""
                      className="h-20 w-36 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.upper.name}
                      {item.duration > 0 &&
                        ` · ${formatDuration(item.duration)}`}
                      {item.playCount > 0 &&
                        ` · ${formatCount(item.playCount)} 播放`}
                    </p>
                  </div>
                </Link>
              ))
            : opusItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
                >
                  {item.cover ? (
                    <BiliImage
                      src={item.cover}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">
                      {item.title}
                    </p>
                    {item.author && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.author}
                      </p>
                    )}
                    {item.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.summary}
                      </p>
                    )}
                  </div>
                </a>
              ))}

          <div
            ref={sentinelRef}
            className="py-4 text-center text-sm text-muted-foreground"
          >
            {loadingMore
              ? "加载更多..."
              : hasMore
                ? "继续下滑加载更多"
                : "已经到底啦"}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
