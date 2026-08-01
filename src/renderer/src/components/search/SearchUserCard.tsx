import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SearchUserItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { FollowButton } from "@/components/video/FollowButton";
import { cn, formatCount } from "@/lib/utils";
import { Radio } from "lucide-react";

interface SearchUserCardProps {
  user: SearchUserItem;
  followed?: boolean;
  onFollowChange?: (mid: number, following: boolean) => void;
}

export function SearchUserCard({
  user,
  followed = false,
  onFollowChange,
}: SearchUserCardProps) {
  const [isFollowing, setIsFollowing] = useState(followed || user.isFollowing);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsFollowing(followed || user.isFollowing);
  }, [followed, user.isFollowing, user.mid]);

  const handleFollow = async () => {
    setLoading(true);
    try {
      const next = !isFollowing;
      await window.biliDesk.bili.modifyFollow(user.mid, next);
      setIsFollowing(next);
      onFollowChange?.(user.mid, next);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-secondary/40">
      <Link to={`/up/${user.mid}`} className="relative shrink-0">
        <BiliImage
          src={user.face}
          alt={user.name}
          className="h-16 w-16 rounded-full object-cover ring-1 ring-border"
        />
        {user.isLive && user.roomId ? (
          <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
            <Radio className="h-2.5 w-2.5" />
            直播
          </span>
        ) : null}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/up/${user.mid}`}
            className="truncate text-sm font-medium hover:text-primary"
          >
            {user.name}
          </Link>
          {user.level > 0 && (
            <span
              className={cn(
                "rounded px-1 py-0.5 text-[10px] font-semibold text-white",
                user.level >= 6
                  ? "bg-red-500"
                  : user.level >= 4
                    ? "bg-blue-500"
                    : "bg-slate-400",
              )}
            >
              LV{user.level}
            </span>
          )}
          {user.officialDesc && (
            <span className="truncate text-[11px] text-primary">
              {user.officialDesc}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCount(user.fans)}粉丝 · {formatCount(user.videos)}个视频
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {user.sign || "这个人很懒，什么都没有写"}
        </p>
      </div>

      <FollowButton
        isFollowing={isFollowing}
        loading={loading}
        onClick={() => void handleFollow()}
        className="shrink-0"
      />
    </div>
  );
}
