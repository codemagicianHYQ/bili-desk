import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SpaceDynamicItem, UpProfile } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  OverlayPortal,
  APP_OVERLAY_ZCLASS,
} from "@/components/ui/overlay-portal";
import {
  ExclusiveTag,
  UpowerExclusiveCard,
  DynamicMetaLine,
  ForwardedOrigEmbed,
  ImageGrid,
} from "@/components/dynamic/DynamicFeedCard";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import {
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  Share2,
  ThumbsUp,
  Trash2,
} from "lucide-react";

interface MyDynamicsPanelProps {
  mid: number;
  profile: Pick<UpProfile, "name" | "face"> | null;
}

function formatError(err: unknown): string {
  return extractIpcErrorMessage(err) || "操作失败";
}

function visibleForwardText(item: SpaceDynamicItem): string {
  const text = item.text?.trim() ?? "";
  if (!text || text === "转发动态" || text === "动态") return "";
  return text;
}

function DynamicActionBar({
  item,
  onOpenDetail,
}: {
  item: SpaceDynamicItem;
  onOpenDetail: () => void;
}) {
  const [liked, setLiked] = useState(Boolean(item.liked));
  const [likeCount, setLikeCount] = useState(item.stats?.like ?? 0);
  const [liking, setLiking] = useState(false);
  const [tip, setTip] = useState("");
  const reply = item.stats?.reply ?? 0;

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(""), 1800);
  };

  const handleForward = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(
        `https://www.bilibili.com/opus/${item.id}`,
      );
      showTip("链接已复制");
    } catch {
      showTip("复制失败");
    }
  };

  const handleLike = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (liking) return;
    const next = !liked;
    setLiking(true);
    try {
      await window.biliDesk.bili.likeDynamic(item.id, next);
      setLiked(next);
      setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    } catch (err) {
      showTip(formatError(err));
    } finally {
      setLiking(false);
    }
  };

  return (
    <div className="relative grid grid-cols-3 border-t border-white/5">
      {tip && (
        <p className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
          {tip}
        </p>
      )}
      <button
        type="button"
        onClick={(event) => void handleForward(event)}
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]"
      >
        <Share2 className="h-4 w-4" />
        转发
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenDetail();
        }}
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]"
      >
        <MessageCircle className="h-4 w-4" />
        {reply > 0 ? reply : "评论"}
      </button>
      <button
        type="button"
        disabled={liking}
        onClick={(event) => void handleLike(event)}
        className={cn(
          "flex items-center justify-center gap-1.5 py-3 text-sm transition-colors",
          liked ? "text-[#00aeec]" : "text-[#9499a0] hover:text-[#e3e5e7]",
        )}
      >
        <ThumbsUp className={cn("h-4 w-4", liked && "fill-current")} />
        {likeCount > 0 ? formatCount(likeCount) : "点赞"}
      </button>
    </div>
  );
}

