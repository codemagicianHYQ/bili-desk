import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { CommentItem } from "@shared/types";
import { CommentThread } from "@/components/comment/CommentThread";
import { commentRpid, stripComment } from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { Button } from "@/components/ui/button";
import { VirtualList } from "@/components/ui/virtual-list";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { commentsCache, commentsCacheKey } from "@/lib/session-data-cache";
import { formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Loader2 } from "lucide-react";

interface VideoCommentSectionProps {
  aid: number;
  bvid?: string;
  ownerMid?: number;
  replyCount?: number;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

type CommentSort = 0 | 2;

/** 虚拟列表只减 DOM，不减 JS 堆；热门稿评论加软上限防 OOM */
const MAX_COMMENTS = 800;

function estimateCommentSize(item: CommentItem): number {
  const pics = item.pictures?.length ?? 0;
  let height = 132;
  height +=
    Math.min(10, Math.ceil((item.content?.trim().length ?? 0) / 42)) * 22;
  if (pics === 1) height += 300;
  else if (pics > 0) height += Math.ceil(pics / 3) * 168 + 12;
  height += Math.min(item.replies?.length ?? 0, 3) * 84;
  return height;
}

export function VideoCommentSection({
  aid,
  ownerMid,
  replyCount = 0,
  scrollRootRef,
}: VideoCommentSectionProps) {
  const selfMid = useAppStore((state) => state.user?.mid);
  const loadingMoreRef = useRef(false);
  const commentsRef = useRef<CommentItem[]>([]);
  const nextOffsetRef = useRef("");
  const pendingRef = useRef<CommentItem | null>(null);
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

  commentsRef.current = comments;
  useReplyEmotes();

  const handlers = useMemo(
    () => ({
      like: (item: CommentItem, next: boolean) =>
        window.biliDesk.bili.likeComment(aid, item.rpid, next),
      hate: (item: CommentItem, next: boolean) =>
        window.biliDesk.bili.hateComment(
          String(aid),
          1,
          commentRpid(item),
          next,
        ),
      delete: (item: CommentItem) =>
        window.biliDesk.bili.deleteComment(String(aid), 1, commentRpid(item)),
      report: (item: CommentItem, reason: number) =>
        window.biliDesk.bili.reportComment(
          String(aid),
          1,
          commentRpid(item),
          reason,
        ),
      reply: (item: CommentItem, text: string) => {
        const root = item.root > 0 ? item.root : item.rpid;
        return window.biliDesk.bili.addComment(aid, text, root, item.rpid);
      },
      loadMoreReplies: (item: CommentItem, pageNo: number) =>
        window.biliDesk.bili.getCommentReplies(aid, item.rpid, pageNo),
    }),
    [aid],
  );

  const loadComments = useCallback(
    async (
      nextPage: number,
      nextSort: CommentSort,
      reset: boolean,
      keepVisible = false,
    ) => {
      if (reset) {
        loadingMoreRef.current = false;
        if (!keepVisible) {
          setLoading(true);
          setComments([]);
          commentsRef.current = [];
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
        const result = await window.biliDesk.bili.getComments(
          aid,
          nextPage,
          nextSort,
          reset ? "" : nextOffsetRef.current,
        );

        const prev = reset ? [] : commentsRef.current;
        const seen = new Set(prev.map((item) => item.rpid));
        const merged = reset ? [] : [...prev];
        let uniqueAdded = 0;
        const incoming = result.comments;
        for (const item of incoming) {
          if (merged.length >= MAX_COMMENTS) break;
          if (seen.has(item.rpid)) continue;
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
        const hasMoreNext =
          Boolean(result.hasMore) && underCap && (reset || uniqueAdded > 0);
        setHasMore(hasMoreNext);
        const nextTotal = Math.max(
          result.acount || 0,
          result.count || 0,
          merged.length,
          replyCount,
        );
        setTotal(nextTotal);
        commentsCache.set(commentsCacheKey(aid, nextSort), {
          comments: merged,
          page: result.page,
          hasMore: hasMoreNext,
          total: nextTotal,
          nextOffset: result.nextOffset,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "评论加载失败");
        if (!reset) setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [aid, replyCount],
  );

  useEffect(() => {
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
      void loadComments(1, sort, true, true);
      return;
    }
    nextOffsetRef.current = "";
    void loadComments(1, sort, true);
  }, [aid, sort, loadComments]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMoreRef.current || !hasMore) return;
    void loadComments(page + 1, sort, false);
  }, [loading, hasMore, page, sort, loadComments]);

  const handleDeleted = useCallback(
    (rpid: number) => {
      if (pendingRef.current?.rpid === rpid) pendingRef.current = null;
      const stripped = stripComment(commentsRef.current, rpid);
      commentsRef.current = stripped.list;
      setComments(stripped.list);
      setTotal((count) => Math.max(0, count - Math.max(stripped.removed, 1)));
      commentsCache.delete(commentsCacheKey(aid, 0));
      commentsCache.delete(commentsCacheKey(aid, 2));
    },
    [aid],
  );

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const created = await window.biliDesk.bili.addComment(aid, text);
      setDraft("");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "发表评论失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          评论
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {formatCount(total)}
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={sort === 0 ? "default" : "outline"}
            onClick={() => setSort(0)}
          >
            按热度
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sort === 2 ? "default" : "outline"}
            onClick={() => setSort(2)}
          >
            按时间
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="发一条友善的评论吧"
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <EmotePickerButton
              onPick={(emote) =>
                setDraft((prev) => (prev + emote).slice(0, 1000))
              }
            />
            <p className="text-xs text-muted-foreground">
              {draft.trim().length}/1000
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={sending || !draft.trim()}
            onClick={() => void handleSend()}
          >
            {sending ? "发送中..." : "发表评论"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载评论中...
        </p>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          还没有评论，来抢沙发吧
        </p>
      ) : (
        <VirtualList
          items={comments}
          scrollRootRef={scrollRootRef}
          estimateSize={estimateCommentSize}
          overscan={8}
          getItemKey={(item) => item.rpid}
          onEndReached={handleLoadMore}
          renderItem={(item) => (
            <div className="pb-5">
              <CommentThread
                item={item}
                ownerMid={ownerMid}
                selfMid={selfMid}
                handlers={handlers}
                onChanged={() => void loadComments(1, sort, true)}
                onDeleted={handleDeleted}
              />
            </div>
          )}
          footer={
            <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
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
          }
        />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
