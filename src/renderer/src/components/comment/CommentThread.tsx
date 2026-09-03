import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CommentItem } from "@shared/types";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { CommentActionBar } from "@/components/comment/CommentActionBar";
import {
  countCommentTree,
  formatCommentTime,
  nestCommentReplies,
  stripComment,
} from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

export interface CommentThreadHandlers {
  like: (item: CommentItem, next: boolean) => Promise<void>;
  hate: (item: CommentItem, next: boolean) => Promise<void>;
  delete: (item: CommentItem) => Promise<void>;
  report: (item: CommentItem, reason: number) => Promise<void>;
  reply: (item: CommentItem, text: string) => Promise<void>;
  loadMoreReplies?: (
    item: CommentItem,
    page: number,
  ) => Promise<{ comments: CommentItem[] }>;
}

interface CommentThreadProps {
  item: CommentItem;
  ownerMid?: number;
  selfMid?: number;
  nested?: boolean;
  handlers: CommentThreadHandlers;
  onChanged: () => void;
  onDeleted: (rpid: number) => void;
}

export function CommentThread({
  item,
  ownerMid,
  selfMid,
  nested = false,
  handlers,
  onChanged,
  onDeleted,
}: CommentThreadProps) {
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
  const [moreReplies, setMoreReplies] = useState<CommentItem[]>([]);
  const [morePage, setMorePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const tree = useMemo(
    () => nestCommentReplies([...item.replies, ...moreReplies], item.rpid),
    [item.replies, item.rpid, moreReplies],
  );
  const loadedCount = tree.reduce((n, reply) => n + countCommentTree(reply), 0);
  const pictureSrcs = item.pictures?.map((picture) => picture.src) ?? [];
  const commentMid = item.member.mid || item.mid;
  const isOwn = Boolean(selfMid && commentMid === selfMid);
  const canDelete =
    isOwn || Boolean(ownerMid && selfMid && ownerMid === selfMid);
  const isOwner = Boolean(ownerMid && commentMid === ownerMid);
  const level = item.member.level;
  const isSenior = Boolean(item.member.isSeniorMember);
  const hasKids = tree.length > 0;

  const toggleCollapsed = (rpid: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rpid)) next.delete(rpid);
      else next.add(rpid);
      return next;
    });
  };

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    setError("");
    try {
      const next = !liked;
      if (next && hated) {
        await handlers.hate(item, false);
        setHated(false);
      }
      await handlers.like(item, next);
      setLiked(next);
      setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const handleHate = async () => {
    if (hating) return;
    setHating(true);
    setError("");
    try {
      const next = !hated;
      if (next && liked) {
        await handlers.like(item, false);
        setLiked(false);
        setLikeCount((count) => Math.max(0, count - 1));
      }
      await handlers.hate(item, next);
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
      await handlers.delete(item);
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
      await handlers.report(item, reason);
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
      await handlers.reply(item, text);
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
    if (loadingMore || nested || !handlers.loadMoreReplies) return;
    setLoadingMore(true);
    setError("");
    try {
      const nextPage = moreReplies.length === 0 ? 1 : morePage + 1;
      const page = await handlers.loadMoreReplies(item, nextPage);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "楼中楼加载失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const bubbleDeleted = (rpid: number) => {
    setMoreReplies((prev) => stripComment(prev, rpid).list);
    onDeleted(rpid);
  };

  return (
    <div
      className={cn(
        "bili-cmt-node",
        nested && "is-nested",
        hasKids && "has-kids",
      )}
    >
      <div className="bili-cmt-rail">
        <Link to={`/up/${commentMid}`} className="bili-cmt-avatar">
          <BiliImage
            src={item.member.face}
            alt={item.member.name}
            className="h-full w-full rounded-full object-cover"
          />
        </Link>
      </div>
      <div className="bili-cmt-body min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-5">
          <Link
            to={`/up/${commentMid}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {item.member.name}
          </Link>
          {isOwner && (
            <span className="rounded bg-[#00AEEC]/15 px-1 py-px text-[10px] font-medium leading-4 text-[#00AEEC]">
              楼主
            </span>
          )}
          {isOwn && !isOwner && (
            <span className="rounded bg-secondary px-1 py-px text-[10px] leading-4 text-muted-foreground">
              自己
            </span>
          )}
          {item.location && (
            <span className="text-xs text-muted-foreground">
              {item.location}
            </span>
          )}
          {typeof level === "number" && level >= 0 && (
            <span
              className={cn("bili-cmt-lv", isSenior && "is-senior")}
              data-lv={isSenior ? 6 : Math.min(6, Math.floor(level))}
              title={isSenior ? "硬核会员" : undefined}
            >
              LV{level}
              {isSenior && <Zap className="bili-cmt-lv-bolt" aria-hidden />}
            </span>
          )}
        </div>
        {item.content.trim() && (
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            <BiliEmoteText
              text={item.content}
              emotes={emotes}
              mentions={item.mentions}
              size={nested ? 20 : 22}
            />
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
                  loading="eager"
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
        <CommentActionBar
          leading={<span>{formatCommentTime(item.ctime)}</span>}
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
      </div>

      {hasKids && (
        <div className="bili-cmt-kids">
          {tree.map((reply, index) => {
            const folded = collapsed.has(reply.rpid);
            const last = index === tree.length - 1;
            const hidden = folded ? countCommentTree(reply) : 0;
            return (
              <div
                key={reply.rpid}
                className={cn("bili-cmt-branch", last && "is-last")}
              >
                <button
                  type="button"
                  className={cn("bili-cmt-fold", folded && "is-plus")}
                  aria-label={folded ? "展开回复" : "收起回复"}
                  onClick={() => toggleCollapsed(reply.rpid)}
                />
                {folded ? (
                  <button
                    type="button"
                    className="bili-cmt-folded"
                    onClick={() => toggleCollapsed(reply.rpid)}
                  >
                    已收起 {hidden} 条评论
                  </button>
                ) : (
                  <CommentThread
                    item={reply}
                    ownerMid={ownerMid}
                    selfMid={selfMid}
                    nested
                    handlers={handlers}
                    onChanged={onChanged}
                    onDeleted={bubbleDeleted}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!nested && item.rcount > loadedCount && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMoreReplies()}
          className="bili-cmt-more"
        >
          {loadingMore
            ? "加载中..."
            : loadedCount > 0
              ? `展开更多回复（共 ${item.rcount}）`
              : `查看 ${item.rcount} 条回复`}
        </button>
      )}
    </div>
  );
}
