import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { cn } from "@/lib/utils";
export function FollowingLiveList({ rooms, count, className, }) {
    if (rooms.length === 0)
        return null;
    return (_jsxs("section", { className: cn("space-y-3", className), children: [_jsx("div", { className: "flex items-baseline justify-between gap-3", children: _jsxs("h2", { className: "text-sm font-semibold text-foreground", children: ["\u6B63\u5728\u76F4\u64AD", _jsx("span", { className: "ml-1.5 text-muted-foreground", children: count || rooms.length })] }) }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-3", children: rooms.map((room) => (_jsxs(Link, { to: `/live/${room.roomId}`, className: "flex items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/60", children: [_jsx(BiliImage, { src: room.face || room.cover, alt: room.uname, className: "h-11 w-11 shrink-0 rounded-full object-cover" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-foreground", children: room.uname || "未知主播" }), _jsx("p", { className: "truncate text-xs text-muted-foreground", children: room.title || "直播中" })] })] }, room.roomId))) })] }));
}
