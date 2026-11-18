import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BiliImage } from "@/components/ui/bili-image";
import { LivePlayer } from "@/components/live/LivePlayer";
import { LiveChatPanel } from "@/components/live/LiveChatPanel";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { ErrorState } from "@/components/ui/content-unavailable";
import { formatCount } from "@/lib/utils";
import { Eye, Loader2, Radio, Users } from "lucide-react";
export function LivePage({ roomId, active = true }) {
    const [room, setRoom] = useState(null);
    const [playInfo, setPlayInfo] = useState(null);
    const [quality, setQuality] = useState(undefined);
    const [error, setError] = useState("");
    const [playError, setPlayError] = useState("");
    const [loading, setLoading] = useState(true);
    const [online, setOnline] = useState(0);
    const [watched, setWatched] = useState(0);
    const [watchedText, setWatchedText] = useState("");
    const [viewers, setViewers] = useState(0);
    const autoReloadSeqRef = useRef(0);
    const autoReloadUsedRef = useRef(false);
    /** 取流失败：主播已下播 / 轮播时切到未开播态，其余错误给出可读文案 */
    const handlePlayFailure = useCallback((err, fallback) => {
        const message = extractIpcErrorMessage(err);
        const offline = message.includes("未开播");
        const rotating = message.includes("轮播");
        if (offline || rotating) {
            const status = rotating ? 2 : 0;
            setPlayInfo(null);
            setRoom((prev) => (prev ? { ...prev, liveStatus: status } : prev));
            setPlayError(rotating ? "主播轮播中" : "主播已下播");
            return;
        }
        setPlayError(message || fallback);
    }, []);
    const fetchPlayUrl = useCallback((id, qn) => {
        setPlayError("");
        return window.biliDesk.bili
            .getLivePlayUrl(id, qn)
            .then((info) => {
            setPlayInfo(info);
            setQuality(info.quality);
        })
            .catch((e) => handlePlayFailure(e, "获取直播流失败"));
    }, [handlePlayFailure]);
    const reloadPlayUrl = useCallback(() => {
        if (!room || room.liveStatus !== 1)
            return;
        if (autoReloadUsedRef.current) {
            setPlayError("直播流异常，请切换清晰度或刷新");
            return;
        }
        autoReloadUsedRef.current = true;
        const seq = ++autoReloadSeqRef.current;
        const id = room.roomId || roomId;
        void window.biliDesk.bili
            .getLivePlayUrl(id, quality)
            .then((info) => {
            if (seq !== autoReloadSeqRef.current)
                return;
            setPlayError("");
            setPlayInfo(info);
            setQuality(info.quality);
        })
            .catch((e) => {
            if (seq !== autoReloadSeqRef.current)
                return;
            handlePlayFailure(e, "直播流异常，请刷新重试");
        });
    }, [handlePlayFailure, quality, room, roomId]);
    const applyRoomStats = useCallback((detail) => {
        setOnline(detail.online);
        setWatched(detail.watched ?? 0);
        setWatchedText(detail.watchedText ?? "");
        if (detail.viewers != null && detail.viewers > 0) {
            setViewers(detail.viewers);
        }
    }, []);
    const loadRoom = useCallback((id) => {
        setLoading(true);
        setError("");
        setPlayError("");
        setPlayInfo(null);
        setRoom(null);
        autoReloadUsedRef.current = false;
        autoReloadSeqRef.current += 1;
        window.biliDesk.bili
            .getLiveRoom(id)
            .then((detail) => {
            setRoom(detail);
            applyRoomStats(detail);
            setLoading(false);
            if (detail.liveStatus === 1) {
                void fetchPlayUrl(detail.roomId || id);
            }
            else {
                setPlayError(detail.liveStatus === 2 ? "主播轮播中" : "主播当前未开播");
            }
        })
            .catch((e) => {
            setError(e.message);
            setLoading(false);
        });
    }, [applyRoomStats, fetchPlayUrl]);
    useEffect(() => {
        if (!roomId)
            return;
        autoReloadUsedRef.current = false;
        loadRoom(roomId);
    }, [roomId, loadRoom]);
    useEffect(() => {
        const onRefresh = () => loadRoom(roomId);
        window.addEventListener("bilidesk:refresh-live", onRefresh);
        return () => {
            window.removeEventListener("bilidesk:refresh-live", onRefresh);
        };
    }, [roomId, loadRoom]);
    useEffect(() => {
        if (!roomId || !active)
            return;
        const pullViewers = () => {
            void window.biliDesk.bili
                .getLiveRoomViewers(roomId, room?.uid)
                .then((count) => {
                if (count > 0)
                    setViewers(count);
            })
                .catch(() => {
                // 观众数刷新失败不影响播放
            });
        };
        pullViewers();
        const viewersTimer = window.setInterval(pullViewers, 15000);
        const roomTimer = window.setInterval(() => {
            void window.biliDesk.bili
                .getLiveRoom(roomId)
                .then((detail) => {
                setRoom((prev) => (prev ? { ...prev, ...detail } : detail));
                applyRoomStats(detail);
                if (detail.liveStatus !== 1) {
                    setPlayInfo(null);
                    setPlayError(detail.liveStatus === 2 ? "主播轮播中" : "主播已下播");
                }
            })
                .catch(() => {
                // 人数刷新失败不影响播放
            });
        }, 45000);
        return () => {
            window.clearInterval(viewersTimer);
            window.clearInterval(roomTimer);
        };
    }, [active, applyRoomStats, room?.uid, roomId]);
    if (loading) {
        return (_jsxs("div", { className: "flex h-full items-center justify-center gap-2 text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u76F4\u64AD\u95F4..."] }));
    }
    if (error || !room) {
        return (_jsx(ErrorState, { error: error || "直播间加载失败", hint: "live", fallback: "\u76F4\u64AD\u95F4\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", action: _jsx(Button, { variant: "secondary", size: "sm", onClick: () => loadRoom(roomId), children: "\u91CD\u8BD5" }) }));
    }
    const realRoomId = room.roomId || roomId;
    return (_jsxs("div", { className: "flex h-full min-h-0 flex-col lg:flex-row", children: [_jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsx("div", { className: "relative min-h-0 flex-1 bg-black", children: playInfo && active ? (_jsx(LivePlayer, { className: "h-full rounded-none aspect-auto", playInfo: playInfo, poster: room.cover, onQualityChange: (qn) => {
                                autoReloadUsedRef.current = false;
                                setQuality(qn);
                                void fetchPlayUrl(realRoomId, qn);
                            }, onError: setPlayError, onRequestReload: reloadPlayUrl }, `${roomId}-${playInfo.quality}-${playInfo.url}`)) : (_jsxs("div", { className: "relative flex h-full items-center justify-center overflow-hidden bg-black", children: [room.cover && (_jsx(BiliImage, { src: room.cover, alt: room.title, variant: "cover", className: "absolute inset-0 h-full w-full object-cover opacity-40" })), _jsx("div", { className: "relative z-[1] space-y-2 px-6 text-center text-sm text-white/90", children: playInfo && !active ? (_jsx("p", { children: "\u76F4\u64AD\u5DF2\u6682\u505C" })) : playError ? (_jsxs(_Fragment, { children: [_jsx("p", { children: playError }), room.liveStatus === 1 && (_jsx(Button, { size: "sm", variant: "secondary", onClick: () => {
                                                    autoReloadUsedRef.current = false;
                                                    void fetchPlayUrl(realRoomId, quality);
                                                }, children: "\u91CD\u65B0\u52A0\u8F7D\u76F4\u64AD\u6D41" }))] })) : (_jsxs("p", { className: "inline-flex items-center gap-2", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u6B63\u5728\u83B7\u53D6\u76F4\u64AD\u6D41..."] })) })] })) }), playError && playInfo && (_jsx("p", { className: "px-4 pt-2 text-sm text-red-400", children: playError })), _jsxs("div", { className: "shrink-0 space-y-2.5 border-t border-border px-4 py-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("span", { className: room.liveStatus === 1
                                            ? "inline-flex items-center gap-1 rounded bg-red-500/90 px-2 py-0.5 text-xs font-medium text-white"
                                            : "inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground", children: [_jsx(Radio, { className: "h-3 w-3" }), room.liveStatus === 1
                                                ? "直播中"
                                                : room.liveStatus === 2
                                                    ? "轮播中"
                                                    : "未开播"] }), room.areaName && (_jsx("span", { className: "rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground", children: room.parentAreaName
                                            ? `${room.parentAreaName} · ${room.areaName}`
                                            : room.areaName })), _jsxs("span", { className: "inline-flex items-center gap-1 text-xs text-muted-foreground", children: [_jsx(Users, { className: "h-3.5 w-3.5" }), formatCount(online), " \u4EBA\u6C14"] }), (watchedText || watched > 0) && (_jsxs("span", { className: "inline-flex items-center gap-1 text-xs text-muted-foreground", children: [_jsx(Eye, { className: "h-3.5 w-3.5" }), watchedText || `${formatCount(watched)}人看过`] }))] }), _jsx("h1", { className: "text-lg font-semibold leading-snug", children: room.title }), _jsxs(Link, { to: `/up/${room.uid}`, className: "inline-flex min-w-0 items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-secondary/60", children: [_jsx(BiliImage, { src: room.face, alt: room.uname, className: "h-10 w-10 rounded-full object-cover" }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium", children: room.uname }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u623F\u95F4\u53F7 ", realRoomId] })] })] })] })] }), _jsx(LiveChatPanel, { roomId: realRoomId, viewers: viewers, active: active, className: "h-[38vh] w-full border-l-0 border-t lg:h-auto lg:w-[340px] lg:border-l lg:border-t-0", onStats: (stats) => {
                    if (stats.online != null)
                        setOnline(stats.online);
                    if (stats.watched != null)
                        setWatched(stats.watched);
                    if (stats.watchedText)
                        setWatchedText(stats.watchedText);
                    if (stats.viewers != null)
                        setViewers(stats.viewers);
                } })] }));
}
