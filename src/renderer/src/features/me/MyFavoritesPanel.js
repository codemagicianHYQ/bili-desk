import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import { OpusAppLink } from "@/components/opus/OpusAppLink";
import { BiliImage } from "@/components/ui/bili-image";
import { ChargeMarkedCover } from "@/components/video/charge-badge";
import { Button } from "@/components/ui/button";
import { cn, formatCount, formatDuration as formatVideoDuration, } from "@/lib/utils";
import { FileText, Loader2, Video } from "lucide-react";
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function formatDuration(seconds) {
    if (!seconds)
        return "";
    return formatVideoDuration(seconds);
}
export function MyFavoritesPanel() {
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const [tab, setTab] = useState("video");
    const [videos, setVideos] = useState([]);
    const [opusItems, setOpusItems] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (kind, nextPage, append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            if (kind === "video") {
                const result = await window.biliDesk.bili.getFavVideoMedias(nextPage);
                setVideos((prev) => append ? [...prev, ...result.items] : result.items);
                setPage(result.page);
                setHasMore(result.hasMore);
            }
            else {
                const result = await window.biliDesk.bili.getOpusFavorites(nextPage);
                setOpusItems((prev) => append ? [...prev, ...result.items] : result.items);
                setPage(result.page);
                setHasMore(result.hasMore);
            }
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);
    useEffect(() => {
        setVideos([]);
        setOpusItems([]);
        setPage(1);
        setHasMore(false);
        void load(tab, 1, false);
    }, [tab, load]);
    useEffect(() => {
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore || loading || loadingMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void load(tab, page + 1, true);
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [tab, hasMore, load, loading, loadingMore, page]);
    const videoCount = videos.length;
    const opusCount = opusItems.length;
    const isEmpty = tab === "video" ? videoCount === 0 : opusCount === 0;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { size: "sm", variant: tab === "video" ? "default" : "outline", onClick: () => setTab("video"), className: "gap-1.5", children: [_jsx(Video, { className: "h-4 w-4" }), "\u89C6\u9891"] }), _jsxs(Button, { size: "sm", variant: tab === "opus" ? "default" : "outline", onClick: () => setTab("opus"), className: "gap-1.5", children: [_jsx(FileText, { className: "h-4 w-4" }), "\u56FE\u6587"] })] }), _jsx(Link, { to: "/favorites", children: _jsx(Button, { size: "sm", variant: "secondary", children: "\u6253\u5F00\u6536\u85CF\u7BA1\u7406" }) })] }), loading && isEmpty ? (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2D..."] })) : error && isEmpty ? (_jsx("p", { className: "text-sm text-red-400", children: error })) : isEmpty ? (_jsx("p", { className: "text-sm text-muted-foreground", children: tab === "video" ? "暂无收藏视频" : "暂无收藏图文" })) : (_jsxs("div", { ref: scrollRef, className: "max-h-[60vh] space-y-2 overflow-y-auto pr-1", children: [tab === "video"
                        ? videos.map((item) => (_jsxs(Link, { to: item.bvid ? `/video/${item.bvid}` : "#", className: cn("flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50", !item.bvid && "pointer-events-none opacity-60"), children: [item.cover ? (_jsx(ChargeMarkedCover, { bvid: item.bvid, className: "h-20 w-36 shrink-0", badgeClassName: "right-1 top-1 px-1 py-px text-[10px]", children: _jsx(BiliImage, { src: item.cover, alt: "", className: "h-full w-full rounded-lg object-cover" }) })) : (_jsx("div", { className: "flex h-20 w-36 shrink-0 items-center justify-center rounded-lg bg-muted", children: _jsx(Video, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [item.upper.name, item.duration > 0 &&
                                                    ` · ${formatDuration(item.duration)}`, item.playCount > 0 &&
                                                    ` · ${formatCount(item.playCount)} 播放`] })] })] }, `${item.id}-${item.favTime}`)))
                        : opusItems.map((item) => (_jsxs(OpusAppLink, { item: item, className: "flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-20 w-20 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted", children: _jsx(FileText, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), item.author && (_jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: item.author })), item.summary && (_jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: item.summary }))] })] }, item.id))), _jsx("div", { ref: sentinelRef, className: "py-4 text-center text-sm text-muted-foreground", children: loadingMore
                            ? "加载更多..."
                            : hasMore
                                ? "继续下滑加载更多"
                                : "已经到底啦" }), error && _jsx("p", { className: "text-sm text-red-400", children: error })] }))] }));
}
