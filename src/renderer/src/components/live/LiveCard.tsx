import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import type { LiveRoomItem } from "@shared/types";
import { cn, formatCount } from "@/lib/utils";
import { BiliImage } from "@/components/ui/bili-image";
import { Badge } from "@/components/ui/badge";

interface LiveCardProps {
  room: LiveRoomItem;
  className?: string;
  showFollowedBadge?: boolean;
}

export function LiveCard({
  room,
  className,
  showFollowedBadge = false,
}: LiveCardProps) {
  const onlineLabel =
    room.onlineText ||
    (room.online > 0 ? `${formatCount(room.online)} 人气` : "直播中");

  return (
    <Link
      to={`/live/${room.roomId}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl bg-card transition-colors hover:bg-secondary/40",
        className,
      )}
    >
      <div className="relative aspect-video bg-muted">
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          <BiliImage
            src={room.cover || room.keyframe || room.face}
            alt={room.title}
            variant="cover"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <span className="absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Radio className="h-3 w-3" />
            直播中
          </span>
          {room.areaName && (
            <span className="absolute bottom-2 left-2 z-[1] max-w-[60%] truncate rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
              {room.areaName}
            </span>
          )}
          <span className="absolute bottom-2 right-2 z-[1] rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {onlineLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">
          {room.title}
        </h3>
        <div className="mt-auto flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
          <span className="truncate">{room.uname || "未知主播"}</span>
          {showFollowedBadge && (
            <Badge
              variant="default"
              className="shrink-0 px-1.5 py-0 text-[10px] leading-4"
            >
              已关注
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
