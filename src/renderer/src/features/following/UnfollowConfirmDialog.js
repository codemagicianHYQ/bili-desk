import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BiliImage } from "@/components/ui/bili-image";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UserMinus } from "lucide-react";
export function UnfollowConfirmDialog({ up, loading, error, onConfirm, onCancel, }) {
    return (_jsx(ConfirmDialog, { open: up != null, title: "\u53D6\u6D88\u5173\u6CE8", description: up
            ? `确定取消关注「${up.uname}」吗？之后可在 UP 主页面重新关注。`
            : undefined, confirmLabel: "\u53D6\u6D88\u5173\u6CE8", cancelLabel: "\u4FDD\u7559\u5173\u6CE8", destructive: true, loading: loading, onConfirm: onConfirm, onCancel: onCancel, children: up && (_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "relative shrink-0", children: [_jsx(BiliImage, { src: up.face, alt: "", className: "h-12 w-12 rounded-full object-cover ring-2 ring-border" }), _jsx("span", { className: "absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-red-400", children: _jsx(UserMinus, { className: "h-3.5 w-3.5" }) })] }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate font-medium", children: up.uname }), _jsx("p", { className: "line-clamp-1 text-xs text-muted-foreground", children: up.sign || "暂无签名" }), error ? (_jsx("p", { className: "mt-1 text-xs text-red-400", children: error })) : null] })] })) }));
}
