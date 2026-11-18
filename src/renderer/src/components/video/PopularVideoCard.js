import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { MessageCircle, Play } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import { ChargeCoverBadge, useCoverChargeBadge, } from "@/components/video/charge-badge";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { cn, formatCount, formatDuration } from "@/lib/utils";
function rankTone(rank) {
    if (rank === 1)
        return "text-amber-400";
    if (rank === 2)
        return "text-zinc-300";
    if (rank === 3)
        return "text-orange-400";
    return "text-muted-foreground";
}
export function PopularVideoCard({ video, showRank }) {
    const chargeBadge = useCoverChargeBadge(video.bvid, video.chargeBadge);
    return (_jsxs(Link, { to: `/video/${video.bvid}`, className: "group flex gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/60", children: [showRank && video.rank ? (_jsx("div", { className: cn("flex w-7 shrink-0 items-start justify-center pt-1 text-lg font-bold tabular-nums", rankTone(video.rank)), children: video.rank })) : null, _jsxs("div", { className: "relative w-[210px] shrink-0 overflow-hidden rounded-lg bg-muted", children: [_jsx("div", { className: "aspect-video", children: _jsx(BiliImage, { src: video.cover, alt: video.title, variant: "cover", className: "h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" }) }), _jsx(ChargeCoverBadge, { label: chargeBadge, className: "right-1.5 top-1.5" }), _jsx("span", { className: "absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white", children: formatDuration(video.duration) }), _jsx(WatchLaterButton, { aid: video.aid, bvid: video.bvid, video: video, className: chargeBadge ? "top-9" : undefined })] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col py-0.5", children: [_jsx("h3", { className: "line-clamp-2 text-sm font-semibold leading-snug text-foreground", children: video.title }), video.rcmdReason ? (_jsx("span", { className: "mt-2 w-fit rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-medium text-orange-400", children: video.rcmdReason })) : null, _jsxs("div", { className: "mt-2 flex items-center gap-1.5 text-xs text-muted-foreground", children: [_jsx("span", { className: "rounded border border-border px-1 py-px text-[10px] leading-none", children: "UP" }), _jsx("span", { className: "truncate", children: video.owner.name })] }), _jsxs("div", { className: "mt-auto flex items-center gap-4 pt-2 text-xs text-muted-foreground", children: [_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Play, { className: "h-3.5 w-3.5" }), formatCount(video.play)] }), _jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(MessageCircle, { className: "h-3.5 w-3.5" }), formatCount(video.reply)] })] })] })] }));
}
