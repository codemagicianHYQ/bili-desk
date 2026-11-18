import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { useNavigate } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Tv } from "lucide-react";
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
export function MyFollowPanel({ mid }) {
    const navigate = useNavigate();
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const [followTab, setFollowTab] = useState("bangumi");
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (tab, nextPage, append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const type = tab === "bangumi" ? 1 : 2;
            const result = await window.biliDesk.bili.getBangumiFollowList(mid, type, nextPage);
            setItems((prev) => (append ? [...prev, ...result.list] : result.list));
            setPage(result.page);
            setHasMore(result.hasMore);
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [mid]);
    useEffect(() => {
        setItems([]);
        setPage(1);
        setHasMore(false);
        void load(followTab, 1, false);
    }, [followTab, load]);
    useEffect(() => {
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore || loading || loadingMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void load(followTab, page + 1, true);
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [followTab, hasMore, load, loading, loadingMore, page]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Button, { size: "sm", variant: followTab === "bangumi" ? "default" : "outline", onClick: () => setFollowTab("bangumi"), children: "\u8FFD\u756A" }), _jsx(Button, { size: "sm", variant: followTab === "cinema" ? "default" : "outline", onClick: () => setFollowTab("cinema"), children: "\u8FFD\u5267" })] }), loading && items.length === 0 ? (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2D..."] })) : error && items.length === 0 ? (_jsx("p", { className: "text-sm text-red-400", children: error })) : items.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: followTab === "bangumi"
                    ? "暂无追番（需在 B 站公开追番列表）"
                    : "暂无追剧（需在 B 站公开追剧列表）" })) : (_jsxs("div", { ref: scrollRef, className: "max-h-[60vh] space-y-2 overflow-y-auto pr-1", children: [items.map((item) => (_jsxs("button", { type: "button", onClick: () => navigate(`/season/bangumi/${item.seasonId}`), className: "flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/50", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-20 w-14 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-muted", children: _jsx(Tv, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), item.progress && (_jsx("p", { className: "mt-1 text-xs text-primary", children: item.progress })), item.evaluate && (_jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: item.evaluate }))] })] }, item.seasonId))), _jsx("div", { ref: sentinelRef, className: cn("py-4 text-center text-sm text-muted-foreground"), children: loadingMore
                            ? "加载更多..."
                            : hasMore
                                ? "继续下滑加载更多"
                                : "已经到底啦" }), error && _jsx("p", { className: "text-sm text-red-400", children: error })] }))] }));
}
