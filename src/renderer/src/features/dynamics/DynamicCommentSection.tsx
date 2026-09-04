import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommentItem } from "@shared/types";
import { CommentThread } from "@/components/comment/CommentThread";
import { commentRpid, stripComment } from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { Button } from "@/components/ui/button";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Loader2 } from "lucide-react";

type CommentSort = 0 | 2;

interface DynamicCommentSectionProps {
  oid: string;
  type: number;
  replyCount?: number;
  ownerMid?: number;
}

function closestScrollRoot(start: HTMLElement | null): Element | null {
  let node: HTMLElement | null = start?.parentElement ?? null;
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

export function DynamicCommentSection({
  oid,
  type,
  replyCount = 0,
  ownerMid,
}: DynamicCommentSectionProps) {
  const selfMid = useAppStore((state) => state.user?.mid);
  const [sort, setSort] = useState<CommentSort>(0);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(replyCount);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const loadingMoreRef = useRef(false);
  const commentsRef = useRef<CommentItem[]>([]);
  const nextOffsetRef = useRef("");
  const pendingRef = useRef<CommentItem | null>(null);

  commentsRef.current = comments;
  useReplyEmotes();

  const hasMoreRef = useRef(hasMore);
  const pageRef = useRef(page);
  const sortRef = useRef(sort);
  const sentinelRef = useRef<HTMLDivElement>(null);
  hasMoreRef.current = hasMore;
  pageRef.current = page;
  sortRef.current = sort;

  const handlers = useMemo(
    () => ({
      like: (item: CommentItem, next: boolean) =>
        window.biliDesk.bili.likeTargetComment(oid, type, item.rpid, next),
      hate: (item: CommentItem, next: boolean) =>
        window.biliDesk.bili.hateComment(oid, type, commentRpid(item), next),
      delete: (item: CommentItem) =>
        window.biliDesk.bili.deleteComment(oid, type, commentRpid(item)),
      report: (item: CommentItem, reason: number) =>
        window.biliDesk.bili.reportComment(
          oid,
          type,
          commentRpid(item),
          reason,
        ),
      reply: (item: CommentItem, text: string) => {
        const root = item.root > 0 ? item.root : item.rpid;
        return window.biliDesk.bili.addTargetComment(
          oid,
          type,
          text,
          root,
          item.rpid,
        );
      },
      loadMoreReplies: (item: CommentItem, pageNo: number) =>
        window.biliDesk.bili.getTargetCommentReplies(
          oid,
          type,
          item.rpid,
          pageNo,
        ),
    }),
    [oid, type],
  );

  const loadComments = useCallback(
    async (
      nextPage: number,
      nextSort: CommentSort,
      reset: boolean,
      keepVisible = false,
    ) => {
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
      } else {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }
      setError("");
      try {
        const result = await window.biliDesk.bili.getTargetComments(
          oid,
          type,
          nextPage,
          nextSort,
          reset ? "" : nextOffsetRef.current,
        );
        const pending = pendingRef.current;
        let mergedLength = 0;
        setComments((prev) => {
          const base = reset ? result.comments : prev;
          const seen = new Set(base.map((item) => item.rpid));
          const merged = reset ? [...result.comments] : [...prev];
          if (!reset) {
            for (const item of result.comments) {
              if (seen.has(item.rpid)) continue;
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
        setTotal(
          Math.max(
            result.acount || 0,
            result.count || 0,
            mergedLength,
            replyCount,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "评论加载失败");
        if (!reset) setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [oid, type, replyCount],
  );

  useEffect(() => {
    nextOffsetRef.current = "";
    void loadComments(1, sort, true);
  }, [oid, type, sort, reloadToken, loadComments]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMoreRef.current || !hasMoreRef.current) return;
    void loadComments(pageRef.current + 1, sortRef.current, false);
  }, [loading, loadComments]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || loading || !hasMore) return;
    const root = closestScrollRoot(target);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { root, rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, comments.length, handleLoadMore]);

  const handleDeleted = useCallback((rpid: number) => {
    if (pendingRef.current?.rpid === rpid) pendingRef.current = null;
    const stripped = stripComment(commentsRef.current, rpid);
    commentsRef.current = stripped.list;
    setComments(stripped.list);
    setTotal((count) => Math.max(0, count - Math.max(stripped.removed, 1)));
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !oid || !type) return;
    setSending(true);
    setError("");
    try {
      const created = await window.biliDesk.bili.addTargetComment(
        oid,
        type,
        text,
      );
      setDraft("");
      if (created) {
        pendingRef.current = created;
        setComments((prev) =>
          prev.some((item) => item.rpid === created.rpid)
            ? prev
            : [created, ...prev],
        );
        setTotal((count) => count + 1);
        setLoading(false);
      }
      await loadComments(1, sort, true, true);
      pendingRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "发表评论失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          评论 {total > 0 ? total : ""}
        </h2>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              sort === 0
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setSort(0)}
          >
            最热
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              sort === 2
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setSort(2)}
          >
            最新
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="发一条友善的评论吧"
          className="min-h-[64px] flex-1 resize-none rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <div className="flex flex-col gap-2">
          <EmotePickerButton
            onPick={(emote) => setDraft((prev) => prev + emote)}
          />
          <Button
            size="sm"
            disabled={sending || !draft.trim()}
            onClick={() => void handleSend()}
          >
            {sending ? "发送中" : "发表"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载评论中...
        </div>
      ) : comments.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          还没有评论，来抢沙发吧
        </p>
      ) : (
        <div className="space-y-5">
          {comments.map((item) => (
            <CommentThread
              key={item.rpid}
              item={item}
              ownerMid={ownerMid}
              selfMid={selfMid}
              handlers={handlers}
              onChanged={() => setReloadToken((token) => token + 1)}
              onDeleted={handleDeleted}
            />
          ))}
          <div
            ref={sentinelRef}
            className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                加载更多评论...
              </>
            ) : hasMore ? (
              "继续下滑加载更多"
            ) : (
              "已经到底啦"
            )}
          </div>
        </div>
      )}
    </section>
  );
}
