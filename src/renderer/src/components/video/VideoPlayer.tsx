import { useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import Artplayer from "artplayer";
import artplayerPluginDanmuku from "artplayer-plugin-danmuku";
import flvjs from "flv.js";
import dashjs from "dashjs";
import type { VideoPlayInfo, VideoSubtitleTrack } from "@shared/types";
import { attachBiliDash } from "@/components/video/dash-mse";
import {
  readPlaybackRate,
  readPlaybackVolume,
  writePlaybackVolume,
} from "@/components/video/playback-pref";
import { createPlaybackRateControl } from "@/components/video/playback-rate-setting";
import {
  bindPlayerResize,
  createOsFullscreenControl,
  createWebFullscreenControl,
  exitPlayerFill,
} from "@/components/video/os-fullscreen-control";
import {
  flushDanmakuPref,
  readDanmakuPref,
  writeDanmakuPref,
} from "@/components/video/danmaku-pref";
import { createQualityControl } from "@/components/video/quality-setting";
import {
  applyArtSubtitle,
  createSubtitleBlobUrl,
  createSubtitleControl,
  pickSubtitleTrack,
} from "@/components/video/subtitle-control";
import {
  matchSubtitleTrack,
  resolveSubtitleChoice,
} from "@/components/video/subtitle-pref";
import {
  attachPlayerHotkeys,
  createSeekStepSetting,
} from "@/components/video/player-hotkeys";
import { BILI_AUTO_QN } from "@shared/utils/bilibili-quality";
import { danmakuBlocked } from "@/components/video/danmaku-match";
import { CommandDanmakuOverlay } from "@/components/video/CommandDanmakuOverlay";
import {
  loadPlayerThumbnails,
  type PlayerThumbnails,
} from "@/components/video/video-snapshot";
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
Artplayer.DBCLICK_FULLSCREEN = false;

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
  /** CC / AI 字幕轨（已转 WebVTT） */
  subtitleTracks?: VideoSubtitleTrack[];
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
  /** 章节跳转：time 为秒，nonce 用来重复点同一章节 */
  seekAt?: { time: number; nonce: number } | null;
  /** 稿件完整时长。试看文件更短时，进度条按这个时长显示 */
  timelineDuration?: number;
  /** 试看播到片段结尾，或拖进未解锁的后半段 */
  onPreviewBoundary?: (ended: boolean) => void;
  /** 试看文件的秒数，用来标出可看区间 */
  onPreviewLength?: (seconds: number) => void;
  className?: string;
}

function formatPlayerClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s}`;
  return `${String(m).padStart(2, "0")}:${s}`;
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
  subtitleTracks = [],
  selectedQn = BILI_AUTO_QN,
  onQualityChange,
  onError,
  onWatchFromStart,
  seekAt = null,
  timelineDuration,
  onPreviewBoundary,
  onPreviewLength,
  className,
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
  const onPreviewBoundaryRef = useRef(onPreviewBoundary);
  const onPreviewLengthRef = useRef(onPreviewLength);
  const incognitoMode = useAppStore((state) => state.incognitoMode);
  const userLoggedIn = useAppStore((state) => Boolean(state.user?.isLogin));
  const incognitoRef = useRef(incognitoMode);
  const loggedInRef = useRef(userLoggedIn);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [resumeTipAt, setResumeTipAt] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  onQualityChangeRef.current = onQualityChange;
  onErrorRef.current = onError;
  onWatchFromStartRef.current = onWatchFromStart;
  onPreviewBoundaryRef.current = onPreviewBoundary;
  onPreviewLengthRef.current = onPreviewLength;
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

    const archiveDuration = (art: Artplayer) => {
      const media = art.duration || 0;
      if (timelineDuration && media > 1 && timelineDuration > media + 8) {
        return timelineDuration;
      }
      return media;
    };
    const isPreview = (art: Artplayer) => {
      const media = art.duration || 0;
      return Boolean(
        timelineDuration && media > 1 && timelineDuration > media + 8,
      );
    };
    const saveCurrentProgress = () => {
      const art = artRef.current;
      if (!art || !art.duration) return;
      savePlaybackProgress(bvid, cid, art.currentTime, archiveDuration(art));
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
      const duration = Math.max(0, Math.floor(archiveDuration(art)));
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
        savePlaybackProgress(bvid, cid, target, archiveDuration(art));
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

    const subtitleChoice = resolveSubtitleChoice(bvid);
    const preferredSubtitle = matchSubtitleTrack(
      subtitleTracks,
      subtitleChoice,
      pickSubtitleTrack,
    );
    const showSubtitle = subtitleChoice.enabled && Boolean(preferredSubtitle);
    let subtitleBlobUrl = "";
    if (preferredSubtitle) {
      subtitleBlobUrl = createSubtitleBlobUrl(preferredSubtitle.vtt);
    }
    const subtitleTrackUrls = new Map<number, string>();
    if (preferredSubtitle && subtitleBlobUrl) {
      subtitleTrackUrls.set(preferredSubtitle.id, subtitleBlobUrl);
    }

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
      fullscreenWeb: false,
      pip: true,
      mutex: true,
      hotkey: false,
      controls: [
        ...(subtitleTracks.length > 0
          ? [createSubtitleControl(subtitleTracks, subtitleTrackUrls, bvid)]
          : []),
        createQualityControl(playInfo, selectedQn, (qn) => {
          saveCurrentProgress();
          onQualityChangeRef.current(qn);
        }),
        createPlaybackRateControl(),
        createWebFullscreenControl(),
        createOsFullscreenControl(),
      ],
      theme: playerThemeColor(),
      lang: "zh-cn",
      type: resolvePlayerType(playInfo.format),
      ...(preferredSubtitle && showSubtitle
        ? {
            subtitle: {
              url: subtitleBlobUrl,
              type: "vtt",
              encoding: "utf-8",
              escape: true,
              name: preferredSubtitle.lanDoc || preferredSubtitle.lan || "字幕",
              style: {
                color: "#fff",
                fontSize: "20px",
                textShadow: "0 1px 2px rgba(0,0,0,.85)",
              },
            },
          }
        : {}),
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
      settings: [createSeekStepSetting()],
      plugins: [
        artplayerPluginDanmuku({
          ...readDanmakuPref(),
          danmuku: async () => {
            // 先让视频抢带宽开播，弹幕稍后再拉
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            try {
              const [list, filters] = await Promise.all([
                window.biliDesk.bili.getDanmakuList(cid),
                window.biliDesk.bili.getDanmakuFilters().catch(() => []),
              ]);
              if (filters.length === 0) return list;
              return list.filter((item) => !danmakuBlocked(item, filters));
            } catch {
              // 弹幕失败不打断播放
              return [];
            }
          },
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
              const message = formatDisplayedError(
                error,
                undefined,
                "发送弹幕失败",
              );
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
    let nearEndWaitTimer = 0;
    let playbackFinished = false;
    const finishPlayback = () => {
      if (playbackFinished) return;
      if (isPreview(art)) {
        savePlaybackProgress(bvid, cid, art.currentTime, archiveDuration(art));
        reportHeartbeat(0);
        stopHeartbeat();
        onPreviewBoundaryRef.current?.(true);
        return;
      }
      playbackFinished = true;
      window.clearTimeout(nearEndWaitTimer);
      accumulateRealtime();
      lastTickAt = 0;
      stopHeartbeat();
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      reportHeartbeat(0, { finished: true });
    };

    art.on("video:playing", () => {
      window.clearTimeout(stallTimer);
      window.clearTimeout(nearEndWaitTimer);
      if (seekTimer != null) window.clearTimeout(seekTimer);
      seekTimer = window.setTimeout(() => trySeekToProgress(art), 500);
    });

    let previewEndedFlag = false;
    let sentPreviewLength = 0;
    let draggingPreview = false;
    let dragSeekTimer = 0;
    let dragMove: ((ev: PointerEvent) => void) | null = null;
    let dragUp: ((ev: PointerEvent) => void) | null = null;
    let dragRect: DOMRect | null = null;
    const progressBar = container.querySelector<HTMLElement>(
      ".art-control-progress",
    );
    const setPreviewEnded = (ended: boolean) => {
      if (previewEndedFlag === ended) return;
      previewEndedFlag = ended;
      onPreviewBoundaryRef.current?.(ended);
    };
    const previewNodes: {
      time?: HTMLElement;
      range?: HTMLElement;
      cap?: HTMLElement;
      loaded?: HTMLElement;
      played?: HTMLElement;
      indicator?: HTMLElement;
      ready: boolean;
    } = { ready: false };
    const ensurePreviewNodes = () => {
      if (previewNodes.ready) return;
      const inner = container.querySelector<HTMLElement>(
        ".art-control-progress-inner",
      );
      if (!inner) return;
      inner.style.position = "relative";
      let range = inner.querySelector<HTMLElement>(".bili-preview-range");
      if (!range) {
        range = document.createElement("div");
        range.className = "bili-preview-range";
        range.style.cssText =
          "position:absolute;left:0;top:0;height:100%;background:#f5a623;pointer-events:none;z-index:1;";
        inner.prepend(range);
      }
      let cap = inner.querySelector<HTMLElement>(".bili-preview-cap");
      if (!cap) {
        cap = document.createElement("div");
        cap.className = "bili-preview-cap";
        cap.style.cssText =
          "position:absolute;top:-4px;width:3px;height:calc(100% + 8px);background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.65);pointer-events:none;z-index:4;";
        inner.appendChild(cap);
      }
      const loaded = container.querySelector<HTMLElement>(
        ".art-progress-loaded",
      );
      if (loaded) loaded.style.background = "transparent";
      previewNodes.time = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".art-controls-left .art-control",
        ),
      ).find((node) => /^\d+:\d+/.test(node.textContent?.trim() ?? ""));
      previewNodes.range = range;
      previewNodes.cap = cap;
      previewNodes.loaded = loaded ?? undefined;
      previewNodes.played =
        container.querySelector<HTMLElement>(".art-progress-played") ??
        undefined;
      previewNodes.indicator =
        container.querySelector<HTMLElement>(".art-progress-indicator") ??
        undefined;
      if (previewNodes.played) previewNodes.played.style.zIndex = "2";
      if (previewNodes.indicator) previewNodes.indicator.style.zIndex = "5";
      previewNodes.ready = true;
    };
    const paintPreviewTimeline = (displaySeconds?: number) => {
      if (!isPreview(art) || !timelineDuration) return;
      if (draggingPreview && displaySeconds == null) return;
      ensurePreviewNodes();
      const media = art.duration || 0;
      const full = timelineDuration;
      const current = Math.min(
        displaySeconds ?? art.currentTime ?? 0,
        media || full,
      );
      const previewRatio = Math.min(0.995, Math.max(0.01, media / full));
      const playedRatio = Math.min(previewRatio, Math.max(0, current / full));
      const playedWidth = `${playedRatio * 100}%`;
      const rangeWidth = `${previewRatio * 100}%`;
      if (previewNodes.range) previewNodes.range.style.width = rangeWidth;
      if (previewNodes.cap) {
        previewNodes.cap.style.left = `calc(${previewRatio * 100}% - 1px)`;
      }
      if (previewNodes.loaded) previewNodes.loaded.style.width = rangeWidth;
      if (previewNodes.played) previewNodes.played.style.width = playedWidth;
      if (previewNodes.indicator)
        previewNodes.indicator.style.left = playedWidth;
      const timeText = `${formatPlayerClock(current)} / ${formatPlayerClock(full)}`;
      if (previewNodes.time && previewNodes.time.textContent !== timeText) {
        previewNodes.time.textContent = timeText;
      }
      if (media > 1 && sentPreviewLength !== Math.floor(media)) {
        sentPreviewLength = Math.floor(media);
        onPreviewLengthRef.current?.(sentPreviewLength);
      }
      if (displaySeconds == null) {
        setPreviewEnded(media > 1 && current >= media - 0.4);
      }
    };
    const commitPreviewSeek = (target: number, endIfLocked: boolean) => {
      const media = art.duration || 0;
      if (target >= media - 0.3) {
        art.currentTime = Math.max(0, media - 0.05);
        if (endIfLocked) art.pause();
        setPreviewEnded(true);
      } else {
        art.currentTime = target;
        setPreviewEnded(false);
      }
    };
    const seekPreview = (clientX: number, endIfLocked: boolean) => {
      if (!isPreview(art) || !timelineDuration) return;
      const bar = progressBar;
      if (!bar) return;
      const rect = dragRect ?? bar.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      const target = ratio * timelineDuration;
      const media = art.duration || 0;
      const shown = Math.min(target, Math.max(0, media - 0.05));
      paintPreviewTimeline(shown);
      if (!endIfLocked) {
        // 拖动过程只改进度条。每次改 currentTime 都会让弹幕重排
        window.clearTimeout(dragSeekTimer);
        dragSeekTimer = window.setTimeout(() => {
          if (!draggingPreview) return;
          commitPreviewSeek(target, false);
        }, 220);
        return;
      }
      window.clearTimeout(dragSeekTimer);
      dragSeekTimer = 0;
      draggingPreview = false;
      commitPreviewSeek(target, true);
      paintPreviewTimeline();
    };

    art.on("video:timeupdate", () => {
      if (art.currentTime > 0.2) {
        window.clearTimeout(stallTimer);
      }
      const t = art.currentTime || 0;
      setCurrentTime((prev) => (Math.abs(prev - t) >= 0.25 ? t : prev));
      if (!draggingPreview) paintPreviewTimeline();
      const now = Date.now();
      if (now - lastSaveAtRef.current < SAVE_INTERVAL_MS) return;
      lastSaveAtRef.current = now;
      savePlaybackProgress(bvid, cid, art.currentTime, archiveDuration(art));
    });
    art.on("video:loadedmetadata", () => {
      if (!isPreview(art)) return;
      onPreviewLengthRef.current?.(Math.max(1, Math.floor(art.duration || 0)));
      paintPreviewTimeline();
    });
    art.on("setBar", (type: string, percentage: number) => {
      if (draggingPreview || !isPreview(art) || !timelineDuration) return;
      if (type === "hover") {
        const tip = container.querySelector<HTMLElement>(".art-progress-tip");
        const media = art.duration || 0;
        const hoverSeconds = Math.min(
          timelineDuration,
          percentage * timelineDuration,
        );
        if (tip) {
          tip.textContent =
            hoverSeconds > media + 0.5
              ? `${formatPlayerClock(hoverSeconds)} · 试看至 ${formatPlayerClock(media)}`
              : formatPlayerClock(hoverSeconds);
        }
        return;
      }
      if (type !== "played") return;
      paintPreviewTimeline();
    });
    const stopArtSeek = (event: Event) => {
      if (!isPreview(art)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onProgressPointerDown = (event: PointerEvent) => {
      if (!isPreview(art) || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      draggingPreview = true;
      dragRect = progressBar?.getBoundingClientRect() ?? null;
      seekPreview(event.clientX, false);
      if (dragMove) window.removeEventListener("pointermove", dragMove);
      if (dragUp) window.removeEventListener("pointerup", dragUp);
      dragMove = (ev: PointerEvent) => seekPreview(ev.clientX, false);
      dragUp = (ev: PointerEvent) => {
        seekPreview(ev.clientX, true);
        dragRect = null;
        if (dragMove) window.removeEventListener("pointermove", dragMove);
        if (dragUp) window.removeEventListener("pointerup", dragUp);
        dragMove = null;
        dragUp = null;
      };
      window.addEventListener("pointermove", dragMove);
      window.addEventListener("pointerup", dragUp);
    };
    progressBar?.addEventListener("pointerdown", onProgressPointerDown, true);
    progressBar?.addEventListener("mousedown", stopArtSeek, true);
    progressBar?.addEventListener("click", stopArtSeek, true);

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

    art.on("video:ended", finishPlayback);

    art.on("video:waiting", () => {
      window.clearTimeout(nearEndWaitTimer);
      const media = art.video as HTMLVideoElement | undefined;
      if (!media || playbackFinished) return;
      const duration = media.duration || art.duration || 0;
      const current = media.currentTime || 0;
      if (!(duration > 5 && current >= duration - 1.5)) return;
      nearEndWaitTimer = window.setTimeout(() => {
        if (playbackFinished) return;
        if ((media.currentTime || 0) < duration - 1.5) return;
        try {
          media.pause();
        } catch {
          // ignore
        }
        finishPlayback();
        media.dispatchEvent(new Event("ended"));
      }, 800);
    });

    artRef.current = art;
    let disposed = false;
    void loadPlayerThumbnails(bvid, cid).then((thumbnails) => {
      if (disposed || !thumbnails) return;
      (art as unknown as { thumbnails: PlayerThumbnails }).thumbnails =
        thumbnails;
    });
    const applySavedPlayback = () => {
      const rate = readPlaybackRate();
      if (Math.abs((art.playbackRate || 1) - rate) > 0.001) {
        art.playbackRate = rate;
      }
      const savedVolume = readPlaybackVolume();
      if (
        savedVolume != null &&
        Math.abs((art.volume ?? 1) - savedVolume) > 0.001
      ) {
        art.volume = savedVolume;
      }
    };
    applySavedPlayback();
    art.on("ready", applySavedPlayback);
    art.on("video:loadedmetadata", applySavedPlayback);
    art.on("video:volume", () => {
      writePlaybackVolume(art.volume);
    });
    art.on("artplayerPluginDanmuku:config", (option) => {
      writeDanmakuPref(option);
    });
    const unbindResize = bindPlayerResize(art, container);
    const unbindHotkeys = attachPlayerHotkeys(art, () => activeRef.current);
    if (playInfo.qualityNotice) {
      art.notice.show = playInfo.qualityNotice;
    }

    return () => {
      disposed = true;
      progressBar?.removeEventListener(
        "pointerdown",
        onProgressPointerDown,
        true,
      );
      progressBar?.removeEventListener("mousedown", stopArtSeek, true);
      progressBar?.removeEventListener("click", stopArtSeek, true);
      window.clearTimeout(dragSeekTimer);
      if (dragMove) window.removeEventListener("pointermove", dragMove);
      if (dragUp) window.removeEventListener("pointerup", dragUp);
      unbindHotkeys();
      unbindResize();
      window.clearTimeout(stallTimer);
      window.clearTimeout(nearEndWaitTimer);
      if (seekTimer != null) window.clearTimeout(seekTimer);
      accumulateRealtime();
      stopHeartbeat();
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      if (!art.paused) {
        reportHeartbeat(2);
      }
      artRef.current = null;
      flushDanmakuPref();
      if (subtitleBlobUrl) URL.revokeObjectURL(subtitleBlobUrl);
      for (const url of subtitleTrackUrls.values()) {
        if (url !== subtitleBlobUrl) URL.revokeObjectURL(url);
      }
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
    timelineDuration,
  ]);

  useEffect(() => {
    const art = artRef.current;
    if (!art || !seekAt) return;
    try {
      art.currentTime = seekAt.time;
      void art.play();
    } catch {
      // 播放器还没就绪
    }
  }, [seekAt]);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return;

    const createdUrls: string[] = [];
    const trackUrls = new Map<number, string>();

    const sync = async () => {
      try {
        art.controls.remove("bili-subtitle");
      } catch {
        // 尚未添加过
      }

      if (subtitleTracks.length === 0) {
        try {
          art.subtitle.show = false;
        } catch {
          // ignore
        }
        return;
      }

      for (const track of subtitleTracks) {
        const url = createSubtitleBlobUrl(track.vtt);
        createdUrls.push(url);
        trackUrls.set(track.id, url);
      }

      art.controls.add(createSubtitleControl(subtitleTracks, trackUrls, bvid));

      const choice = resolveSubtitleChoice(bvid);
      const preferred = matchSubtitleTrack(
        subtitleTracks,
        choice,
        pickSubtitleTrack,
      );
      if (!preferred || !choice.enabled) return;
      const url = trackUrls.get(preferred.id);
      if (!url) return;
      try {
        await applyArtSubtitle(art, preferred, url, true);
      } catch {
        // ignore
      }
    };

    void sync();

    return () => {
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [subtitleTracks, cid, bvid, reloadKey]);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return;

    if (!active) {
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      resumeOnActiveRef.current = !art.paused;
      exitPlayerFill(art);
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
    <div
      className={cn(
        "bili-player-stage relative bg-black",
        className ?? "aspect-video w-full",
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      <CommandDanmakuOverlay aid={aid} cid={cid} currentTime={currentTime} />
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
