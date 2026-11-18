import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState, } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { ChargeCoverBadge, useCoverChargeBadge, } from "@/components/video/charge-badge";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RepostDialog } from "@/components/dynamic/RepostDialog";
import { PublishDynamicDialog } from "@/components/dynamic/PublishDynamicDialog";
import { OverlayPortal, APP_OVERLAY_ZCLASS, } from "@/components/ui/overlay-portal";
import { ExclusiveTag, UpowerExclusiveCard, DynamicMetaLine, ForwardedOrigEmbed, ImageGrid, } from "@/components/dynamic/DynamicFeedCard";
import { formatDisplayedError } from "@/lib/ipc-error";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { Loader2, Lock, MessageCircle, MoreHorizontal, Pencil, Pin, Share2, ThumbsUp, Trash2, } from "lucide-react";
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function visibleForwardText(item) {
    const text = item.text?.trim() ?? "";
    if (!text || text === "转发动态" || text === "动态")
        return "";
    return text;
}
function DynamicActionBar({ item, onOpenDetail, }) {
    const [liked, setLiked] = useState(Boolean(item.liked));
    const [likeCount, setLikeCount] = useState(item.stats?.like ?? 0);
    const [liking, setLiking] = useState(false);
    const [tip, setTip] = useState("");
    const [repostOpen, setRepostOpen] = useState(false);
    const reply = item.stats?.reply ?? 0;
    const showTip = (message) => {
        setTip(message);
        window.setTimeout(() => setTip(""), 1800);
    };
    const handleForward = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setRepostOpen(true);
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
            setLiked(next);
            setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
        }
        catch (err) {
            showTip(formatError(err));
        }
        finally {
            setLiking(false);
        }
    };
    return (_jsxs("div", { className: "relative grid grid-cols-3 border-t border-white/5", children: [tip && (_jsx("p", { className: "pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white", children: tip })), _jsxs("button", { type: "button", onClick: (event) => void handleForward(event), className: "flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]", children: [_jsx(Share2, { className: "h-4 w-4" }), "\u8F6C\u53D1"] }), _jsx(RepostDialog, { open: repostOpen, dynId: item.id, preview: item.text, onClose: () => setRepostOpen(false) }), _jsxs("button", { type: "button", onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenDetail();
                }, className: "flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]", children: [_jsx(MessageCircle, { className: "h-4 w-4" }), reply > 0 ? reply : "评论"] }), _jsxs("button", { type: "button", disabled: liking, onClick: (event) => void handleLike(event), className: cn("flex items-center justify-center gap-1.5 py-3 text-sm transition-colors", liked ? "text-[#00aeec]" : "text-[#9499a0] hover:text-[#e3e5e7]"), children: [_jsx(ThumbsUp, { className: cn("h-4 w-4", liked && "fill-current") }), likeCount > 0 ? formatCount(likeCount) : "点赞"] })] }));
}
function VideoDynamicBody({ item }) {
    const knownCharge = item.exclusiveTag && /充电|专属/.test(item.exclusiveTag)
        ? item.exclusiveTag
        : undefined;
    const chargeBadge = useCoverChargeBadge(item.bvid, knownCharge);
    const content = (_jsxs("div", { className: "flex gap-3 rounded-lg bg-black/25 p-3 transition-colors hover:bg-black/35", children: [_jsxs("div", { className: "relative shrink-0 overflow-hidden rounded-md", children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: item.title ?? "", className: "h-[86px] w-[136px] object-cover" })) : (_jsx("div", { className: "h-[86px] w-[136px] bg-secondary" })), _jsx(ChargeCoverBadge, { label: chargeBadge, className: "right-1 top-1 px-1 py-px text-[10px]" }), item.duration != null && item.duration > 0 && (_jsx("span", { className: "absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[11px] text-white", children: formatDuration(item.duration) }))] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col justify-between py-0.5", children: [_jsx("p", { className: "line-clamp-2 text-sm leading-snug text-[#e3e5e7]", children: item.title }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 text-xs text-[#9499a0]", children: [item.stats?.view != null && item.stats.view > 0 && (_jsxs("span", { children: [formatCount(item.stats.view), " \u64AD\u653E"] })), item.stats?.danmaku != null && item.stats.danmaku > 0 && (_jsxs("span", { children: [formatCount(item.stats.danmaku), " \u5F39\u5E55"] }))] })] })] }));
    if (item.bvid) {
        return (_jsx(Link, { to: `/video/${item.bvid}`, onClick: (event) => event.stopPropagation(), children: content }));
    }
    return content;
}
function OwnerMenu({ open, pinned, busy, onClose, onPin, onCard, onShare, onEdit, onPrivate, onlySelf, onDelete, }) {
    if (!open)
        return null;
    const row = "flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] text-[#e3e5e7] transition-colors hover:bg-white/5 disabled:opacity-50";
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: cn("fixed inset-0 flex items-end justify-center bg-black/55 p-4", APP_OVERLAY_ZCLASS), onClick: onClose, children: _jsxs("div", { role: "menu", className: "w-full max-w-md overflow-hidden rounded-2xl bg-[#232527] shadow-2xl ring-1 ring-white/10", onClick: (event) => event.stopPropagation(), children: [_jsxs("button", { type: "button", disabled: busy, className: row, onClick: onPin, children: [_jsx(Pin, { className: "h-4 w-4 text-[#fb7299]" }), pinned ? "取消置顶" : "置顶"] }), _jsxs("button", { type: "button", disabled: busy, className: cn(row, "border-t border-white/5"), onClick: onCard, children: [_jsx(Pencil, { className: "h-4 w-4 text-[#fb7299]" }), "\u4F7F\u7528\u6B64\u5361\u7247\u80CC\u666F"] }), _jsxs("button", { type: "button", disabled: busy, className: cn(row, "border-t border-white/5"), onClick: onEdit, children: [_jsx(Pencil, { className: "h-4 w-4 text-[#fb7299]" }), "\u7F16\u8F91"] }), _jsxs("button", { type: "button", disabled: busy, className: cn(row, "border-t border-white/5"), onClick: onPrivate, children: [_jsx(Lock, { className: "h-4 w-4 text-[#fb7299]" }), onlySelf ? "设为公开" : "设为仅自己可见"] }), _jsxs("button", { type: "button", disabled: busy, className: cn(row, "border-t border-white/5"), onClick: onShare, children: [_jsx(Share2, { className: "h-4 w-4 text-[#fb7299]" }), "\u5206\u4EAB"] }), _jsxs("button", { type: "button", disabled: busy, className: cn(row, "border-t border-white/5 text-rose-400"), onClick: onDelete, children: [_jsx(Trash2, { className: "h-4 w-4" }), "\u5220\u9664"] }), _jsx("button", { type: "button", className: "w-full border-t border-white/10 py-3.5 text-center text-[15px] text-[#9499a0] hover:bg-white/5", onClick: onClose, children: "\u53D6\u6D88" })] }) }) }));
}
function DynamicCard({ item, fallbackName, fallbackFace, onPinned, onRemoved, }) {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [onlySelf, setOnlySelf] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tip, setTip] = useState("");
    const authorName = item.authorName || fallbackName;
    const authorFace = item.authorFace || fallbackFace;
    const canOpenDetail = Boolean(item.id) &&
        item.id !== "0" &&
        (item.kind === "opus" ||
            item.kind === "text" ||
            item.kind === "draw" ||
            item.kind === "forward" ||
            item.kind === "article" ||
            item.kind === "upower");
    const forwardText = item.kind === "forward" ? visibleForwardText(item) : item.text;
    const images = item.images?.length
        ? item.images
        : item.cover
            ? [item.cover]
            : [];
    const showTip = (message) => {
        setTip(message);
        window.setTimeout(() => setTip(""), 1800);
    };
    const openDetail = () => {
        if (item.kind === "article" &&
            item.commentType === 12 &&
            item.commentId &&
            /^\d+$/.test(item.commentId)) {
            navigate(`/article/${item.commentId}`);
            return;
        }
        navigate(`/dynamic/${item.id}`);
    };
    const handlePin = async () => {
        if (busy)
            return;
        const next = !item.pinned;
        setBusy(true);
        try {
            await window.biliDesk.bili.setDynamicTop(item.id, next);
            onPinned(item.id, next);
            setMenuOpen(false);
            showTip(next ? "已置顶" : "已取消置顶");
        }
        catch (err) {
            showTip(formatError(err));
        }
        finally {
            setBusy(false);
        }
    };
    const handleCard = async () => {
        if (busy)
            return;
        if (!item.cardItemId) {
            showTip("这条动态没有可使用的卡片装扮");
            setMenuOpen(false);
            return;
        }
        setBusy(true);
        try {
            await window.biliDesk.bili.equipDynamicCard(item.cardItemId);
            setMenuOpen(false);
            showTip(item.cardName ? `已使用「${item.cardName}」` : "已使用此卡片背景");
        }
        catch (err) {
            showTip(formatError(err));
        }
        finally {
            setBusy(false);
        }
    };
    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(`https://www.bilibili.com/opus/${item.id}`);
            setMenuOpen(false);
            showTip("链接已复制");
        }
        catch {
            showTip("复制失败");
        }
    };
    const handleDelete = async () => {
        if (busy)
            return;
        setBusy(true);
        try {
            await window.biliDesk.bili.removeDynamic(item.id);
            setConfirmDelete(false);
            setMenuOpen(false);
            onRemoved(item.id);
        }
        catch (err) {
            showTip(formatError(err));
            setBusy(false);
        }
    };
    return (_jsxs("article", { className: "relative overflow-hidden rounded-xl bg-[#232527] shadow-sm ring-1 ring-white/5", children: [tip && (_jsx("p", { className: "pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white", children: tip })), _jsxs("div", { className: "flex items-start gap-3 px-5 pb-1 pt-5", children: [authorFace ? (_jsx(BiliImage, { src: authorFace, alt: authorName, className: "h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/10" })) : (_jsx("div", { className: "h-12 w-12 shrink-0 rounded-full bg-secondary" })), _jsxs("div", { className: "min-w-0 flex-1 pt-0.5", children: [_jsx("p", { className: "truncate text-[15px] font-medium text-[#00aeec]", children: authorName }), _jsxs("p", { className: "mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#9499a0]", children: [item.pubTimeLabel && _jsx("span", { children: item.pubTimeLabel }), !item.exclusiveTag && item.pubAction && (_jsxs("span", { children: ["\u00B7 ", item.pubAction] })), item.pinned && (_jsx("span", { className: "rounded bg-[#fb7299]/15 px-1 py-px text-[#fb7299]", children: "\u7F6E\u9876" })), item.ipLocation ? _jsxs("span", { children: ["\u00B7 IP\u5C5E\u5730\uFF1A", item.ipLocation] }) : null, item.cvId ? (_jsxs(Link, { to: `/article/${item.cvId}`, onClick: (event) => event.stopPropagation(), className: "hover:text-[#00AEEC] hover:underline", children: ["\u00B7 cv", item.cvId] })) : null, item.exclusiveTag && _jsx(ExclusiveTag, { text: item.exclusiveTag })] })] }), _jsx("button", { type: "button", "aria-label": "\u52A8\u6001\u8BBE\u7F6E", className: "rounded-md p-1 text-[#9499a0] transition-colors hover:bg-white/5 hover:text-[#e3e5e7]", onClick: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuOpen(true);
                        }, children: _jsx(MoreHorizontal, { className: "h-5 w-5" }) })] }), _jsx("div", { className: cn("space-y-3 px-5 py-3", canOpenDetail && "cursor-pointer"), onClick: canOpenDetail ? openDetail : undefined, children: item.kind === "video" ? (_jsxs(_Fragment, { children: [item.text && (_jsx("p", { className: "text-sm text-[#9499a0]", children: _jsx(BiliEmoteText, { text: item.text, mentions: item.mentions, emotes: item.emotes }) })), _jsx(VideoDynamicBody, { item: item }), _jsx(DynamicMetaLine, { item: item })] })) : item.kind === "upower" ? (_jsx(UpowerExclusiveCard, { item: item })) : item.kind === "forward" ? (_jsxs(_Fragment, { children: [forwardText && (_jsx("p", { className: "text-sm leading-relaxed text-[#e3e5e7]", children: _jsx(BiliEmoteText, { text: forwardText, mentions: item.mentions, emotes: item.emotes }) })), item.orig ? (_jsx(ForwardedOrigEmbed, { item: item.orig, imageLayout: "grid" })) : (_jsx("p", { className: "rounded-lg bg-black/25 px-3 py-4 text-sm text-[#9499a0]", children: "\u6E90\u52A8\u6001\u5DF2\u5220\u9664" }))] })) : (_jsxs(_Fragment, { children: [item.title && item.kind !== "text" && (_jsx("h3", { className: "text-sm font-medium leading-snug text-[#e3e5e7]", children: item.title })), item.text && item.text !== "动态" && (_jsx("p", { className: "text-sm leading-relaxed text-[#e3e5e7]", children: _jsx(BiliEmoteText, { text: item.text, mentions: item.mentions, emotes: item.emotes }) })), images.length > 0 && (_jsx(ImageGrid, { images: images, layout: item.kind === "article" || item.kind === "live"
                                ? "stack"
                                : "grid" })), _jsx(DynamicMetaLine, { item: item })] })) }), _jsx(DynamicActionBar, { item: item, onOpenDetail: openDetail }), _jsx(OwnerMenu, { open: menuOpen, pinned: Boolean(item.pinned), busy: busy, onClose: () => {
                    if (!busy)
                        setMenuOpen(false);
                }, onPin: () => void handlePin(), onCard: () => void handleCard(), onShare: () => void handleShare(), onEdit: () => {
                    setMenuOpen(false);
                    setEditOpen(true);
                }, onlySelf: onlySelf, onPrivate: () => {
                    if (busy)
                        return;
                    setBusy(true);
                    const next = !onlySelf;
                    void window.biliDesk.bili
                        .setDynamicPrivate(item.id, next)
                        .then(() => {
                        setOnlySelf(next);
                        setMenuOpen(false);
                        showTip(next ? "已设为仅自己可见" : "已设为公开");
                    })
                        .catch((err) => showTip(formatError(err)))
                        .finally(() => setBusy(false));
                }, onDelete: () => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                } }), _jsx(PublishDynamicDialog, { open: editOpen, editId: item.id, initialText: item.text, keepImages: item.images ?? [], onClose: () => setEditOpen(false) }, item.id), _jsx(ConfirmDialog, { open: confirmDelete, title: "\u8981\u5220\u9664\u52A8\u6001\u5417\uFF1F", description: "\u52A8\u6001\u5220\u9664\u540E\u5C06\u65E0\u6CD5\u6062\u590D\uFF0C\u8BF7\u8C28\u614E\u64CD\u4F5C", confirmLabel: "\u786E\u8BA4\u5220\u9664", destructive: true, loading: busy, onCancel: () => {
                    if (!busy)
                        setConfirmDelete(false);
                }, onConfirm: () => void handleDelete() })] }));
}
export function MyDynamicsPanel({ mid, profile }) {
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const offsetRef = useRef("");
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [publishOpen, setPublishOpen] = useState(false);
    const fallbackName = profile?.name ?? "用户";
    const fallbackFace = profile?.face ?? "";
    const load = useCallback(async (append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const result = await window.biliDesk.bili.getSpaceDynamics(mid, append ? offsetRef.current : "");
            offsetRef.current = result.offset;
            setHasMore(result.hasMore);
            setItems((prev) => append ? [...prev, ...result.items] : result.items);
        }
        catch (err) {
            setError(formatError(err));
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [mid]);
    useEffect(() => {
        offsetRef.current = "";
        void load(false);
    }, [load]);
    useEffect(() => {
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore || loading || loadingMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void load(true);
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, load, loading, loadingMore]);
    const handlePinned = (id, pinned) => {
        setItems((prev) => {
            const next = prev.map((entry) => entry.id === id
                ? { ...entry, pinned }
                : pinned
                    ? { ...entry, pinned: false }
                    : entry);
            if (!pinned)
                return next;
            const target = next.find((entry) => entry.id === id);
            if (!target)
                return next;
            return [target, ...next.filter((entry) => entry.id !== id)];
        });
    };
    if (loading && items.length === 0) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u52A8\u6001..."] }));
    }
    if (error && items.length === 0) {
        return _jsx("p", { className: "text-sm text-red-400", children: error });
    }
    if (items.length === 0) {
        return (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "flex justify-end", children: _jsx("button", { type: "button", className: "rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary", onClick: () => setPublishOpen(true), children: "\u53D1\u52A8\u6001" }) }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u52A8\u6001" }), _jsx(PublishDynamicDialog, { open: publishOpen, onClose: () => setPublishOpen(false), onPublished: () => {
                        offsetRef.current = "";
                        void load(false);
                    } })] }));
    }
    return (_jsxs("div", { ref: scrollRef, className: "max-h-[70vh] space-y-4 overflow-y-auto pr-1", children: [_jsx("div", { className: "flex justify-end", children: _jsx("button", { type: "button", className: "rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary", onClick: () => setPublishOpen(true), children: "\u53D1\u52A8\u6001" }) }), _jsx(PublishDynamicDialog, { open: publishOpen, onClose: () => setPublishOpen(false), onPublished: () => {
                    offsetRef.current = "";
                    void load(false);
                } }), items.map((item) => (_jsx(DynamicCard, { item: item, fallbackName: fallbackName, fallbackFace: fallbackFace, onPinned: handlePinned, onRemoved: (id) => setItems((prev) => prev.filter((entry) => entry.id !== id)) }, item.id))), _jsx("div", { ref: sentinelRef, className: cn("py-4 text-center text-sm text-muted-foreground"), children: loadingMore
                    ? "加载更多..."
                    : hasMore
                        ? "继续下滑加载更多"
                        : "已经到底啦" }), error && _jsx("p", { className: "text-sm text-red-400", children: error })] }));
}
