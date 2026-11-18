import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { formatDisplayedError } from "@/lib/ipc-error";
import { openBiliHref } from "@/lib/open-bili-href";
import { formatCount } from "@/lib/utils";
export function UpSpaceCoursePanel({ mid }) {
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (nextPage, append) => {
        if (append)
            setLoadingMore(true);
        else
            setLoading(true);
        setError("");
        try {
            const result = await window.biliDesk.bili.getUpCourses(mid, nextPage);
            const list = result.list ?? [];
            setItems((prev) => (append ? [...prev, ...list] : list));
            setPage(result.page ?? nextPage);
            setHasMore(Boolean(result.hasMore));
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "课堂加载失败"));
            if (!append)
                setItems([]);
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [mid]);
    useEffect(() => {
        void load(1, false);
    }, [load]);
    if (loading && items.length === 0) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u8BFE\u5802..."] }));
    }
    if (error && items.length === 0) {
        return (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void load(1, false), children: "\u91CD\u65B0\u52A0\u8F7D" })] }));
    }
    if (items.length === 0) {
        return _jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u8BFE\u7A0B" });
    }
    return (_jsxs("div", { className: "space-y-3", children: [items.map((item) => (_jsx(CourseRow, { item: item }, item.seasonId))), hasMore ? (_jsx(Button, { type: "button", size: "sm", variant: "outline", disabled: loadingMore, onClick: () => void load(page + 1, true), children: loadingMore ? "加载中..." : "加载更多" })) : null] }));
}
function CourseRow({ item }) {
    const navigate = useNavigate();
    const meta = [
        item.epCount > 0 ? `${item.epCount} 课时` : "",
        item.playCount > 0 ? `${formatCount(item.playCount)} 播放` : "",
        item.subtitle,
        item.status,
    ]
        .filter(Boolean)
        .join(" · ");
    const className = "flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50";
    const body = (_jsxs(_Fragment, { children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-20 w-32 shrink-0 rounded-lg object-cover" })) : (_jsx("div", { className: "flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-muted", children: _jsx(BookOpen, { className: "h-5 w-5 text-muted-foreground" }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), meta ? (_jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: meta })) : null] })] }));
    if (item.kind === "cheese" && item.seasonId > 0) {
        return (_jsx(Link, { to: `/season/cheese/${item.seasonId}`, className: className, children: body }));
    }
    if (item.url) {
        return (_jsx("button", { type: "button", className: `${className} w-full text-left`, onClick: () => void openBiliHref(item.url, navigate), children: body }));
    }
    return _jsx("div", { className: className, children: body });
}
