import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link, useNavigate } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { ChargeCoverBadge, useCoverChargeBadge, } from "@/components/video/charge-badge";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { parseBiliAppPath } from "@shared/utils/bili-app-link";
import { ExternalLink, Lock, MessageCircle, MoreHorizontal, Radio, Share2, ThumbsUp, Zap, } from "lucide-react";
import { openBiliHref } from "@/lib/open-bili-href";
import { DynamicMoreSheet } from "@/components/dynamic/DynamicMoreSheet";
import { DynamicAttachCards } from "@/components/dynamic/DynamicAttachCards";
import { RepostDialog } from "@/components/dynamic/RepostDialog";
import { useAppStore } from "@/stores/app-store";
function DynamicActionBar({ item, onOpenDetail, onLikedChange, }) {
    const [liked, setLiked] = useState(Boolean(item.liked));
    const [likeCount, setLikeCount] = useState(item.stats?.like ?? 0);
    const [liking, setLiking] = useState(false);
    const [tip, setTip] = useState("");
    const [repostOpen, setRepostOpen] = useState(false);
    const reply = item.stats?.reply ?? 0;
    const forward = item.stats?.forward ?? 0;
    const showTip = (message) => {
        setTip(message);
        window.setTimeout(() => setTip(""), 1800);
    };
    const handleForward = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setRepostOpen(true);
    };
    const handleComment = (event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenDetail();
    };
    const handleLike = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (liking)
            return;
        const next = !liked;
        setLiking(true);
        try {
            await window.biliDesk.bili.likeDynamic(item.id, next);
            const nextCount = Math.max(0, likeCount + (next ? 1 : -1));
            setLiked(next);
            setLikeCount(nextCount);
            onLikedChange?.(next, nextCount);
        }
        catch (err) {
            showTip(formatDisplayedError(err, undefined, "点赞失败"));
        }
        finally {
            setLiking(false);
        }
    };
    return (_jsxs("div", { className: "relative grid grid-cols-3 border-t border-border/60", children: [tip && (_jsx("span", { className: "pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/80 px-2.5 py-1 text-xs text-white", children: tip })), _jsxs("button", { type: "button", onClick: handleForward, className: "flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground", children: [_jsx(Share2, { className: "h-4 w-4" }), forward > 0 ? formatCount(forward) : "转发"] }), _jsxs("button", { type: "button", onClick: handleComment, className: "flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground", children: [_jsx(MessageCircle, { className: "h-4 w-4" }), reply > 0 ? formatCount(reply) : "评论"] }), _jsxs("button", { type: "button", onClick: handleLike, disabled: liking, className: cn("flex items-center justify-center gap-1.5 py-3 text-sm transition-colors hover:bg-secondary/40", liked
                    ? "text-pink-400 hover:text-pink-300"
                    : "text-muted-foreground hover:text-foreground"), children: [_jsx(ThumbsUp, { className: cn("h-4 w-4", liked && "fill-current") }), likeCount > 0 ? formatCount(likeCount) : "点赞"] }), _jsx(RepostDialog, { open: repostOpen, dynId: item.id, preview: item.text, onClose: () => setRepostOpen(false) })] }));
}
function VideoDynamicBody({ item }) {
    const knownCharge = item.exclusiveTag && /充电|专属/.test(item.exclusiveTag)
        ? item.exclusiveTag
        : undefined;
    const chargeBadge = useCoverChargeBadge(item.bvid, knownCharge);
    const content = (_jsxs("div", { className: "flex gap-3 rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary/80", children: [_jsxs("div", { className: "relative shrink-0 overflow-hidden rounded-md", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: item.title ?? "", className: "h-[86px] w-[136px] object-cover" })) : (_jsx("div", { className: "h-[86px] w-[136px] bg-secondary" })), _jsx(ChargeCoverBadge, { label: chargeBadge, className: "right-1 top-1 px-1 py-px text-[10px]" }), item.duration != null && item.duration > 0 && (_jsx("span", { className: "absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[11px] text-white", children: formatDuration(item.duration) }))] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col justify-between py-0.5", children: [_jsx("p", { className: "line-clamp-2 text-sm leading-snug", children: item.title }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 text-xs text-muted-foreground", children: [item.stats?.view != null && item.stats.view > 0 && (_jsxs("span", { children: [formatCount(item.stats.view), " \u64AD\u653E"] })), item.stats?.danmaku != null && item.stats.danmaku > 0 && (_jsxs("span", { children: [formatCount(item.stats.danmaku), " \u5F39\u5E55"] }))] })] })] }));
    if (item.bvid) {
        return (_jsx(Link, { to: `/video/${item.bvid}`, onClick: (e) => e.stopPropagation(), children: content }));
    }
    return content;
}
function LiveDynamicBody({ item }) {
    const to = item.liveRoomId ? `/live/${item.liveRoomId}` : null;
    const external = item.liveUrl ||
        (item.liveRoomId ? `https://live.bilibili.com/${item.liveRoomId}` : "");
    const content = (_jsxs("div", { className: "overflow-hidden rounded-lg bg-secondary/50 transition-colors hover:bg-secondary/80", children: [_jsxs("div", { className: "relative", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: item.title ?? "", className: "aspect-video w-full object-cover" })) : (_jsx("div", { className: "aspect-video w-full bg-secondary" })), _jsxs("span", { className: "absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white", children: [_jsx(Radio, { className: "h-3 w-3" }), "\u76F4\u64AD\u4E2D"] })] }), _jsxs("div", { className: "space-y-1 p-3", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), item.text && (_jsx("p", { className: "text-xs text-muted-foreground", children: _jsx(BiliEmoteText, { text: item.text, mentions: item.mentions, emotes: item.emotes }) }))] })] }));
    if (to) {
        return (_jsx(Link, { to: to, onClick: (e) => e.stopPropagation(), children: content }));
    }
    const appPath = external ? parseBiliAppPath(external) : null;
    if (appPath) {
        return (_jsx(Link, { to: appPath, onClick: (e) => e.stopPropagation(), children: content }));
    }
    if (!external)
        return content;
    return (_jsx("a", { href: external, target: "_blank", rel: "noreferrer", className: "block", onClick: (e) => e.stopPropagation(), children: content }));
}
export function ExclusiveTag({ text }) {
    return (_jsxs("span", { className: "inline-flex items-center gap-0.5 rounded border border-[#fb7299]/45 bg-[#fb7299]/10 px-1 py-px text-[11px] leading-4 text-[#fb7299]", children: [_jsx(Zap, { className: "h-3 w-3 fill-current" }), text] }));
}
export function DynamicMetaLine({ item }) {
    const location = item.ipLocation?.trim();
    const cvId = item.cvId;
    if (!location && !cvId)
        return null;
    return (_jsxs("p", { className: "text-xs text-muted-foreground", children: [location ? _jsxs("span", { children: ["IP\u5C5E\u5730\uFF1A", location] }) : null, location && cvId ? _jsx("span", { children: " \u00B7 " }) : null, cvId ? (_jsxs(Link, { to: `/article/${cvId}`, onClick: (event) => event.stopPropagation(), className: "hover:text-[#00AEEC] hover:underline", children: ["cv", cvId] })) : null] }));
}
export function UpowerExclusiveCard({ item }) {
    const navigate = useNavigate();
    const title = item.title?.trim() || "充电专属动态";
    const hint = item.text?.trim() && item.text !== "动态"
        ? item.text
        : "加入当前 UP 主的充电即可解锁观看";
    const button = item.chargeButton?.trim() || "去充电";
    const openCharge = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (item.chargeUrl) {
            void openBiliHref(item.chargeUrl, navigate);
            return;
        }
        if (item.authorMid)
            navigate(`/up/${item.authorMid}`);
    };
    return (_jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-[#fb7299]/35 bg-gradient-to-r from-[#fb7299]/12 via-[#fb7299]/5 to-transparent px-3 py-3", children: [_jsxs("div", { className: "relative h-11 w-11 shrink-0", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-11 w-11 rounded-full object-cover" })) : (_jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-full bg-[#fb7299] text-white", children: _jsx(Zap, { className: "h-5 w-5 fill-current" }) })), _jsx("span", { className: "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[#fb7299] shadow-sm ring-1 ring-[#fb7299]/30", children: _jsx(Lock, { className: "h-2.5 w-2.5" }) })] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium text-foreground", children: title }), _jsx("p", { className: "mt-0.5 line-clamp-2 text-xs text-muted-foreground", children: hint })] }), _jsx("button", { type: "button", onClick: openCharge, className: "shrink-0 rounded-lg bg-[#fb7299] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90", children: button })] }));
}
export function ImageGrid({ images, layout = "grid", }) {
    const [lightboxIndex, setLightboxIndex] = useState(null);
    if (images.length === 0)
        return null;
    const open = (index, event) => {
        event.preventDefault();
        event.stopPropagation();
        setLightboxIndex(index);
    };
    if (layout === "stack" && images.length > 1) {
        return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-2", children: [_jsx("button", { type: "button", className: "block w-full overflow-hidden rounded-lg text-left", onClick: (event) => open(0, event), children: _jsx(BiliImage, { src: images[0], alt: "", className: "max-h-[480px] w-full object-contain" }) }), _jsx("div", { className: "grid grid-cols-3 gap-1.5", children: images.slice(1).map((src, index) => (_jsx("button", { type: "button", className: "overflow-hidden rounded-md", onClick: (event) => open(index + 1, event), children: _jsx(BiliImage, { src: src, alt: "", className: "aspect-[4/3] w-full object-cover transition-opacity hover:opacity-90" }) }, `${src}-${index + 1}`))) })] }), _jsx(ImageLightbox, { images: images, index: lightboxIndex ?? 0, open: lightboxIndex != null, onClose: () => setLightboxIndex(null), onIndexChange: setLightboxIndex })] }));
    }
    if (images.length === 1) {
        return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "block max-w-full text-left", onClick: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setLightboxIndex(0);
                    }, children: _jsx(BiliImage, { src: images[0], alt: "", className: "max-h-[480px] w-auto max-w-full rounded-lg object-contain" }) }), _jsx(ImageLightbox, { images: images, index: 0, open: lightboxIndex != null, onClose: () => setLightboxIndex(null) })] }));
    }
    const shown = images.slice(0, 9);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("grid gap-1.5", shown.length === 2 || shown.length === 4
                    ? "grid-cols-2"
                    : "grid-cols-3"), children: shown.map((src, index) => (_jsx("button", { type: "button", className: "overflow-hidden rounded-md", onClick: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setLightboxIndex(index);
                    }, children: _jsx(BiliImage, { src: src, alt: "", className: "aspect-square w-full object-cover transition-opacity hover:opacity-90" }) }, `${src}-${index}`))) }), _jsx(ImageLightbox, { images: shown, index: lightboxIndex ?? 0, open: lightboxIndex != null, onClose: () => setLightboxIndex(null), onIndexChange: setLightboxIndex })] }));
}
function openDynamicTarget(item, navigate) {
    if (item.bvid) {
        navigate(`/video/${item.bvid}`);
        return;
    }
    if (item.liveRoomId) {
        navigate(`/live/${item.liveRoomId}`);
        return;
    }
    if (item.kind === "article" &&
        item.commentType === 12 &&
        item.commentId &&
        /^\d+$/.test(item.commentId)) {
        navigate(`/article/${item.commentId}`);
        return;
    }
    if (item.id &&
        item.id !== "0" &&
        (item.kind === "opus" ||
            item.kind === "text" ||
            item.kind === "draw" ||
            item.kind === "forward" ||
            item.kind === "article" ||
            item.kind === "upower")) {
        navigate(`/dynamic/${item.id}`);
    }
}
function dynamicImages(item) {
    if (item.images?.length)
        return item.images;
    if (item.cover)
        return [item.cover];
    return [];
}
function DynamicCardBody({ item, depth = 0, imageLayout, }) {
    const images = dynamicImages(item);
    if (item.kind === "video") {
        return (_jsxs(_Fragment, { children: [item.text && (_jsx("p", { className: "text-sm text-muted-foreground", children: _jsx(BiliEmoteText, { text: item.text, mentions: item.mentions, emotes: item.emotes }) })), _jsx(VideoDynamicBody, { item: item }), _jsx(DynamicAttachCards, { item: item, voteMode: "compact" }), _jsx(DynamicMetaLine, { item: item })] }));
    }
    if (item.kind === "live") {
        return _jsx(LiveDynamicBody, { item: item });
    }
    if (item.kind === "upower") {
        return _jsx(UpowerExclusiveCard, { item: item });
    }
    return (_jsxs(_Fragment, { children: [item.title && (_jsx("h3", { className: "text-[17px] font-semibold leading-snug text-foreground", children: item.title })), item.text && (_jsx("p", { className: "text-sm leading-relaxed", children: _jsx(BiliEmoteText, { text: item.text, mentions: item.mentions, emotes: item.emotes }) })), (item.kind === "draw" ||
                item.kind === "opus" ||
                item.kind === "text" ||
                item.kind === "article") && (_jsx(ImageGrid, { images: images, layout: imageLayout ?? (item.kind === "draw" ? "grid" : "stack") })), _jsx(DynamicAttachCards, { item: item, voteMode: "compact" }), _jsx(DynamicMetaLine, { item: item }), item.kind === "forward" && item.orig && depth < 2 && (_jsx(ForwardedOrigEmbed, { item: item.orig, depth: depth + 1, imageLayout: imageLayout })), item.kind === "forward" && !item.orig && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6E90\u52A8\u6001\u5DF2\u5220\u9664" }))] }));
}
function atLabel(name) {
    const text = (name || "用户").trim() || "用户";
    return text.startsWith("@") ? text : `@${text}`;
}
export function ForwardedOrigEmbed({ item, depth = 0, imageLayout, }) {
    const navigate = useNavigate();
    const deleted = !item.id || item.id === "0" || item.text === "源动态已删除";
    return (_jsxs("div", { className: "space-y-2 rounded-lg border border-border/70 bg-secondary/45 p-3", onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!deleted)
                openDynamicTarget(item, navigate);
        }, onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (!deleted)
                    openDynamicTarget(item, navigate);
            }
        }, role: deleted ? undefined : "link", tabIndex: deleted ? undefined : 0, children: [(item.authorName || item.authorMid) && (_jsxs("div", { className: "flex items-center gap-2", children: [item.authorFace ? (_jsx(BiliImage, { src: item.authorFace, alt: item.authorName || "", className: "h-6 w-6 rounded-full object-cover" })) : null, item.authorMid ? (_jsx(Link, { to: `/up/${item.authorMid}`, onClick: (event) => event.stopPropagation(), className: "truncate text-sm font-medium text-sky-400 hover:underline", children: atLabel(item.authorName) })) : (_jsx("p", { className: "truncate text-sm font-medium text-sky-400", children: atLabel(item.authorName) }))] })), _jsx(DynamicCardBody, { item: item, depth: depth, imageLayout: imageLayout })] }));
}
export function DynamicFeedCard({ item, fallbackName = "用户", fallbackFace = "", onRemoved, onUnfollowed, }) {
    const navigate = useNavigate();
    const myMid = useAppStore((state) => state.user?.mid ?? 0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuTip, setMenuTip] = useState("");
    const menuAnchorRef = useRef(null);
    const authorName = item.authorName || fallbackName;
    const authorFace = item.authorFace || fallbackFace;
    const canOpenDetail = item.kind === "opus" ||
        item.kind === "text" ||
        item.kind === "draw" ||
        item.kind === "forward" ||
        item.kind === "article" ||
        item.kind === "upower";
    const openDetail = () => {
        openDynamicTarget(item, navigate);
    };
    const isOwn = myMid > 0 && item.authorMid === myMid;
    const showMenuTip = (message) => {
        setMenuTip(message);
        window.setTimeout(() => setMenuTip(""), 1800);
    };
    const authorLink = item.authorMid ? (_jsx(Link, { to: `/up/${item.authorMid}`, className: "truncate text-[15px] font-medium text-sky-400 hover:underline", children: authorName })) : (_jsx("p", { className: "truncate text-[15px] font-medium", children: authorName }));
    const authorBlock = (_jsxs("div", { className: "relative flex items-start gap-3 px-5 pb-1 pt-5", children: [menuTip && (_jsx("span", { className: "pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-black/80 px-2.5 py-1 text-xs text-white", children: menuTip })), item.authorMid ? (_jsx(Link, { to: `/up/${item.authorMid}`, className: "shrink-0", children: authorFace ? (_jsx(BiliImage, { src: authorFace, alt: authorName, className: "h-11 w-11 rounded-full object-cover ring-1 ring-border" })) : (_jsx("div", { className: "h-11 w-11 rounded-full bg-secondary" })) })) : authorFace ? (_jsx(BiliImage, { src: authorFace, alt: authorName, className: "h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border" })) : (_jsx("div", { className: "h-11 w-11 shrink-0 rounded-full bg-secondary" })), _jsxs("div", { className: "min-w-0 flex-1 pt-0.5", children: [authorLink, _jsxs("p", { className: "mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", children: [item.pubTimeLabel && _jsx("span", { children: item.pubTimeLabel }), !item.exclusiveTag && item.pubAction && (_jsxs("span", { children: ["\u00B7 ", item.pubAction] })), item.ipLocation ? _jsxs("span", { children: ["\u00B7 IP\u5C5E\u5730\uFF1A", item.ipLocation] }) : null, item.cvId ? (_jsxs(Link, { to: `/article/${item.cvId}`, onClick: (event) => event.stopPropagation(), className: "hover:text-[#00AEEC] hover:underline", children: ["\u00B7 cv", item.cvId] })) : null, item.exclusiveTag && _jsx(ExclusiveTag, { text: item.exclusiveTag })] })] }), _jsxs("div", { className: "ml-1 flex shrink-0 items-center gap-1 pt-0.5", children: [item.kind === "live" && !item.liveRoomId && item.liveUrl && (_jsx(ExternalLink, { className: "h-4 w-4 text-muted-foreground" })), _jsx("button", { ref: menuAnchorRef, type: "button", "aria-label": "\u52A8\u6001\u8BBE\u7F6E", className: "rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground", onClick: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuOpen(true);
                        }, children: _jsx(MoreHorizontal, { className: "h-5 w-5" }) })] })] }));
    return (_jsxs("article", { className: "overflow-hidden rounded-xl border border-border bg-card shadow-sm", children: [authorBlock, _jsx("div", { className: cn("space-y-3 px-5 py-3", canOpenDetail && "cursor-pointer"), onClick: canOpenDetail ? openDetail : undefined, onKeyDown: canOpenDetail
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetail();
                        }
                    }
                    : undefined, role: canOpenDetail ? "link" : undefined, tabIndex: canOpenDetail ? 0 : undefined, children: _jsx(DynamicCardBody, { item: item }) }), _jsx(DynamicActionBar, { item: item, onOpenDetail: openDetail }), _jsx(DynamicMoreSheet, { open: menuOpen, anchorRef: menuAnchorRef, item: item, isOwn: isOwn, authorName: authorName, onClose: () => setMenuOpen(false), onTip: showMenuTip, onRemoved: onRemoved, onUnfollowed: onUnfollowed })] }));
}
