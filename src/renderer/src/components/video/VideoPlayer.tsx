import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import artplayerPluginDanmuku from "artplayer-plugin-danmuku";
import flvjs from "flv.js";
import dashjs from "dashjs";
import type { VideoPlayInfo } from "@shared/types";
import { createPlaybackRateControl } from "@/components/video/playback-rate-setting";
import {
  clearPlaybackProgress,
  getPlaybackProgress,
  savePlaybackProgress,
} from "@/lib/playback-progress";
import { cn, formatDuration } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface VideoPlayerProps {
  playInfo: VideoPlayInfo;
  aid: number;
  bvid: string;
  cid: number;
  poster?: string;
  active?: boolean;
  /** 优先于本地缓存的续播秒数（如历史记录进度） */
  initialTime?: number;
  reloadKey?: number;
  onQualityChange: (qn: number) => void;
  onError?: (message: string) => void;
  /** 用户选择从头观看时回调（用于清掉 URL 续播参数） */
  onWatchFromStart?: () => void;
}

function resolvePlayerType(format: VideoPlayInfo["format"]): string {
  if (format === "flv") return "flv";
  if (format === "dash") return "mpd";
  return "mp4";
}

function playerThemeColor(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  return raw ? `hsl(${raw})` : "#fb7299";
}

function danmakuModeToBili(mode?: 0 | 1 | 2): number {
  if (mode === 1) return 5;
  if (mode === 2) return 4;
  return 1;
}

function colorHexToInt(color?: string): number {
  if (!color) return 16777215;
  const hex = color.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 16777215;
  return Number.parseInt(hex, 16);
}

const SAVE_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 15000;
const RESUME_TIP_MS = 5000;

