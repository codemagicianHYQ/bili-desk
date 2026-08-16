import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { VideoDetail, VideoPlayInfo } from "@shared/types";
import { Button } from "@/components/ui/button";
import { formatCount, formatPubdate } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { UpOwnerCard } from "@/components/video/UpOwnerCard";
import { VideoActionBar } from "@/components/video/VideoActionBar";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { VideoCommentSection } from "@/features/video/VideoCommentSection";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import {
  readQualityPref,
  writeQualityPref,
} from "@/components/video/quality-pref";
import { ArrowUp, RefreshCw } from "lucide-react";

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
  const playRequestIdRef = useRef(0);
  const streamModeRef = useRef<"mp4" | "dash">("mp4");
  const loweredQnRef = useRef(false);

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

  const fetchPlayUrl = useCallback(
    (targetBvid: string, cid: number, qn?: number) => {
      const requestId = ++playRequestIdRef.current;
      return window.biliDesk.bili
        .getPlayUrl(targetBvid, cid, qn, {
          preferMp4: streamModeRef.current === "mp4",
        })
        .then((info) => {
          if (requestId !== playRequestIdRef.current) return;
          setPlayInfo(info);
          setPlayError("");
          setPlayErrorDetail("");
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
                setPlayInfo(info);
                setPlayError("");
                setPlayErrorDetail("");
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
    [],
  );

  useEffect(() => {
    if (!bvid) return;

    setPlayError("");
    setPlayErrorDetail("");
    setPlayInfo(null);
    setReloadKey(0);
    playRequestIdRef.current += 1;
    streamModeRef.current = "mp4";
    loweredQnRef.current = false;

    window.biliDesk.bili
      .getVideo(bvid)
      .then((detail) => {
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
    streamModeRef.current = "mp4";
    if (loweredQnRef.current) {
      loweredQnRef.current = false;
      setQuality(readQualityPref());
    }
  }, [bvid, selectedCid]);

  useEffect(() => {
    if (!bvid || !selectedCid) return;
    void fetchPlayUrl(bvid, selectedCid, quality);
  }, [bvid, selectedCid, quality, fetchPlayUrl]);

  const handleQualityChange = useCallback((qn: number) => {
    writeQualityPref(qn);
    setQuality((prev) => (prev === qn ? prev : qn));
  }, []);

  const handleRefresh = useCallback(() => {
    if (!bvid || !selectedCid) return;
    streamModeRef.current = "mp4";
    loweredQnRef.current = false;
    setPlayInfo(null);
    setReloadKey((key) => key + 1);
    void fetchPlayUrl(bvid, selectedCid, quality);
  }, [bvid, selectedCid, quality, fetchPlayUrl]);

  const handlePlayerError = useCallback(
    (message: string, kind?: "stall" | "decode" | "other", detail?: string) => {
      if (detail) setPlayErrorDetail(detail);
      if (
        (kind === "stall" || kind === "decode") &&
        bvid &&
        selectedCid &&
        playInfo
      ) {
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
      <PageBackHeader
        trailing={
          playInfo ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          ) : undefined
        }
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="scrollbar-overlay h-full overflow-y-auto"
        >
          <div className="mx-auto max-w-4xl space-y-6 p-6 pt-4">
            <div className="rounded-2xl border border-border bg-card">
              {playInfo && selectedCid ? (
                <div className="overflow-hidden rounded-t-2xl">
                  <VideoPlayer
                    playInfo={playInfo}
                    aid={video.aid}
                    bvid={bvid}
                    cid={selectedCid}
                    poster={video.cover}
                    active={active}
                    initialTime={initialTime}
                    reloadKey={reloadKey}
                    selectedQn={quality}
                    onQualityChange={handleQualityChange}
                    onError={handlePlayerError}
                    onWatchFromStart={handleWatchFromStart}
                  />
                </div>
              ) : (
                <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-black">
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

              <div className="space-y-4 p-6">
                <h1 className="text-xl font-semibold leading-snug">
                  {video.title}
                </h1>

                {video.pages.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {video.pages.map((part) => (
                      <Button
                        key={part.cid}
                        size="sm"
                        variant={
                          selectedCid === part.cid ? "default" : "outline"
                        }
                        onClick={() => {
                          setSelectedCid(part.cid);
                        }}
                      >
                        P{part.page}
                        {part.part && part.page === 1 ? "" : ` · ${part.part}`}
                      </Button>
                    ))}
                  </div>
                )}

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

                <VideoActionBar video={video} />

                <p className="text-xs text-muted-foreground">
                  {formatCount(video.stat.view)} 播放 ·{" "}
                  {formatCount(video.stat.danmaku)} 弹幕
                  {video.pubdate > 0
                    ? ` · ${formatPubdate(video.pubdate)}`
                    : ""}
                  {playInfo ? ` · ${playInfo.qualityLabel}` : ""}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {video.desc || "暂无简介"}
                </p>
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
              </div>
            </div>

            <VideoCommentSection
              aid={video.aid}
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
