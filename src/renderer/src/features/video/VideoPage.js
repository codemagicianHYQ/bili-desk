import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn, formatCount, formatDuration, formatPubdateTime, } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { UpOwnerCard } from "@/components/video/UpOwnerCard";
import { VideoActionBar } from "@/components/video/VideoActionBar";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { VideoCommentSection } from "@/features/video/VideoCommentSection";
import { RelatedVideosPanel } from "@/features/video/RelatedVideosPanel";
import { VideoTagList } from "@/components/video/VideoTagList";
import { VideoAiSummaryCard } from "@/components/video/VideoAiSummaryCard";
import { VideoWatchExtras } from "@/components/video/VideoWatchExtras";
import { VideoSideTools } from "@/components/video/VideoSideTools";
import { VideoPlaylistPanel } from "@/components/video/VideoPlaylistPanel";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { extractIpcErrorMessage, formatDisplayedError } from "@/lib/ipc-error";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { videoDetailCache } from "@/lib/session-data-cache";
import { readQualityPref, writeQualityPref, } from "@/components/video/quality-pref";
import { ArrowUp, BadgeCheck, Check, Copy, Gauge, MessageSquare, Play, Repeat2, Zap, } from "lucide-react";
function parsePositiveInt(raw) {
    if (!raw)
        return undefined;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
export function VideoPage({ bvid, active = true }) {
    const scrollRef = useRef(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [video, setVideo] = useState(null);
    const [playInfo, setPlayInfo] = useState(null);
    const [selectedCid, setSelectedCid] = useState(null);
    const [quality, setQuality] = useState(readQualityPref);
    const [reloadKey, setReloadKey] = useState(0);
    const [seekAt, setSeekAt] = useState(null);
    const [error, setError] = useState("");
    const [playError, setPlayError] = useState("");
    const [playErrorDetail, setPlayErrorDetail] = useState("");
    const [resumeCancelled, setResumeCancelled] = useState(false);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [onlineLabel, setOnlineLabel] = useState("");
    const [belowTab, setBelowTab] = useState("comments");
    const [bvidCopied, setBvidCopied] = useState(false);
    const [previewEnded, setPreviewEnded] = useState(false);
    const [previewSeconds, setPreviewSeconds] = useState(0);
    const [subtitles, setSubtitles] = useState([]);
    const playRequestIdRef = useRef(0);
    const streamModeRef = useRef("mp4");
    const loweredQnRef = useRef(false);
    const skipQualityFetchRef = useRef(false);
    const resumeCid = useMemo(() => parsePositiveInt(searchParams.get("cid")), [searchParams]);
    const focusRpid = parsePositiveInt(searchParams.get("rpid")) ?? 0;
    const focusRoot = parsePositiveInt(searchParams.get("root")) ?? 0;
    const resumeTimeRaw = useMemo(() => {
        const t = Number(searchParams.get("t"));
        return Number.isFinite(t) && t >= 5 ? t : undefined;
    }, [searchParams]);
    useEffect(() => {
        setResumeCancelled(false);
        setBelowTab("comments");
        setBvidCopied(false);
        setPreviewEnded(false);
        setPreviewSeconds(0);
    }, [bvid, resumeCid, resumeTimeRaw]);
    const initialTime = useMemo(() => {
        if (resumeCancelled)
            return undefined;
        if (resumeTimeRaw == null || !selectedCid || !video)
            return undefined;
        if (resumeCid != null) {
            return resumeCid === selectedCid ? resumeTimeRaw : undefined;
        }
        // 未指定分 P 时，只对默认第一 P 续播，避免切 P 误跳
        return selectedCid === video.pages[0]?.cid ? resumeTimeRaw : undefined;
    }, [resumeCancelled, resumeCid, resumeTimeRaw, selectedCid, video]);
    const applyPlayInfo = useCallback((info, requestedQn) => {
        setPlayInfo(info);
        setPlayError("");
        setPlayErrorDetail("");
        if (info.qualityDenied &&
            requestedQn != null &&
            requestedQn !== info.quality) {
            writeQualityPref(info.quality);
            skipQualityFetchRef.current = true;
            setQuality(info.quality);
        }
    }, []);
    const fetchPlayUrl = useCallback((targetBvid, cid, qn) => {
        const requestId = ++playRequestIdRef.current;
        return window.biliDesk.bili
            .getPlayUrl(targetBvid, cid, qn, {
            preferMp4: streamModeRef.current === "mp4",
        })
            .then((info) => {
            if (requestId !== playRequestIdRef.current)
                return;
            applyPlayInfo(info, qn);
        })
            .catch((e) => {
            if (requestId !== playRequestIdRef.current)
                return;
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
                    if (requestId !== playRequestIdRef.current)
                        return;
                    applyPlayInfo(info, qn);
                })
                    .catch((dashErr) => {
                    if (requestId !== playRequestIdRef.current)
                        return;
                    const dashMessage = extractIpcErrorMessage(dashErr);
                    console.warn("[BiliDesk][playurl] DASH fallback failed", {
                        bvid: targetBvid,
                        cid,
                        qn,
                        message: dashMessage,
                    });
                    setPlayError(dashMessage);
                    setPlayErrorDetail(`bvid=${targetBvid} cid=${cid} qn=${qn ?? "-"} mode=dash`);
                });
            }
            setPlayError(message);
            setPlayErrorDetail(`bvid=${targetBvid} cid=${cid} qn=${qn ?? "-"} mode=${streamModeRef.current}`);
        });
    }, [applyPlayInfo]);
    useEffect(() => {
        if (!bvid)
            return;
        setPlayError("");
        setPlayErrorDetail("");
        setPlayInfo(null);
        setReloadKey(0);
        playRequestIdRef.current += 1;
        streamModeRef.current = readQualityPref() >= 80 ? "dash" : "mp4";
        loweredQnRef.current = false;
        const cached = videoDetailCache.get(bvid);
        // 旧缓存无 ugcSeason 字段时强制重拉，避免合集列表缺失
        if (cached && "ugcSeason" in cached && cached.chargeChecked) {
            setVideo(cached);
            setError("");
            const preferredCid = resumeCid && cached.pages.some((part) => part.cid === resumeCid)
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
            const preferredCid = resumeCid && detail.pages.some((part) => part.cid === resumeCid)
                ? resumeCid
                : (detail.pages[0]?.cid ?? null);
            setSelectedCid(preferredCid);
        })
            .catch((e) => setError(formatDisplayedError(e, undefined, "视频信息获取失败")));
    }, [bvid, resumeCid]);
    useEffect(() => {
        streamModeRef.current = readQualityPref() >= 80 ? "dash" : "mp4";
        if (loweredQnRef.current) {
            loweredQnRef.current = false;
            setQuality(readQualityPref());
        }
    }, [bvid, selectedCid]);
    useEffect(() => {
        if (!bvid || !selectedCid)
            return;
        if (skipQualityFetchRef.current) {
            skipQualityFetchRef.current = false;
            return;
        }
        void fetchPlayUrl(bvid, selectedCid, quality);
    }, [bvid, selectedCid, quality, fetchPlayUrl]);
    const handleQualityChange = useCallback((qn) => {
        writeQualityPref(qn);
        loweredQnRef.current = false;
        streamModeRef.current = qn >= 80 ? "dash" : "mp4";
        setQuality((prev) => (prev === qn ? prev : qn));
    }, []);
    const handleRefresh = useCallback(() => {
        if (!bvid || !selectedCid)
            return;
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
    const handlePlayerError = useCallback((message, kind, detail) => {
        if (detail)
            setPlayErrorDetail(detail);
        if ((kind === "stall" || kind === "decode") &&
            bvid &&
            selectedCid &&
            playInfo) {
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
    }, [bvid, selectedCid, playInfo, quality, fetchPlayUrl]);
    const handleWatchFromStart = useCallback(() => {
        setResumeCancelled(true);
        if (!searchParams.has("t"))
            return;
        const next = new URLSearchParams(searchParams);
        next.delete("t");
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el)
            return;
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
        if (focusRpid > 0)
            setBelowTab("comments");
    }, [focusRpid]);
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
                if (cancelled)
                    return;
                setOnlineLabel(info.total ? `${info.total} 人在看` : "");
            })
                .catch(() => {
                if (!cancelled)
                    setOnlineLabel("");
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
            if (!cancelled)
                setSubtitles(tracks);
        })
            .catch(() => {
            if (!cancelled)
                setSubtitles([]);
        });
        return () => {
            cancelled = true;
        };
    }, [bvid, selectedCid]);
    const scrollToTop = useCallback(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, []);
    if (error) {
        return _jsx(ContentUnavailable, { kind: "video", error: error });
    }
    if (!video) {
        return (_jsx("div", { className: "flex h-full items-center justify-center text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." }));
    }
    return (_jsx("div", { className: "flex h-full flex-col overflow-hidden", children: _jsxs("div", { className: "relative min-h-0 flex-1", children: [_jsxs("div", { ref: scrollRef, className: "bili-watch-scroll scrollbar-overlay h-full overflow-x-hidden overflow-y-auto", children: [_jsx("div", { className: "bili-watch-column bili-watch-player-wrap mx-auto flex h-full w-full shrink-0 flex-col px-4 pt-3 lg:px-6", children: _jsxs("div", { className: "bili-watch-player-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card", children: [_jsxs("div", { className: "relative z-0 min-h-0 flex-1 bg-black", children: [playInfo && selectedCid ? (_jsx(VideoPlayer, { className: "h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-contain", playInfo: playInfo, aid: video.aid, bvid: bvid, cid: selectedCid, poster: video.cover, active: active, subtitleTracks: subtitles, initialTime: initialTime, reloadKey: reloadKey, selectedQn: quality, onQualityChange: handleQualityChange, onError: handlePlayerError, onWatchFromStart: handleWatchFromStart, seekAt: seekAt, timelineDuration: video.charge && !video.charge.unlocked
                                                    ? video.duration
                                                    : undefined, onPreviewBoundary: setPreviewEnded, onPreviewLength: setPreviewSeconds })) : (_jsxs("div", { className: "relative h-full w-full overflow-hidden bg-black", children: [_jsx(BiliImage, { src: video.cover, alt: video.title, className: "h-full w-full object-cover opacity-60" }), _jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center text-sm text-white/80", children: [_jsx("p", { children: playError || "正在加载播放器..." }), playErrorDetail && (_jsx("p", { className: "max-w-xl break-all font-mono text-xs text-white/50", children: playErrorDetail }))] })] })), video.charge && (_jsx(ChargeAccessNotice, { title: video.charge.title, subtitle: previewEnded && !video.charge.unlocked
                                                    ? previewSeconds > 0
                                                        ? `试看 ${formatDuration(previewSeconds)} 已结束，完整版 ${formatDuration(video.duration)}`
                                                        : `试看已结束，完整版 ${formatDuration(video.duration)}`
                                                    : previewSeconds > 0
                                                        ? `可试看 ${formatDuration(previewSeconds)} · ${video.charge.subtitle}`
                                                        : video.charge.subtitle, buttonText: video.charge.unlocked
                                                    ? undefined
                                                    : video.charge.buttonText, payUrl: video.charge.unlocked ? undefined : video.charge.payUrl, ended: previewEnded && !video.charge.unlocked }))] }), _jsx("div", { "data-watch-actions": true, className: "relative z-20 shrink-0 space-y-2 border-t border-border px-4 py-2", children: _jsxs("div", { className: "flex min-w-0 items-start gap-3", children: [_jsxs("div", { className: "min-w-0 flex-1 space-y-1", children: [_jsx("h1", { className: "text-sm font-semibold leading-snug break-words line-clamp-2 lg:text-base", children: video.title }), _jsxs("div", { className: "flex flex-wrap items-center gap-2.5", children: [onlineLabel && (_jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full bg-pink-500/15 px-2 py-0.5 text-xs font-medium text-pink-400", children: [_jsxs("span", { className: "relative flex h-1.5 w-1.5", children: [_jsx("span", { className: "absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-400 opacity-75" }), _jsx("span", { className: "relative inline-flex h-1.5 w-1.5 rounded-full bg-pink-400" })] }), onlineLabel] })), _jsxs("button", { type: "button", className: "inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-primary", title: "\u590D\u5236 BV \u53F7", onClick: async () => {
                                                                        const id = video.bvid || bvid;
                                                                        try {
                                                                            await navigator.clipboard.writeText(id);
                                                                            setBvidCopied(true);
                                                                            window.setTimeout(() => setBvidCopied(false), 1600);
                                                                        }
                                                                        catch {
                                                                            setBvidCopied(false);
                                                                        }
                                                                    }, children: [video.bvid || bvid, bvidCopied ? (_jsx(Check, { className: "h-3 w-3 text-emerald-400" })) : (_jsx(Copy, { className: "h-3 w-3 opacity-70" })), _jsx("span", { className: "font-sans", children: bvidCopied ? "已复制" : "复制" })] })] })] }), _jsx(VideoActionBar, { video: video, className: "shrink-0 grow-0 pt-0.5" })] }) })] }) }), _jsxs("div", { className: "bili-watch-column mx-auto w-full space-y-6 px-4 py-4 lg:px-6", children: [_jsx(UpOwnerCard, { mid: video.owner.mid, name: video.owner.name, face: video.owner.face, trailing: _jsx(WatchLaterButton, { aid: video.aid, bvid: video.bvid, video: video, variant: "inline" }) }), video.staff && video.staff.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-3", children: video.staff.map((member) => (_jsxs(Link, { to: `/up/${member.mid}`, className: "flex min-w-[140px] items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/60", children: [_jsx(BiliImage, { src: member.face, alt: member.name, className: "h-9 w-9 rounded-full object-cover" }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate text-sm font-medium", children: member.name }), _jsx("div", { className: "truncate text-[11px] text-muted-foreground", children: member.title })] })] }, `${member.mid}-${member.title}`))) })), video.honors && video.honors.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-2", children: video.honors.map((honor) => (_jsx("span", { className: "rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-300", children: honor.desc }, `${honor.type}-${honor.desc}`))) })), _jsxs("div", { className: "flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground", children: [_jsxs("span", { className: "inline-flex items-center gap-1.5", title: "\u64AD\u653E", children: [_jsx(Play, { className: "h-4 w-4 opacity-80" }), formatCount(video.stat.view)] }), _jsxs("span", { className: "inline-flex items-center gap-1.5", title: "\u5F39\u5E55", children: [_jsx(MessageSquare, { className: "h-4 w-4 opacity-80" }), formatCount(video.stat.danmaku)] }), video.pubdate > 0 && (_jsx("span", { className: "tabular-nums", title: "\u53D1\u5E03\u65F6\u95F4", children: formatPubdateTime(video.pubdate) })), [
                                            playInfo ? { icon: Gauge, label: playInfo.qualityLabel } : null,
                                            video.copyright === 1
                                                ? { icon: BadgeCheck, label: "自制" }
                                                : video.copyright === 2
                                                    ? { icon: Repeat2, label: "转载" }
                                                    : null,
                                        ]
                                            .filter((item) => Boolean(item))
                                            .map((item) => (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-md bg-secondary/40 px-1.5 py-0.5 text-xs", children: [_jsx(item.icon, { className: "h-3 w-3 opacity-70" }), item.label] }, item.label)))] }), _jsx(VideoPlaylistPanel, { bvid: video.bvid || bvid, selectedCid: selectedCid, pages: video.pages, ugcSeason: video.ugcSeason, onSelectPart: setSelectedCid }), _jsx("p", { className: "text-sm leading-relaxed text-muted-foreground", children: video.desc ? _jsx(BiliEmoteText, { text: video.desc }) : "暂无简介" }), _jsx(VideoTagList, { tags: video.tags }), selectedCid ? (_jsx(VideoAiSummaryCard, { bvid: video.bvid || bvid, cid: selectedCid, upMid: video.owner.mid, onSeek: (time) => setSeekAt({ time, nonce: Date.now() }) })) : null, selectedCid ? (_jsx(VideoWatchExtras, { bvid: video.bvid || bvid, cid: selectedCid, onSeek: (time) => setSeekAt({ time, nonce: Date.now() }) })) : null, selectedCid ? (_jsx(VideoSideTools, { bvid: video.bvid || bvid, aid: video.aid, cid: selectedCid, qn: quality, onSeek: (time) => setSeekAt({ time, nonce: Date.now() }) })) : null, playError && playInfo && (_jsxs("div", { className: "space-y-1 text-sm text-red-400", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { children: playError }), _jsx(Button, { type: "button", size: "sm", variant: "outline", className: "h-7", onClick: handleRefresh, children: "\u5237\u65B0\u64AD\u653E\u5668" })] }), playErrorDetail && (_jsx("p", { className: "break-all font-mono text-xs text-muted-foreground", children: playErrorDetail }))] })), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "relative mx-auto grid w-full max-w-md grid-cols-2 rounded-full border border-border/70 bg-secondary/50 p-1", children: [_jsx("span", { "aria-hidden": true, className: "pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", style: {
                                                        left: 4,
                                                        transform: belowTab === "related"
                                                            ? "translateX(100%)"
                                                            : "translateX(0)",
                                                    } }), _jsxs("button", { type: "button", className: cn("relative z-10 rounded-full py-1.5 text-sm transition-colors duration-300", belowTab === "comments"
                                                        ? "font-medium text-foreground"
                                                        : "text-muted-foreground hover:text-foreground"), onClick: () => setBelowTab("comments"), children: ["\u8BC4\u8BBA", video.stat.reply > 0 ? (_jsx("span", { className: "ml-1 text-xs font-normal text-muted-foreground", children: formatCount(video.stat.reply) })) : null] }), _jsx("button", { type: "button", className: cn("relative z-10 rounded-full py-1.5 text-sm transition-colors duration-300", belowTab === "related"
                                                        ? "font-medium text-foreground"
                                                        : "text-muted-foreground hover:text-foreground"), onClick: () => setBelowTab("related"), children: "\u76F8\u5173\u63A8\u8350" })] }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: cn("transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", belowTab === "comments"
                                                        ? "translate-x-0 opacity-100"
                                                        : "pointer-events-none h-0 overflow-hidden -translate-x-8 opacity-0"), "aria-hidden": belowTab !== "comments", children: _jsx(VideoCommentSection, { aid: video.aid, bvid: video.bvid || bvid, ownerMid: video.owner.mid, replyCount: video.stat.reply, scrollRootRef: scrollRef, focusRpid: focusRpid, focusRoot: focusRoot }) }), _jsx("div", { className: cn("transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", belowTab === "related"
                                                        ? "translate-x-0 opacity-100"
                                                        : "pointer-events-none h-0 overflow-hidden translate-x-8 opacity-0"), "aria-hidden": belowTab !== "related", children: _jsx(RelatedVideosPanel, { hideTitle: true, bvid: video.bvid || bvid }) })] })] })] })] }), showBackToTop && (_jsx(Button, { type: "button", size: "icon", variant: "secondary", className: "absolute bottom-6 right-6 z-10 h-10 w-10 rounded-full border border-border shadow-lg backdrop-blur-sm", onClick: scrollToTop, "aria-label": "\u56DE\u5230\u9876\u90E8", title: "\u56DE\u5230\u9876\u90E8", children: _jsx(ArrowUp, { className: "h-4 w-4" }) }))] }) }));
}
function ChargeAccessNotice({ title, subtitle, buttonText, payUrl, ended, }) {
    const openPay = () => {
        if (!payUrl)
            return;
        void window.biliDesk.app.openExternal(payUrl);
    };
    const card = (_jsxs("div", { className: "pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg bg-black/75 px-3 py-2 text-white shadow-lg", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium", children: title }), _jsxs("p", { className: "mt-0.5 flex items-center gap-1 text-xs text-white/80", children: [_jsx(Zap, { className: "h-3.5 w-3.5 shrink-0 text-[#00aeec]" }), _jsx("span", { className: "truncate", children: subtitle })] })] }), buttonText && payUrl && (_jsx("button", { type: "button", className: "shrink-0 rounded-md bg-[#fb7299] px-3 py-1.5 text-sm font-medium text-white", onClick: openPay, children: buttonText }))] }));
    if (ended) {
        return (_jsx("div", { className: "absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-6", children: card }));
    }
    return (_jsx("div", { className: "pointer-events-none absolute bottom-14 left-3 z-20", children: card }));
}
