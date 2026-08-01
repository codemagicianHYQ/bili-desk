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

export function LivePlayer({
  playInfo,
  poster,
  className,
  onQualityChange,
  onError,
}: LivePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const flvRef = useRef<flvjs.Player | null>(null);
  const onQualityChangeRef = useRef(onQualityChange);
  const onErrorRef = useRef(onError);

  onQualityChangeRef.current = onQualityChange;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

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
          if (!flvjs.isSupported()) {
            onErrorRef.current?.("当前环境不支持 FLV 直播播放");
            return;
          }

          // 先清掉可能残留的旧实例，避免叠音
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
            },
            {
              enableWorker: false,
              enableStashBuffer: false,
              stashInitialSize: 128,
              lazyLoad: false,
              autoCleanupSourceBuffer: true,
            },
          );

          flvRef.current = flvPlayer;

          flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
            if (disposed) return;
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
        onErrorRef.current?.("直播播放失败，请尝试切换清晰度或刷新");
      }
    });

    artRef.current = art;

    return () => {
      disposed = true;
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

      // destroy 事件若未触发，这里兜底杀掉 flv / 静音源
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
