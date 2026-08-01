import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { VideoItem } from "@shared/types";
import { cn, formatCount, formatDuration, formatPubdate } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { Badge } from "@/components/ui/badge";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";

interface VideoCardProps {
  video: VideoItem;
  className?: string;
  /** owner: UP 主 + 播放量；stats: 发布时间 + 播放量（用于自己的投稿） */
  meta?: "owner" | "stats";
  /** 在 UP 主名旁显示「已关注」标签 */
  showFollowedBadge?: boolean;
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
  showFollowedBadge = false,
  interactive = true,
  hideWatchLater = false,
  onCardClick,
}: VideoCardProps) {
  const content = (
    <>
      <div className="relative aspect-video bg-muted">
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          <BiliImage
            src={video.cover}
            alt={video.title}
            variant="cover"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          {interactive && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
              <Play className="h-10 w-10 fill-white text-white" />
            </div>
          )}
          <span className="absolute bottom-2 right-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {formatDuration(video.duration)}
          </span>
        </div>
        {!hideWatchLater && (
          <WatchLaterButton aid={video.aid} bvid={video.bvid} video={video} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">
          {video.title}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {meta === "stats" ? (
            <span>{formatPubdate(video.pubdate) || "—"}</span>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <span
                className={cn(
                  "truncate",
                  showFollowedBadge && "font-medium text-primary",
                )}
              >
                {video.owner.name}
              </span>
              {showFollowedBadge && (
                <Badge
                  variant="default"
                  className="shrink-0 px-1.5 py-0 text-[10px] leading-4"
                >
                  已关注
                </Badge>
              )}
              {video.pubdate > 0 && (
                <>
                  <span className="shrink-0 text-muted-foreground/50">·</span>
                  <span className="shrink-0">
                    {formatPubdate(video.pubdate)}
                  </span>
                </>
              )}
            </div>
          )}
          <span className="shrink-0">{formatCount(video.play)} 播放</span>
        </div>
      </div>
    </>
  );

  const cardClassName = cn(
    "group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200",
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
