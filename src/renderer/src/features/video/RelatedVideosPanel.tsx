import { useEffect, useState } from "react";
import type { VideoItem } from "@shared/types";
import { VideoCard } from "@/components/video/VideoCard";
import { cn } from "@/lib/utils";

export function RelatedVideosPanel({
  bvid,
  className,
}: {
  bvid: string;
  className?: string;
}) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setVideos([]);
    void window.biliDesk.bili
      .getRelatedVideos(bvid)
      .then((list) => {
        if (cancelled) return;
        setVideos(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "相关推荐加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bvid]);

  if (!loading && !error && videos.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-sm font-semibold">相关推荐</h2>
      {loading && (
        <p className="text-xs text-muted-foreground">加载推荐中...</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.slice(0, 12).map((video) => (
            <VideoCard key={video.bvid} video={video} />
          ))}
        </div>
      )}
    </section>
  );
}
