import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link, useNavigate } from "react-router-dom";
import { openBiliHref } from "@/lib/open-bili-href";
import { BiliImage } from "@/components/ui/bili-image";
import { cn, formatCount } from "@/lib/utils";
import { BookOpen, Loader2, Zap } from "lucide-react";
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function formatChargeExpire(expireTime, expired) {
    if (!expireTime)
        return expired ? "已过期" : "";
    const date = new Date(expireTime > 1e12 ? expireTime : expireTime * 1000);
    if (Number.isNaN(date.getTime()))
        return expired ? "已过期" : "";
    const text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return expired ? `${text} 已过期` : `有效至 ${text}`;
}
export function MyCheesePanel({ mid }) {
    return _jsx(MyCheeseList, { mid: mid });
}
export function MyUpowerPanel(_props) {
    const [segment, setSegment] = useState("active");
    const [active, setActive] = useState([]);
    const [expired, setExpired] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        void window.biliDesk.bili
            .getUpowerPaidList()
            .then((result) => {
            if (cancelled)
                return;
            setActive(result.active);
            setExpired(result.expired);
        })
            .catch((err) => {
            if (!cancelled)
                setError(formatError(err));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    if (loading) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u5145\u7535\u8BB0\u5F55..."] }));
    }
    if (error) {
        return _jsx("p", { className: "text-sm text-red-400", children: error });
    }
    const list = segment === "active" ? active : expired;
    const emptyLabel = segment === "active" ? "暂无生效中的包月充电" : "暂无过期的充电记录";
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { type: "button", className: cn("rounded-full px-3 py-1 text-sm", segment === "active"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"), onClick: () => setSegment("active"), children: ["\u751F\u6548\u4E2D ", active.length] }), _jsxs("button", { type: "button", className: cn("rounded-full px-3 py-1 text-sm", segment === "expired"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"), onClick: () => setSegment("expired"), children: ["\u5DF2\u8FC7\u671F ", expired.length] })] }), list.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: emptyLabel })) : (_jsx("div", { className: "space-y-3 pb-8", children: list.map((up) => (_jsx(ChargeUpCard, { up: up }, up.mid || up.name))) }))] }));
}
function ChargeUpCard({ up }) {
    const expireText = formatChargeExpire(up.expireTime, up.expired);
    const inner = (_jsxs(_Fragment, { children: [up.face ? (_jsx(BiliImage, { src: up.face, alt: "", className: "h-10 w-10 shrink-0 rounded-full object-cover" })) : (_jsx("div", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted", children: _jsx(Zap, { className: "h-4 w-4 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium", children: up.name }), _jsx("p", { className: "mt-0.5 text-xs text-muted-foreground", children: [expireText || (up.expired ? "已过期" : "生效中"), up.privilegeName]
                            .filter(Boolean)
                            .join(" · ") })] })] }));
    return (_jsxs("div", { className: cn("rounded-xl border border-border bg-card p-3", up.expired && "opacity-80"), children: [up.mid > 0 ? (_jsx(Link, { to: `/up/${up.mid}`, className: "flex items-center gap-3 hover:text-primary", children: inner })) : (_jsx("div", { className: "flex items-center gap-3", children: inner })), up.exclusives.length > 0 && (_jsx("div", { className: "mt-3 space-y-2 border-t border-border pt-3", children: up.exclusives.map((item) => (_jsx(ExclusiveRow, { item: item, expired: up.expired }, item.seasonId))) }))] }));
}
function ExclusiveRow({ item, expired, }) {
    const navigate = useNavigate();
    return (_jsxs("button", { type: "button", onClick: () => void openBiliHref(item.url, navigate), className: "flex w-full gap-3 rounded-lg p-1 text-left transition-colors hover:bg-secondary/50", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-16 w-12 shrink-0 rounded-md object-cover" })) : (_jsx("div", { className: "flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted", children: _jsx(Zap, { className: "h-4 w-4 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: [
                            expired ? "充电专属 · 已过期" : "充电专属",
                            item.epCount > 0 ? `${item.epCount} 个视频` : "",
                            item.playCount > 0 ? `${formatCount(item.playCount)} 播放` : "",
                        ]
                            .filter(Boolean)
                            .join(" · ") })] })] }));
}
function MyCheeseList({ mid }) {
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (nextPage, append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const result = await window.biliDesk.bili.getCheeseFollowList(nextPage, mid);
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
        void load(1, false);
    }, [load]);
    useEffect(() => {
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore || loading || loadingMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void load(page + 1, true);
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, load, loading, loadingMore, page]);
    if (loading && items.length === 0) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u8BFE\u5802..."] }));
    }
    if (error && items.length === 0) {
        return _jsx("p", { className: "text-sm text-red-400", children: error });
    }
    if (items.length === 0) {
        return _jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u8FFD\u8BFE\u6216\u5DF2\u8D2D\u8BFE\u5802" });
    }
    return (_jsxs("div", { ref: scrollRef, className: "max-h-[60vh] space-y-2 overflow-y-auto pr-1", children: [items.map((item) => (_jsxs(Link, { to: `/season/cheese/${item.seasonId}`, className: "flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-20 w-14 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-muted", children: _jsx(BookOpen, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), _jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: [
                                    item.epCount > 0 ? `${item.epCount} 课时` : "",
                                    item.playCount > 0 ? `${formatCount(item.playCount)} 播放` : "",
                                    item.status,
                                ]
                                    .filter(Boolean)
                                    .join(" · ") })] })] }, item.seasonId))), _jsx("div", { ref: sentinelRef, className: cn("py-4 text-center text-sm text-muted-foreground"), children: loadingMore
                    ? "加载更多..."
                    : hasMore
                        ? "继续下滑加载更多"
                        : "已经到底啦" }), error && _jsx("p", { className: "text-sm text-red-400", children: error })] }));
}
