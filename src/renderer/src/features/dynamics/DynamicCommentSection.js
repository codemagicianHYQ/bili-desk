import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommentThread } from "@/components/comment/CommentThread";
import { useFocusComment } from "@/components/comment/focus-comment";
import { commentRpid, stripComment } from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { CommentImagePicker } from "@/components/comment/CommentImagePicker";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { Button } from "@/components/ui/button";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { extractIpcErrorMessage, formatCommentLoadError, } from "@/lib/ipc-error";
import { useAppStore } from "@/stores/app-store";
import { Loader2 } from "lucide-react";
function closestScrollRoot(start) {
    let node = start?.parentElement ?? null;
    while (node && node !== document.documentElement) {
        const { overflowY } = getComputedStyle(node);
        if (/(auto|scroll|overlay)/.test(overflowY))
            return node;
        node = node.parentElement;
    }
    return null;
}
export function DynamicCommentSection({ oid, type, replyCount = 0, ownerMid, focusRpid = 0, focusRoot = 0, }) {
    const selfMid = useAppStore((state) => state.user?.mid);
    const [sort, setSort] = useState(0);
    const [comments, setComments] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(replyCount);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [draft, setDraft] = useState("");
    const [draftFiles, setDraftFiles] = useState([]);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [closed, setClosed] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const loadingMoreRef = useRef(false);
    const commentsRef = useRef([]);
    const nextOffsetRef = useRef("");
    const pendingRef = useRef(null);
    commentsRef.current = comments;
    useReplyEmotes();
    const hasMoreRef = useRef(hasMore);
    const pageRef = useRef(page);
    const sortRef = useRef(sort);
    const sentinelRef = useRef(null);
    hasMoreRef.current = hasMore;
    pageRef.current = page;
    sortRef.current = sort;
    const handlers = useMemo(() => ({
        like: (item, next) => window.biliDesk.bili.likeTargetComment(oid, type, item.rpid, next),
        hate: (item, next) => window.biliDesk.bili.hateComment(oid, type, commentRpid(item), next),
        delete: (item) => window.biliDesk.bili.deleteComment(oid, type, commentRpid(item)),
        report: (item, reason) => window.biliDesk.bili.reportComment(oid, type, commentRpid(item), reason),
        pin: (item, pin) => window.biliDesk.bili.pinComment(oid, type, item.rpid, pin),
        reply: async (item, text, images) => {
            const root = item.root > 0 ? item.root : item.rpid;
            await window.biliDesk.bili.addTargetComment(oid, type, text, root, item.rpid, images);
        },
        loadMoreReplies: (item, pageNo) => window.biliDesk.bili.getTargetCommentReplies(oid, type, item.rpid, pageNo),
    }), [oid, type]);
    const loadComments = useCallback(async (nextPage, nextSort, reset, keepVisible = false) => {
        if (!oid || !type) {
            setLoading(false);
            setComments([]);
            return;
        }
        if (reset) {
            if (!keepVisible) {
                setLoading(true);
                setComments([]);
                setHasMore(false);
            }
            nextOffsetRef.current = "";
        }
        else {
            if (loadingMoreRef.current)
                return;
            loadingMoreRef.current = true;
            setLoadingMore(true);
        }
        setError("");
        setClosed(false);
        try {
            const result = await window.biliDesk.bili.getTargetComments(oid, type, nextPage, nextSort, reset ? "" : nextOffsetRef.current, reset ? focusRpid : 0);
            const pending = pendingRef.current;
            let mergedLength = 0;
            setComments((prev) => {
                const base = reset ? result.comments : prev;
                const seen = new Set(base.map((item) => item.rpid));
                const merged = reset ? [...result.comments] : [...prev];
                if (!reset) {
                    for (const item of result.comments) {
                        if (seen.has(item.rpid))
                            continue;
                        seen.add(item.rpid);
                        merged.push(item);
                    }
                }
                if (pending && !merged.some((item) => item.rpid === pending.rpid)) {
                    merged.unshift(pending);
                }
                commentsRef.current = merged;
                mergedLength = merged.length;
                return merged;
            });
            nextOffsetRef.current = result.nextOffset ?? "";
            setPage(result.page);
            setHasMore(result.hasMore && result.comments.length > 0);
            setTotal(Math.max(result.acount || 0, result.count || 0, mergedLength, replyCount));
        }
        catch (err) {
            const formatted = formatCommentLoadError(err);
            if (formatted.closed) {
                setClosed(true);
                setError("");
                if (reset) {
                    setComments([]);
                    setHasMore(false);
                }
            }
            else {
                setError(formatted.message);
                if (!reset)
                    setHasMore(false);
            }
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
            loadingMoreRef.current = false;
        }
    }, [focusRpid, oid, type, replyCount]);
    const loadFocusedReplies = useCallback(async (root) => {
        const collected = [];
        const seen = new Set();
        let pageNo = 1;
        let hasMore = true;
        while (hasMore && pageNo <= 15) {
            const page = await window.biliDesk.bili.getTargetCommentReplies(oid, type, root, pageNo);
            for (const item of page.comments) {
                if (seen.has(item.rpid))
                    continue;
                seen.add(item.rpid);
                collected.push(item);
            }
            hasMore = page.hasMore && page.comments.length > 0;
            if (collected.some((item) => item.rpid === focusRpid ||
                item.replies?.some((reply) => reply.rpid === focusRpid)) &&
                pageNo >= 2) {
                break;
            }
            pageNo += 1;
        }
        return collected;
    }, [focusRpid, oid, type]);
    useFocusComment({
        comments,
        setComments,
        focusRpid,
        focusRoot,
        loadReplies: loadFocusedReplies,
    });
    useEffect(() => {
        nextOffsetRef.current = "";
        void loadComments(1, sort, true);
    }, [oid, type, sort, reloadToken, loadComments]);
    const handleLoadMore = useCallback(() => {
        if (loading || loadingMoreRef.current || !hasMoreRef.current)
            return;
        void loadComments(pageRef.current + 1, sortRef.current, false);
    }, [loading, loadComments]);
    useEffect(() => {
        const target = sentinelRef.current;
        if (!target || loading || !hasMore)
            return;
        const root = closestScrollRoot(target);
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                handleLoadMore();
        }, { root, rootMargin: "400px 0px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, loading, comments.length, handleLoadMore]);
    const handleDeleted = useCallback((rpid) => {
        if (pendingRef.current?.rpid === rpid)
            pendingRef.current = null;
        const stripped = stripComment(commentsRef.current, rpid);
        commentsRef.current = stripped.list;
        setComments(stripped.list);
        setTotal((count) => Math.max(0, count - Math.max(stripped.removed, 1)));
    }, []);
    const handleSend = async () => {
        const text = draft.trim();
        if ((!text && draftFiles.length === 0) || !oid || !type)
            return;
        setSending(true);
        setError("");
        try {
            const images = await imageFilesToPayload(draftFiles);
            const created = await window.biliDesk.bili.addTargetComment(oid, type, text, 0, 0, images);
            setDraft("");
            setDraftFiles([]);
            if (created) {
                pendingRef.current = created;
                setComments((prev) => prev.some((item) => item.rpid === created.rpid)
                    ? prev
                    : [created, ...prev]);
                setTotal((count) => count + 1);
                setLoading(false);
            }
            await loadComments(1, sort, true, true);
            pendingRef.current = null;
        }
        catch (err) {
            const formatted = formatCommentLoadError(err);
            if (formatted.closed) {
                setClosed(true);
                setError("");
            }
            else {
                setError(extractIpcErrorMessage(err) || "发表评论失败");
            }
        }
        finally {
            setSending(false);
        }
    };
    return (_jsxs("section", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("h2", { className: "text-base font-semibold", children: ["\u8BC4\u8BBA ", total > 0 ? total : ""] }), !closed && (_jsxs("div", { className: "flex gap-2 text-sm", children: [_jsx("button", { type: "button", className: cn("rounded-full px-3 py-1 transition-colors", sort === 0
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground"), onClick: () => setSort(0), children: "\u6700\u70ED" }), _jsx("button", { type: "button", className: cn("rounded-full px-3 py-1 transition-colors", sort === 2
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground"), onClick: () => setSort(2), children: "\u6700\u65B0" })] }))] }), !closed && (_jsxs("div", { className: "flex gap-3", children: [_jsx("textarea", { value: draft, onChange: (e) => setDraft(e.target.value), rows: 2, placeholder: "\u53D1\u4E00\u6761\u53CB\u5584\u7684\u8BC4\u8BBA\u5427", className: "min-h-[64px] flex-1 resize-none rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm outline-none focus:border-primary/50" }), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx(EmotePickerButton, { onPick: (emote) => setDraft((prev) => prev + emote) }), _jsx(CommentImagePicker, { files: draftFiles, onChange: setDraftFiles, disabled: sending }), _jsx(Button, { size: "sm", disabled: sending || (!draft.trim() && draftFiles.length === 0), onClick: () => void handleSend(), children: sending ? "发送中" : "发表" })] })] })), error && _jsx("p", { className: "text-sm text-red-400", children: error }), loading ? (_jsxs("div", { className: "flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u8BC4\u8BBA\u4E2D..."] })) : closed ? (_jsx("p", { className: "py-10 text-center text-sm text-muted-foreground", children: "UP\u4E3B\u5DF2\u5173\u95ED\u8BC4\u8BBA\u533A" })) : comments.length === 0 ? (_jsx("p", { className: "py-10 text-center text-sm text-muted-foreground", children: "\u8FD8\u6CA1\u6709\u8BC4\u8BBA\uFF0C\u6765\u62A2\u6C99\u53D1\u5427" })) : (_jsxs("div", { className: "space-y-1", children: [comments.map((item) => (_jsx(CommentThread, { item: item, ownerMid: ownerMid, selfMid: selfMid, subjectType: type, handlers: handlers, highlightRpid: focusRpid, onChanged: () => setReloadToken((token) => token + 1), onDeleted: handleDeleted }, item.rpid))), _jsx("div", { ref: sentinelRef, className: "flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground", children: loadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u66F4\u591A\u8BC4\u8BBA..."] })) : hasMore ? ("继续下滑加载更多") : ("已经到底啦") })] }))] }));
}
