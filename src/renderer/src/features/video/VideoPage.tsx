import { useCallback, useEffect, useState } from "react";
import type { VideoDetail, VideoPlayInfo } from "@shared/types";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { UpOwnerCard } from "@/components/video/UpOwnerCard";
import { VideoFavButton } from "@/components/video/VideoFavButton";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { PageBackHeader } from "@/components/layout/PageBackHeader";

interface VideoPageProps {
  bvid: string;
  active?: boolean;
}

export function VideoPage({ bvid, active = true }: VideoPageProps) {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [playInfo, setPlayInfo] = useState<VideoPlayInfo | null>(null);
  const [selectedCid, setSelectedCid] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [playError, setPlayError] = useState("");

  useEffect(() => {
    if (!bvid) return;

    setError("");
    setPlayError("");
    setPlayInfo(null);

    window.biliDesk.bili
      .getVideo(bvid)
      .then((detail) => {
        setVideo(detail);
        setSelectedCid(detail.pages[0]?.cid ?? null);
        setQuality(undefined);
      })
      .catch((e: Error) => setError(e.message));
  }, [bvid]);

  useEffect(() => {
    if (!bvid || !selectedCid) return;

    setPlayError("");

    window.biliDesk.bili
      .getPlayUrl(bvid, selectedCid, quality)
      .then(setPlayInfo)
      .catch((e: Error) => setPlayError(e.message));
  }, [bvid, selectedCid, quality]);

  const handleQualityChange = useCallback((qn: number) => {
    setQuality(qn);
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageBackHeader />

      <div className="scrollbar-overlay flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6 pt-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {playInfo ? (
              <VideoPlayer
                playInfo={playInfo}
                poster={video.cover}
                active={active}
                onQualityChange={handleQualityChange}
                onError={setPlayError}
              />
            ) : (
              <div className="relative aspect-video w-full bg-black">
                <BiliImage
                  src={video.cover}
                  alt={video.title}
                  className="h-full w-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                  {playError || "正在加载播放器..."}
                </div>
              </div>
            )}

            <div className="space-y-4 p-6">
              <h1 className="text-xl font-semibold leading-snug">
                {video.title}
              </h1>

              {video.pages.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {video.pages.map((part) => (
                    <Button
                      key={part.cid}
                      size="sm"
                      variant={selectedCid === part.cid ? "default" : "outline"}
                      onClick={() => {
                        setQuality(undefined);
                        setSelectedCid(part.cid);
                      }}
                    >
                      P{part.page}
                      {part.part && part.page === 1 ? "" : ` · ${part.part}`}
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <UpOwnerCard
                    mid={video.owner.mid}
                    name={video.owner.name}
                    face={video.owner.face}
                  />
                </div>
                <WatchLaterButton
                  aid={video.aid}
                  bvid={video.bvid}
                  video={video}
                  variant="inline"
                />
                <VideoFavButton aid={video.aid} />
              </div>

              <p className="text-xs text-muted-foreground">
                {formatCount(video.stat.view)} 播放 ·{" "}
                {formatCount(video.stat.danmaku)} 弹幕
                {playInfo ? ` · ${playInfo.qualityLabel}` : ""}
                {video.stat.favorite > 0
                  ? ` · ${formatCount(video.stat.favorite)} 收藏`
                  : ""}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {video.desc || "暂无简介"}
              </p>
              {playError && playInfo && (
                <p className="text-sm text-red-400">{playError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
