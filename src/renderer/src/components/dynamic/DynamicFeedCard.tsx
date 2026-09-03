import { useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SpaceDynamicItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { parseBiliAppPath } from "@shared/utils/bili-app-link";
import {
  ExternalLink,
  MessageCircle,
  Radio,
  Share2,
  ThumbsUp,
} from "lucide-react";

function DynamicActionBar({
  item,
  onOpenDetail,
  onLikedChange,
}: {
  item: SpaceDynamicItem;
  onOpenDetail: () => void;
  onLikedChange?: (liked: boolean, likeCount: number) => void;
}) {
  const [liked, setLiked] = useState(Boolean(item.liked));
  const [likeCount, setLikeCount] = useState(item.stats?.like ?? 0);
  const [liking, setLiking] = useState(false);
  const [tip, setTip] = useState("");
  const reply = item.stats?.reply ?? 0;
  const forward = item.stats?.forward ?? 0;

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(""), 1800);
  };

  const handleForward = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const url = `https://www.bilibili.com/opus/${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showTip("链接已复制");
    } catch {
      showTip("复制失败");
    }
  };

  const handleComment = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenDetail();
  };

  const handleLike = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (liking) return;
    const next = !liked;
    setLiking(true);
    try {
      await window.biliDesk.bili.likeDynamic(item.id, next);
      const nextCount = Math.max(0, likeCount + (next ? 1 : -1));
      setLiked(next);
      setLikeCount(nextCount);
      onLikedChange?.(next, nextCount);
    } catch (err) {
      showTip(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  return (
    <div className="relative grid grid-cols-3 border-t border-border/60">
      {tip && (
        <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/80 px-2.5 py-1 text-xs text-white">
          {tip}
        </span>
      )}
      <button
        type="button"
        onClick={handleForward}
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
      >
        <Share2 className="h-4 w-4" />
        {forward > 0 ? formatCount(forward) : "转发"}
      </button>
      <button
        type="button"
        onClick={handleComment}
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
      >
        <MessageCircle className="h-4 w-4" />
        {reply > 0 ? formatCount(reply) : "评论"}
      </button>
      <button
        type="button"
        onClick={handleLike}
        disabled={liking}
        className={cn(
          "flex items-center justify-center gap-1.5 py-3 text-sm transition-colors hover:bg-secondary/40",
          liked
            ? "text-pink-400 hover:text-pink-300"
            : "text-muted-foreground hover:text-foreground",
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
    <div className="flex gap-3 rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary/80">
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
        <p className="line-clamp-2 text-sm leading-snug">{item.title}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
      <Link to={`/video/${item.bvid}`} onClick={(e) => e.stopPropagation()}>
        {content}
      </Link>
    );
  }
  return content;
}

function LiveDynamicBody({ item }: { item: SpaceDynamicItem }) {
  const to = item.liveRoomId ? `/live/${item.liveRoomId}` : null;
  const external =
    item.liveUrl ||
    (item.liveRoomId ? `https://live.bilibili.com/${item.liveRoomId}` : "");

  const content = (
    <div className="overflow-hidden rounded-lg bg-secondary/50 transition-colors hover:bg-secondary/80">
      <div className="relative">
        {item.cover ? (
          <BiliImage
            src={item.cover}
            alt={item.title ?? ""}
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="aspect-video w-full bg-secondary" />
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white">
          <Radio className="h-3 w-3" />
          直播中
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        {item.text && (
          <p className="text-xs text-muted-foreground">
            <LinkifiedText text={item.text} />
          </p>
        )}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} onClick={(e) => e.stopPropagation()}>
        {content}
      </Link>
    );
  }
  const appPath = external ? parseBiliAppPath(external) : null;
  if (appPath) {
    return (
      <Link to={appPath} onClick={(e) => e.stopPropagation()}>
        {content}
      </Link>
    );
  }
  if (!external) return content;
  return (
    <a
      href={external}
      target="_blank"
      rel="noreferrer"
      className="block"
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </a>
  );
}

function ImageGrid({ images }: { images: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <>
        <button
          type="button"
          className="block max-w-full text-left"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setLightboxIndex(0);
          }}
        >
          <BiliImage
            src={images[0]}
            alt=""
            className="max-h-[480px] w-auto max-w-full rounded-lg object-contain"
          />
        </button>
        <ImageLightbox
          images={images}
          index={0}
          open={lightboxIndex != null}
          onClose={() => setLightboxIndex(null)}
        />
      </>
    );
  }

  const shown = images.slice(0, 9);
  return (
    <>
      <div
        className={cn(
          "grid gap-1.5",
          shown.length === 2 || shown.length === 4
            ? "grid-cols-2"
            : "grid-cols-3",
        )}
      >
        {shown.map((src, index) => (
          <button
            key={`${src}-${index}`}
            type="button"
            className="overflow-hidden rounded-md"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setLightboxIndex(index);
            }}
          >
            <BiliImage
              src={src}
              alt=""
              className="aspect-square w-full object-cover transition-opacity hover:opacity-90"
            />
          </button>
        ))}
      </div>
      <ImageLightbox
        images={shown}
        index={lightboxIndex ?? 0}
        open={lightboxIndex != null}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function openDynamicTarget(
  item: SpaceDynamicItem,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (item.bvid) {
    navigate(`/video/${item.bvid}`);
    return;
  }
  if (item.liveRoomId) {
    navigate(`/live/${item.liveRoomId}`);
    return;
  }
  if (
    item.kind === "article" &&
    item.commentType === 12 &&
    item.commentId &&
    /^\d+$/.test(item.commentId)
  ) {
    navigate(`/article/${item.commentId}`);
    return;
  }
  if (
    item.id &&
    item.id !== "0" &&
    (item.kind === "opus" ||
      item.kind === "text" ||
      item.kind === "draw" ||
      item.kind === "forward" ||
      item.kind === "article")
  ) {
    navigate(`/dynamic/${item.id}`);
  }
}

