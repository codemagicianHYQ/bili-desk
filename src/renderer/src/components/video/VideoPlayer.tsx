import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import artplayerPluginDanmuku from "artplayer-plugin-danmuku";
import flvjs from "flv.js";
import dashjs from "dashjs";
import type { VideoPlayInfo } from "@shared/types";
import { attachBiliDash } from "@/components/video/dash-mse";
import { createPlaybackRateControl } from "@/components/video/playback-rate-setting";
import {
  createOsFullscreenControl,
  setOsFullscreenLayout,
} from "@/components/video/os-fullscreen-control";
import { createQualityControl } from "@/components/video/quality-setting";
import { BILI_AUTO_QN } from "@shared/utils/bilibili-quality";
import {
  clearPlaybackProgress,
  getPlaybackProgress,
  savePlaybackProgress,
} from "@/lib/playback-progress";
import { cn, formatDuration } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  describeDashError,
  describeMediaError,
  logPlayback,
} from "@/lib/playback-log";

Artplayer.FULLSCREEN_WEB_IN_BODY = false;

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
  /** 0 = 自动，其余为 B 站 qn */
  selectedQn?: number;
  onQualityChange: (qn: number) => void;
  onError?: (
    message: string,
    kind?: "stall" | "decode" | "other",
    detail?: string,
  ) => void;
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
/** 仅提示；超时后由页面自动换线路，避免一直转圈 */
const STALL_TIMEOUT_MS = 10000;
const DASH_STALL_TIMEOUT_MS = 15000;

