import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  VideoDetail,
  VideoPlayInfo,
  VideoSubtitleTrack,
} from "@shared/types";
import { Button } from "@/components/ui/button";
import { formatCount, formatPubdate } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { UpOwnerCard } from "@/components/video/UpOwnerCard";
import { VideoActionBar } from "@/components/video/VideoActionBar";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { VideoCommentSection } from "@/features/video/VideoCommentSection";
import { RelatedVideosPanel } from "@/features/video/RelatedVideosPanel";
import { VideoTagList } from "@/components/video/VideoTagList";
import { VideoPlaylistPanel } from "@/components/video/VideoPlaylistPanel";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { videoDetailCache } from "@/lib/session-data-cache";
import {
  readQualityPref,
  writeQualityPref,
} from "@/components/video/quality-pref";
import { ArrowUp } from "lucide-react";

interface VideoPageProps {
  bvid: string;
  active?: boolean;
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function VideoPage({ bvid, active = true }: VideoPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [playInfo, setPlayInfo] = useState<VideoPlayInfo | null>(null);
  const [selectedCid, setSelectedCid] = useState<number | null>(null);
  const [quality, setQuality] = useState(readQualityPref);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [playError, setPlayError] = useState("");
  const [playErrorDetail, setPlayErrorDetail] = useState("");
  const [resumeCancelled, setResumeCancelled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [onlineLabel, setOnlineLabel] = useState("");
  const [subtitles, setSubtitles] = useState<VideoSubtitleTrack[]>([]);
  const playRequestIdRef = useRef(0);
  const streamModeRef = useRef<"mp4" | "dash">("mp4");
  const loweredQnRef = useRef(false);
  const skipQualityFetchRef = useRef(false);

  const resumeCid = useMemo(
    () => parsePositiveInt(searchParams.get("cid")),
    [searchParams],
  );
  const resumeTimeRaw = useMemo(() => {
    const t = Number(searchParams.get("t"));
    return Number.isFinite(t) && t >= 5 ? t : undefined;
  }, [searchParams]);

  useEffect(() => {
    setResumeCancelled(false);
  }, [bvid, resumeCid, resumeTimeRaw]);

  const initialTime = useMemo(() => {
    if (resumeCancelled) return undefined;
    if (resumeTimeRaw == null || !selectedCid || !video) return undefined;
    if (resumeCid != null) {
      return resumeCid === selectedCid ? resumeTimeRaw : undefined;
    }
    // 未指定分 P 时，只对默认第一 P 续播，避免切 P 误跳
    return selectedCid === video.pages[0]?.cid ? resumeTimeRaw : undefined;
  }, [resumeCancelled, resumeCid, resumeTimeRaw, selectedCid, video]);

  const applyPlayInfo = useCallback(
    (info: VideoPlayInfo, requestedQn?: number) => {
      setPlayInfo(info);
      setPlayError("");
      setPlayErrorDetail("");
      if (
        info.qualityDenied &&
        requestedQn != null &&
        requestedQn !== info.quality
      ) {
        writeQualityPref(info.quality);
        skipQualityFetchRef.current = true;
        setQuality(info.quality);
      }
    },
    [],
  );

  const fetchPlayUrl = useCallback(
    (targetBvid: string, cid: number, qn?: number) => {
      const requestId = ++playRequestIdRef.current;
      return window.biliDesk.bili
        .getPlayUrl(targetBvid, cid, qn, {
          preferMp4: streamModeRef.current === "mp4",
        })
        .then((info) => {
          if (requestId !== playRequestIdRef.current) return;
          applyPlayInfo(info, qn);
        })
        .catch((e: Error) => {
          if (requestId !== playRequestIdRef.current) return;
          const message = extractIpcErrorMessage(e);
          console.warn("[BiliDesk][playurl] getPlayUrl failed", {
            bvid: targetBvid,
            cid,
            qn,
            mode: streamModeRef.current,
            message,
          });
          if (streamModeRef.current === "mp4") {
            streamModeRef.current = "dash";
            setPlayError("正在切换播放线路...");
            setPlayErrorDetail(message);
            return window.biliDesk.bili
              .getPlayUrl(targetBvid, cid, qn, { preferMp4: false })
              .then((info) => {
                if (requestId !== playRequestIdRef.current) return;
                applyPlayInfo(info, qn);
              })
              .catch((dashErr: Error) => {
                if (requestId !== playRequestIdRef.current) return;
                const dashMessage = extractIpcErrorMessage(dashErr);
                console.warn("[BiliDesk][playurl] DASH fallback failed", {
                  bvid: targetBvid,
                  cid,
                  qn,
                  message: dashMessage,
                });
                setPlayError(dashMessage);
                setPlayErrorDetail(
                  `bvid=${targetBvid} cid=${cid} qn=${qn ?? "-"} mode=dash`,
                );
              });
          }
          setPlayError(message);
          setPlayErrorDetail(
            `bvid=${targetBvid} cid=${cid} qn=${qn ?? "-"} mode=${streamModeRef.current}`,
          );
        });
    },
    [applyPlayInfo],
  );

  useEffect(() => {
    if (!bvid) return;

    setPlayError("");
    setPlayErrorDetail("");
    setPlayInfo(null);
    setReloadKey(0);
    playRequestIdRef.current += 1;
    streamModeRef.current = readQualityPref() >= 80 ? "dash" : "mp4";
    loweredQnRef.current = false;

    const cached = videoDetailCache.get(bvid);
    // 旧缓存无 ugcSeason 字段时强制重拉，避免合集列表缺失
    if (cached && "ugcSeason" in cached) {
      setVideo(cached);
      setError("");
      const preferredCid =
        resumeCid && cached.pages.some((part) => part.cid === resumeCid)
          ? resumeCid
          : (cached.pages[0]?.cid ?? null);
      setSelectedCid(preferredCid);
      return;
    }

    window.biliDesk.bili
      .getVideo(bvid)
      .then((detail) => {
        videoDetailCache.set(bvid, detail);
        setVideo(detail);
        const preferredCid =
          resumeCid && detail.pages.some((part) => part.cid === resumeCid)
            ? resumeCid
            : (detail.pages[0]?.cid ?? null);
        setSelectedCid(preferredCid);
      })
      .catch((e: Error) => setError(e.message));
  }, [bvid, resumeCid]);

  useEffect(() => {
    streamModeRef.current = readQualityPref() >= 80 ? "dash" : "mp4";
    if (loweredQnRef.current) {
      loweredQnRef.current = false;
      setQuality(readQualityPref());
    }
  }, [bvid, selectedCid]);

  useEffect(() => {
    if (!bvid || !selectedCid) return;
    if (skipQualityFetchRef.current) {
      skipQualityFetchRef.current = false;
      return;
    }
    void fetchPlayUrl(bvid, selectedCid, quality);
  }, [bvid, selectedCid, quality, fetchPlayUrl]);

  const handleQualityChange = useCallback((qn: number) => {
    writeQualityPref(qn);
    loweredQnRef.current = false;
    streamModeRef.current = qn >= 80 ? "dash" : "mp4";
    setQuality((prev) => (prev === qn ? prev : qn));
  }, []);

  const handleRefresh = useCallback(() => {
    if (!bvid || !selectedCid) return;
    streamModeRef.current = quality >= 80 ? "dash" : "mp4";
    loweredQnRef.current = false;
    setPlayInfo(null);
    setReloadKey((key) => key + 1);
    void fetchPlayUrl(bvid, selectedCid, quality);
  }, [bvid, selectedCid, quality, fetchPlayUrl]);

  useEffect(() => {
    const onRefresh = () => handleRefresh();
    window.addEventListener("bilidesk:refresh-video", onRefresh);
    return () => {
      window.removeEventListener("bilidesk:refresh-video", onRefresh);
    };
  }, [handleRefresh]);

  const handlePlayerError = useCallback(
    (message: string, kind?: "stall" | "decode" | "other", detail?: string) => {
      if (detail) setPlayErrorDetail(detail);
      if (
        (kind === "stall" || kind === "decode") &&
        bvid &&
        selectedCid &&
        playInfo
      ) {
        if (playInfo.format === "dash" && playInfo.dash) {
          if (kind === "decode") {
            loweredQnRef.current = true;
            streamModeRef.current = "mp4";
            setPlayError("1080P 解码失败，正在切换 720P...");
            setPlayInfo(null);
            setQuality(64);
            return;
          }
          setPlayError(message);
          return;
        }

        if (playInfo.format === "dash") {
          streamModeRef.current = "mp4";
          setPlayError("正在切换播放线路...");
          setPlayInfo(null);
          void fetchPlayUrl(bvid, selectedCid, quality);
          return;
        }

        if (streamModeRef.current === "mp4") {
          streamModeRef.current = "dash";
          setPlayError("正在切换播放线路...");
          setPlayInfo(null);
          void fetchPlayUrl(bvid, selectedCid, quality);
          return;
        }

        if (!loweredQnRef.current) {
          const lower = [...playInfo.qualities]
            .map((item) => item.qn)
            .filter((qn) => qn < playInfo.quality)
            .sort((a, b) => b - a)[0];
          if (lower != null) {
            loweredQnRef.current = true;
            setPlayError("正在切换较低清晰度...");
            setQuality(lower);
            return;
          }
        }
      }
      setPlayError(message);
    },
    [bvid, selectedCid, playInfo, quality, fetchPlayUrl],
  );

  const handleWatchFromStart = useCallback(() => {
    setResumeCancelled(true);
    if (!searchParams.has("t")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("t");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      setShowBackToTop(el.scrollTop > 400);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [bvid, video?.aid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setShowBackToTop(false);
    }
  }, [bvid]);

  useEffect(() => {
    if (!video?.aid || !selectedCid || !active) {
      setOnlineLabel("");
      return;
    }
    let cancelled = false;
    const pull = () => {
      void window.biliDesk.bili
        .getVideoOnlineTotal(video.aid, selectedCid, video.bvid || bvid)
        .then((info) => {
          if (cancelled) return;
          setOnlineLabel(info.total ? `${info.total} 人在看` : "");
        })
        .catch(() => {
          if (!cancelled) setOnlineLabel("");
        });
    };
    pull();
    const timer = window.setInterval(pull, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [video?.aid, video?.bvid, selectedCid, active, bvid]);

  useEffect(() => {
    if (!selectedCid || !bvid) {
      setSubtitles([]);
      return;
    }
    let cancelled = false;
    void window.biliDesk.bili
      .getVideoSubtitles(bvid, selectedCid)
      .then((tracks) => {
        if (!cancelled) setSubtitles(tracks);
      })
      .catch(() => {
        if (!cancelled) setSubtitles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bvid, selectedCid]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

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
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="scrollbar-overlay h-full overflow-x-hidden overflow-y-auto"
        >
          <div className="bili-watch-column mx-auto flex h-full w-full shrink-0 flex-col px-4 pt-3 lg:px-6">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative z-0 min-h-0 flex-1 bg-black">
                {playInfo && selectedCid ? (
                  <VideoPlayer
                    className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-contain"
                    playInfo={playInfo}
                    aid={video.aid}
                    bvid={bvid}
                    cid={selectedCid}
                    poster={video.cover}
                    active={active}
                    subtitleTracks={subtitles}
                    initialTime={initialTime}
                    reloadKey={reloadKey}
                    selectedQn={quality}
                    onQualityChange={handleQualityChange}
                    onError={handlePlayerError}
                    onWatchFromStart={handleWatchFromStart}
                  />
                ) : (
                  <div className="relative h-full w-full overflow-hidden bg-black">
                    <BiliImage
                      src={video.cover}
                      alt={video.title}
                      className="h-full w-full object-cover opacity-60"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center text-sm text-white/80">
                      <p>{playError || "正在加载播放器..."}</p>
                      {playErrorDetail && (
                        <p className="max-w-xl break-all font-mono text-xs text-white/50">
                          {playErrorDetail}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative z-20 shrink-0 space-y-2 border-t border-border px-4 py-2">
                <div className="flex min-w-0 items-start gap-3">
                  <h1 className="min-w-0 flex-1 text-sm font-semibold leading-snug break-words line-clamp-2 lg:text-base">
                    {video.title}
                  </h1>
                  <VideoActionBar
                    video={video}
                    className="shrink-0 grow-0 pt-0.5"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bili-watch-column mx-auto w-full space-y-6 px-4 py-4 lg:px-6">
            <UpOwnerCard
              mid={video.owner.mid}
              name={video.owner.name}
              face={video.owner.face}
              trailing={
                <WatchLaterButton
                  aid={video.aid}
                  bvid={video.bvid}
                  video={video}
                  variant="inline"
                />
              }
            />

            {video.staff && video.staff.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {video.staff.map((member) => (
                  <Link
                    key={`${member.mid}-${member.title}`}
                    to={`/up/${member.mid}`}
                    className="flex min-w-[140px] items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/60"
                  >
                    <BiliImage
                      src={member.face}
                      alt={member.name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {member.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {member.title}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <VideoPlaylistPanel
              bvid={video.bvid || bvid}
              selectedCid={selectedCid}
              pages={video.pages}
              ugcSeason={video.ugcSeason}
              onSelectPart={setSelectedCid}
            />

            {video.honors && video.honors.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {video.honors.map((honor) => (
                  <span
                    key={`${honor.type}-${honor.desc}`}
                    className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-300"
                  >
                    {honor.desc}
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {formatCount(video.stat.view)} 播放 ·{" "}
              {formatCount(video.stat.danmaku)} 弹幕 ·{" "}
              {formatCount(video.stat.like)} 点赞 ·{" "}
              {formatCount(video.stat.coin)} 投币 ·{" "}
              {formatCount(video.stat.favorite)} 收藏 ·{" "}
              {formatCount(video.stat.share)} 分享
              {onlineLabel ? ` · ${onlineLabel}` : ""}
              {video.pubdate > 0 ? ` · ${formatPubdate(video.pubdate)}` : ""}
              {playInfo ? ` · ${playInfo.qualityLabel}` : ""}
              {video.copyright === 1
                ? " · 自制"
                : video.copyright === 2
                  ? " · 转载"
                  : ""}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {video.desc ? <BiliEmoteText text={video.desc} /> : "暂无简介"}
            </p>
            <VideoTagList tags={video.tags} />
            {playError && playInfo && (
              <div className="space-y-1 text-sm text-red-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{playError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={handleRefresh}
                  >
                    刷新播放器
                  </Button>
                </div>
                {playErrorDetail && (
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {playErrorDetail}
                  </p>
                )}
              </div>
            )}

            <RelatedVideosPanel bvid={video.bvid || bvid} />

            <VideoCommentSection
              aid={video.aid}
              bvid={video.bvid || bvid}
              ownerMid={video.owner.mid}
              replyCount={video.stat.reply}
              scrollRootRef={scrollRef}
            />
          </div>
        </div>

        {showBackToTop && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute bottom-6 right-6 z-10 h-10 w-10 rounded-full border border-border shadow-lg backdrop-blur-sm"
            onClick={scrollToTop}
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
