import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { VideoItem } from "@shared/types";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { VideoCard } from "@/components/video/VideoCard";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { Loader2 } from "lucide-react";

export function ChannelPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const channelId = Number(id);
  const fallbackName = searchParams.get("name") || "频道";
  const [name, setName] = useState(fallbackName);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!Number.isFinite(channelId) || channelId <= 0) {
        setError("频道 ID 无效");
        setLoading(false);
        return;
      }
      setLoading(true);
      if (!append) setError("");
      try {
        const result = await window.biliDesk.bili.getChannelVideos(
          channelId,
          nextPage,
        );
        setName(result.name && result.name !== "频道" ? result.name : fallbackName);
        setPage(result.page);
        setHasMore(result.hasMore);
        setVideos((prev) => (append ? [...prev, ...result.videos] : result.videos));
      } catch (err) {
        setError(extractIpcErrorMessage(err) || "频道加载失败");
      } finally {
        setLoading(false);
      }
    },
    [channelId, fallbackName],
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <PageBackHeader fallback="/" label="返回" />
      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
          <h1 className="text-xl font-semibold">{name}</h1>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            {videos.map((video) => (
              <VideoCard key={video.bvid} video={video} meta="stats" />
            ))}
          </div>
          {loading && (
            <p className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载频道...
            </p>
          )}
          {hasMore && !loading && (
            <button
              type="button"
              className="text-sm text-primary"
              onClick={() => void load(page + 1, true)}
            >
              加载更多
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
