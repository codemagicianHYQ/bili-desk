import { useEffect, useRef } from "react";
import Artplayer from "artplayer";
import flvjs from "flv.js";
import dashjs from "dashjs";
import type { VideoPlayInfo } from "@shared/types";
import { createPlaybackRateControl } from "@/components/video/playback-rate-setting";

interface VideoPlayerProps {
  playInfo: VideoPlayInfo;
  poster?: string;
  active?: boolean;
  onQualityChange: (qn: number) => void;
  onError?: (message: string) => void;
}

function resolvePlayerType(format: VideoPlayInfo["format"]): string {
  if (format === "flv") return "flv";
  if (format === "dash") return "mpd";
  return "mp4";
}

export function VideoPlayer({
  playInfo,
  poster,
  active = true,
  onQualityChange,
  onError,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const resumeOnActiveRef = useRef(false);
  const onQualityChangeRef = useRef(onQualityChange);
  const onErrorRef = useRef(onError);

  onQualityChangeRef.current = onQualityChange;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
      theme: "#fb7299",
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
              onQualityChangeRef.current(qn);
            }
            return item.html;
          },
        },
      ],
    });

    art.on("video:error", () => {
      onErrorRef.current?.("视频加载失败，请切换清晰度或稍后重试");
    });

    artRef.current = art;

    return () => {
      artRef.current = null;
      art.destroy();
    };
  }, [
    playInfo.url,
    playInfo.format,
    playInfo.quality,
    playInfo.qualities,
    poster,
  ]);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return;

    if (!active) {
      resumeOnActiveRef.current = !art.paused;
      art.pause();
      return;
    }

    if (resumeOnActiveRef.current) {
      resumeOnActiveRef.current = false;
      void art.play().catch(() => {});
    }
  }, [active]);

  return <div ref={containerRef} className="aspect-video w-full bg-black" />;
}
