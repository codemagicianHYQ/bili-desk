import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CommentItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { cn, formatCount } from "@/lib/utils";
import { Loader2, MessageCircle, ThumbsUp } from "lucide-react";

interface VideoCommentSectionProps {
  aid: number;
  replyCount?: number;
}

type CommentSort = 0 | 2;

function formatCommentTime(ctime: number): string {
  if (!ctime) return "";
  const date = new Date(ctime * 1000);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function CommentRow({
  item,
  aid,
  depth = 0,
  onChanged,
}: {
  item: CommentItem;
  aid: number;
  depth?: number;
  onChanged: () => void;
}) {
  const [liked, setLiked] = useState(item.action === 1);
  const [likeCount, setLikeCount] = useState(item.like);
  const [liking, setLiking] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [moreReplies, setMoreReplies] = useState<CommentItem[]>([]);
  const [morePage, setMorePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const visibleReplies = depth === 0 ? [...item.replies, ...moreReplies] : [];

  const handleLike = async () => {
    setLiking(true);
    setError("");
    try {
      const next = !liked;
      await window.biliDesk.bili.likeComment(aid, item.rpid, next);
      setLiked(next);
      setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text) return;
    setReplying(true);
    setError("");
    try {
      const root = item.root > 0 ? item.root : item.rpid;
      await window.biliDesk.bili.addComment(aid, text, root, item.rpid);
      setReplyText("");
      setShowReply(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "回复失败");
    } finally {
      setReplying(false);
    }
  };

  const loadMoreReplies = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const nextPage = moreReplies.length === 0 ? 1 : morePage + 1;
      const page = await window.biliDesk.bili.getCommentReplies(
        aid,
        item.rpid,
        nextPage,
      );
      setMoreReplies((prev) => {
        const seen = new Set(prev.map((reply) => reply.rpid));
        item.replies.forEach((reply) => seen.add(reply.rpid));
        const merged = [...prev];
        for (const reply of page.comments) {
          if (!seen.has(reply.rpid)) merged.push(reply);
        }
        return merged;
      });
      setMorePage(nextPage);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "楼中楼加载失败");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className={cn("flex gap-3", depth > 0 && "mt-3")}>
      <Link to={`/up/${item.member.mid}`} className="shrink-0">
        <BiliImage
          src={item.member.face}
          alt={item.member.name}
          className="h-9 w-9 rounded-full object-cover"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            to={`/up/${item.member.mid}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {item.member.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {formatCommentTime(item.ctime)}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {item.content}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            disabled={liking}
            onClick={() => void handleLike()}
            className={cn(
              "inline-flex items-center gap-1 transition-colors hover:text-primary",
              liked && "text-primary",
            )}
          >
            <ThumbsUp className={cn("h-3.5 w-3.5", liked && "fill-current")} />
            {likeCount > 0 ? formatCount(likeCount) : "点赞"}
          </button>
          <button
            type="button"
            onClick={() => setShowReply((value) => !value)}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            回复
          </button>
          {depth === 0 && item.rcount > visibleReplies.length && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMoreReplies()}
              className="transition-colors hover:text-primary"
            >
              {loadingMore
                ? "加载中..."
                : expanded
                  ? `展开更多回复（共 ${item.rcount}）`
                  : `查看 ${item.rcount} 条回复`}
            </button>
          )}
        </div>

        {showReply && (
          <div className="mt-3 space-y-2">
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={`回复 @${item.member.name}`}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowReply(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={replying || !replyText.trim()}
                onClick={() => void handleReply()}
              >
                {replying ? "发送中..." : "发送"}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        {visibleReplies.length > 0 && (
          <div className="mt-3 rounded-xl bg-secondary/30 px-3 py-2">
            {visibleReplies.map((reply) => (
              <CommentRow
                key={reply.rpid}
                item={reply}
                aid={aid}
                depth={depth + 1}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoCommentSection({
  aid,
  replyCount = 0,
}: VideoCommentSectionProps) {
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

  const loadComments = useCallback(
    async (nextPage: number, nextSort: CommentSort, reset: boolean) => {
      if (reset) {
        setLoading(true);
        setComments([]);
      } else {
        setLoadingMore(true);
      }
      setError("");

      try {
        const result = await window.biliDesk.bili.getComments(
          aid,
          nextPage,
          nextSort,
        );
        setComments((prev) =>
          reset ? result.comments : [...prev, ...result.comments],
        );
        setPage(result.page);
        setHasMore(result.hasMore);
        setTotal(result.acount || result.count || replyCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : "评论加载失败");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [aid, replyCount],
  );

  useEffect(() => {
    void loadComments(1, sort, true);
  }, [aid, sort, loadComments]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      await window.biliDesk.bili.addComment(aid, text);
      setDraft("");
      await loadComments(1, sort, true);
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
          <p className="text-xs text-muted-foreground">
            {draft.trim().length}/1000
          </p>
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
        <div className="space-y-5">
          {comments.map((item) => (
            <CommentRow
              key={item.rpid}
              item={item}
              aid={aid}
              onChanged={() => void loadComments(1, sort, true)}
            />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadComments(page + 1, sort, false)}
          >
            {loadingMore ? "加载中..." : "加载更多评论"}
          </Button>
        </div>
      )}
    </section>
  );
}
