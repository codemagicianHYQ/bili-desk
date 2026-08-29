import { useCallback, useEffect, useState } from "react";
import type { UserCollectionItem, VideoItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video/VideoCard";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
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
  const [items, setItems] = useState<UserCollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UserCollectionItem | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoTotal, setVideoTotal] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void window.biliDesk.bili
      .getUserCollections(mid, 1)
      .then((result) => {
        if (cancelled) return;
        setItems([...result.seasons, ...result.series]);
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
  }, [mid]);

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
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{selected.title}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(null);
              setVideos([]);
            }}
          >
            返回合集
          </Button>
        </div>
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {shown.map((item) => (
        <button
          key={`${item.kind}-${item.id}`}
          type="button"
          onClick={() => {
            if (!preview) void openCollection(item);
          }}
          className={cn(
            "overflow-hidden rounded-xl border border-border bg-card text-left transition-colors",
            !preview && "hover:bg-secondary/40",
          )}
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
          <div className="p-2.5">
            <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.kind === "season" ? "合集" : "系列"} · {item.total} 个内容
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
