import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { CommentThread } from "@/components/comment/CommentThread";
import { useFocusComment } from "@/components/comment/focus-comment";
import { commentRpid, stripComment } from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { CommentImagePicker } from "@/components/comment/CommentImagePicker";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { Button } from "@/components/ui/button";
import { VirtualList } from "@/components/ui/virtual-list";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { commentsCache, commentsCacheKey } from "@/lib/session-data-cache";
import { extractIpcErrorMessage, formatCommentLoadError, } from "@/lib/ipc-error";
import { formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Loader2 } from "lucide-react";
/** 虚拟列表只减 DOM，不减 JS 堆；热门稿评论加软上限防 OOM */
const MAX_COMMENTS = 800;
function estimateCommentSize(item) {
    const pics = item.pictures?.length ?? 0;
    let height = 132;
    height +=
        Math.min(10, Math.ceil((item.content?.trim().length ?? 0) / 42)) * 22;
    if (pics === 1)
        height += 300;
    else if (pics > 0)
        height += Math.ceil(pics / 3) * 168 + 12;
    height += Math.min(item.replies?.length ?? 0, 3) * 84;
    return height;
}
export function VideoCommentSection({ aid, bvid, ownerMid, replyCount = 0, scrollRootRef, focusRpid = 0, focusRoot = 0, }) {
    const selfMid = useAppStore((state) => state.user?.mid);
    const loadingMoreRef = useRef(false);
    const commentsRef = useRef([]);
    const nextOffsetRef = useRef("");
    const pendingRef = useRef(null);
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
    commentsRef.current = comments;
    useReplyEmotes();
    const handlers = useMemo(() => ({
        like: (item, next) => window.biliDesk.bili.likeComment(aid, item.rpid, next),
        hate: (item, next) => window.biliDesk.bili.hateComment(String(aid), 1, commentRpid(item), next),
        delete: (item) => window.biliDesk.bili.deleteComment(String(aid), 1, commentRpid(item)),
        report: (item, reason) => window.biliDesk.bili.reportComment(String(aid), 1, commentRpid(item), reason),
        pin: (item, pin) => window.biliDesk.bili.pinComment(String(aid), 1, item.rpid, pin),
        reply: async (item, text, images) => {
            const root = item.root > 0 ? item.root : item.rpid;
            await window.biliDesk.bili.addComment(aid, text, root, item.rpid, images);
        },
        loadMoreReplies: (item, pageNo) => window.biliDesk.bili.getCommentReplies(aid, item.rpid, pageNo),
    }), [aid]);
    const loadComments = useCallback(async (nextPage, nextSort, reset, keepVisible = false) => {
        if (reset) {
            loadingMoreRef.current = false;
            if (!keepVisible) {
                setLoading(true);
                setComments([]);
                commentsRef.current = [];
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
            const result = await window.biliDesk.bili.getComments(aid, nextPage, nextSort, reset ? "" : nextOffsetRef.current, reset ? focusRpid : 0);
            const prev = reset ? [] : commentsRef.current;
            const seen = new Set(prev.map((item) => item.rpid));
            const merged = reset ? [] : [...prev];
            let uniqueAdded = 0;
            const incoming = result.comments;
            for (const item of incoming) {
                if (merged.length >= MAX_COMMENTS)
                    break;
                if (seen.has(item.rpid))
                    continue;
                seen.add(item.rpid);
                merged.push(item);
                uniqueAdded += 1;
            }
            const pending = pendingRef.current;
            if (pending && !seen.has(pending.rpid)) {
                merged.unshift(pending);
                seen.add(pending.rpid);
            }
            commentsRef.current = merged;
            nextOffsetRef.current = result.nextOffset ?? "";
            setComments(merged);
            setPage(result.page);
            const underCap = merged.length < MAX_COMMENTS;
            const hasMoreNext = Boolean(result.hasMore) && underCap && (reset || uniqueAdded > 0);
            setHasMore(hasMoreNext);
            const nextTotal = Math.max(result.acount || 0, result.count || 0, merged.length, replyCount);
            setTotal(nextTotal);
            commentsCache.set(commentsCacheKey(aid, nextSort), {
                comments: merged,
                page: result.page,
                hasMore: hasMoreNext,
                total: nextTotal,
                nextOffset: result.nextOffset,
            });
        }
        catch (err) {
            const formatted = formatCommentLoadError(err);
            if (formatted.closed) {
                setClosed(true);
                setError("");
                if (reset) {
                    setComments([]);
                    commentsRef.current = [];
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
    }, [aid, focusRpid, replyCount]);
    const loadFocusedReplies = useCallback(async (root) => {
        const collected = [];
        const seen = new Set();
        let pageNo = 1;
        let hasMore = true;
        while (hasMore && pageNo <= 15) {
            const page = await window.biliDesk.bili.getCommentReplies(aid, root, pageNo);
            for (const item of page.comments) {
                if (seen.has(item.rpid))
                    continue;
                seen.add(item.rpid);
                collected.push(item);
            }
            hasMore = page.hasMore && page.comments.length > 0;
            // 已拉到定位评论所在页后，再多拉一页尽量补齐同层兄弟
            if (collected.some((item) => item.rpid === focusRpid ||
                item.replies?.some((reply) => reply.rpid === focusRpid)) &&
                pageNo >= 2) {
                break;
            }
            pageNo += 1;
        }
        return collected;
    }, [aid, focusRpid]);
    useFocusComment({
        comments,
        setComments,
        focusRpid,
        focusRoot,
        loadReplies: loadFocusedReplies,
    });
    useEffect(() => {
        if (focusRpid > 0) {
            nextOffsetRef.current = "";
            void loadComments(1, sort, true);
            return;
        }
        const cached = commentsCache.get(commentsCacheKey(aid, sort));
        if (cached) {
            commentsRef.current = cached.comments;
            nextOffsetRef.current = cached.nextOffset ?? "";
            setComments(cached.comments);
            setPage(cached.page);
            setHasMore(cached.hasMore);
            setTotal(cached.total);
            setLoading(false);
            setLoadingMore(false);
            setError("");
            setClosed(false);
            void loadComments(1, sort, true, true);
            return;
        }
        nextOffsetRef.current = "";
        void loadComments(1, sort, true);
    }, [aid, focusRpid, sort, loadComments]);
    const handleLoadMore = useCallback(() => {
        if (loading || loadingMoreRef.current || !hasMore)
            return;
        void loadComments(page + 1, sort, false);
    }, [loading, hasMore, page, sort, loadComments]);
    const handleDeleted = useCallback((rpid) => {
        if (pendingRef.current?.rpid === rpid)
            pendingRef.current = null;
        const stripped = stripComment(commentsRef.current, rpid);
        commentsRef.current = stripped.list;
        setComments(stripped.list);
        setTotal((count) => Math.max(0, count - Math.max(stripped.removed, 1)));
        commentsCache.delete(commentsCacheKey(aid, 0));
        commentsCache.delete(commentsCacheKey(aid, 2));
    }, [aid]);
    const handleSend = async () => {
        const text = draft.trim();
        if (!text && draftFiles.length === 0)
            return;
        setSending(true);
        setError("");
        try {
            const images = await imageFilesToPayload(draftFiles);
            const created = await window.biliDesk.bili.addComment(aid, text, 0, 0, images);
            setDraft("");
            setDraftFiles([]);
            commentsCache.delete(commentsCacheKey(aid, 0));
            commentsCache.delete(commentsCacheKey(aid, 2));
            if (created) {
                pendingRef.current = created;
                const next = [
                    created,
                    ...commentsRef.current.filter((item) => item.rpid !== created.rpid),
                ];
                commentsRef.current = next;
                setComments(next);
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
    return (_jsxs("section", { className: "space-y-4 rounded-2xl border border-border bg-card p-5", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("h2", { className: "text-base font-semibold", children: ["\u8BC4\u8BBA", _jsx("span", { className: "ml-2 text-sm font-normal text-muted-foreground", children: formatCount(total) })] }), !closed && (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx(Button, { type: "button", size: "sm", variant: sort === 0 ? "default" : "outline", onClick: () => setSort(0), children: "\u6309\u70ED\u5EA6" }), _jsx(Button, { type: "button", size: "sm", variant: sort === 2 ? "default" : "outline", onClick: () => setSort(2), children: "\u6309\u65F6\u95F4" })] }))] }), !closed && (_jsxs("div", { className: "space-y-2", children: [_jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), rows: 3, maxLength: 1000, placeholder: "\u53D1\u4E00\u6761\u53CB\u5584\u7684\u8BC4\u8BBA\u5427", className: "w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" }), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [_jsx(EmotePickerButton, { onPick: (emote) => setDraft((prev) => (prev + emote).slice(0, 1000)) }), _jsx(CommentImagePicker, { files: draftFiles, onChange: setDraftFiles, disabled: sending }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [draft.trim().length, "/1000"] })] }), _jsx(Button, { type: "button", size: "sm", disabled: sending || (!draft.trim() && draftFiles.length === 0), onClick: () => void handleSend(), children: sending ? "发送中..." : "发表评论" })] })] })), loading ? (_jsxs("p", { className: "flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u8BC4\u8BBA\u4E2D..."] })) : closed ? (_jsx("p", { className: "py-8 text-center text-sm text-muted-foreground", children: "UP\u4E3B\u5DF2\u5173\u95ED\u8BC4\u8BBA\u533A" })) : comments.length === 0 ? (_jsx("p", { className: "py-8 text-center text-sm text-muted-foreground", children: "\u8FD8\u6CA1\u6709\u8BC4\u8BBA\uFF0C\u6765\u62A2\u6C99\u53D1\u5427" })) : (_jsx(VirtualList, { items: comments, scrollRootRef: scrollRootRef, estimateSize: estimateCommentSize, overscan: 8, getItemKey: (item) => item.rpid, scrollToKey: focusRoot || focusRpid || null, onEndReached: handleLoadMore, renderItem: (item) => (_jsx("div", { className: "pb-1", children: _jsx(CommentThread, { item: item, ownerMid: ownerMid, selfMid: selfMid, bvid: bvid, handlers: handlers, highlightRpid: focusRpid, onChanged: () => void loadComments(1, sort, true), onDeleted: handleDeleted }) })), footer: _jsx("div", { className: "flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground", children: loadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u66F4\u591A\u8BC4\u8BBA..."] })) : hasMore ? ("继续下滑加载更多") : ("已经到底啦") }) })), error && _jsx("p", { className: "text-sm text-red-400", children: error })] }));
}
