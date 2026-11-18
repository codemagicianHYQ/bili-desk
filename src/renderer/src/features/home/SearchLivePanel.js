import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import { Loader2, Radio } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn, formatCount } from "@/lib/utils";
const PAGE_SIZE = 30;
const ORDER_OPTIONS = [
    { value: "online", label: "人气直播" },
    { value: "live_time", label: "最新开播" },
];
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
export function SearchLivePanel({ keyword, active, onTotalChange, }) {
    const loadSeqRef = useRef(0);
    const onTotalChangeRef = useRef(onTotalChange);
    onTotalChangeRef.current = onTotalChange;
    const [order, setOrder] = useState("online");
    const [rooms, setRooms] = useState([]);
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
            if (typeof window.biliDesk.bili.searchLiveRooms !== "function") {
                throw new Error("直播搜索服务未就绪，请重启应用后再试");
            }
            const result = await window.biliDesk.bili.searchLiveRooms(trimmed, nextPage, nextOrder);
            if (seq !== loadSeqRef.current)
                return;
            setRooms(result.rooms);
            setPage(result.page);
            setTotal(result.total);
            setHasMore(result.hasMore);
            onTotalChangeRef.current?.(result.total);
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            setRooms([]);
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
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: option.label }, option.value))) }), loading && rooms.length === 0 ? (_jsxs("p", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u641C\u7D22\u76F4\u64AD\u4E2D..."] })) : error && rooms.length === 0 ? (_jsxs("div", { className: "space-y-3 py-16 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => void load(keyword, page, order), children: "\u91CD\u8BD5" })] })) : rooms.length === 0 ? (_jsx("p", { className: "py-16 text-center text-sm text-muted-foreground", children: "\u6CA1\u6709\u627E\u5230\u76F8\u5173\u76F4\u64AD" })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("grid grid-cols-2 gap-4 p-6 md:grid-cols-3 xl:grid-cols-4", loading && "opacity-60"), children: rooms.map((room) => (_jsxs(Link, { to: `/live/${room.roomId}`, className: "group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-secondary/40", children: [_jsxs("div", { className: "relative aspect-video bg-muted", children: [_jsx(BiliImage, { src: room.cover || room.face, alt: room.title, variant: "cover", className: "absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" }), _jsxs("span", { className: "absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white", children: [_jsx(Radio, { className: "h-3 w-3" }), "\u76F4\u64AD"] }), room.areaName && (_jsx("span", { className: "absolute bottom-2 left-2 z-[1] max-w-[60%] truncate rounded bg-black/70 px-1.5 py-0.5 text-xs text-white", children: room.areaName })), _jsx("span", { className: "absolute bottom-2 right-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white", children: room.online > 0
                                                ? `${formatCount(room.online)} 人气`
                                                : "直播中" })] }), _jsxs("div", { className: "flex flex-1 flex-col gap-1.5 p-3", children: [_jsx("h3", { className: "line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug", children: room.title }), _jsx("p", { className: "truncate text-xs text-muted-foreground", children: room.uname || "未知主播" })] })] }, room.roomId))) }), rooms.length > 0 && (_jsx(PaginationBar, { page: page, totalPages: totalPages, disabled: loading, disableNext: !hasMore && page >= totalPages, onPageChange: goToPage, info: _jsxs(_Fragment, { children: ["\u7EA6 ", total.toLocaleString(), " \u6761 \u00B7 \u7B2C ", page, " / ", totalPages, " \u9875"] }) }))] }))] }));
}
