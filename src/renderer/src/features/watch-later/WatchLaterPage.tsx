import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ToViewItem } from "@shared/types";
import { useAppStore } from "@/stores/app-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Trash2,
} from "lucide-react";

const PAGE_SIZE = 30;
const TOVIEW_MAX = 1000;

const GRID_COLS_CLASS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
} as const;

function WatchLaterCard({
  item,
  editing,
  selected,
  onToggleSelect,
  onRemove,
}: {
  item: ToViewItem;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
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

  const handleSelect = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleSelect();
  };

  return (
    <div className="group relative">
      <div
        className={cn(
          editing &&
            selected &&
            "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <VideoCard
          video={item}
          hideWatchLater
          interactive={!editing}
          onCardClick={editing ? onToggleSelect : undefined}
        />
      </div>
      {progressPercent > 0 && !editing && (
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
      {editing ? (
        <button
          type="button"
          title={selected ? "取消选择" : "选择"}
          onClick={handleSelect}
          className={cn(
            "absolute left-5 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/80 bg-black/60 text-white hover:bg-black/80",
          )}
        >
          {selected && <Check className="h-4 w-4" />}
        </button>
      ) : (
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
      )}
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
  const removeMany = useWatchLaterStore((state) => state.removeMany);

  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [selectedBvids, setSelectedBvids] = useState<Set<string>>(new Set());
  const [batchRemoving, setBatchRemoving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const pageVideos = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return videos.slice(start, start + PAGE_SIZE);
  }, [videos, page]);

  useEffect(() => {
    if (user?.isLogin) void fetch();
  }, [user?.isLogin, fetch]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!editing) setSelectedBvids(new Set());
  }, [editing]);

  const toggleSelect = (bvid: string) => {
    setSelectedBvids((prev) => {
      const next = new Set(prev);
      if (next.has(bvid)) next.delete(bvid);
      else next.add(bvid);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedBvids(new Set(pageVideos.map((item) => item.bvid)));
  };

  const clearSelection = () => {
    setSelectedBvids(new Set());
  };

  const handleBatchRemove = async () => {
    if (selectedBvids.size === 0) return;
    setBatchRemoving(true);
    try {
      const targets = videos
        .filter((item) => selectedBvids.has(item.bvid))
        .map((item) => ({ aid: item.aid, bvid: item.bvid }));
      await removeMany(targets);
      setSelectedBvids(new Set());
      setEditing(false);
    } finally {
      setBatchRemoving(false);
    }
  };

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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            共 {count} 个视频 · 最多 {TOVIEW_MAX} 个 · 与 B 站账号同步
          </p>
          {videos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAllOnPage}
                    disabled={batchRemoving}
                  >
                    全选本页
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearSelection}
                    disabled={batchRemoving || selectedBvids.size === 0}
                  >
                    取消选择
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    disabled={batchRemoving || selectedBvids.size === 0}
                    onClick={() => void handleBatchRemove()}
                  >
                    {batchRemoving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    删除
                    {selectedBvids.size > 0 ? ` (${selectedBvids.size})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={batchRemoving}
                    onClick={() => setEditing(false)}
                  >
                    完成
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  编辑
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-6">
          {error && videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-red-400">
              <p>{error}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void fetch()}
              >
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
              {pageVideos.map((item) => (
                <WatchLaterCard
                  key={item.bvid}
                  item={item}
                  editing={editing}
                  selected={selectedBvids.has(item.bvid)}
                  onToggleSelect={() => toggleSelect(item.bvid)}
                  onRemove={() => remove(item.aid, item.bvid)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {videos.length > 0 && (
        <div className="shrink-0 border-t border-border bg-background px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              第 {page} / {totalPages} 页 · 本页 {pageVideos.length} 个
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={page <= 1 || batchRemoving}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={page >= totalPages || batchRemoving}
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