export function VideoPlayer({
  playInfo,
  aid,
  bvid,
  cid,
  poster,
  active = true,
  initialTime,
  reloadKey = 0,
  selectedQn = BILI_AUTO_QN,
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
      // 缓冲不足时强行 seek 容易一直转圈
      const media = art.video as HTMLVideoElement | undefined;
      if (media && media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        return;
      }

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

    let stallReported = false;
    let stallTimer = 0;
    const playbackCtx = {
      bvid,
      cid,
      qn: playInfo.quality,
      format: playInfo.format,
      url: playInfo.url,
    };
    const reportStall = (
      message: string,
      extra?: unknown,
      videoEl?: HTMLVideoElement,
    ) => {
      if (stallReported) return;
      stallReported = true;
      window.clearTimeout(stallTimer);
      const media =
        videoEl ?? (artRef.current?.video as HTMLVideoElement | undefined);
      const detail = [
        `${playInfo.format.toUpperCase()} ${playInfo.qualityLabel}`,
        describeMediaError(media),
        extra ? describeDashError(extra) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      logPlayback(message, playbackCtx, extra ?? media?.error ?? null);
      onErrorRef.current?.(message, "stall", detail);
    };

    const art = new Artplayer({
      container,
      url: playInfo.url,
      poster,
      autoplay: true,
      autoSize: false,
      autoMini: false,
      setting: true,
      playbackRate: false,
      aspectRatio: true,
      fullscreen: false,
      fullscreenWeb: true,
      pip: true,
      mutex: true,
      controls: [
        createQualityControl(playInfo, selectedQn, (qn) => {
          saveCurrentProgress();
          onQualityChangeRef.current(qn);
        }),
        createPlaybackRateControl(),
        createOsFullscreenControl(),
      ],
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
          if (playInfo.dash) {
            const stop = attachBiliDash(video, playInfo.dash, (message) => {
              reportStall(message, undefined, video);
            });
            player.on("destroy", stop);
            return;
          }

          if (!dashjs.supportsMediaSource()) {
            onErrorRef.current?.("当前环境不支持 DASH 播放");
            return;
          }

          const dashPlayer = dashjs.MediaPlayer().create();
          dashPlayer.updateSettings({
            streaming: {
              abr: { autoSwitchBitrate: { video: false, audio: false } },
              cacheInitSegments: true,
              buffer: {
                fastSwitchEnabled: true,
                stableBufferTime: 3,
                bufferTimeAtTopQuality: 6,
                bufferTimeAtTopQualityLongForm: 8,
              },
              retryAttempts: {
                MediaSegment: 2,
                InitializationSegment: 2,
                IndexSegment: 2,
                BitstreamSwitchingSegment: 1,
                FragmentInfoSegment: 1,
              },
              retryIntervals: {
                MediaSegment: 500,
                InitializationSegment: 500,
                IndexSegment: 500,
                BitstreamSwitchingSegment: 500,
                FragmentInfoSegment: 500,
              },
            },
          });

          const onDashError = (event: unknown) => {
            const text = describeDashError(event);
            logPlayback("dash.js error", playbackCtx, event);
            if (/download|fragment|network/i.test(text)) return;
            reportStall(
              "视频流加载失败，可点刷新重试或切换清晰度",
              event,
              video,
            );
          };
          dashPlayer.on(dashjs.MediaPlayer.events.ERROR, onDashError);

          let blobUrl = "";
          const startDash = (manifestUrl: string) => {
            dashPlayer.initialize(video, manifestUrl, player.option.autoplay);
          };

          // data: MPD 在 dash.js 里 Range 请求容易卡住，转成 blob 更稳
          if (url.startsWith("data:")) {
            void fetch(url)
              .then((res) => res.blob())
              .then((blob) => {
                blobUrl = URL.createObjectURL(
                  new Blob([blob], { type: "application/dash+xml" }),
                );
                startDash(blobUrl);
              })
              .catch((error) => {
                reportStall("DASH 清单解析失败", error, video);
              });
          } else {
            startDash(url);
          }

          player.on("destroy", () => {
            try {
              dashPlayer.off(dashjs.MediaPlayer.events.ERROR, onDashError);
            } catch {
              // ignore
            }
            try {
              dashPlayer.reset();
            } catch {
              // ignore
            }
            if (blobUrl) URL.revokeObjectURL(blobUrl);
          });
        },
      },
      settings: [],
      plugins: [
        artplayerPluginDanmuku({
          danmuku: async () => {
            // 先让视频抢带宽开播，弹幕稍后再拉
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            try {
              return await window.biliDesk.bili.getDanmakuList(cid);
            } catch {
              // 弹幕失败不打断播放
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
          heatmap: false,
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
      if (playInfo.format === "dash") return;
      reportStall("视频加载失败，可点刷新重试或切换清晰度");
    });

    stallTimer = window.setTimeout(
      () => {
        const media = art.video as HTMLVideoElement | undefined;
        const stuck =
          !media ||
          (media.currentTime < 0.2 &&
            media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
        if (stuck) {
          reportStall("视频缓冲超时，可点右上角刷新或切换清晰度后重试");
        }
      },
      playInfo.format === "dash" ? DASH_STALL_TIMEOUT_MS : STALL_TIMEOUT_MS,
    );

    let seekTimer: number | null = null;
    art.on("video:playing", () => {
      window.clearTimeout(stallTimer);
      if (seekTimer != null) window.clearTimeout(seekTimer);
      seekTimer = window.setTimeout(() => trySeekToProgress(art), 500);
    });

    art.on("video:timeupdate", () => {
      if (art.currentTime > 0.2) {
        window.clearTimeout(stallTimer);
      }
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
      window.clearTimeout(stallTimer);
      if (seekTimer != null) window.clearTimeout(seekTimer);
      accumulateRealtime();
      stopHeartbeat();
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      if (!art.paused) {
        reportHeartbeat(2);
      }
      artRef.current = null;
      const media = art.video as HTMLVideoElement | undefined;
      try {
        art.pause();
      } catch {
        // ignore
      }
      try {
        media?.pause();
      } catch {
        // ignore
      }
      art.destroy();
    };
  }, [
    playInfo.url,
    playInfo.format,
    playInfo.quality,
    selectedQn,
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
      void window.biliDesk.app.setFullscreen(false);
      setOsFullscreenLayout(false);
      if (art.fullscreenWeb) art.fullscreenWeb = false;
      try {
        art.pause();
      } catch {
        // ignore
      }
      const media = art.video as HTMLVideoElement | undefined;
      try {
        media?.pause();
      } catch {
        // ignore
      }
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
    <div className="bili-player-stage relative aspect-video w-full bg-black">
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
