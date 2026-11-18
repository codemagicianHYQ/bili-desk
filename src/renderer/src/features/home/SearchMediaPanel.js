import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { useNavigate } from "react-router-dom";
import { Loader2, Tv } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn, formatPubdate } from "@/lib/utils";
const PAGE_SIZE = 20;
function formatError(err, kind) {
    return formatDisplayedError(err, undefined, "加载失败");
}
export function SearchMediaPanel({ keyword, kind, active, onTotalChange, }) {
    const navigate = useNavigate();
    const loadSeqRef = useRef(0);
    const onTotalChangeRef = useRef(onTotalChange);
    onTotalChangeRef.current = onTotalChange;
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const label = kind === "bangumi" ? "番剧" : "影视";
    const load = useCallback(async (nextKeyword, nextPage) => {
        const trimmed = nextKeyword.trim();
        if (!trimmed)
            return;
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setError("");
        try {
            if (typeof window.biliDesk.bili.searchMedia !== "function") {
                throw new Error(`${label}搜索服务未就绪，请重启应用后再试`);
            }
            const result = await window.biliDesk.bili.searchMedia(trimmed, kind, nextPage);
            if (seq !== loadSeqRef.current)
                return;
            setItems(result.items);
            setPage(result.page);
            setTotal(result.total);
            setHasMore(result.hasMore);
            onTotalChangeRef.current?.(result.total);
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            setItems([]);
            setTotal(0);
            setError(formatError(err, kind));
        }
        finally {
            if (seq === loadSeqRef.current)
                setLoading(false);
        }
    }, [kind, label]);
    useEffect(() => {
        if (!active || !keyword.trim())
            return;
        void load(keyword, 1);
    }, [active, keyword, kind, load]);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const goToPage = (nextPage) => {
        if (loading || nextPage < 1)
            return;
        if (nextPage > totalPages && !hasMore)
            return;
        void load(keyword, nextPage);
    };
    if (!active)
        return null;
    return (_jsx("div", { children: loading && items.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u641C\u7D22", label, "\u4E2D..."] })) : error && items.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void load(keyword, page), children: "\u91CD\u8BD5" })] })) : items.length === 0 ? (_jsxs("p", { className: "py-16 text-center text-sm text-muted-foreground", children: ["\u6CA1\u6709\u627E\u5230\u76F8\u5173", label] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("mx-auto grid max-w-5xl gap-4 px-6 py-4 md:grid-cols-2", loading && "opacity-60"), children: items.map((item) => (_jsxs("button", { type: "button", onClick: () => {
                            if (item.seasonId > 0) {
                                navigate(`/season/bangumi/${item.seasonId}`);
                                return;
                            }
                            void openBiliHref(item.url, navigate);
                        }, className: "group flex gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/40", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: item.title, variant: "cover", className: "h-28 w-20 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary", children: _jsx(Tv, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary", children: item.title }), (item.styles || item.areas) && (_jsx("p", { className: "mt-1 line-clamp-1 text-xs text-muted-foreground", children: [item.areas, item.styles].filter(Boolean).join(" · ") })), item.indexShow && (_jsx("p", { className: "mt-1 text-xs text-primary", children: item.indexShow })), item.desc && (_jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: item.desc })), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground", children: [item.score > 0 && (_jsxs("span", { children: ["\u8BC4\u5206 ", item.score.toFixed(1)] })), item.pubtime > 0 && (_jsxs(_Fragment, { children: [item.score > 0 && _jsx("span", { children: "\u00B7" }), _jsx("span", { children: formatPubdate(item.pubtime) })] }))] })] })] }, `${item.kind}-${item.seasonId}-${item.mediaId}`))) }), items.length > 0 && (_jsx(PaginationBar, { page: page, totalPages: totalPages, disabled: loading, disableNext: !hasMore && page >= totalPages, onPageChange: goToPage, info: _jsxs(_Fragment, { children: ["\u7EA6 ", total.toLocaleString(), " \u6761 \u00B7 \u7B2C ", page, " / ", totalPages, " \u9875"] }) }))] })) }));
}
