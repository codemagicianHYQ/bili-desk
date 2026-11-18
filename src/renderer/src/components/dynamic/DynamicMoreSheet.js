import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState, } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { formatDisplayedError } from "@/lib/ipc-error";
import { upRelationCache } from "@/lib/session-data-cache";
import { cn } from "@/lib/utils";
import { useFollowingStore } from "@/stores/following-store";
import { AlertTriangle, Share2, Trash2, UserMinus } from "lucide-react";
/** 网页动态三点「举报」理由，reason_type 与接口一致 */
const DYNAMIC_REPORT_REASONS = [
    { id: 3, label: "违法违规" },
    { id: 1, label: "色情低俗" },
    { id: 4, label: "垃圾广告" },
    { id: 5, label: "人身攻击" },
    { id: 6, label: "侵犯隐私" },
    { id: 8, label: "引战" },
    { id: 0, label: "其他" },
];
function shareUrl(item) {
    if (item.bvid)
        return `https://www.bilibili.com/video/${item.bvid}`;
    if (item.cvId)
        return `https://www.bilibili.com/read/cv${item.cvId}`;
    if (item.liveRoomId)
        return `https://live.bilibili.com/${item.liveRoomId}`;
    return `https://www.bilibili.com/opus/${item.id}`;
}
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
export function DynamicMoreSheet({ open, anchorRef, item, isOwn, authorName, onClose, onTip, onRemoved, onUnfollowed, }) {
    const patchFollowing = useFollowingStore((state) => state.patchFollowing);
    const removeMidFromTagLists = useFollowingStore((state) => state.removeMidFromTagLists);
    const invalidateSidebar = useFollowingStore((state) => state.invalidateSidebar);
    const [view, setView] = useState("main");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmUnfollow, setConfirmUnfollow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pos, setPos] = useState({ top: 0, right: 8 });
    const panelRef = useRef(null);
    useEffect(() => {
        if (!open)
            setView("main");
    }, [open]);
    useLayoutEffect(() => {
        if (!open)
            return;
        const place = () => {
            const anchor = anchorRef.current?.getBoundingClientRect();
            if (!anchor)
                return;
            const height = panelRef.current?.offsetHeight ?? 160;
            const gap = 6;
            const right = Math.max(8, window.innerWidth - anchor.right);
            let top = anchor.bottom + gap;
            if (top + height > window.innerHeight - 8 &&
                anchor.top - gap - height > 8) {
                top = anchor.top - gap - height;
            }
            setPos({ top, right });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, view, anchorRef]);
    const closeAll = () => {
        if (busy)
            return;
        setView("main");
        onClose();
    };
    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl(item));
            onClose();
            onTip("链接已复制");
        }
        catch {
            onTip("复制失败");
        }
    };
    const handleUnfollow = async () => {
        const mid = item.authorMid;
        if (!mid || busy)
            return;
        setBusy(true);
        try {
            await window.biliDesk.bili.modifyFollow(mid, false);
            patchFollowing(mid, null);
            removeMidFromTagLists(mid);
            invalidateSidebar();
            upRelationCache.set(String(mid), {
                isFollowing: false,
                attribute: 0,
                special: false,
            });
            setConfirmUnfollow(false);
            onClose();
            onUnfollowed?.(mid);
            onTip(`已取消关注「${authorName}」`);
        }
        catch (err) {
            onTip(formatError(err));
        }
        finally {
            setBusy(false);
        }
    };
    const handleDelete = async () => {
        if (busy)
            return;
        setBusy(true);
        try {
            await window.biliDesk.bili.removeDynamic(item.id);
            setConfirmDelete(false);
            onClose();
            onRemoved?.(item.id);
            onTip("已删除");
        }
        catch (err) {
            onTip(formatError(err));
            setBusy(false);
        }
    };
    const handleReport = async (reasonType) => {
        const mid = item.authorMid;
        if (!mid || busy)
            return;
        setBusy(true);
        try {
            await window.biliDesk.bili.reportDynamic(item.id, mid, reasonType);
            setView("main");
            onClose();
            onTip("已提交举报");
        }
        catch (err) {
            onTip(formatError(err));
        }
        finally {
            setBusy(false);
        }
    };
    const row = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#e3e5e7] transition-colors hover:bg-white/5 disabled:opacity-50";
    return (_jsxs(_Fragment, { children: [open && (_jsxs(OverlayPortal, { children: [_jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u52A8\u6001\u8BBE\u7F6E", className: cn("fixed inset-0 cursor-default border-0 bg-transparent p-0", APP_OVERLAY_ZCLASS), onMouseDown: (event) => {
                            event.preventDefault();
                            closeAll();
                        } }), _jsx("div", { ref: panelRef, role: "menu", className: cn("fixed w-40 overflow-hidden rounded-xl bg-[#2b2d31] py-1 shadow-2xl ring-1 ring-white/10", APP_OVERLAY_ZCLASS), style: { top: pos.top, right: pos.right }, onMouseDown: (event) => event.stopPropagation(), children: view === "report" ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "px-3 pb-1 pt-1.5 text-xs text-[#9499a0]", children: "\u9009\u62E9\u4E3E\u62A5\u7406\u7531" }), DYNAMIC_REPORT_REASONS.map((reason) => (_jsx("button", { type: "button", disabled: busy, className: row, onClick: () => void handleReport(reason.id), children: reason.label }, reason.id))), _jsx("button", { type: "button", className: cn(row, "text-[#9499a0]"), onClick: () => setView("main"), children: "\u8FD4\u56DE" })] })) : (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: row, onClick: () => void handleShare(), children: [_jsx(Share2, { className: "h-4 w-4 text-[#fb7299]" }), "\u5206\u4EAB"] }), !isOwn && item.authorMid ? (_jsxs("button", { type: "button", disabled: busy, className: row, onClick: () => {
                                        onClose();
                                        setConfirmUnfollow(true);
                                    }, children: [_jsx(UserMinus, { className: "h-4 w-4 text-[#fb7299]" }), "\u53D6\u6D88\u5173\u6CE8"] })) : null, !isOwn && item.authorMid ? (_jsxs("button", { type: "button", disabled: busy, className: row, onClick: () => setView("report"), children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-[#fb7299]" }), "\u4E3E\u62A5"] })) : null, isOwn ? (_jsxs("button", { type: "button", disabled: busy, className: cn(row, "text-rose-400"), onClick: () => {
                                        onClose();
                                        setConfirmDelete(true);
                                    }, children: [_jsx(Trash2, { className: "h-4 w-4" }), "\u5220\u9664"] })) : null] })) })] })), _jsx(ConfirmDialog, { open: confirmUnfollow, title: `取消关注「${authorName}」？`, description: "\u53D6\u6D88\u540E\uFF0C\u5BF9\u65B9\u7684\u65B0\u52A8\u6001\u4E0D\u4F1A\u518D\u51FA\u73B0\u5728\u5173\u6CE8\u52A8\u6001\u91CC", confirmLabel: "\u53D6\u6D88\u5173\u6CE8", destructive: true, loading: busy, onCancel: () => {
                    if (!busy)
                        setConfirmUnfollow(false);
                }, onConfirm: () => void handleUnfollow() }), _jsx(ConfirmDialog, { open: confirmDelete, title: "\u8981\u5220\u9664\u52A8\u6001\u5417\uFF1F", description: "\u52A8\u6001\u5220\u9664\u540E\u5C06\u65E0\u6CD5\u6062\u590D\uFF0C\u8BF7\u8C28\u614E\u64CD\u4F5C", confirmLabel: "\u786E\u8BA4\u5220\u9664", destructive: true, loading: busy, onCancel: () => {
                    if (!busy)
                        setConfirmDelete(false);
                }, onConfirm: () => void handleDelete() })] }));
}
