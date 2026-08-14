import { Link } from "react-router-dom";
import { MessageCircle, Play } from "lucide-react";
import type { PopularVideoItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { WatchLaterButton } from "@/components/video/WatchLaterButton";
import { cn, formatCount, formatDuration } from "@/lib/utils";

interface PopularVideoCardProps {
  video: PopularVideoItem;
  showRank?: boolean;
}

function rankTone(rank?: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-zinc-300";
  if (rank === 3) return "text-orange-400";
  return "text-muted-foreground";
}

export function PopularVideoCard({ video, showRank }: PopularVideoCardProps) {
  return (
    <Link
      to={`/video/${video.bvid}`}
      className="group flex gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/60"
    >
      {showRank && video.rank ? (
        <div
          className={cn(
            "flex w-7 shrink-0 items-start justify-center pt-1 text-lg font-bold tabular-nums",
            rankTone(video.rank),
          )}
        >
          {video.rank}
        </div>
      ) : null}

      <div className="relative w-[210px] shrink-0 overflow-hidden rounded-lg bg-muted">
        <div className="aspect-video">
          <BiliImage
            src={video.cover}
            alt={video.title}
            variant="cover"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </div>
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
          {formatDuration(video.duration)}
        </span>
        <WatchLaterButton aid={video.aid} bvid={video.bvid} video={video} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {video.title}
        </h3>
        {video.rcmdReason ? (
          <span className="mt-2 w-fit rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-medium text-orange-400">
            {video.rcmdReason}
          </span>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded border border-border px-1 py-px text-[10px] leading-none">
            UP
          </span>
          <span className="truncate">{video.owner.name}</span>
        </div>
        <div className="mt-auto flex items-center gap-4 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Play className="h-3.5 w-3.5" />
            {formatCount(video.play)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {formatCount(video.reply)}
          </span>
        </div>
      </div>
    </Link>
  );
}