export function VideoPlayer({
  playInfo,
  aid,
  bvid,
  cid,
  poster,
  active = true,
  initialTime,
  reloadKey = 0,
  onQualityChange,
  onError,
  onWatchFromStart,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const resumeOnActiveRef = useRef(false);
  const hasSeekedRef = useRef(false);
  const lastSaveAtRef = useRef(0);
  const tipShownKeyRef = useRef<string | null>(null);
  const onQualityChangeRef = useRef(onQualityChange);
  const onErrorRef = useRef(onError);
  const onWatchFromStartRef = useRef(onWatchFromStart);
  const incognitoMode = useAppStore((state) => state.incognitoMode);
  const userLoggedIn = useAppStore((state) => Boolean(state.user?.isLogin));
  const incognitoRef = useRef(incognitoMode);
  const loggedInRef = useRef(userLoggedIn);
  const [resumeTipAt, setResumeTipAt] = useState<number | null>(null);

  onQualityChangeRef.current = onQualityChange;
  onErrorRef.current = onError;
  onWatchFromStartRef.current = onWatchFromStart;
  incognitoRef.current = incognitoMode;
  loggedInRef.current = userLoggedIn;

  useEffect(() => {
    tipShownKeyRef.current = null;
    setResumeTipAt(null);
  }, [bvid, cid]);

  useEffect(() => {
    if (resumeTipAt == null) return;
    const timer = window.setTimeout(() => setResumeTipAt(null), RESUME_TIP_MS);
    return () => window.clearTimeout(timer);
  }, [resumeTipAt]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    hasSeekedRef.current = false;
    lastSaveAtRef.current = 0;

    const localProgress = getPlaybackProgress(bvid, cid);
    const pendingSeek =
      initialTime != null && Number.isFinite(initialTime) && initialTime >= 5
        ? initialTime
        : localProgress;
    const startTs = Math.floor(Date.now() / 1000);
    let playedAccum = 0;
    let lastTickAt = 0;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let startedReported = false;

    const saveCurrentProgress = () => {
      const art = artRef.current;
      if (!art || !art.duration) return;
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
    };

    const accumulateRealtime = () => {
      if (!lastTickAt) return;
      const now = Date.now();
      playedAccum += Math.max(0, (now - lastTickAt) / 1000);
      lastTickAt = now;
    };

    const reportHeartbeat = (
      playType: 0 | 1 | 2 | 3,
      options?: { finished?: boolean },
    ) => {
      if (incognitoRef.current || !loggedInRef.current) return;
      const art = artRef.current;
      if (!art) return;

      accumulateRealtime();
      const current = Math.max(0, Math.floor(art.currentTime || 0));
      const duration = Math.max(0, Math.floor(art.duration || 0));
      const finished =
        options?.finished ||
        (duration > 0 && current >= Math.max(1, duration - 2));
      const playedTime = finished ? -1 : current;

      void window.biliDesk.bili
        .reportWatchHeartbeat({
          aid,
          bvid,
          cid,
          playedTime,
          playType,
          startTs,
          realtime: Math.floor(playedAccum),
          quality: playInfo.quality,
        })
        .catch(() => {
          // 历史上报失败不打扰播放
        });
    };

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        const art = artRef.current;
        if (!art || art.paused) return;
        reportHeartbeat(0);
      }, HEARTBEAT_INTERVAL_MS);
    };

    const trySeekToProgress = (art: Artplayer) => {
      if (hasSeekedRef.current || pendingSeek == null) return;
      if (!art.duration || art.duration <= 0) return;

      // 已接近片尾则从头播，避免“已看完”又卡在最后几秒
      if (pendingSeek >= art.duration - 15) {
        hasSeekedRef.current = true;
        return;
      }

      const target = Math.min(pendingSeek, Math.max(0, art.duration - 1));
      if (target >= 5) {
        art.currentTime = target;
        hasSeekedRef.current = true;
        savePlaybackProgress(bvid, cid, target, art.duration);
        const tipKey = `${bvid}:${cid}`;
        if (tipShownKeyRef.current !== tipKey) {
          tipShownKeyRef.current = tipKey;
          setResumeTipAt(Math.floor(target));
        }
      }
    };

    const art = new Artplayer({
      container,
      url: playInfo.url,
      poster,
      autoplay: true,
      autoSize: false,
      autoMini: true,
      setting: true,
      playbackRate: false,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      pip: true,
      mutex: true,
      controls: [createPlaybackRateControl()],
      theme: playerThemeColor(),
      lang: "zh-cn",
      type: resolvePlayerType(playInfo.format),
      customType: {
        flv(video, url, player) {
          if (!flvjs.isSupported()) {
            onErrorRef.current?.("当前环境不支持 FLV 播放");
            return;
          }

          const flvPlayer = flvjs.createPlayer({
            type: "flv",
            url,
            isLive: false,
          });
          flvPlayer.attachMediaElement(video);
          flvPlayer.load();
          player.on("destroy", () => flvPlayer.destroy());
        },
        mpd(video, url, player) {
          if (!dashjs.supportsMediaSource()) {
            onErrorRef.current?.("当前环境不支持 DASH 播放");
            return;
          }

          const dashPlayer = dashjs.MediaPlayer().create();
          dashPlayer.updateSettings({
            streaming: {
              abr: { autoSwitchBitrate: { video: false, audio: false } },
            },
          });
          dashPlayer.initialize(video, url, player.option.autoplay);
          player.on("destroy", () => dashPlayer.reset());
        },
      },
      settings: [
        {
          html: "清晰度",
          selector: playInfo.qualities.map((item) => ({
            html: item.label,
            default: item.qn === playInfo.quality,
            qn: item.qn,
          })),
          onSelect(item) {
            const qn = item.qn as number;
            if (qn !== playInfo.quality) {
              saveCurrentProgress();
              onQualityChangeRef.current(qn);
            }
            return item.html;
          },
        },
      ],
      plugins: [
        artplayerPluginDanmuku({
          danmuku: async () => {
            try {
              return await window.biliDesk.bili.getDanmakuList(cid);
            } catch (error) {
              onErrorRef.current?.(
                error instanceof Error ? error.message : "弹幕加载失败",
              );
              return [];
            }
          },
          speed: 5,
          opacity: 1,
          fontSize: 22,
          color: "#FFFFFF",
          mode: 0,
          modes: [0, 1, 2],
          margin: [10, "25%"],
          antiOverlap: true,
          synchronousPlayback: true,
          visible: true,
          emitter: true,
          maxLength: 100,
          theme: "dark",
          heatmap: true,
          beforeEmit: async (danmu) => {
            try {
              const progressMs = Math.floor(
                (danmu.time ?? art.currentTime) * 1000,
              );
              await window.biliDesk.bili.sendDanmaku({
                cid,
                bvid,
                progress: progressMs,
                message: danmu.text,
                mode: danmakuModeToBili(danmu.mode),
                color: colorHexToInt(danmu.color),
              });
              return true;
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "发送弹幕失败";
              onErrorRef.current?.(message);
              return false;
            }
          },
        }),
      ],
    });

    art.on("video:error", () => {
      onErrorRef.current?.("视频加载失败，可点刷新重试或切换清晰度");
    });

    art.on("video:canplay", () => {
      trySeekToProgress(art);
    });

    art.on("video:loadedmetadata", () => {
      trySeekToProgress(art);
    });

    art.on("video:timeupdate", () => {
      const now = Date.now();
      if (now - lastSaveAtRef.current < SAVE_INTERVAL_MS) return;
      lastSaveAtRef.current = now;
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
    });

    art.on("play", () => {
      lastTickAt = Date.now();
      if (!startedReported) {
        startedReported = true;
        reportHeartbeat(1);
      } else {
        reportHeartbeat(3);
      }
      startHeartbeat();
    });

    art.on("pause", () => {
      accumulateRealtime();
      lastTickAt = 0;
      stopHeartbeat();
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      reportHeartbeat(2);
    });

    art.on("video:ended", () => {
      accumulateRealtime();
      lastTickAt = 0;
      stopHeartbeat();
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      reportHeartbeat(0, { finished: true });
    });

    artRef.current = art;

    return () => {
      accumulateRealtime();
      stopHeartbeat();
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      if (!art.paused) {
        reportHeartbeat(2);
      }
      artRef.current = null;
      art.destroy();
    };
  }, [
    playInfo.url,
    playInfo.format,
    playInfo.quality,
    playInfo.qualities,
    poster,
    aid,
    bvid,
    cid,
    initialTime,
    reloadKey,
  ]);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return;

    if (!active) {
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      resumeOnActiveRef.current = !art.paused;
      art.pause();
      return;
    }

    if (resumeOnActiveRef.current) {
      resumeOnActiveRef.current = false;
      void art.play().catch(() => {});
    }
  }, [active, bvid, cid]);

  const handleWatchFromStart = () => {
    const art = artRef.current;
    if (art) {
      art.currentTime = 0;
    }
    clearPlaybackProgress(bvid, cid);
    setResumeTipAt(null);
    onWatchFromStartRef.current?.();
  };

  return (
    <div className="relative aspect-video w-full bg-black">
      <div ref={containerRef} className="h-full w-full" />
      {resumeTipAt != null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[3.25rem] z-30 flex justify-center px-3 sm:bottom-16">
          <div
            className={cn(
              "pointer-events-auto flex max-w-[min(92%,28rem)] items-center gap-2 rounded-full",
              "border border-white/15 bg-black/75 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm sm:text-sm",
            )}
          >
            <span className="min-w-0 truncate text-white/90">
              已从 {formatDuration(resumeTipAt)} 续播
            </span>
            <button
              type="button"
              onClick={handleWatchFromStart}
              className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              从头观看
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
