import { useEffect, useRef } from "react";
import Artplayer from "artplayer";
import flvjs from "flv.js";
import type { LivePlayInfo } from "@shared/types";
import { cn } from "@/lib/utils";

interface LivePlayerProps {
  playInfo: LivePlayInfo;
  poster?: string;
  className?: string;
  onQualityChange: (qn: number) => void;
  onError?: (message: string) => void;
  /** 首连 NetworkError 重试耗尽后，请父组件换新流地址 */
  onRequestReload?: () => void;
}

function playerThemeColor(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  return raw ? `hsl(${raw})` : "#fb7299";
}

function destroyFlvPlayer(
  flvPlayer: flvjs.Player | null,
  video?: HTMLVideoElement | null,
): void {
  if (flvPlayer) {
    try {
      flvPlayer.pause();
    } catch {
      // ignore
    }
    try {
      flvPlayer.unload();
    } catch {
      // ignore
    }
    try {
      flvPlayer.detachMediaElement();
    } catch {
      // ignore
    }
    try {
      flvPlayer.destroy();
    } catch {
      // ignore
    }
  }

  if (video) {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      // ignore
    }
  }
}

function isTransientNetworkError(
  errorType: unknown,
  errorDetail: unknown,
): boolean {
  const type = String(errorType ?? "").toLowerCase();
  const detail = String(errorDetail ?? "").toLowerCase();
  return (
    type.includes("network") ||
    detail.includes("network") ||
    detail.includes("exception") ||
    detail.includes("unreachable") ||
    detail.includes("timeout") ||
    detail.includes("http")
  );
}

export function LivePlayer({
  playInfo,
  poster,
  className,
  onQualityChange,
  onError,
  onRequestReload,
}: LivePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const flvRef = useRef<flvjs.Player | null>(null);
  const onQualityChangeRef = useRef(onQualityChange);
  const onErrorRef = useRef(onError);
  const onRequestReloadRef = useRef(onRequestReload);

  onQualityChangeRef.current = onQualityChange;
  onErrorRef.current = onError;
  onRequestReloadRef.current = onRequestReload;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let localRetry = 0;
    const maxLocalRetry = 2;

    const clearRetryTimer = () => {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    };

    const bindFlv = (
      video: HTMLVideoElement,
      url: string,
      player: Artplayer,
    ) => {
      if (!flvjs.isSupported()) {
        onErrorRef.current?.("当前环境不支持 FLV 直播播放");
        return;
      }

      destroyFlvPlayer(flvRef.current, video);
      flvRef.current = null;

      const flvPlayer = flvjs.createPlayer(
        {
          type: "flv",
          url,
          isLive: true,
          hasAudio: true,
          hasVideo: true,
          cors: true,
          withCredentials: false,
        },
        {
          enableWorker: false,
          enableStashBuffer: true,
          stashInitialSize: 384,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
          fixAudioTimestampGap: true,
        },
      );

      flvRef.current = flvPlayer;

      flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
        if (disposed) return;

        // 首连 CDN/握手偶发失败：同址重连一两次（用户二次进房往往就好）
        if (
          localRetry < maxLocalRetry &&
          isTransientNetworkError(errorType, errorDetail)
        ) {
          localRetry += 1;
          clearRetryTimer();
          retryTimer = setTimeout(() => {
            if (disposed) return;
            bindFlv(video, url, player);
          }, 400 * localRetry);
          return;
        }

        // 本地重试耗尽：请父级换新签名流地址
        if (isTransientNetworkError(errorType, errorDetail)) {
          onRequestReloadRef.current?.();
          return;
        }

        onErrorRef.current?.(
          `直播流异常（${String(errorType)}: ${String(errorDetail)}），请切换清晰度或刷新`,
        );
      });

      flvPlayer.attachMediaElement(video);
      flvPlayer.load();

      const tryPlay = () => {
        if (disposed) return;
        void video.play().catch(() => undefined);
      };
      video.addEventListener("loadedmetadata", tryPlay, { once: true });
      video.addEventListener("canplay", tryPlay, { once: true });

      player.on("destroy", () => {
        if (flvRef.current === flvPlayer) {
          flvRef.current = null;
        }
        destroyFlvPlayer(flvPlayer, video);
      });
    };

    const art = new Artplayer({
      container,
      url: playInfo.url,
      poster,
      autoplay: true,
      isLive: true,
      autoSize: false,
      autoMini: false,
      setting: true,
      playbackRate: false,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      pip: false,
      mutex: true,
      theme: playerThemeColor(),
      lang: "zh-cn",
      type: playInfo.format === "flv" ? "flv" : "m3u8",
      customType: {
        flv(video, url, player) {
          bindFlv(video, url, player);
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
              onQualityChangeRef.current(qn);
            }
            return item.html;
          },
        },
      ],
    });

    art.on("error", () => {
      if (!disposed) {
        if (localRetry < maxLocalRetry) {
          localRetry += 1;
          clearRetryTimer();
          retryTimer = setTimeout(() => {
            if (disposed) return;
            onRequestReloadRef.current?.();
          }, 400 * localRetry);
          return;
        }
        onErrorRef.current?.("直播播放失败，请尝试切换清晰度或刷新");
      }
    });

    artRef.current = art;

    return () => {
      disposed = true;
      clearRetryTimer();
      const video = art.video as HTMLVideoElement | undefined;
      const flvPlayer = flvRef.current;
      flvRef.current = null;
      artRef.current = null;

      try {
        art.pause();
      } catch {
        // ignore
      }

      try {
        art.destroy(true);
      } catch {
        // ignore
      }

      destroyFlvPlayer(flvPlayer, video);
    };
  }, [playInfo.url, playInfo.quality, playInfo.format, poster]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "aspect-video w-full overflow-hidden rounded-xl bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-contain",
        className,
      )}
    />
  );
}
