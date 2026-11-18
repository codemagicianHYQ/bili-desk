import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { OpusAppLink } from "@/components/opus/OpusAppLink";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { FileText, Loader2 } from "lucide-react";
export function UpSpaceOpusPanel({ mid }) {
    const sentinelRef = useRef(null);
    const offsetRef = useRef("");
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const result = await window.biliDesk.bili.getSpaceOpus(mid, append ? offsetRef.current : "");
            offsetRef.current = result.offset;
            setHasMore(result.hasMore);
            setItems((prev) => append ? [...prev, ...result.items] : result.items);
        }
        catch (err) {
            setError(formatUserSpaceError(err));
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [mid]);
    useEffect(() => {
        offsetRef.current = "";
        setItems([]);
        void load(false);
    }, [load]);
    useEffect(() => {
        const target = sentinelRef.current;
        if (!target || !hasMore || loading)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && !loadingMore)
                void load(true);
        }, { rootMargin: "240px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore, load]);
    if (loading && items.length === 0) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u56FE\u6587..."] }));
    }
    if (error && items.length === 0) {
        return (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => void load(false), children: "\u91CD\u65B0\u52A0\u8F7D" })] }));
    }
    if (items.length === 0) {
        return _jsx("p", { className: "text-sm text-muted-foreground", children: "\u8BE5 UP \u6682\u65E0\u516C\u5F00\u56FE\u6587" });
    }
    return (_jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [items.map((item) => (_jsxs(OpusAppLink, { item: item, className: "flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-20 w-20 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted", children: _jsx(FileText, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), item.summary && (_jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: item.summary }))] })] }, item.id))), _jsx("div", { ref: sentinelRef, className: "col-span-full py-3 text-center text-xs text-muted-foreground", children: loadingMore ? "加载更多..." : hasMore ? "继续下滑" : "已经到底啦" })] }));
}
