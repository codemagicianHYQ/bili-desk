import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LivePlayInfo, LiveRoomDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { BiliImage } from "@/components/ui/bili-image";
import { LivePlayer } from "@/components/live/LivePlayer";
import { LiveChatPanel } from "@/components/live/LiveChatPanel";
import { formatCount } from "@/lib/utils";
import { Eye, Loader2, Radio, Users } from "lucide-react";

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
  const [online, setOnline] = useState(0);
  const [watched, setWatched] = useState(0);
  const [watchedText, setWatchedText] = useState("");
  const [viewers, setViewers] = useState(0);
  const autoReloadSeqRef = useRef(0);
  const autoReloadUsedRef = useRef(false);

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

  const reloadPlayUrl = useCallback(() => {
    if (!room || room.liveStatus !== 1) return;
    if (autoReloadUsedRef.current) {
      setPlayError("直播流异常，请切换清晰度或刷新");
      return;
    }
    autoReloadUsedRef.current = true;
    const seq = ++autoReloadSeqRef.current;
    const id = room.roomId || roomId;
    void window.biliDesk.bili
      .getLivePlayUrl(id, quality)
      .then((info) => {
        if (seq !== autoReloadSeqRef.current) return;
        setPlayError("");
        setPlayInfo(info);
        setQuality(info.quality);
      })
      .catch((e: Error) => {
        if (seq !== autoReloadSeqRef.current) return;
        setPlayError(e.message || "直播流异常，请刷新重试");
      });
  }, [quality, room, roomId]);

  const applyRoomStats = useCallback((detail: LiveRoomDetail) => {
    setOnline(detail.online);
    setWatched(detail.watched ?? 0);
    setWatchedText(detail.watchedText ?? "");
    if (detail.viewers != null && detail.viewers > 0) {
      setViewers(detail.viewers);
    }
  }, []);

  const loadRoom = useCallback(
    (id: number) => {
      setLoading(true);
      setError("");
      setPlayError("");
      setPlayInfo(null);
      setRoom(null);
      autoReloadUsedRef.current = false;
      autoReloadSeqRef.current += 1;

      window.biliDesk.bili
        .getLiveRoom(id)
        .then((detail) => {
          setRoom(detail);
          applyRoomStats(detail);
          setLoading(false);
          if (detail.liveStatus === 1) {
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
    [applyRoomStats, fetchPlayUrl],
  );

  useEffect(() => {
    if (!roomId) return;
    autoReloadUsedRef.current = false;
    loadRoom(roomId);
  }, [roomId, loadRoom]);

  useEffect(() => {
    const onRefresh = () => loadRoom(roomId);
    window.addEventListener("bilidesk:refresh-live", onRefresh);
    return () => {
      window.removeEventListener("bilidesk:refresh-live", onRefresh);
    };
  }, [roomId, loadRoom]);

  useEffect(() => {
    if (!roomId || !active) return;
    const pullViewers = () => {
      void window.biliDesk.bili
        .getLiveRoomViewers(roomId, room?.uid)
        .then((count) => {
          if (count > 0) setViewers(count);
        })
        .catch(() => {
          // 观众数刷新失败不影响播放
        });
    };
    pullViewers();
    const viewersTimer = window.setInterval(pullViewers, 15000);
    const roomTimer = window.setInterval(() => {
      void window.biliDesk.bili
        .getLiveRoom(roomId)
        .then((detail) => {
          setRoom((prev) => (prev ? { ...prev, ...detail } : detail));
          applyRoomStats(detail);
        })
        .catch(() => {
          // 人数刷新失败不影响播放
        });
    }, 45000);
    return () => {
      window.clearInterval(viewersTimer);
      window.clearInterval(roomTimer);
    };
  }, [active, applyRoomStats, room?.uid, roomId]);

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
      <div className="flex h-full flex-col items-center justify-center gap-3 text-red-400">
        <p>{error || "直播间加载失败"}</p>
        <Button variant="secondary" size="sm" onClick={() => loadRoom(roomId)}>
          重试
        </Button>
      </div>
    );
  }

  const realRoomId = room.roomId || roomId;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 bg-black">
          {playInfo && active ? (
            <LivePlayer
              key={`${roomId}-${playInfo.quality}-${playInfo.url}`}
              className="h-full rounded-none aspect-auto"
              playInfo={playInfo}
              poster={room.cover}
              onQualityChange={(qn) => {
                autoReloadUsedRef.current = false;
                setQuality(qn);
                void fetchPlayUrl(realRoomId, qn);
              }}
              onError={setPlayError}
              onRequestReload={reloadPlayUrl}
            />
          ) : (
            <div className="relative flex h-full items-center justify-center overflow-hidden bg-black">
              {room.cover && (
                <BiliImage
                  src={room.cover}
                  alt={room.title}
                  variant="cover"
                  className="absolute inset-0 h-full w-full object-cover opacity-40"
                />
              )}
              <div className="relative z-[1] space-y-2 px-6 text-center text-sm text-white/90">
                {playInfo && !active ? (
                  <p>直播已暂停</p>
                ) : playError ? (
                  <>
                    <p>{playError}</p>
                    {room.liveStatus === 1 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          autoReloadUsedRef.current = false;
                          void fetchPlayUrl(realRoomId, quality);
                        }}
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
        </div>

        {playError && playInfo && (
          <p className="px-4 pt-2 text-sm text-red-400">{playError}</p>
        )}

        <div className="shrink-0 space-y-2.5 border-t border-border px-4 py-3">
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
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {formatCount(online)} 人气
            </span>
            {(watchedText || watched > 0) && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                {watchedText || `${formatCount(watched)}人看过`}
              </span>
            )}
          </div>

          <h1 className="text-lg font-semibold leading-snug">{room.title}</h1>

          <Link
            to={`/up/${room.uid}`}
            className="inline-flex min-w-0 items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-secondary/60"
          >
            <BiliImage
              src={room.face}
              alt={room.uname}
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{room.uname}</p>
              <p className="text-xs text-muted-foreground">
                房间号 {realRoomId}
              </p>
            </div>
          </Link>
        </div>
      </div>

      <LiveChatPanel
        roomId={realRoomId}
        viewers={viewers}
        active={active}
        className="h-[38vh] w-full border-l-0 border-t lg:h-auto lg:w-[340px] lg:border-l lg:border-t-0"
        onStats={(stats) => {
          if (stats.online != null) setOnline(stats.online);
          if (stats.watched != null) setWatched(stats.watched);
          if (stats.watchedText) setWatchedText(stats.watchedText);
          if (stats.viewers != null) setViewers(stats.viewers);
        }}
      />
    </div>
  );
}
