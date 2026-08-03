import { Link } from "react-router-dom";
import type { SpaceDynamicItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import {
  ExternalLink,
  MessageCircle,
  Radio,
  Share2,
  ThumbsUp,
} from "lucide-react";

function DynamicActionBar({ item }: { item: SpaceDynamicItem }) {
  const reply = item.stats?.reply ?? 0;
  const like = item.stats?.like ?? 0;

  return (
    <div className="grid grid-cols-3 border-t border-border/60">
      <div className="flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground">
        <Share2 className="h-4 w-4" />
        转发
      </div>
      <div className="flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground">
        <MessageCircle className="h-4 w-4" />
        {reply > 0 ? formatCount(reply) : "评论"}
      </div>
      <div className="flex items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground">
        <ThumbsUp className="h-4 w-4" />
        {like > 0 ? formatCount(like) : "点赞"}
      </div>
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
    return <Link to={`/video/${item.bvid}`}>{content}</Link>;
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
          <p className="text-xs text-muted-foreground">{item.text}</p>
        )}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }
  if (!external) return content;
  return (
    <a href={external} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  );
}

function ImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <BiliImage
        src={images[0]}
        alt=""
        className="max-h-96 w-full rounded-lg object-cover"
      />
    );
  }

  const shown = images.slice(0, 9);
  return (
    <div
      className={cn(
        "grid gap-1.5",
        shown.length === 2 || shown.length === 4
          ? "grid-cols-2"
          : "grid-cols-3",
      )}
    >
      {shown.map((src) => (
        <BiliImage
          key={src}
          src={src}
          alt=""
          className="aspect-square w-full rounded-md object-cover"
        />
      ))}
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
  const authorName = item.authorName || fallbackName;
  const authorFace = item.authorFace || fallbackFace;
  const meta = [item.pubTimeLabel, item.pubAction].filter(Boolean).join(" · ");
  const images = item.images?.length
    ? item.images
    : item.cover
      ? [item.cover]
      : [];

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

      <div className="space-y-3 px-5 py-3">
        {item.kind === "video" ? (
          <>
            {item.text && (
              <p className="text-sm text-muted-foreground">{item.text}</p>
            )}
            <VideoDynamicBody item={item} />
          </>
        ) : item.kind === "live" ? (
          <LiveDynamicBody item={item} />
        ) : (
          <>
            {item.text && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {item.text}
              </p>
            )}
            {(item.kind === "draw" ||
              item.kind === "opus" ||
              item.kind === "text") && <ImageGrid images={images} />}
            {item.kind === "forward" && !item.text && (
              <p className="text-sm text-muted-foreground">转发动态</p>
            )}
          </>
        )}
      </div>

      <DynamicActionBar item={item} />
    </article>
  );
}
