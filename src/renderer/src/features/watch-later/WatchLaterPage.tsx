import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ToViewItem } from "@shared/types";
import { useAppStore } from "@/stores/app-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import { Clock, Loader2, Trash2 } from "lucide-react";

const GRID_COLS_CLASS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
} as const;

function WatchLaterCard({
  item,
  onRemove,
}: {
  item: ToViewItem;
  onRemove: () => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const progressPercent =
    item.duration > 0
      ? Math.min(100, Math.round((item.progress / item.duration) * 100))
      : 0;

  const handleRemove = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="group relative">
      <VideoCard video={item} />
      {progressPercent > 0 && (
        <>
          <div className="pointer-events-none absolute bottom-[4.5rem] left-3 right-3 h-1 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="pointer-events-none absolute bottom-[5.25rem] left-3 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            看到 {formatDuration(item.progress)}
          </p>
        </>
      )}
      <button
        type="button"
        title="从稍后再看移除"
        disabled={removing}
        onClick={(event) => void handleRemove(event)}
        className="absolute right-5 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500/80 group-hover:opacity-100"
      >
        {removing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function WatchLaterPage() {
  const user = useAppStore((state) => state.user);
  const homeGridColumns = useAppStore((state) => state.homeGridColumns);
  const videos = useWatchLaterStore((state) => state.videos);
  const count = useWatchLaterStore((state) => state.count);
  const loading = useWatchLaterStore((state) => state.loading);
  const ready = useWatchLaterStore((state) => state.ready);
  const error = useWatchLaterStore((state) => state.error);
  const fetch = useWatchLaterStore((state) => state.fetch);
  const remove = useWatchLaterStore((state) => state.remove);

  useEffect(() => {
    if (user?.isLogin) void fetch();
  }, [user?.isLogin, fetch]);

  if (!user?.isLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Clock className="h-10 w-10 opacity-40" />
        <p className="text-sm">登录后同步 B 站稍后再看列表</p>
        <Link to="/login">
          <Button size="sm">去登录</Button>
        </Link>
      </div>
    );
  }

  if (!ready && loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载稍后再看...
      </div>
    );
  }

  return (
    <div className="scrollbar-overlay h-full overflow-y-auto">
      <div className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          共 {count} 个视频 · 最多 100 个 · 与 B 站账号同步
        </p>

        {error && videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-red-400">
            <p>{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void fetch()}>
              重试
            </Button>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-40" />
            <p className="text-sm">暂无稍后再看视频</p>
            <p className="text-xs">在视频卡片或播放页点击时钟图标即可添加</p>
          </div>
        ) : (
          <div className={cn("grid gap-4", GRID_COLS_CLASS[homeGridColumns])}>
            {videos.map((item) => (
              <WatchLaterCard
                key={item.bvid}
                item={item}
                onRemove={() => remove(item.aid, item.bvid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
