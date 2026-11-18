import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ForwardedOrigEmbed, ExclusiveTag, UpowerExclusiveCard, DynamicMetaLine, } from "@/components/dynamic/DynamicFeedCard";
import { DynamicCommentSection } from "@/features/dynamics/DynamicCommentSection";
import { DynamicAttachCards } from "@/components/dynamic/DynamicAttachCards";
import { RepostDialog } from "@/components/dynamic/RepostDialog";
import { BiliImage } from "@/components/ui/bili-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { ContentUnavailable } from "@/components/ui/content-unavailable";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { cn, formatCount } from "@/lib/utils";
import { Loader2, MessageCircle, Share2, Star, ThumbsUp } from "lucide-react";
function formatPubTime(ts, label) {
    if (label)
        return label;
    if (!ts)
        return "";
    const date = new Date(ts * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}年${m}月${d}日 ${hh}:${mm}`;
}
export function DynamicDetailPage() {
    const { id = "" } = useParams();
    const [searchParams] = useSearchParams();
    const focusRpid = Number(searchParams.get("rpid")) || 0;
    const focusRoot = Number(searchParams.get("root")) || 0;
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [liking, setLiking] = useState(false);
    const [favorited, setFavorited] = useState(false);
    const [favCount, setFavCount] = useState(0);
    const [favoriting, setFavoriting] = useState(false);
    const [repostOpen, setRepostOpen] = useState(false);
    const [tip, setTip] = useState("");
    const [previewIndex, setPreviewIndex] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        setItem(null);
        void window.biliDesk.bili
            .getDynamicDetail(id)
            .then((detail) => {
            if (cancelled)
                return;
            setItem(detail);
            setLiked(Boolean(detail.liked));
            setLikeCount(detail.stats?.like ?? 0);
            setFavorited(Boolean(detail.favorited));
            setFavCount(detail.stats?.favorite ?? 0);
        })
            .catch((err) => {
            if (cancelled)
                return;
            setError(formatDisplayedError(err, undefined, "加载动态失败"));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [id]);
    const images = useMemo(() => {
        if (!item)
            return [];
        if (item.images?.length)
            return item.images;
        if (item.cover)
            return [item.cover];
        return [];
    }, [item]);
    const showTip = (message) => {
        setTip(message);
        window.setTimeout(() => setTip(""), 1800);
    };
    const handleLike = async () => {
        if (!item || liking)
            return;
        const next = !liked;
        setLiking(true);
        try {
            await window.biliDesk.bili.likeDynamic(item.id, next);
            setLiked(next);
            setLikeCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
        }
        catch (err) {
            showTip(formatDisplayedError(err, undefined, "点赞失败"));
        }
        finally {
            setLiking(false);
        }
    };
    const handleFavorite = async () => {
        if (!item || favoriting)
            return;
        const next = !favorited;
        setFavoriting(true);
        try {
            await window.biliDesk.bili.favoriteDynamic(item.id, next);
            setFavorited(next);
            setFavCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
            showTip(next ? "已收藏" : "已取消收藏");
        }
        catch (err) {
            showTip(formatDisplayedError(err, undefined, "收藏失败"));
        }
        finally {
            setFavoriting(false);
        }
    };
    const handleShare = () => {
        if (!item)
            return;
        setRepostOpen(true);
    };
    const commentOid = item?.commentId || item?.id || "";
    const commentType = item?.commentType || 17;
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(PageBackHeader, { fallback: "/dynamics", label: "\u8FD4\u56DE\u52A8\u6001" }), _jsx("div", { className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: loading ? (_jsxs("div", { className: "flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u52A8\u6001\u4E2D..."] })) : error ? (_jsx(ContentUnavailable, { kind: "dynamic", error: error })) : !item ? (_jsx("p", { className: "px-6 py-16 text-center text-sm text-muted-foreground", children: "\u52A8\u6001\u4E0D\u5B58\u5728" })) : (_jsxs("div", { className: "mx-auto flex max-w-3xl gap-6 px-6 py-6", children: [_jsxs("div", { className: "min-w-0 flex-1 space-y-5", children: [item.title && (_jsx("h1", { className: "text-2xl font-semibold leading-snug", children: item.title })), _jsxs("div", { className: "flex items-center gap-3", children: [item.authorFace ? (_jsx(BiliImage, { src: item.authorFace, alt: item.authorName || "", className: "h-11 w-11 rounded-full object-cover" })) : (_jsx("div", { className: "h-11 w-11 rounded-full bg-secondary" })), _jsxs("div", { className: "min-w-0", children: [item.authorMid ? (_jsx(Link, { to: `/up/${item.authorMid}`, className: "truncate text-[15px] font-medium text-sky-400 hover:underline", children: item.authorName || "用户" })) : (_jsx("p", { className: "truncate text-[15px] font-medium", children: item.authorName || "用户" })), _jsxs("p", { className: "flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", children: [_jsxs("span", { children: [formatPubTime(item.pubTime, item.pubTimeLabel), !item.exclusiveTag && item.pubAction
                                                                    ? ` · ${item.pubAction}`
                                                                    : ""] }), item.ipLocation ? (_jsxs("span", { children: [" \u00B7 IP\u5C5E\u5730\uFF1A", item.ipLocation] })) : null, item.cvId ? (_jsxs(_Fragment, { children: [_jsx("span", { children: " \u00B7 " }), _jsxs(Link, { to: `/article/${item.cvId}`, className: "hover:text-[#00AEEC] hover:underline", children: ["cv", item.cvId] })] })) : null, item.exclusiveTag && (_jsx(ExclusiveTag, { text: item.exclusiveTag }))] })] })] }), item.kind === "upower" ? (_jsx(UpowerExclusiveCard, { item: item })) : (item.text && (_jsx("p", { className: "text-[15px] leading-relaxed", children: _jsx(BiliEmoteText, { text: item.text, mentions: item.mentions, emotes: item.emotes }) }))), item.kind === "forward" && item.orig && (_jsx(ForwardedOrigEmbed, { item: item.orig })), item.kind === "forward" && !item.orig && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6E90\u52A8\u6001\u5DF2\u5220\u9664" })), images.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsx("button", { type: "button", className: "block w-full overflow-hidden rounded-xl bg-secondary/30", onClick: () => setPreviewIndex(0), children: _jsx(BiliImage, { src: images[0], alt: item.title || "", className: "max-h-[520px] w-full object-contain" }) }), images.length > 1 && (_jsx("div", { className: "grid grid-cols-3 gap-2", children: images.slice(1).map((src, index) => (_jsx("button", { type: "button", onClick: () => setPreviewIndex(index + 1), className: "overflow-hidden rounded-lg", children: _jsx(BiliImage, { src: src, alt: "", className: "aspect-[4/3] w-full object-cover" }) }, `${src}-${index}`))) }))] })), _jsx(DynamicAttachCards, { item: item, voteMode: "detail" }), _jsx(DynamicMetaLine, { item: item }), _jsx("div", { className: "border-t border-border pt-5", children: _jsx(DynamicCommentSection, { oid: commentOid, type: commentType, replyCount: item.stats?.reply ?? 0, ownerMid: item.authorMid, focusRpid: focusRpid, focusRoot: focusRoot }) })] }), _jsxs("aside", { className: "sticky top-4 hidden h-fit w-14 shrink-0 flex-col items-center gap-4 self-start rounded-full border border-border/70 bg-card/90 px-2 py-4 shadow-sm lg:flex", children: [tip && (_jsx("span", { className: "absolute -left-24 top-2 rounded-full bg-black/80 px-2 py-1 text-[11px] text-white", children: tip })), _jsxs("button", { type: "button", onClick: () => void handleLike(), disabled: liking, className: cn("flex flex-col items-center gap-1 text-xs transition-colors", liked
                                        ? "text-pink-400"
                                        : "text-muted-foreground hover:text-foreground"), children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(ThumbsUp, { className: cn("h-4 w-4", liked && "fill-current") }) }), formatCount(likeCount)] }), _jsxs("button", { type: "button", onClick: () => void handleShare(), className: "flex flex-col items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(Share2, { className: "h-4 w-4" }) }), formatCount(item.stats?.forward ?? 0)] }), _jsx(RepostDialog, { open: repostOpen, dynId: item.id, preview: item.text, onClose: () => setRepostOpen(false) }), _jsxs("button", { type: "button", onClick: () => void handleFavorite(), disabled: favoriting, className: cn("flex flex-col items-center gap-1 text-xs transition-colors", favorited
                                        ? "text-amber-400"
                                        : "text-muted-foreground hover:text-foreground"), children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(Star, { className: cn("h-4 w-4", favorited && "fill-current") }) }), formatCount(favCount)] }), _jsxs("div", { className: "flex flex-col items-center gap-1 text-xs text-muted-foreground", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60", children: _jsx(MessageCircle, { className: "h-4 w-4" }) }), formatCount(item.stats?.reply ?? 0)] })] })] })) }), item && (_jsx(ImageLightbox, { images: images, index: previewIndex ?? 0, open: previewIndex != null, onClose: () => setPreviewIndex(null), onIndexChange: setPreviewIndex }))] }));
}