function VideoDynamicBody({ item }: { item: SpaceDynamicItem }) {
  const content = (
    <div className="flex gap-3 rounded-lg bg-black/25 p-3 transition-colors hover:bg-black/35">
      <div className="relative shrink-0 overflow-hidden rounded-md">
        {item.cover ? (
          <BiliImage
            src={item.cover}
            alt={item.title ?? ""}
            className="h-[86px] w-[136px] object-cover"
          />
        ) : (
          <div className="h-[86px] w-[136px] bg-secondary" />
        )}
        {item.duration != null && item.duration > 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[11px] text-white">
            {formatDuration(item.duration)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <p className="line-clamp-2 text-sm leading-snug text-[#e3e5e7]">
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#9499a0]">
          {item.stats?.view != null && item.stats.view > 0 && (
            <span>{formatCount(item.stats.view)} 播放</span>
          )}
          {item.stats?.danmaku != null && item.stats.danmaku > 0 && (
            <span>{formatCount(item.stats.danmaku)} 弹幕</span>
          )}
        </div>
      </div>
    </div>
  );

  if (item.bvid) {
    return (
      <Link
        to={`/video/${item.bvid}`}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </Link>
    );
  }
  return content;
}

function OwnerMenu({
  open,
  pinned,
  busy,
  onClose,
  onPin,
  onCard,
  onShare,
  onDelete,
}: {
  open: boolean;
  pinned: boolean;
  busy: boolean;
  onClose: () => void;
  onPin: () => void;
  onCard: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  if (!open) return null;

  const row =
    "flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] text-[#e3e5e7] transition-colors hover:bg-white/5 disabled:opacity-50";

  return (
    <OverlayPortal>
      <div
        className={cn(
          "fixed inset-0 flex items-end justify-center bg-black/55 p-4",
          APP_OVERLAY_ZCLASS,
        )}
        onClick={onClose}
      >
        <div
          role="menu"
          className="w-full max-w-md overflow-hidden rounded-2xl bg-[#232527] shadow-2xl ring-1 ring-white/10"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" disabled={busy} className={row} onClick={onPin}>
            <Pin className="h-4 w-4 text-[#fb7299]" />
            {pinned ? "取消置顶" : "置顶"}
          </button>
          <button
            type="button"
            disabled={busy}
            className={cn(row, "border-t border-white/5")}
            onClick={onCard}
          >
            <Pencil className="h-4 w-4 text-[#fb7299]" />
            使用此卡片背景
          </button>
          <button
            type="button"
            disabled={busy}
            className={cn(row, "border-t border-white/5")}
            onClick={onShare}
          >
            <Share2 className="h-4 w-4 text-[#fb7299]" />
            分享
          </button>
          <button
            type="button"
            disabled={busy}
            className={cn(row, "border-t border-white/5 text-rose-400")}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
          <button
            type="button"
            className="w-full border-t border-white/10 py-3.5 text-center text-[15px] text-[#9499a0] hover:bg-white/5"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}

function DynamicCard({
  item,
  fallbackName,
  fallbackFace,
  onPinned,
  onRemoved,
}: {
  item: SpaceDynamicItem;
  fallbackName: string;
  fallbackFace: string;
  onPinned: (id: string, pinned: boolean) => void;
  onRemoved: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState("");
  const authorName = item.authorName || fallbackName;
  const authorFace = item.authorFace || fallbackFace;
  const canOpenDetail =
    Boolean(item.id) &&
    item.id !== "0" &&
    (item.kind === "opus" ||
      item.kind === "text" ||
      item.kind === "draw" ||
      item.kind === "forward" ||
      item.kind === "article" ||
      item.kind === "upower");
  const forwardText =
    item.kind === "forward" ? visibleForwardText(item) : item.text;
  const images = item.images?.length
    ? item.images
    : item.cover
      ? [item.cover]
      : [];

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(""), 1800);
  };

  const openDetail = () => {
    if (
      item.kind === "article" &&
      item.commentType === 12 &&
      item.commentId &&
      /^\d+$/.test(item.commentId)
    ) {
      navigate(`/article/${item.commentId}`);
      return;
    }
    navigate(`/dynamic/${item.id}`);
  };

  const handlePin = async () => {
    if (busy) return;
    const next = !item.pinned;
    setBusy(true);
    try {
      await window.biliDesk.bili.setDynamicTop(item.id, next);
      onPinned(item.id, next);
      setMenuOpen(false);
      showTip(next ? "已置顶" : "已取消置顶");
    } catch (err) {
      showTip(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCard = async () => {
    if (busy) return;
    if (!item.cardItemId) {
      showTip("这条动态没有可使用的卡片装扮");
      setMenuOpen(false);
      return;
    }
    setBusy(true);
    try {
      await window.biliDesk.bili.equipDynamicCard(item.cardItemId);
      setMenuOpen(false);
      showTip(
        item.cardName ? `已使用「${item.cardName}」` : "已使用此卡片背景",
      );
    } catch (err) {
      showTip(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(
        `https://www.bilibili.com/opus/${item.id}`,
      );
      setMenuOpen(false);
      showTip("链接已复制");
    } catch {
      showTip("复制失败");
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.biliDesk.bili.removeDynamic(item.id);
      setConfirmDelete(false);
      setMenuOpen(false);
      onRemoved(item.id);
    } catch (err) {
      showTip(formatError(err));
      setBusy(false);
    }
  };

  return (
    <article className="relative overflow-hidden rounded-xl bg-[#232527] shadow-sm ring-1 ring-white/5">
      {tip && (
        <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
          {tip}
        </p>
      )}
      <div className="flex items-start gap-3 px-5 pb-1 pt-5">
        {authorFace ? (
          <BiliImage
            src={authorFace}
            alt={authorName}
            className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-secondary" />
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-medium text-[#00aeec]">
            {authorName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#9499a0]">
            {item.pubTimeLabel && <span>{item.pubTimeLabel}</span>}
            {!item.exclusiveTag && item.pubAction && (
              <span>· {item.pubAction}</span>
            )}
            {item.pinned && (
              <span className="rounded bg-[#fb7299]/15 px-1 py-px text-[#fb7299]">
                置顶
              </span>
            )}
            {item.ipLocation ? <span>· IP属地：{item.ipLocation}</span> : null}
            {item.cvId ? (
              <Link
                to={`/article/${item.cvId}`}
                onClick={(event) => event.stopPropagation()}
                className="hover:text-[#00AEEC] hover:underline"
              >
                · cv{item.cvId}
              </Link>
            ) : null}
            {item.exclusiveTag && <ExclusiveTag text={item.exclusiveTag} />}
          </p>
        </div>
        <button
          type="button"
          aria-label="动态设置"
          className="rounded-md p-1 text-[#9499a0] transition-colors hover:bg-white/5 hover:text-[#e3e5e7]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen(true);
          }}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div
        className={cn("space-y-3 px-5 py-3", canOpenDetail && "cursor-pointer")}
        onClick={canOpenDetail ? openDetail : undefined}
      >
        {item.kind === "video" ? (
          <>
            {item.text && (
              <p className="text-sm text-[#9499a0]">
                <BiliEmoteText
                  text={item.text}
                  mentions={item.mentions}
                  emotes={item.emotes}
                />
              </p>
            )}
            <VideoDynamicBody item={item} />
            <DynamicMetaLine item={item} />
          </>
        ) : item.kind === "upower" ? (
          <UpowerExclusiveCard item={item} />
        ) : item.kind === "forward" ? (
          <>
            {forwardText && (
              <p className="text-sm leading-relaxed text-[#e3e5e7]">
                <BiliEmoteText
                  text={forwardText}
                  mentions={item.mentions}
                  emotes={item.emotes}
                />
              </p>
            )}
            {item.orig ? (
              <ForwardedOrigEmbed item={item.orig} imageLayout="grid" />
            ) : (
              <p className="rounded-lg bg-black/25 px-3 py-4 text-sm text-[#9499a0]">
                源动态已删除
              </p>
            )}
          </>
        ) : (
          <>
            {item.title && item.kind !== "text" && (
              <h3 className="text-sm font-medium leading-snug text-[#e3e5e7]">
                {item.title}
              </h3>
            )}
            {item.text && item.text !== "动态" && (
              <p className="text-sm leading-relaxed text-[#e3e5e7]">
                <BiliEmoteText
                  text={item.text}
                  mentions={item.mentions}
                  emotes={item.emotes}
                />
              </p>
            )}
            {images.length > 0 && (
              <ImageGrid
                images={images}
                layout={
                  item.kind === "article" || item.kind === "live"
                    ? "stack"
                    : "grid"
                }
              />
            )}
            <DynamicMetaLine item={item} />
          </>
        )}
      </div>

      <DynamicActionBar item={item} onOpenDetail={openDetail} />

      <OwnerMenu
        open={menuOpen}
        pinned={Boolean(item.pinned)}
        busy={busy}
        onClose={() => {
          if (!busy) setMenuOpen(false);
        }}
        onPin={() => void handlePin()}
        onCard={() => void handleCard()}
        onShare={() => void handleShare()}
        onDelete={() => {
          setMenuOpen(false);
          setConfirmDelete(true);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="要删除动态吗？"
        description="动态删除后将无法恢复，请谨慎操作"
        confirmLabel="确认删除"
        destructive
        loading={busy}
        onCancel={() => {
          if (!busy) setConfirmDelete(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </article>
  );
}

export function MyDynamicsPanel({ mid, profile }: MyDynamicsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef("");
  const [items, setItems] = useState<SpaceDynamicItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fallbackName = profile?.name ?? "用户";
  const fallbackFace = profile?.face ?? "";

  const load = useCallback(
    async (append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }

      try {
        const result = await window.biliDesk.bili.getSpaceDynamics(
          mid,
          append ? offsetRef.current : "",
        );
        offsetRef.current = result.offset;
        setHasMore(result.hasMore);
        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items,
        );
      } catch (err) {
        setError(formatError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mid],
  );

  useEffect(() => {
    offsetRef.current = "";
    void load(false);
  }, [load]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(true);
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, load, loading, loadingMore]);

  const handlePinned = (id: string, pinned: boolean) => {
    setItems((prev) => {
      const next = prev.map((entry) =>
        entry.id === id
          ? { ...entry, pinned }
          : pinned
            ? { ...entry, pinned: false }
            : entry,
      );
      if (!pinned) return next;
      const target = next.find((entry) => entry.id === id);
      if (!target) return next;
      return [target, ...next.filter((entry) => entry.id !== id)];
    });
  };

  if (loading && items.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载动态...
      </p>
    );
  }

  if (error && items.length === 0) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无动态</p>;
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
    >
      {items.map((item) => (
        <DynamicCard
          key={item.id}
          item={item}
          fallbackName={fallbackName}
          fallbackFace={fallbackFace}
          onPinned={handlePinned}
          onRemoved={(id) =>
            setItems((prev) => prev.filter((entry) => entry.id !== id))
          }
        />
      ))}
      <div
        ref={sentinelRef}
        className={cn("py-4 text-center text-sm text-muted-foreground")}
      >
        {loadingMore
          ? "加载更多..."
          : hasMore
            ? "继续下滑加载更多"
            : "已经到底啦"}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
