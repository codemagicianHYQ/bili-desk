import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { cn, formatCount, formatDuration, formatPubdate } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { Badge } from "@/components/ui/badge";
import { ChargeCoverBadge, useCoverChargeBadge, } from "@/components/video/charge-badge";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { RecommendDislikeMenu } from "@/components/video/RecommendDislikeMenu";
export function VideoCard({ video, className, meta = "owner", showFollowedBadge = false, interactive = true, hideWatchLater = false, progressPercent = 0, progressLabel, onCardClick, onDislike, }) {
    const showProgress = progressPercent > 0;
    const chargeBadge = useCoverChargeBadge(video.bvid, video.chargeBadge);
    const content = (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relative aspect-video bg-muted", children: [_jsxs("div", { className: "absolute inset-0 overflow-hidden rounded-[inherit]", children: [_jsx(BiliImage, { src: video.cover, alt: video.title, variant: "cover", className: "absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" }), interactive && (_jsx("div", { className: "absolute inset-0 z-[1] flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100", children: _jsx(Play, { className: "h-10 w-10 fill-white text-white" }) })), progressLabel && (_jsx("span", { className: "absolute bottom-2 left-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white", children: progressLabel })), _jsx(ChargeCoverBadge, { label: chargeBadge }), _jsx("span", { className: "absolute bottom-2 right-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white", children: formatDuration(video.duration) }), showProgress && (_jsx("div", { className: "absolute inset-x-0 bottom-0 z-[2] h-0.5 bg-black/35", children: _jsx("div", { className: "h-full bg-primary", style: { width: `${Math.min(100, progressPercent)}%` } }) }))] }), !hideWatchLater && (_jsx(WatchLaterButton, { aid: video.aid, bvid: video.bvid, video: video, className: chargeBadge ? "top-9" : undefined }))] }), _jsxs("div", { className: "flex flex-1 flex-col gap-2 p-3", children: [_jsx("h3", { className: "line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug", children: video.title }), _jsxs("div", { className: "mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground", children: [meta === "stats" ? (_jsx("span", { children: formatPubdate(video.pubdate) || "—" })) : (_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-1 overflow-hidden", children: [_jsx("span", { className: cn("truncate", showFollowedBadge && "font-medium text-primary"), children: video.owner.name }), showFollowedBadge && (_jsx(Badge, { variant: "default", className: "shrink-0 px-1.5 py-0 text-[10px] leading-4", children: "\u5DF2\u5173\u6CE8" })), video.pubdate > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "shrink-0 text-muted-foreground/50", children: "\u00B7" }), _jsx("span", { className: "shrink-0", children: formatPubdate(video.pubdate) })] }))] })), _jsxs("span", { className: "shrink-0", children: [formatCount(video.play), " \u64AD\u653E"] }), onDislike && (_jsx(RecommendDislikeMenu, { video: video, onDislike: onDislike }))] })] })] }));
    const cardClassName = cn("group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200", interactive && "hover:-translate-y-0.5 hover:shadow-lg", !interactive && onCardClick && "cursor-pointer", className);
    if (!interactive) {
        return (_jsx("div", { role: onCardClick ? "button" : undefined, tabIndex: onCardClick ? 0 : undefined, onClick: onCardClick, onKeyDown: onCardClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onCardClick();
                    }
                }
                : undefined, className: cardClassName, children: content }));
    }
    return (_jsx(Link, { to: `/video/${video.bvid}`, className: cardClassName, children: content }));
}
