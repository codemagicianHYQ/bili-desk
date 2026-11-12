import { useEffect, useMemo, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Link } from "react-router-dom";
import type { BinaryImageFile, CommentItem } from "@shared/types";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { CommentActionBar } from "@/components/comment/CommentActionBar";
import {
  countCommentTree,
  formatCommentTime,
  nestCommentReplies,
  stripComment,
} from "@/components/comment/comment-tree";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { CommentImagePicker } from "@/components/comment/CommentImagePicker";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Zap } from "lucide-react";

function commentNeedsTranslation(text: string): boolean {
  const plain = text
    .replace(/\[[^\]]{1,24}\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\S+/g, "");
  const hangul = plain.match(/[가-힣]/g)?.length ?? 0;
  const kana = plain.match(/[\u3040-\u30ff]/g)?.length ?? 0;
  const cjk = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = plain.match(/[A-Za-z]/g)?.length ?? 0;
  if (hangul + kana >= 2) return true;
  if (cjk === 0 && latin >= 8) return true;
  return hangul + kana + latin >= 12 && hangul + kana + latin > cjk * 1.5;
}

function commentPermalink(
  item: CommentItem,
  subjectType: number,
  bvid?: string,
): string {
  const rpid = item.rpidStr || String(item.rpid);
  if (subjectType === 12) {
    return `https://www.bilibili.com/read/cv${item.oid}#reply${rpid}`;
  }
  if (subjectType === 11 || subjectType === 17) {
    return `https://t.bilibili.com/${item.oid}#reply${rpid}`;
  }
  const vid = bvid?.startsWith("BV") ? bvid : `av${item.oid}`;
  return `https://www.bilibili.com/video/${vid}#reply${rpid}`;
}

function treeHasRpid(item: CommentItem, rpid: number): boolean {
  if (item.rpid === rpid) return true;
  return item.replies.some((reply) => treeHasRpid(reply, rpid));
}

export interface CommentThreadHandlers {
  like: (item: CommentItem, next: boolean) => Promise<void>;
  hate: (item: CommentItem, next: boolean) => Promise<void>;
  delete: (item: CommentItem) => Promise<void>;
  report: (item: CommentItem, reason: number) => Promise<void>;
  reply: (
    item: CommentItem,
    text: string,
    images?: BinaryImageFile[],
  ) => Promise<void>;
  pin?: (item: CommentItem, pin: boolean) => Promise<void>;
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
  highlightRpid?: number;
  /** 评论区类型，视频是 1 */
  subjectType?: number;
  bvid?: string;
}