function dynamicImages(item: SpaceDynamicItem): string[] {
  if (item.images?.length) return item.images;
  if (item.cover) return [item.cover];
  return [];
}

function DynamicCardBody({
  item,
  depth = 0,
}: {
  item: SpaceDynamicItem;
  depth?: number;
}) {
  const images = dynamicImages(item);

  if (item.kind === "video") {
    return (
      <>
        {item.text && (
          <p className="text-sm text-muted-foreground">
            <LinkifiedText text={item.text} />
          </p>
        )}
        <VideoDynamicBody item={item} />
      </>
    );
  }

  if (item.kind === "live") {
    return <LiveDynamicBody item={item} />;
  }

  return (
    <>
      {item.title && (
        <h3 className="text-[17px] font-semibold leading-snug text-foreground">
          {item.title}
        </h3>
      )}
      {item.text && (
        <p className="text-sm leading-relaxed">
          <LinkifiedText text={item.text} />
        </p>
      )}
      {(item.kind === "draw" ||
        item.kind === "opus" ||
        item.kind === "text" ||
        item.kind === "article") && <ImageGrid images={images} />}
      {item.kind === "forward" && item.orig && depth < 2 && (
        <ForwardedOrigEmbed item={item.orig} depth={depth + 1} />
      )}
      {item.kind === "forward" && !item.orig && (
        <p className="text-sm text-muted-foreground">源动态已删除</p>
      )}
    </>
  );
}

export function ForwardedOrigEmbed({
  item,
  depth = 0,
}: {
  item: SpaceDynamicItem;
  depth?: number;
}) {
  const navigate = useNavigate();
  const deleted = !item.id || item.id === "0" || item.text === "源动态已删除";

  return (
    <div
      className="space-y-2 rounded-lg border border-border/70 bg-secondary/45 p-3"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!deleted) openDynamicTarget(item, navigate);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          if (!deleted) openDynamicTarget(item, navigate);
        }
      }}
      role={deleted ? undefined : "link"}
      tabIndex={deleted ? undefined : 0}
    >
      {(item.authorName || item.authorMid) && (
        <div className="flex items-center gap-2">
          {item.authorFace ? (
            <BiliImage
              src={item.authorFace}
              alt={item.authorName || ""}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : null}
          {item.authorMid ? (
            <Link
              to={`/up/${item.authorMid}`}
              onClick={(event) => event.stopPropagation()}
              className="truncate text-sm font-medium text-sky-400 hover:underline"
            >
              {item.authorName || "用户"}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium text-sky-400">
              {item.authorName || "用户"}
            </p>
          )}
        </div>
      )}
      <DynamicCardBody item={item} depth={depth} />
    </div>
  );
}

export function DynamicFeedCard({
  item,
  fallbackName = "用户",
  fallbackFace = "",
}: {
  item: SpaceDynamicItem;
  fallbackName?: string;
  fallbackFace?: string;
}) {
  const navigate = useNavigate();
  const authorName = item.authorName || fallbackName;
  const authorFace = item.authorFace || fallbackFace;
  const meta = [item.pubTimeLabel, item.pubAction].filter(Boolean).join(" · ");
  const canOpenDetail =
    item.kind === "opus" ||
    item.kind === "text" ||
    item.kind === "draw" ||
    item.kind === "forward" ||
    item.kind === "article";

  const openDetail = () => {
    openDynamicTarget(item, navigate);
  };

  const authorBlock = (
    <div className="flex items-start gap-3 px-5 pb-1 pt-5">
      {authorFace ? (
        <BiliImage
          src={authorFace}
          alt={authorName}
          className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded-full bg-secondary" />
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="truncate text-[15px] font-medium text-sky-400">
          {authorName}
        </p>
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      </div>
      {item.kind === "live" && !item.liveRoomId && item.liveUrl && (
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {item.authorMid ? (
        <Link to={`/up/${item.authorMid}`}>{authorBlock}</Link>
      ) : (
        authorBlock
      )}

      <div
        className={cn("space-y-3 px-5 py-3", canOpenDetail && "cursor-pointer")}
        onClick={canOpenDetail ? openDetail : undefined}
        onKeyDown={
          canOpenDetail
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetail();
                }
              }
            : undefined
        }
        role={canOpenDetail ? "link" : undefined}
        tabIndex={canOpenDetail ? 0 : undefined}
      >
        <DynamicCardBody item={item} />
      </div>

      <DynamicActionBar item={item} onOpenDetail={openDetail} />
    </article>
  );
}
