import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn, formatCount, formatPubdate } from "@/lib/utils";
import { Loader2 } from "lucide-react";
const ARTICLE_PAGE_SIZE = 20;
const ORDER_OPTIONS = [
    { value: "totalrank", label: "综合排序" },
    { value: "pubdate", label: "最新发布" },
    { value: "click", label: "最多阅读" },
    { value: "attention", label: "最多点赞" },
    { value: "scores", label: "最多评论" },
];
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
export function SearchArticlePanel({ keyword, active, onTotalChange, }) {
    const loadSeqRef = useRef(0);
    const onTotalChangeRef = useRef(onTotalChange);
    onTotalChangeRef.current = onTotalChange;
    const [order, setOrder] = useState("totalrank");
    const [articles, setArticles] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (nextKeyword, nextPage, nextOrder) => {
        const trimmed = nextKeyword.trim();
        if (!trimmed)
            return;
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setError("");
        try {
            if (typeof window.biliDesk.bili.searchArticles !== "function") {
                throw new Error("专栏搜索服务未就绪，请重启应用后再试");
            }
            const result = await window.biliDesk.bili.searchArticles(trimmed, nextPage, nextOrder);
            if (seq !== loadSeqRef.current)
                return;
            setArticles(result.articles);
            setPage(result.page);
            setTotal(result.total);
            setHasMore(result.hasMore);
            // 仅成功时校正角标，避免失败/重试把角标打成 0 来回跳
            onTotalChangeRef.current?.(result.total);
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            setArticles([]);
            setTotal(0);
            setError(formatError(err));
        }
        finally {
            if (seq === loadSeqRef.current)
                setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (!active || !keyword.trim())
            return;
        void load(keyword, 1, order);
    }, [active, keyword, order, load]);
    const totalPages = Math.max(1, Math.ceil(total / ARTICLE_PAGE_SIZE));
    const goToPage = (nextPage) => {
        if (loading || nextPage < 1)
            return;
        if (nextPage > totalPages && !hasMore)
            return;
        void load(keyword, nextPage, order);
    };
    if (!active)
        return null;
    return (_jsxs("div", { children: [_jsx("div", { className: "flex flex-wrap gap-2 border-b border-border px-6 py-3", children: ORDER_OPTIONS.map((option) => (_jsx("button", { type: "button", onClick: () => setOrder(option.value), className: cn("rounded-md px-2.5 py-1 text-xs transition-colors", order === option.value
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: option.label }, option.value))) }), loading && articles.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u641C\u7D22\u4E13\u680F\u4E2D..."] })) : error && articles.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void load(keyword, page, order), children: "\u91CD\u8BD5" })] })) : articles.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-muted-foreground", children: "\u6CA1\u6709\u627E\u5230\u76F8\u5173\u4E13\u680F" })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("mx-auto grid max-w-5xl gap-4 px-6 py-4 md:grid-cols-2", loading && "opacity-60"), children: articles.map((article) => (_jsxs(Link, { to: `/article/${article.id}`, className: "group flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/40", children: [article.cover ? (_jsx(BiliImage, { src: article.cover, alt: article.title, variant: "cover", className: "h-20 w-28 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "h-20 w-28 shrink-0 rounded-lg bg-secondary" })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary", children: article.title }), _jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: article.desc || "暂无摘要" }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground", children: [_jsx("span", { className: "truncate", children: article.author ||
                                                        (article.mid > 0 ? `UID ${article.mid}` : "未知作者") }), article.categoryName && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsx("span", { children: article.categoryName })] })), article.pubTime > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsx("span", { children: formatPubdate(article.pubTime) })] })), _jsxs("span", { className: "ml-auto", children: [formatCount(article.view), " \u9605\u8BFB \u00B7", " ", formatCount(article.like), " \u8D5E"] })] })] })] }, article.id))) }), _jsx(PaginationBar, { page: page, totalPages: totalPages, disabled: loading, disableNext: !hasMore && page >= totalPages, onPageChange: goToPage, info: _jsxs(_Fragment, { children: ["\u7EA6 ", total.toLocaleString(), " \u7BC7\u4E13\u680F \u00B7 \u7B2C ", page, " / ", totalPages, " \u9875"] }) })] }))] }));
}
