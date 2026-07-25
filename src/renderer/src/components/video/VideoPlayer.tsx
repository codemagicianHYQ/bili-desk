import { useEffect, useRef } from "react";
import Artplayer from "artplayer";
import flvjs from "flv.js";
import dashjs from "dashjs";
import type { VideoPlayInfo } from "@shared/types";
import { createPlaybackRateControl } from "@/components/video/playback-rate-setting";
import {
  getPlaybackProgress,
  savePlaybackProgress,
} from "@/lib/playback-progress";

interface VideoPlayerProps {
  playInfo: VideoPlayInfo;
  bvid: string;
  cid: number;
  poster?: string;
  active?: boolean;
  reloadKey?: number;
  onQualityChange: (qn: number) => void;
  onError?: (message: string) => void;
}

function resolvePlayerType(format: VideoPlayInfo["format"]): string {
  if (format === "flv") return "flv";
  if (format === "dash") return "mpd";
  return "mp4";
}

const SAVE_INTERVAL_MS = 3000;

export function VideoPlayer({
  playInfo,
  bvid,
  cid,
  poster,
  active = true,
  reloadKey = 0,
  onQualityChange,
  onError,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const resumeOnActiveRef = useRef(false);
  const hasSeekedRef = useRef(false);
  const lastSaveAtRef = useRef(0);
  const onQualityChangeRef = useRef(onQualityChange);
  const onErrorRef = useRef(onError);

  onQualityChangeRef.current = onQualityChange;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    hasSeekedRef.current = false;
    lastSaveAtRef.current = 0;

    const pendingSeek = getPlaybackProgress(bvid, cid);

    const saveCurrentProgress = () => {
      const art = artRef.current;
      if (!art || !art.duration) return;
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
    };

    const trySeekToProgress = (art: Artplayer) => {
      if (hasSeekedRef.current || pendingSeek == null) return;
      if (!art.duration || art.duration <= 0) return;

      const target = Math.min(pendingSeek, Math.max(0, art.duration - 1));
      if (target >= 5) {
        art.currentTime = target;
        hasSeekedRef.current = true;
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
              saveCurrentProgress();
              onQualityChangeRef.current(qn);
            }
            return item.html;
          },
        },
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

    art.on("pause", () => {
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
    });

    artRef.current = art;

    return () => {
      savePlaybackProgress(bvid, cid, art.currentTime, art.duration);
      artRef.current = null;
      art.destroy();
    };
  }, [
    playInfo.url,
    playInfo.format,
    playInfo.quality,
    playInfo.qualities,
    poster,
    bvid,
    cid,
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

  return <div ref={containerRef} className="aspect-video w-full bg-black" />;
}
