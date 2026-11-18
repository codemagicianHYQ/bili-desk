import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, formatCount } from "@/lib/utils";
import { Copy, Flag, MessageCircle, ThumbsDown, ThumbsUp, Trash2, } from "lucide-react";
export const COMMENT_REPORT_REASONS = [
    { id: 1, label: "违法违规" },
    { id: 2, label: "色情低俗" },
    { id: 4, label: "赌博诈骗" },
    { id: 6, label: "人身攻击" },
    { id: 7, label: "引战" },
    { id: 8, label: "剧透" },
    { id: 9, label: "恶意刷屏" },
    { id: 0, label: "其他" },
];
export function CommentActionBar({ leading, liked, hated, likeCount, liking, hating, deleting, reporting, isOwn, canDelete, copyText, onLike, onHate, onReply, onDelete, onReport, canPin = false, pinned = false, onPin, reportSignal = 0, }) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [copyTip, setCopyTip] = useState("");
    useEffect(() => {
        if (reportSignal > 0)
            setShowReport(true);
    }, [reportSignal]);
    const handleCopy = async () => {
        const text = copyText?.trim();
        if (!text)
            return;
        try {
            await navigator.clipboard.writeText(text);
            setCopyTip("已复制");
        }
        catch {
            setCopyTip("复制失败");
        }
        window.setTimeout(() => setCopyTip(""), 1600);
    };
    return (_jsxs("div", { className: "mt-1.5 space-y-2", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 text-xs text-muted-foreground", children: [leading, _jsxs("button", { type: "button", disabled: liking, onClick: onLike, className: cn("inline-flex items-center gap-1 transition-colors hover:text-primary", liked && "text-primary"), children: [_jsx(ThumbsUp, { className: cn("h-3.5 w-3.5", liked && "fill-current") }), likeCount > 0 ? formatCount(likeCount) : "点赞"] }), _jsxs("button", { type: "button", disabled: hating, onClick: onHate, className: cn("inline-flex items-center gap-1 transition-colors hover:text-primary", hated && "text-primary"), children: [_jsx(ThumbsDown, { className: cn("h-3.5 w-3.5", hated && "fill-current") }), "\u70B9\u8E29"] }), _jsxs("button", { type: "button", onClick: onReply, className: "inline-flex items-center gap-1 transition-colors hover:text-primary", children: [_jsx(MessageCircle, { className: "h-3.5 w-3.5" }), "\u56DE\u590D"] }), canPin && onPin && (_jsx("button", { type: "button", onClick: onPin, className: cn("inline-flex items-center gap-1 transition-colors hover:text-primary", pinned && "text-primary"), children: pinned ? "取消置顶" : "置顶" })), copyText?.trim() && (_jsxs("button", { type: "button", onClick: () => void handleCopy(), className: "inline-flex items-center gap-1 transition-colors hover:text-primary", children: [_jsx(Copy, { className: "h-3.5 w-3.5" }), copyTip || "复制评论"] })), canDelete &&
                        (confirmDelete ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", disabled: deleting, onClick: onDelete, className: "text-red-400 transition-colors hover:text-red-300", children: deleting ? "删除中..." : "确认删除" }), _jsx("button", { type: "button", onClick: () => setConfirmDelete(false), className: "transition-colors hover:text-foreground", children: "\u53D6\u6D88" })] })) : (_jsxs("button", { type: "button", onClick: () => setConfirmDelete(true), className: "inline-flex items-center gap-1 transition-colors hover:text-red-400", children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), "\u5220\u9664"] }))), !isOwn && (_jsxs("button", { type: "button", onClick: () => setShowReport((open) => !open), className: "inline-flex items-center gap-1 transition-colors hover:text-primary", children: [_jsx(Flag, { className: "h-3.5 w-3.5" }), "\u4E3E\u62A5"] }))] }), showReport && !isOwn && (_jsx("div", { className: "flex flex-wrap gap-1.5", children: COMMENT_REPORT_REASONS.map((reason) => (_jsx(Button, { type: "button", size: "sm", variant: "outline", disabled: reporting, className: "h-7 px-2 text-xs", onClick: () => {
                        onReport(reason.id);
                        setShowReport(false);
                    }, children: reason.label }, reason.id))) }))] }));
}
