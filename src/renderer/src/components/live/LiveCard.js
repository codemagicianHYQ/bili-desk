import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { Badge } from "@/components/ui/badge";
export function LiveCard({ room, className, showFollowedBadge = false, }) {
    const onlineLabel = room.onlineText ||
        (room.online > 0 ? `${formatCount(room.online)} 人气` : "直播中");
    return (_jsxs(Link, { to: `/live/${room.roomId}`, className: cn("group flex flex-col overflow-hidden rounded-xl bg-card transition-colors hover:bg-secondary/40", className), children: [_jsx("div", { className: "relative aspect-video bg-muted", children: _jsxs("div", { className: "absolute inset-0 overflow-hidden rounded-[inherit]", children: [_jsx(BiliImage, { src: room.cover || room.keyframe || room.face, alt: room.title, variant: "cover", className: "absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" }), _jsxs("span", { className: "absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white", children: [_jsx(Radio, { className: "h-3 w-3" }), "\u76F4\u64AD\u4E2D"] }), room.areaName && (_jsx("span", { className: "absolute bottom-2 left-2 z-[1] max-w-[60%] truncate rounded bg-black/70 px-1.5 py-0.5 text-xs text-white", children: room.areaName })), _jsx("span", { className: "absolute bottom-2 right-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white", children: onlineLabel })] }) }), _jsxs("div", { className: "flex flex-1 flex-col gap-2 p-3", children: [_jsx("h3", { className: "line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug", children: room.title }), _jsxs("div", { className: "mt-auto flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground", children: [_jsx("span", { className: "truncate", children: room.uname || "未知主播" }), showFollowedBadge && (_jsx(Badge, { variant: "default", className: "shrink-0 px-1.5 py-0 text-[10px] leading-4", children: "\u5DF2\u5173\u6CE8" }))] })] })] }));
}
