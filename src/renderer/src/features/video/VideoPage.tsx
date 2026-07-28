import { useCallback, useEffect, useState } from "react";
import type { VideoDetail, VideoPlayInfo } from "@shared/types";
import { Button } from "@/components/ui/button";
import { formatCount, formatPubdate } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { UpOwnerCard } from "@/components/video/UpOwnerCard";
import { VideoFavButton } from "@/components/video/VideoFavButton";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { RefreshCw } from "lucide-react";

interface VideoPageProps {
  bvid: string;
  active?: boolean;
}

export function VideoPage({ bvid, active = true }: VideoPageProps) {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [playInfo, setPlayInfo] = useState<VideoPlayInfo | null>(null);
  const [selectedCid, setSelectedCid] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [playError, setPlayError] = useState("");

  const fetchPlayUrl = useCallback(
    (targetBvid: string, cid: number, qn?: number) => {
      setPlayError("");
      return window.biliDesk.bili
        .getPlayUrl(targetBvid, cid, qn)
        .then(setPlayInfo)
        .catch((e: Error) => setPlayError(e.message));
    },
    [],
  );

  useEffect(() => {
    if (!bvid) return;

    setError("");
    setPlayError("");
    setPlayInfo(null);
    setReloadKey(0);

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
    void fetchPlayUrl(bvid, selectedCid, quality);
  }, [bvid, selectedCid, quality, fetchPlayUrl]);

  const handleQualityChange = useCallback((qn: number) => {
    setQuality(qn);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!bvid || !selectedCid) return;
    setPlayInfo(null);
    setReloadKey((key) => key + 1);
    void fetchPlayUrl(bvid, selectedCid, quality);
  }, [bvid, selectedCid, quality, fetchPlayUrl]);

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
      <PageBackHeader
        trailing={
          playInfo ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          ) : undefined
        }
      />

      <div className="scrollbar-overlay flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6 pt-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {playInfo && selectedCid ? (
              <VideoPlayer
                playInfo={playInfo}
                bvid={bvid}
                cid={selectedCid}
                poster={video.cover}
                active={active}
                reloadKey={reloadKey}
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

              <UpOwnerCard
                mid={video.owner.mid}
                name={video.owner.name}
                face={video.owner.face}
                trailing={
                  <>
                    <WatchLaterButton
                      aid={video.aid}
                      bvid={video.bvid}
                      video={video}
                      variant="inline"
                    />
                    <VideoFavButton aid={video.aid} />
                  </>
                }
              />

              <p className="text-xs text-muted-foreground">
                {formatCount(video.stat.view)} 播放 ·{" "}
                {formatCount(video.stat.danmaku)} 弹幕
                {video.pubdate > 0 ? ` · ${formatPubdate(video.pubdate)}` : ""}
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
