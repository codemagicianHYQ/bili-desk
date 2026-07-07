import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { VideoItem } from "@shared/types";
import { cn, formatCount, formatDuration, formatPubdate } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";

interface VideoCardProps {
  video: VideoItem;
  className?: string;
  /** owner: UP 主 + 播放量；stats: 发布时间 + 播放量（用于自己的投稿） */
  meta?: "owner" | "stats";
  /** 禁用跳转（编辑多选等场景） */
  interactive?: boolean;
  /** 隐藏稍后再看快捷按钮 */
  hideWatchLater?: boolean;
  onCardClick?: () => void;
}

export function VideoCard({
  video,
  className,
  meta = "owner",
  interactive = true,
  hideWatchLater = false,
  onCardClick,
}: VideoCardProps) {
  const content = (
    <>
      <div className="relative aspect-video overflow-hidden bg-muted">
        <BiliImage
          src={video.cover}
          alt={video.title}
          variant="cover"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
        {!hideWatchLater && (
          <WatchLaterButton aid={video.aid} bvid={video.bvid} video={video} />
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(video.duration)}
        </span>
        {interactive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
            <Play className="h-10 w-10 fill-white text-white" />
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          {video.title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {meta === "stats" ? (
            <span>{formatPubdate(video.pubdate) || "—"}</span>
          ) : (
            <span className="min-w-0 truncate">
              {video.owner.name}
              {video.pubdate > 0 && (
                <>
                  <span className="mx-1 text-muted-foreground/50">·</span>
                  <span>{formatPubdate(video.pubdate)}</span>
                </>
              )}
            </span>
          )}
          <span className="shrink-0">{formatCount(video.play)} 播放</span>
        </div>
      </div>
    </>
  );

  const cardClassName = cn(
    "group block overflow-hidden rounded-xl border border-border bg-card transition-all duration-200",
    interactive && "hover:-translate-y-0.5 hover:shadow-lg",
    !interactive && onCardClick && "cursor-pointer",
    className,
  );

  if (!interactive) {
    return (
      <div
        role={onCardClick ? "button" : undefined}
        tabIndex={onCardClick ? 0 : undefined}
        onClick={onCardClick}
        onKeyDown={
          onCardClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onCardClick();
                }
              }
            : undefined
        }
        className={cardClassName}
      >
        {content}
      </div>
    );
  }

  return (
    <Link to={`/video/${video.bvid}`} className={cardClassName}>
      {content}
    </Link>
  );
}