export function CommentThread({
  item,
  ownerMid,
  selfMid,
  nested = false,
  handlers,
  onChanged,
  onDeleted,
  highlightRpid = 0,
  subjectType = 1,
  bvid,
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
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replying, setReplying] = useState(false);
  const [moreReplies, setMoreReplies] = useState<CommentItem[]>([]);
  const [morePage, setMorePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [menuTip, setMenuTip] = useState("");
  const [reportSignal, setReportSignal] = useState(0);
  const [translated, setTranslated] = useState("");
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const canPin = Boolean(
    handlers.pin &&
    ownerMid &&
    selfMid &&
    ownerMid === selfMid &&
    !nested &&
    item.root === 0,
  );
  const isOwner = Boolean(ownerMid && commentMid === ownerMid);
  const level = item.member.level;
  const isSenior = Boolean(item.member.isSeniorMember);
  const hasKids = tree.length > 0;
  const autoExpandRef = useRef(0);
  const canTranslate = commentNeedsTranslation(item.content);
  const shownContent = showTranslated && translated ? translated : item.content;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirmBlock(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

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
      setError(formatDisplayedError(err, undefined, "点赞失败"));
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
      setError(formatDisplayedError(err, undefined, "点踩失败"));
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
      setError(formatDisplayedError(err, undefined, "删除失败"));
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
      setError(formatDisplayedError(err, undefined, "举报失败"));
    } finally {
      setReporting(false);
    }
  };

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text && replyFiles.length === 0) return;
    setReplying(true);
    setError("");
    try {
      const images = await imageFilesToPayload(replyFiles);
      await handlers.reply(item, text, images);
      setReplyText("");
      setReplyFiles([]);
      setShowReply(false);
      onChanged();
    } catch (err) {
      setError(formatDisplayedError(err, undefined, "回复失败"));
    } finally {
      setReplying(false);
    }
  };

  const loadMoreReplies = async () => {
    if (loadingMore || nested || !handlers.loadMoreReplies) return false;
    setLoadingMore(true);
    setError("");
    try {
      const nextPage = moreReplies.length === 0 ? 1 : morePage + 1;
      const page = await handlers.loadMoreReplies(item, nextPage);
      let added = 0;
      setMoreReplies((prev) => {
        const seen = new Set(prev.map((reply) => reply.rpid));
        item.replies.forEach((reply) => seen.add(reply.rpid));
        const merged = [...prev];
        for (const reply of page.comments) {
          if (seen.has(reply.rpid)) continue;
          seen.add(reply.rpid);
          merged.push(reply);
          added += 1;
        }
        return merged;
      });
      setMorePage(nextPage);
      return added > 0;
    } catch (err) {
      setError(formatDisplayedError(err, undefined, "楼中楼加载失败"));
      return false;
    } finally {
      setLoadingMore(false);
    }
  };

  // 定位进楼时自动把剩余楼中楼翻完，避免只剩 seek 那一条链路
  useEffect(() => {
    if (nested || !highlightRpid || highlightRpid === autoExpandRef.current) {
      return;
    }
    const inThisRoot =
      item.rpid === highlightRpid || treeHasRpid(item, highlightRpid);
    if (!inThisRoot) return;
    if (item.rcount <= loadedCount) {
      autoExpandRef.current = highlightRpid;
      return;
    }
    let cancelled = false;
    void (async () => {
      let guard = 0;
      while (!cancelled && guard < 20) {
        const got = await loadMoreReplies();
        guard += 1;
        if (!got) break;
      }
      if (!cancelled) autoExpandRef.current = highlightRpid;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 定位命中后自动翻页，避免 loadedCount 抖动重入
  }, [highlightRpid, item.rpid, item.replies.length, item.rcount, nested]);

  const bubbleDeleted = (rpid: number) => {
    setMoreReplies((prev) => stripComment(prev, rpid).list);
    onDeleted(rpid);
  };

  const copyPermalink = async () => {
    try {
      await navigator.clipboard.writeText(
        commentPermalink(item, subjectType, bvid),
      );
      setMenuTip("已复制链接");
    } catch {
      setMenuTip("复制失败");
    }
    setMenuOpen(false);
    window.setTimeout(() => setMenuTip(""), 1600);
  };

  const blockAuthor = async () => {
    if (!confirmBlock) {
      setConfirmBlock(true);
      return;
    }
    if (!commentMid) return;
    setBlocking(true);
    setError("");
    try {
      await window.biliDesk.bili.modifyBlock(commentMid, true);
      setMenuTip("已加入黑名单");
      setMenuOpen(false);
      setConfirmBlock(false);
      window.setTimeout(() => setMenuTip(""), 1600);
    } catch (err) {
      setError(formatDisplayedError(err, undefined, "拉黑失败"));
    } finally {
      setBlocking(false);
    }
  };

  const toggleTranslate = async () => {
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translated) {
      setShowTranslated(true);
      return;
    }
    setTranslating(true);
    setError("");
    try {
      const text = await window.biliDesk.bili.translateComment(
        String(item.oid),
        subjectType,
        item.rpidStr || item.rpid,
      );
      setTranslated(text);
      setShowTranslated(true);
    } catch (err) {
      setError(formatDisplayedError(err, undefined, "翻译失败"));
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div
      data-comment-rpid={item.rpid}
      className={cn(
        "bili-cmt-node",
        nested && "is-nested",
        hasKids && "has-kids",
        highlightRpid === item.rpid &&
          "rounded-xl bg-primary/10 ring-2 ring-primary/50",
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
          {item.pinned && (
            <span className="rounded bg-[#fb7299]/15 px-1 py-px text-[10px] font-medium leading-4 text-[#fb7299]">
              {item.pinKind === "admin" ? "管理员置顶" : "置顶"}
            </span>
          )}
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
              text={shownContent}
              emotes={emotes}
              mentions={item.mentions}
              size={nested ? 20 : 22}
            />
          </p>
        )}
        {canTranslate && (
          <button
            type="button"
            disabled={translating}
            onClick={() => void toggleTranslate()}
            className="mt-1 text-xs text-[#00AEEC] hover:underline disabled:opacity-60"
          >
            {translating ? "翻译中..." : showTranslated ? "查看原文" : "翻译"}
          </button>
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
        <div className="relative pr-8">
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
            canPin={canPin}
            pinned={Boolean(item.pinned)}
            onPin={() => {
              if (!handlers.pin) return;
              void handlers
                .pin(item, !item.pinned)
                .then(() => onChanged())
                .catch((err: unknown) =>
                  setError(formatDisplayedError(err, undefined, "置顶失败")),
                );
            }}
            reportSignal={reportSignal}
          />
          <div
            ref={menuRef}
            className={cn(
              "bili-cmt-more-btn absolute right-0 top-0",
              menuOpen && "is-open",
            )}
          >
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="更多"
              onClick={() => {
                setMenuOpen((open) => !open);
                setConfirmBlock(false);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-30 w-36 overflow-hidden rounded-lg border border-border/80 bg-popover py-1 text-[13px] text-popover-foreground shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-secondary"
                  onClick={() => void copyPermalink()}
                >
                  复制评论链接
                </button>
                {!isOwn && (
                  <button
                    type="button"
                    disabled={blocking}
                    className="block w-full px-3 py-1.5 text-left hover:bg-secondary disabled:opacity-60"
                    onClick={() => void blockAuthor()}
                  >
                    {blocking
                      ? "处理中..."
                      : confirmBlock
                        ? "确认加入黑名单"
                        : "加入黑名单"}
                  </button>
                )}
                {!isOwn && (
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left hover:bg-secondary"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmBlock(false);
                      setReportSignal((value) => value + 1);
                    }}
                  >
                    硬核会员举报
                  </button>
                )}
              </div>
            )}
          </div>
          {menuTip && (
            <p className="absolute -top-5 right-0 text-[11px] text-muted-foreground">
              {menuTip}
            </p>
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <EmotePickerButton
                  onPick={(emote) =>
                    setReplyText((prev) => (prev + emote).slice(0, 1000))
                  }
                />
                <CommentImagePicker
                  files={replyFiles}
                  onChange={setReplyFiles}
                  disabled={replying}
                />
              </div>
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
                  disabled={
                    replying || (!replyText.trim() && replyFiles.length === 0)
                  }
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
                    subjectType={subjectType}
                    bvid={bvid}
                    handlers={handlers}
                    onChanged={onChanged}
                    onDeleted={bubbleDeleted}
                    highlightRpid={highlightRpid}
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
              ? `展开更多回复，共 ${item.rcount} 条`
              : `共 ${item.rcount} 条回复，点击查看`}
        </button>
      )}
    </div>
  );
}
