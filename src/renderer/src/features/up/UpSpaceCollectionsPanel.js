import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video/VideoCard";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { extractIpcErrorMessage, formatUserSpaceError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Folder, Layers, Loader2 } from "lucide-react";
function looksLikeCharge(item) {
    return /充电|专属|upower/i.test(`${item.title} ${item.description}`);
}
export function UpSpaceCollectionsPanel({ mid, preview, onlyCharge, }) {
    const selfMid = useAppStore((state) => state.user?.mid);
    const isOwnSpace = Boolean(selfMid) && Number(selfMid) === Number(mid);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);
    const [videos, setVideos] = useState([]);
    const [videoPage, setVideoPage] = useState(1);
    const [videoTotal, setVideoTotal] = useState(0);
    const [videosLoading, setVideosLoading] = useState(false);
    const [subscribedIds, setSubscribedIds] = useState(new Set());
    const [subBusyId, setSubBusyId] = useState(null);
    const [subError, setSubError] = useState("");
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        setSelected(null);
        setVideos([]);
        setSubscribedIds(new Set());
        setSubError("");
        void window.biliDesk.bili
            .getUserCollections(mid, 1)
            .then((result) => {
            if (cancelled)
                return;
            const next = [...result.seasons, ...result.series];
            setItems(next);
            // 只查合集订阅态；系列（series）没有同一套订阅接口
            if (!selfMid || Number(selfMid) === Number(mid))
                return;
            const seasons = next.filter((item) => item.kind === "season");
            void Promise.all(seasons.map(async (item) => {
                try {
                    const subscribed = await window.biliDesk.bili.getUgcSeasonSubscribed(item.id);
                    return subscribed ? item.id : null;
                }
                catch {
                    return null;
                }
            })).then((ids) => {
                if (cancelled)
                    return;
                setSubscribedIds(new Set(ids.filter((id) => id != null)));
            });
        })
            .catch((err) => {
            if (!cancelled)
                setError(formatUserSpaceError(err));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [mid, selfMid]);
    const handleToggleSubscribe = useCallback(async (item) => {
        if (item.kind !== "season" || subBusyId != null || isOwnSpace)
            return;
        if (!selfMid) {
            setSubError("请先登录后再订阅合集");
            return;
        }
        const next = !subscribedIds.has(item.id);
        setSubBusyId(item.id);
        setSubError("");
        setSubscribedIds((prev) => {
            const copy = new Set(prev);
            if (next)
                copy.add(item.id);
            else
                copy.delete(item.id);
            return copy;
        });
        try {
            await window.biliDesk.bili.setUgcSeasonSubscribe(item.id, next);
        }
        catch (err) {
            const message = extractIpcErrorMessage(err) || "操作失败";
            setSubscribedIds((prev) => {
                const copy = new Set(prev);
                if (next)
                    copy.delete(item.id);
                else
                    copy.add(item.id);
                return copy;
            });
            if (next &&
                (message.includes("已订阅") ||
                    message.includes("已经收藏") ||
                    message.includes("重复"))) {
                setSubscribedIds((prev) => new Set(prev).add(item.id));
            }
            else {
                setSubError(message);
            }
        }
        finally {
            setSubBusyId(null);
        }
    }, [isOwnSpace, selfMid, subBusyId, subscribedIds]);
    const openCollection = useCallback(async (item, page = 1) => {
        setSelected(item);
        setVideosLoading(true);
        try {
            const result = item.kind === "season"
                ? await window.biliDesk.bili.getSeasonArchives(mid, item.id, page)
                : await window.biliDesk.bili.getSeriesArchives(item.id, page);
            setVideos(result.videos);
            setVideoPage(result.page);
            setVideoTotal(result.total);
        }
        catch (err) {
            setError(formatUserSpaceError(err));
        }
        finally {
            setVideosLoading(false);
        }
    }, [mid]);
    if (loading) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u5408\u96C6..."] }));
    }
    if (error && items.length === 0) {
        return _jsx("p", { className: "text-sm text-red-400", children: error });
    }
    if (items.length === 0) {
        return (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u8BE5 UP \u6682\u65E0\u516C\u5F00\u5408\u96C6\u6216\u7CFB\u5217" }));
    }
    const filtered = onlyCharge ? items.filter(looksLikeCharge) : items;
    const shown = preview ? filtered.slice(0, 4) : filtered;
    if (filtered.length === 0) {
        return (_jsx("p", { className: "text-sm text-muted-foreground", children: onlyCharge ? "该 UP 暂无公开充电专属" : "该 UP 暂无公开合集或系列" }));
    }
    if (selected && !preview) {
        const totalPages = Math.max(1, Math.ceil(videoTotal / 30));
        const canSubscribe = selected.kind === "season" && !isOwnSpace && Boolean(selfMid);
        const subscribed = subscribedIds.has(selected.id);
        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium", children: selected.title }), _jsxs("p", { className: "mt-0.5 text-xs text-muted-foreground", children: [selected.kind === "season" ? "合集" : "系列", " \u00B7 ", selected.total, " ", "\u4E2A\u5185\u5BB9"] })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [canSubscribe && (_jsx(Button, { size: "sm", variant: subscribed ? "outline" : "default", disabled: subBusyId === selected.id, onClick: () => void handleToggleSubscribe(selected), children: subBusyId === selected.id
                                        ? "处理中..."
                                        : subscribed
                                            ? "已订阅"
                                            : "订阅合集" })), _jsx(Button, { size: "sm", variant: "outline", onClick: () => {
                                        setSelected(null);
                                        setVideos([]);
                                        setSubError("");
                                    }, children: "\u8FD4\u56DE\u5408\u96C6" })] })] }), subError && _jsx("p", { className: "text-xs text-red-400", children: subError }), videosLoading && videos.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u89C6\u9891..." })) : (_jsx("div", { className: "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4", children: videos.map((video) => (_jsx(VideoCard, { video: video }, video.bvid))) })), videoTotal > 30 && (_jsx(PaginationBar, { page: videoPage, totalPages: totalPages, onPageChange: (page) => void openCollection(selected, page) }))] }));
    }
    return (_jsxs("div", { className: "space-y-3", children: [subError && _jsx("p", { className: "text-xs text-red-400", children: subError }), _jsx("div", { className: "grid grid-cols-2 gap-3 md:grid-cols-4", children: shown.map((item) => {
                    const canSubscribe = !preview &&
                        item.kind === "season" &&
                        !isOwnSpace &&
                        Boolean(selfMid);
                    const subscribed = subscribedIds.has(item.id);
                    return (_jsxs("div", { className: cn("overflow-hidden rounded-xl border border-border bg-card text-left transition-colors", !preview && "hover:bg-secondary/40"), children: [_jsx("button", { type: "button", onClick: () => {
                                    if (!preview)
                                        void openCollection(item);
                                }, className: "block w-full text-left", children: item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "aspect-video w-full object-cover" })) : (_jsx("div", { className: "flex aspect-video items-center justify-center bg-muted", children: item.kind === "season" ? (_jsx(Folder, { className: "h-6 w-6 text-muted-foreground" })) : (_jsx(Layers, { className: "h-6 w-6 text-muted-foreground" })) })) }), _jsxs("div", { className: "space-y-2 p-2.5", children: [_jsxs("button", { type: "button", onClick: () => {
                                            if (!preview)
                                                void openCollection(item);
                                        }, className: "block w-full text-left", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [item.kind === "season" ? "合集" : "系列", " \u00B7 ", item.total, " ", "\u4E2A\u5185\u5BB9"] })] }), canSubscribe && (_jsx(Button, { type: "button", size: "sm", variant: subscribed ? "outline" : "default", className: "h-7 w-full px-2 text-xs", disabled: subBusyId === item.id, onClick: (event) => {
                                            event.stopPropagation();
                                            void handleToggleSubscribe(item);
                                        }, children: subBusyId === item.id
                                            ? "处理中..."
                                            : subscribed
                                                ? "已订阅"
                                                : "订阅合集" }))] })] }, `${item.kind}-${item.id}`));
                }) })] }));
}
