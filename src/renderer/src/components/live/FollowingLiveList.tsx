import { Link } from "react-router-dom";
import type { LiveRoomItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { cn } from "@/lib/utils";

interface FollowingLiveListProps {
  rooms: LiveRoomItem[];
  count: number;
  className?: string;
}

export function FollowingLiveList({
  rooms,
  count,
  className,
}: FollowingLiveListProps) {
  if (rooms.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          正在直播
          <span className="ml-1.5 text-muted-foreground">
            {count || rooms.length}
          </span>
        </h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => (
          <Link
            key={room.roomId}
            to={`/live/${room.roomId}`}
            className="flex items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/60"
          >
            <BiliImage
              src={room.face || room.cover}
              alt={room.uname}
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {room.uname || "未知主播"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {room.title || "直播中"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
