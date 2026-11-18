import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatPubdate } from "@/lib/utils";
import { Ban, Loader2, UserCheck } from "lucide-react";
export function BlacklistPanel() {
    const [users, setUsers] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [target, setTarget] = useState(null);
    const [unblocking, setUnblocking] = useState(false);
    const [message, setMessage] = useState("");
    const loadPage = useCallback(async (nextPage, append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const result = await window.biliDesk.bili.getBlacklist(nextPage);
            setUsers((prev) => (append ? [...prev, ...result.users] : result.users));
            setPage(result.page);
            setTotal(result.total);
            setHasMore(result.hasMore);
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "黑名单加载失败"));
            if (!append)
                setUsers([]);
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);
    useEffect(() => {
        void loadPage(1, false);
    }, [loadPage]);
    const handleUnblock = async () => {
        const up = target;
        if (!up)
            return;
        setUnblocking(true);
        try {
            await window.biliDesk.bili.modifyBlock(up.mid, false);
            setUsers((prev) => prev.filter((item) => item.mid !== up.mid));
            setTotal((prev) => Math.max(0, prev - 1));
            setMessage(`已将「${up.uname}」移出黑名单`);
            setTarget(null);
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "取消拉黑失败"));
        }
        finally {
            setUnblocking(false);
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u4E0E B \u7AD9\u8D26\u53F7\u540C\u6B65\u3002\u53D6\u6D88\u62C9\u9ED1\u540E\u53EF\u91CD\u65B0\u5173\u6CE8\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u52A0\u56DE\u5173\u6CE8\u5217\u8868\u3002" }), (error || message) && (_jsx("p", { className: `text-xs ${error ? "text-red-400" : "text-foreground"}`, children: error || message })), loading ? (_jsxs("div", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u9ED1\u540D\u5355..."] })) : users.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center", children: [_jsx(Ban, { className: "mb-3 h-8 w-8 text-muted-foreground/60" }), _jsx("p", { className: "text-sm font-medium", children: "\u9ED1\u540D\u5355\u662F\u7A7A\u7684" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "\u88AB\u62C9\u9ED1\u7684\u7528\u6237\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC" })] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u5171 ", total, " \u4EBA"] }), _jsx("div", { className: "space-y-2", children: users.map((user) => (_jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3", children: [_jsx(Link, { to: `/up/${user.mid}`, className: "shrink-0", children: _jsx(BiliImage, { src: user.face, alt: "", className: "h-11 w-11 rounded-full object-cover" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx(Link, { to: `/up/${user.mid}`, className: "truncate text-sm font-medium hover:text-primary", children: user.uname }), _jsx("p", { className: "truncate text-xs text-muted-foreground", children: user.sign || "暂无签名" }), user.blockedAt ? (_jsxs("p", { className: "mt-0.5 text-[11px] text-muted-foreground/80", children: ["\u62C9\u9ED1\u4E8E ", formatPubdate(user.blockedAt)] })) : null] }), _jsxs(Button, { type: "button", size: "sm", variant: "secondary", className: "shrink-0 gap-1", onClick: () => {
                                        setError("");
                                        setTarget(user);
                                    }, children: [_jsx(UserCheck, { className: "h-3.5 w-3.5" }), "\u53D6\u6D88\u62C9\u9ED1"] })] }, user.mid))) }), hasMore && (_jsx("div", { className: "flex justify-center pt-2", children: _jsx(Button, { type: "button", variant: "secondary", disabled: loadingMore, onClick: () => void loadPage(page + 1, true), children: loadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2D..."] })) : ("加载更多") }) }))] })), _jsx(ConfirmDialog, { open: target != null, title: "\u53D6\u6D88\u62C9\u9ED1", description: target
                    ? `确定将「${target.uname}」移出黑名单吗？之后可以重新关注。`
                    : undefined, confirmLabel: "\u53D6\u6D88\u62C9\u9ED1", cancelLabel: "\u5148\u7559\u7740", loading: unblocking, onConfirm: () => void handleUnblock(), onCancel: () => {
                    if (!unblocking)
                        setTarget(null);
                } })] }));
}
