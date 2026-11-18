import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { FollowButton } from "@/components/video/FollowButton";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
function formatListError(err) {
    return extractIpcErrorMessage(err) || "列表加载失败";
}
export function UpRelationListPanel({ mid, type, ownerName, onClose, onPrivacyBlocked, }) {
    const scrollRef = useRef(null);
    const loadSeqRef = useRef(0);
    const onCloseRef = useRef(onClose);
    const onPrivacyBlockedRef = useRef(onPrivacyBlocked);
    const [users, setUsers] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [followPendingMid, setFollowPendingMid] = useState(null);
    onCloseRef.current = onClose;
    onPrivacyBlockedRef.current = onPrivacyBlocked;
    const title = type === "followers" ? `${ownerName} 的粉丝` : `${ownerName} 的关注`;
    const loadPage = useCallback(async (nextPage, append) => {
        const seq = ++loadSeqRef.current;
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const result = await window.biliDesk.bili.getUserRelationList(mid, type, nextPage);
            if (seq !== loadSeqRef.current)
                return;
            if (result.privacyBlocked) {
                onPrivacyBlockedRef.current(result.message ||
                    (type === "followers"
                        ? "由于该用户隐私设置，粉丝列表不可见"
                        : "由于该用户隐私设置，关注列表不可见"));
                onCloseRef.current();
                return;
            }
            setUsers((prev) => append ? [...prev, ...result.users] : result.users);
            setPage(result.page);
            setTotal(result.total);
            setHasMore(result.hasMore);
            setError("");
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            const message = formatListError(err);
            if (message.includes("隐私")) {
                onPrivacyBlockedRef.current(message);
                onCloseRef.current();
                return;
            }
            setError(message);
            if (!append)
                setUsers([]);
        }
        finally {
            if (seq === loadSeqRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [mid, type]);
    useEffect(() => {
        void loadPage(1, false);
    }, [loadPage]);
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "Escape")
                onCloseRef.current();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el || loading || loadingMore || !hasMore)
            return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
            void loadPage(page + 1, true);
        }
    };
    const handleFollowToggle = async (user) => {
        const nextFollow = !(user.isFollowing || user.mutual);
        setFollowPendingMid(user.mid);
        try {
            await window.biliDesk.bili.modifyFollow(user.mid, nextFollow);
            setUsers((prev) => prev.map((item) => item.mid === user.mid
                ? {
                    ...item,
                    isFollowing: nextFollow,
                    mutual: nextFollow ? item.mutual : false,
                }
                : item));
        }
        catch (err) {
            setError(formatListError(err));
        }
        finally {
            setFollowPendingMid(null);
        }
    };
    return createPortal(_jsx("div", { className: `fixed inset-0 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`, "data-glass-scrim": true, onClick: () => onCloseRef.current(), children: _jsxs("div", { "data-glass-panel": true, className: "bili-glass flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card/40 shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "flex items-center justify-between border-b border-border px-5 py-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-semibold", children: title }), total > 0 && (_jsxs("p", { className: "mt-0.5 text-xs text-muted-foreground", children: ["\u5171 ", total.toLocaleString(), " \u4EBA"] }))] }), _jsx(Button, { type: "button", size: "sm", variant: "ghost", className: "h-8 w-8 p-0", onClick: () => onCloseRef.current(), "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { ref: scrollRef, className: "min-h-0 flex-1 overflow-y-auto px-4 py-3", onScroll: handleScroll, children: [loading && users.length === 0 ? (_jsx("p", { className: "py-10 text-center text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." })) : error && users.length === 0 ? (_jsxs("div", { className: "space-y-3 py-10 text-center", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void loadPage(1, false), children: "\u91CD\u65B0\u52A0\u8F7D" })] })) : users.length === 0 ? (_jsx("p", { className: "py-10 text-center text-sm text-muted-foreground", children: "\u6682\u65E0\u6570\u636E" })) : (_jsx("ul", { className: "space-y-2", children: users.map((user) => (_jsxs("li", { className: "flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/20 px-3 py-3", children: [_jsx(Link, { to: `/up/${user.mid}`, className: "shrink-0", onClick: () => onCloseRef.current(), children: _jsx(BiliImage, { src: user.face, alt: "", className: "h-11 w-11 rounded-full object-cover" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx(Link, { to: `/up/${user.mid}`, className: "truncate font-medium hover:text-primary", onClick: () => onCloseRef.current(), children: user.uname }), user.official?.title ? (_jsx("p", { className: "mt-0.5 truncate text-xs text-primary", children: user.official.title })) : null, _jsx("p", { className: "mt-1 line-clamp-2 text-xs text-muted-foreground", children: user.sign || "暂无签名" })] }), _jsx(FollowButton, { size: "sm", isFollowing: Boolean(user.isFollowing || user.mutual), loading: followPendingMid === user.mid, onClick: () => void handleFollowToggle(user), className: "shrink-0" })] }, user.mid))) })), loadingMore && (_jsx("p", { className: "py-3 text-center text-xs text-muted-foreground", children: "\u52A0\u8F7D\u66F4\u591A..." })), !hasMore && users.length > 0 && !loadingMore && (_jsx("p", { className: "py-3 text-center text-xs text-muted-foreground", children: "\u5DF2\u7ECF\u5230\u5E95\u5566" })), error && users.length > 0 && (_jsx("p", { className: cn("py-2 text-center text-xs text-red-400"), children: error }))] })] }) }), document.body);
}
