import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import type { CommentItem } from "@shared/types";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { VirtualList } from "@/components/ui/virtual-list";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { cn, formatCount } from "@/lib/utils";
import { commentsCache, commentsCacheKey } from "@/lib/session-data-cache";
import { CommentActionBar } from "@/components/comment/CommentActionBar";
import { commentRpid, stripComment } from "@/components/comment/comment-tree";
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
  bvid,
  ownerMid,
  selfMid,
  depth = 0,
  onChanged,
  onDeleted,
}: {
  item: CommentItem;
  aid: number;
  bvid?: string;
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const visibleReplies = depth === 0 ? [...item.replies, ...moreReplies] : [];
  const pictureSrcs = item.pictures?.map((picture) => picture.src) ?? [];
  const commentMid = item.member.mid || item.mid;
  const isOwn = Boolean(selfMid && commentMid === selfMid);
  const canDelete =
    isOwn || Boolean(ownerMid && selfMid && ownerMid === selfMid);
  const oid = String(aid);
  const rpid = commentRpid(item);

  const handleLike = async () => {
    setLiking(true);
    setError("");
    try {
      const next = !liked;
      if (next && hated) {
        await window.biliDesk.bili.hateComment(oid, 1, rpid, false);
        setHated(false);
      }
      await window.biliDesk.bili.likeComment(aid, item.rpid, next);
      setLiked(next);
      setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const handleHate = async () => {
    setHating(true);
    setError("");
    try {
      const next = !hated;
      if (next && liked) {
        await window.biliDesk.bili.likeComment(aid, item.rpid, false);
        setLiked(false);
        setLikeCount((count) => Math.max(0, count - 1));
      }
      await window.biliDesk.bili.hateComment(oid, 1, rpid, next);
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
      await window.biliDesk.bili.deleteComment(oid, 1, rpid);
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
      await window.biliDesk.bili.reportComment(oid, 1, rpid, reason);
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
          {Boolean(ownerMid && commentMid === ownerMid) && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              UP
            </span>
          )}
          {isOwn && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              自己
            </span>
          )}
        </div>
        {item.content.trim() && (
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            <BiliEmoteText text={item.content} emotes={emotes} size={22} />
          </p>
        )}
        {item.pictures && item.pictures.length > 0 && (
          <div
            className={cn(
              "mt-2 grid gap-1.5",
              item.pictures.length === 1
                ? "max-w-xs grid-cols-1"
                : item.pictures.length === 2
                  ? "max-w-md grid-cols-2"
                  : "max-w-lg grid-cols-3",
            )}
          >
            {item.pictures.map((picture, index) => (
              <button
                key={picture.src}
                type="button"
                onClick={() => setPreviewIndex(index)}
                className={cn(
                  "block w-full overflow-hidden rounded-lg bg-secondary/40 text-left",
                  item.pictures!.length > 1 && "aspect-square",
                  item.pictures!.length === 1 && "max-h-72 aspect-[4/3]",
                )}
                style={
                  item.pictures!.length === 1 &&
                  picture.width > 0 &&
                  picture.height > 0
                    ? { aspectRatio: `${picture.width} / ${picture.height}` }
                    : undefined
                }
              >
                <BiliImage
                  src={picture.src}
                  alt="评论图片"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        <ImageLightbox
          images={pictureSrcs}
          index={previewIndex ?? 0}
          open={previewIndex != null}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span>{formatCommentTime(item.ctime)}</span>
            {item.location && <span>{item.location}</span>}
          </span>
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
            className="mt-1 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            {loadingMore
              ? "加载中..."
              : expanded
                ? `展开更多回复（共 ${item.rcount}）`
                : `查看 ${item.rcount} 条回复`}
          </button>
        )}

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
                  {replying ? "发送中..." : "发送"}
                </Button>
              </div>
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
                bvid={bvid}
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
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoCommentSection({
  aid,
  bvid,
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
  // 预热表情面板，供 `[doge]` 等转义渲染
  useReplyEmotes();
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
              <CommentRow
                item={item}
                aid={aid}
                bvid={bvid}
                ownerMid={ownerMid}
                selfMid={selfMid}
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
