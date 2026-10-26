import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LocalCategorySelection, ToViewItem } from "@shared/types";
import { CategoryTree } from "@/components/taxonomy/CategoryTree";
import {
  buildWatchLaterTree,
  filterBySelection,
  OTHER_CATEGORY,
  type CategoryPath,
} from "./watch-later-categories";
import { useAppStore } from "@/stores/app-store";
import { TOVIEW_MAX, useWatchLaterStore } from "@/stores/watch-later-store";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { cn, formatDuration } from "@/lib/utils";
import { Check, Clock, FolderTree, Loader2, Trash2 } from "lucide-react";

const PAGE_SIZE = 30;
const CLASSIFY_CHUNK = 200;
const SHOW_CATEGORIES_KEY = "bilidesk.watchLater.showCategories";
const ALL_SELECTION: LocalCategorySelection = { level: "all", id: null };

type WatchLaterTab = "official" | "local";

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
          progressPercent={editing ? 0 : progressPercent}
          progressLabel={
            !editing && progressPercent > 0
              ? `看到 ${formatDuration(item.progress)}`
              : undefined
          }
        />
      </div>
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
  const officialVideos = useWatchLaterStore((state) => state.videos);
  const officialCount = useWatchLaterStore((state) => state.count);
  const localVideos = useWatchLaterStore((state) => state.localVideos);
  const localCount = useWatchLaterStore((state) => state.localCount);
  const loading = useWatchLaterStore((state) => state.loading);
  const ready = useWatchLaterStore((state) => state.ready);
  const error = useWatchLaterStore((state) => state.error);
  const fetch = useWatchLaterStore((state) => state.fetch);
  const ensureLoaded = useWatchLaterStore((state) => state.ensureLoaded);
  const remove = useWatchLaterStore((state) => state.remove);
  const removeMany = useWatchLaterStore((state) => state.removeMany);
  const clearOfficial = useWatchLaterStore((state) => state.clearOfficial);

  const [tab, setTab] = useState<WatchLaterTab>("official");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [selectedBvids, setSelectedBvids] = useState<Set<string>>(new Set());
  const [batchRemoving, setBatchRemoving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [showCategories, setShowCategories] = useState(
    () => localStorage.getItem(SHOW_CATEGORIES_KEY) !== "0",
  );
  const [categoryPaths, setCategoryPaths] = useState<Map<string, CategoryPath>>(
    () => new Map(),
  );
  const [classifying, setClassifying] = useState(false);
  const [selectionByTab, setSelectionByTab] = useState<
    Record<WatchLaterTab, LocalCategorySelection>
  >({ official: ALL_SELECTION, local: ALL_SELECTION });
  const requestedRef = useRef<Set<string>>(new Set());
  const pathsRef = useRef(categoryPaths);
  pathsRef.current = categoryPaths;

  const isLocalTab = tab === "local";
  const tabVideos = isLocalTab ? localVideos : officialVideos;
  const count = isLocalTab ? localCount : officialCount;
  const officialFull = officialCount >= TOVIEW_MAX;
  const selection = selectionByTab[tab];

  const { tree, idsByBvid } = useMemo(
    () => buildWatchLaterTree(tabVideos, categoryPaths),
    [tabVideos, categoryPaths],
  );
  const videos = useMemo(
    () =>
      showCategories
        ? filterBySelection(tabVideos, idsByBvid, selection)
        : tabVideos,
    [showCategories, tabVideos, idsByBvid, selection],
  );

  useEffect(() => {
    const pending = [...officialVideos, ...localVideos].filter(
      (item) => !requestedRef.current.has(item.bvid),
    );
    if (pending.length === 0) return;
    for (const item of pending) requestedRef.current.add(item.bvid);
    let cancelled = false;
    setClassifying(true);
    void (async () => {
      for (let start = 0; start < pending.length; start += CLASSIFY_CHUNK) {
        const chunk = pending.slice(start, start + CLASSIFY_CHUNK);
        let result: Record<string, CategoryPath> = {};
        try {
          result = await window.biliDesk.bili.classifyTitles(
            chunk.map((item) => ({
              key: item.bvid,
              title: item.title,
              upper: item.owner?.name ?? "",
            })),
          );
        } catch {
          result = {};
        }
        if (cancelled) return;
        setCategoryPaths((prev) => {
          const next = new Map(prev);
          for (const item of chunk) {
            next.set(item.bvid, result[item.bvid] ?? { l1: OTHER_CATEGORY });
          }
          return next;
        });
      }
      if (!cancelled) setClassifying(false);
    })();
    return () => {
      cancelled = true;
      for (const item of pending) {
        if (!pathsRef.current.has(item.bvid)) {
          requestedRef.current.delete(item.bvid);
        }
      }
      setClassifying(false);
    };
  }, [officialVideos, localVideos]);

  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const pageVideos = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return videos.slice(start, start + PAGE_SIZE);
  }, [videos, page]);

  useEffect(() => {
    if (user?.isLogin) void ensureLoaded();
  }, [user?.isLogin, ensureLoaded]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
    setEditing(false);
    setSelectedBvids(new Set());
  }, [tab]);

  useEffect(() => {
    if (!editing) setSelectedBvids(new Set());
  }, [editing]);

  useEffect(() => {
    setPage(1);
    setSelectedBvids(new Set());
  }, [selection]);

  useEffect(() => {
    if (selection.level === "all" || videos.length > 0 || classifying) return;
    setSelectionByTab((prev) => ({ ...prev, [tab]: ALL_SELECTION }));
  }, [selection, videos.length, classifying, tab]);

  useEffect(() => {
    localStorage.setItem(SHOW_CATEGORIES_KEY, showCategories ? "1" : "0");
  }, [showCategories]);

  const selectCategory = (next: LocalCategorySelection) => {
    setSelectionByTab((prev) => ({ ...prev, [tab]: next }));
  };

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
        <p className="text-sm">登录后查看稍后再看</p>
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg bg-secondary p-1">
              <button
                type="button"
                onClick={() => setTab("official")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === "official"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                B 站官方
                {officialCount > 0 ? ` ${officialCount}` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("local")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === "local"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                本地
                {localCount > 0 ? ` ${localCount}` : ""}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {isLocalTab
                ? `共 ${count} 个视频 · 保存在本机，不占用官方 1000 上限`
                : `共 ${count} 个视频 · 最多 ${TOVIEW_MAX} 个 · 与 B 站账号同步`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tabVideos.length > 0 && (
              <Button
                size="sm"
                variant={showCategories ? "secondary" : "outline"}
                className="gap-1"
                title="按收藏夹同一套标准自动分类"
                onClick={() => setShowCategories((prev) => !prev)}
              >
                <FolderTree className="h-4 w-4" />
                {showCategories ? "隐藏分类" : "自动分类"}
              </Button>
            )}
            {!isLocalTab && officialCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={clearing}
                onClick={() => {
                  if (
                    !window.confirm("清空 B 站官方稍后再看？本地列表不受影响。")
                  ) {
                    return;
                  }
                  setClearing(true);
                  void clearOfficial()
                    .catch(() => undefined)
                    .finally(() => setClearing(false));
                }}
              >
                {clearing ? "清空中..." : "清空官方"}
              </Button>
            )}
            {tabVideos.length > 0 && (
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
        {officialFull && (
          <p className="text-xs text-muted-foreground">
            官方稍后再看已满 {TOVIEW_MAX} 个，再添加会自动进「本地」
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {showCategories && tabVideos.length > 0 && (
          <aside className="flex w-56 shrink-0 flex-col border-r border-border">
            <div className="flex items-center justify-between px-3 pb-1 pt-3 text-xs text-muted-foreground">
              <span>{isLocalTab ? "本地 · 分类" : "官方 · 分类"}</span>
              {classifying && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  分类中
                </span>
              )}
            </div>
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-2">
              <CategoryTree
                key={tab}
                tree={tree}
                selection={selection}
                onSelect={selectCategory}
                allLabel="全部"
                allCount={tabVideos.length}
              />
            </div>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="p-6">
              {!isLocalTab && error && tabVideos.length === 0 ? (
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
              ) : tabVideos.length > 0 && videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
                  这个分类下暂时没有视频
                </div>
              ) : videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                  <Clock className="h-10 w-10 opacity-40" />
                  <p className="text-sm">
                    {isLocalTab ? "本地稍后再看还是空的" : "暂无稍后再看视频"}
                  </p>
                  <p className="text-xs">
                    {isLocalTab
                      ? "官方满员后，新添加的视频会自动出现在这里"
                      : "在视频卡片或播放页点击时钟图标即可添加"}
                  </p>
                </div>
              ) : (
                <div
                  className={cn("grid gap-4", GRID_COLS_CLASS[homeGridColumns])}
                >
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
            <PaginationBar
              className="shrink-0 bg-background"
              page={page}
              totalPages={totalPages}
              disabled={batchRemoving}
              onPageChange={setPage}
              info={
                <>
                  {showCategories && selection.level !== "all"
                    ? `本分类 ${videos.length} 个 · `
                    : ""}
                  第 {page} / {totalPages} 页 · 本页 {pageVideos.length} 个
                </>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
