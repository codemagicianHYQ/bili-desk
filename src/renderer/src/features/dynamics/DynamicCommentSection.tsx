import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { CommentItem } from "@shared/types";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { CommentActionBar } from "@/components/comment/CommentActionBar";
import { commentRpid, stripComment } from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { BiliImage } from "@/components/ui/bili-image";
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

function formatCommentTime(ctime: number): string {
  if (!ctime) return "";
  const date = new Date(ctime * 1000);
  const diff = Math.max(0, Date.now() - date.getTime());
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
  oid,
  type,
  ownerMid,
  selfMid,
  depth = 0,
  onChanged,
  onDeleted,
}: {
  item: CommentItem;
  oid: string;
  type: number;
  ownerMid?: number;
  selfMid?: number;
  depth?: number;
  onChanged: () => void;
  onDeleted: (rpid: number) => void;
}) {
  const emotes = useReplyEmotes(item.emotes);
  const [liked, setLiked] = useState(item.action === 1);
  const [hated, setHated] = useState(item.action === 2);
  const [likeCount, setLikeCount] = useState(item.like);
  const [liking, setLiking] = useState(false);
  const [hating, setHating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [moreReplies, setMoreReplies] = useState<CommentItem[]>([]);
  const [morePage, setMorePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const visibleReplies = depth === 0 ? [...item.replies, ...moreReplies] : [];
  const commentMid = item.member.mid || item.mid;
  const isOwn = Boolean(selfMid && commentMid === selfMid);
  const canDelete =
    isOwn || Boolean(ownerMid && selfMid && ownerMid === selfMid);
  const rpid = commentRpid(item);

  const handleLike = async () => {
    if (liking) return;
    const next = !liked;
    setLiking(true);
    setError("");
    try {
      if (next && hated) {
        await window.biliDesk.bili.hateComment(oid, type, rpid, false);
        setHated(false);
      }
      await window.biliDesk.bili.likeTargetComment(oid, type, item.rpid, next);
      setLiked(next);
      setLikeCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const handleHate = async () => {
    if (hating) return;
    const next = !hated;
    setHating(true);
    setError("");
    try {
      if (next && liked) {
        await window.biliDesk.bili.likeTargetComment(
          oid,
          type,
          item.rpid,
          false,
        );
        setLiked(false);
        setLikeCount((prev) => Math.max(0, prev - 1));
      }
      await window.biliDesk.bili.hateComment(oid, type, rpid, next);
      setHated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "点踩失败");
    } finally {
      setHating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await window.biliDesk.bili.deleteComment(oid, type, rpid);
      onDeleted(item.rpid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async (reason: number) => {
    setReporting(true);
    setError("");
    try {
      await window.biliDesk.bili.reportComment(oid, type, rpid, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : "举报失败");
    } finally {
      setReporting(false);
    }
  };

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text) return;
    setReplying(true);
    setError("");
    try {
      const root = item.root > 0 ? item.root : item.rpid;
      await window.biliDesk.bili.addTargetComment(
        oid,
        type,
        text,
        root,
        item.rpid,
      );
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
      const page = await window.biliDesk.bili.getTargetCommentReplies(
        oid,
        type,
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
    <div className={cn("flex gap-3 py-3", depth > 0 && "py-2")}>
      <Link to={`/up/${item.member.mid || item.mid}`} className="shrink-0">
        <BiliImage
          src={item.member.face}
          alt={item.member.name}
          className={cn(
            "rounded-full object-cover",
            depth > 0 ? "h-7 w-7" : "h-9 w-9",
          )}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link
            to={`/up/${item.member.mid || item.mid}`}
            className="font-medium text-foreground hover:text-sky-400"
          >
            {item.member.name}
          </Link>
          {Boolean(ownerMid && commentMid === ownerMid) && (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
              UP
            </span>
          )}
          {isOwn && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
              自己
            </span>
          )}
          <span>{formatCommentTime(item.ctime)}</span>
          {item.location && <span>{item.location}</span>}
        </div>
        <div className="mt-1 text-sm leading-relaxed">
          <BiliEmoteText text={item.content} emotes={emotes} />
        </div>
        <CommentActionBar
          liked={liked}
          hated={hated}
          likeCount={likeCount}
          liking={liking}
          hating={hating}
          deleting={deleting}
          reporting={reporting}
          isOwn={isOwn}
          canDelete={canDelete}
          copyText={item.content}
          onLike={() => void handleLike()}
          onHate={() => void handleHate()}
          onReply={() => setShowReply((value) => !value)}
          onDelete={() => void handleDelete()}
          onReport={(reason) => void handleReport(reason)}
        />
        {depth === 0 && item.rcount > visibleReplies.length && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMoreReplies()}
            className="mt-1 text-xs text-muted-foreground transition-colors hover:text-sky-400"
          >
            {loadingMore
              ? "加载中..."
              : expanded
                ? `展开更多回复（共 ${item.rcount}）`
                : `查看 ${item.rcount} 条回复`}
          </button>
        )}

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        {showReply && (
          <div className="mt-3 space-y-2">
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={`回复 @${item.member.name}`}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-sky-500/50"
            />
            <div className="flex items-center justify-between gap-2">
              <EmotePickerButton
                onPick={(emote) =>
                  setReplyText((prev) => (prev + emote).slice(0, 1000))
                }
              />
              <div className="flex gap-2">
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
                  {replying ? "发送中" : "回复"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {visibleReplies.length > 0 && (
          <div className="mt-2 rounded-xl bg-secondary/30 px-3 py-1">
            {visibleReplies.map((reply) => (
              <CommentRow
                key={reply.rpid}
                item={reply}
                oid={oid}
                type={type}
                ownerMid={ownerMid}
                selfMid={selfMid}
                depth={depth + 1}
                onChanged={onChanged}
                onDeleted={(rpid) => {
                  setMoreReplies((prev) =>
                    prev.filter((nested) => nested.rpid !== rpid),
                  );
                  onDeleted(rpid);
                }}
              />
            ))}
            {depth === 0 && item.rcount > visibleReplies.length && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMoreReplies()}
                className="mb-2 text-xs text-sky-400 hover:underline"
              >
                {loadingMore
                  ? "加载中..."
                  : `展开更多回复（共 ${item.rcount}）`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
                ? "bg-sky-500/15 text-sky-400"
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
                ? "bg-sky-500/15 text-sky-400"
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
          className="min-h-[64px] flex-1 resize-none rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm outline-none focus:border-sky-500/50"
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
        <div className="divide-y divide-border/60">
          {comments.map((item) => (
            <CommentRow
              key={item.rpid}
              item={item}
              oid={oid}
              type={type}
              ownerMid={ownerMid}
              selfMid={selfMid}
              onChanged={() => setReloadToken((token) => token + 1)}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pb-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadComments(page + 1, sort, false)}
          >
            {loadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中
              </>
            ) : (
              "加载更多评论"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
