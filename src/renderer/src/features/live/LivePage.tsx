import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LivePlayInfo, LiveRoomDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { BiliImage } from "@/components/ui/bili-image";
import { LivePlayer } from "@/components/live/LivePlayer";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { formatCount } from "@/lib/utils";
import { Loader2, Radio, RefreshCw } from "lucide-react";

interface LivePageProps {
  roomId: number;
  active?: boolean;
}

export function LivePage({ roomId, active = true }: LivePageProps) {
  const [room, setRoom] = useState<LiveRoomDetail | null>(null);
  const [playInfo, setPlayInfo] = useState<LivePlayInfo | null>(null);
  const [quality, setQuality] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [playError, setPlayError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchPlayUrl = useCallback((id: number, qn?: number) => {
    setPlayError("");
    return window.biliDesk.bili
      .getLivePlayUrl(id, qn)
      .then((info) => {
        setPlayInfo(info);
        setQuality(info.quality);
      })
      .catch((e: Error) => setPlayError(e.message));
  }, []);

  const loadRoom = useCallback(
    (id: number) => {
      setLoading(true);
      setError("");
      setPlayError("");
      setPlayInfo(null);
      setRoom(null);

      window.biliDesk.bili
        .getLiveRoom(id)
        .then((detail) => {
          setRoom(detail);
          setLoading(false);
          if (detail.liveStatus === 1) {
            // 短号进房后用真实 roomId 拉流，避免 getRoomPlayInfo 空流
            void fetchPlayUrl(detail.roomId || id);
          } else {
            setPlayError(
              detail.liveStatus === 2 ? "主播轮播中" : "主播当前未开播",
            );
          }
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    },
    [fetchPlayUrl],
  );

  useEffect(() => {
    if (!roomId) return;
    loadRoom(roomId);
  }, [roomId, loadRoom]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载直播间...
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex h-full flex-col">
        <PageBackHeader fallback="/" label="返回" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-red-400">
          <p>{error || "直播间加载失败"}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadRoom(roomId)}
          >
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-overlay flex h-full flex-col overflow-y-auto">
      <PageBackHeader
        fallback="/"
        label="返回"
        trailing={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => loadRoom(roomId)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-4">
        {playInfo && active ? (
          <LivePlayer
            key={`${roomId}-${playInfo.quality}-${playInfo.url}`}
            playInfo={playInfo}
            poster={room.cover}
            onQualityChange={(qn) => {
              setQuality(qn);
              void fetchPlayUrl(room.roomId || roomId, qn);
            }}
            onError={setPlayError}
          />
        ) : playInfo && !active ? (
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
            {room.cover && (
              <BiliImage
                src={room.cover}
                alt={room.title}
                variant="cover"
                className="absolute inset-0 h-full w-full object-cover opacity-50"
              />
            )}
            <p className="relative z-[1] text-sm text-white/80">直播已暂停</p>
          </div>
        ) : (
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
            {room.cover && (
              <BiliImage
                src={room.cover}
                alt={room.title}
                variant="cover"
                className="absolute inset-0 h-full w-full object-cover opacity-40"
              />
            )}
            <div className="relative z-[1] space-y-2 px-6 text-center text-sm text-white/90">
              {playError ? (
                <>
                  <p>{playError}</p>
                  {room.liveStatus === 1 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void fetchPlayUrl(room.roomId || roomId, quality)
                      }
                    >
                      重新加载直播流
                    </Button>
                  )}
                </>
              ) : (
                <p className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在获取直播流...
                </p>
              )}
            </div>
          </div>
        )}

        {playError && playInfo && (
          <p className="text-sm text-red-400">{playError}</p>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-red-500/90 px-2 py-0.5 text-xs font-medium text-white">
              <Radio className="h-3 w-3" />
              {room.liveStatus === 1
                ? "直播中"
                : room.liveStatus === 2
                  ? "轮播中"
                  : "未开播"}
            </span>
            {room.areaName && (
              <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {room.parentAreaName
                  ? `${room.parentAreaName} · ${room.areaName}`
                  : room.areaName}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatCount(room.online)} 人气
            </span>
          </div>

          <h1 className="text-xl font-semibold leading-snug">{room.title}</h1>

          <div className="flex items-center gap-3">
            <Link
              to={`/up/${room.uid}`}
              className="flex min-w-0 items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-secondary/60"
            >
              <BiliImage
                src={room.face}
                alt={room.uname}
                className="h-10 w-10 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{room.uname}</p>
                <p className="text-xs text-muted-foreground">
                  房间号 {room.roomId}
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
