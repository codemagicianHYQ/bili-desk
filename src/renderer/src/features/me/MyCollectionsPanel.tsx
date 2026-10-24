import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollectionGroupMap,
  UserCollectionItem,
  VideoItem,
} from "@shared/types";
import {
  UNGROUPED_COLLECTION_L1,
  collectionGroupKey,
} from "@shared/utils/collection-groups";
import {
  CollectionGroupTree,
  buildCollectionTree,
  buildTreeFromGroups,
  matchesCollectionSelection,
  type CollectionGroupSelection,
} from "@/components/collections/CollectionGroupTree";
import { CollectionMoveDialog } from "@/components/collections/CollectionMoveDialog";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoCard } from "@/components/video/VideoCard";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Bookmark,
  Folder,
  FolderInput,
  Layers,
  Loader2,
  PenSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";

const VIDEO_PAGE_SIZE = 30;
const MODE_STORAGE_KEY = "bilidesk:collections-mode";

type CollectionTab = "created" | "subscribed";
type SidebarMode = "bilibili" | "local";
type VideoSortOrder = "desc" | "asc";
type ListSection = { name: string; items: UserCollectionItem[] };

function formatError(err: unknown): string {
  const message = extractIpcErrorMessage(err) || "加载失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  if (message.startsWith("Error invoking remote method")) {
    return "加载失败，请完全重启应用后重试";
  }
  return message;
}

function itemLabel(item: UserCollectionItem): string {
  if (item.kind === "series") return "系列";
  return item.source === "created" ? "我的合集" : "合集";
}

function sectionize(
  items: UserCollectionItem[],
  groups: CollectionGroupMap,
  by: "l1" | "l2",
): ListSection[] {
  const buckets = new Map<string, UserCollectionItem[]>();
  for (const item of items) {
    const group = groups[collectionGroupKey(item)];
    const name = group
      ? by === "l1"
        ? group.l1
        : group.l2
      : UNGROUPED_COLLECTION_L1;
    const bucket = buckets.get(name);
    if (bucket) bucket.push(item);
    else buckets.set(name, [item]);
  }
  return Array.from(buckets, ([name, list]) => ({ name, items: list })).sort(
    (a, b) =>
      Number(a.name === UNGROUPED_COLLECTION_L1) -
        Number(b.name === UNGROUPED_COLLECTION_L1) ||
      b.items.length - a.items.length,
  );
}

interface MyCollectionsPanelProps {
  mid: number;
  /** page：侧栏独立页满高；embedded：嵌在「我的」里 */
  layout?: "page" | "embedded";
}

export function MyCollectionsPanel({
  mid,
  layout = "embedded",
}: MyCollectionsPanelProps) {
  const selfMid = useAppStore((s) => s.user?.mid) ?? 0;
  const isSelf = mid > 0 && Number(mid) === Number(selfMid);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listSentinelRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<SidebarMode>(() =>
    localStorage.getItem(MODE_STORAGE_KEY) === "local" ? "local" : "bilibili",
  );
  const localMode = isSelf && mode === "local";

  const [tab, setTab] = useState<CollectionTab>("subscribed");
  const [seasons, setSeasons] = useState<UserCollectionItem[]>([]);
  const [series, setSeries] = useState<UserCollectionItem[]>([]);
  const [subscribed, setSubscribed] = useState<UserCollectionItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [localItems, setLocalItems] = useState<UserCollectionItem[] | null>(
    null,
  );
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [groups, setGroups] = useState<CollectionGroupMap>({});
  const [groupSelection, setGroupSelection] =
    useState<CollectionGroupSelection>({ l1: null, l2: null });
  const [classifying, setClassifying] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState("");
  const [classifyPercent, setClassifyPercent] = useState(0);
  const [moveItem, setMoveItem] = useState<UserCollectionItem | null>(null);

  const [selected, setSelected] = useState<UserCollectionItem | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoTotal, setVideoTotal] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [sortOrder, setSortOrder] = useState<VideoSortOrder>("desc");
  const [subscribedIds, setSubscribedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState("");

  const clearDetail = useCallback(() => {
    setSelected(null);
    setVideos([]);
    setVideoPage(1);
    setVideoTotal(0);
    setSubError("");
  }, []);

  const loadList = useCallback(
    async (kind: CollectionTab, nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
        clearDetail();
      }

      try {
        if (kind === "created") {
          const result = await window.biliDesk.bili.getUserCollections(
            mid,
            nextPage,
          );
          setSeasons((prev) =>
            append ? [...prev, ...result.seasons] : result.seasons,
          );
          setSeries((prev) =>
            append ? [...prev, ...result.series] : result.series,
          );
          setHasMore(result.hasMore);
        } else {
          const result =
            await window.biliDesk.bili.getSubscribedCollections(nextPage);
          setSubscribed((prev) =>
            append ? [...prev, ...result.seasons] : result.seasons,
          );
          setHasMore(result.hasMore);
        }
        setPage(nextPage);
      } catch (err) {
        setError(formatError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mid, clearDetail],
  );

  const loadLocal = useCallback(async () => {
    setLocalLoading(true);
    setLocalError("");
    try {
      setLocalItems(await window.biliDesk.bili.getLocalCollections());
    } catch (err) {
      setLocalError(formatError(err));
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    void window.biliDesk.bili
      .getCollectionGroups()
      .then(setGroups)
      .catch(() => setGroups({}));
    return window.biliDesk.bili.onCollectionClassifyProgress((progress) => {
      setClassifyMessage(progress.message);
      setClassifyPercent(
        progress.total > 0
          ? Math.round((progress.done / progress.total) * 100)
          : 0,
      );
    });
  }, []);

  useEffect(() => {
    if (localMode) return;
    setSeasons([]);
    setSeries([]);
    setSubscribed([]);
    setSubscribedIds(new Set());
    setPage(1);
    setHasMore(false);
    void loadList(tab, 1, false);
  }, [tab, mid, loadList, localMode]);

  useEffect(() => {
    if (localMode && localItems == null && !localLoading) void loadLocal();
  }, [localMode, localItems, localLoading, loadLocal]);

  useEffect(() => {
    if (tab !== "subscribed") return;
    setSubscribedIds(new Set(subscribed.map((item) => item.id)));
  }, [tab, subscribed]);

  useEffect(() => {
    const root = listScrollRef.current;
    const target = listSentinelRef.current;
    if (localMode || !root || !target || !hasMore || loading || loadingMore)
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadList(tab, page + 1, true);
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, hasMore, loadList, loading, loadingMore, page, localMode]);

  const switchMode = (next: SidebarMode) => {
    if (next === mode) return;
    localStorage.setItem(MODE_STORAGE_KEY, next);
    setMode(next);
    clearDetail();
  };

  const switchTab = (next: CollectionTab) => {
    if (next === tab) return;
    setTab(next);
  };

  const selectGroup = (next: CollectionGroupSelection) => {
    setGroupSelection(next);
    clearDetail();
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  };

  const runClassify = async (classifyMode: "new" | "all") => {
    if (classifying) return;
    setClassifying(true);
    setClassifyPercent(0);
    setClassifyMessage("正在启动 AI 整理…");
    try {
      const result =
        await window.biliDesk.bili.classifyCollections(classifyMode);
      setLocalItems(result.items);
      setGroups(result.groups);
      setClassifyMessage(result.message);
    } catch (err) {
      setClassifyMessage(formatError(err));
    } finally {
      setClassifying(false);
    }
  };

  const renameGroup = async (l1: string, l2: string | null, name: string) => {
    try {
      const next = await window.biliDesk.bili.renameCollectionGroup(
        l1,
        l2,
        name,
      );
      setGroups(next);
      setGroupSelection((prev) => {
        if (prev.l1 !== l1) return prev;
        if (l2 == null) return { ...prev, l1: name };
        return prev.l2 === l2 ? { ...prev, l2: name } : prev;
      });
    } catch (err) {
      setClassifyMessage(formatError(err));
    }
  };

  const loadVideos = useCallback(
    async (collection: UserCollectionItem, nextPage: number) => {
      setVideosLoading(true);
      setVideosError("");

      const ownerMid = collection.ownerMid ?? mid;

      try {
        const result =
          collection.kind === "season"
            ? await window.biliDesk.bili.getSeasonArchives(
                ownerMid,
                collection.id,
                nextPage,
              )
            : await window.biliDesk.bili.getSeriesArchives(
                collection.id,
                nextPage,
              );

        setVideos(result.videos);
        setVideoPage(result.page);
        setVideoTotal(
          result.total > 0
            ? result.total
            : collection.total || result.videos.length,
        );
      } catch (err) {
        setVideosError(formatError(err));
        setVideos([]);
      } finally {
        setVideosLoading(false);
      }
    },
    [mid],
  );

  const selectCollection = useCallback(
    (collection: UserCollectionItem) => {
      setSelected(collection);
      setSortOrder("desc");
      setVideoPage(1);
      setSubError("");
      void loadVideos(collection, 1);
      if (collection.kind === "season" && collection.source === "subscribed") {
        setSubscribedIds((prev) => new Set(prev).add(collection.id));
      } else if (
        collection.kind === "season" &&
        Number(collection.ownerMid ?? mid) !== Number(selfMid)
      ) {
        void window.biliDesk.bili
          .getUgcSeasonSubscribed(collection.id)
          .then((value) => {
            setSubscribedIds((prev) => {
              const next = new Set(prev);
              if (value) next.add(collection.id);
              else next.delete(collection.id);
              return next;
            });
          })
          .catch(() => {});
      }
    },
    [loadVideos, mid, selfMid],
  );

  const goToVideoPage = useCallback(
    (nextPage: number) => {
      if (!selected || nextPage < 1 || videosLoading) return;
      const totalPages = Math.max(1, Math.ceil(videoTotal / VIDEO_PAGE_SIZE));
      if (nextPage > totalPages) return;
      setVideoPage(nextPage);
      void loadVideos(selected, nextPage);
    },
    [selected, videosLoading, videoTotal, loadVideos],
  );

  const isOwnSelected = Boolean(
    selected &&
    (selected.source === "created" ||
      Number(selected.ownerMid ?? 0) === Number(selfMid)),
  );
  const canSubscribeSelected = Boolean(
    selected && selected.kind === "season" && !isOwnSelected,
  );
  const selectedSubscribed = Boolean(
    selected && subscribedIds.has(selected.id),
  );

  const removeFromLists = (item: UserCollectionItem) => {
    setSubscribed((prev) => prev.filter((entry) => entry.id !== item.id));
    setLocalItems((prev) =>
      prev
        ? prev.filter(
            (entry) =>
              !(
                entry.source === "subscribed" &&
                collectionGroupKey(entry) === collectionGroupKey(item)
              ),
          )
        : prev,
    );
  };

  const handleToggleSubscribe = async () => {
    if (!selected || selected.kind !== "season" || subBusy) return;
    if (!selfMid) {
      setSubError("请先登录后再订阅合集");
      return;
    }
    const next = !selectedSubscribed;
    const snapshot = selected;
    setSubBusy(true);
    setSubError("");
    setSubscribedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(snapshot.id);
      else copy.delete(snapshot.id);
      return copy;
    });
    try {
      await window.biliDesk.bili.setUgcSeasonSubscribe(snapshot.id, next);
      if (!next && snapshot.source === "subscribed") {
        removeFromLists(snapshot);
        clearDetail();
      }
    } catch (err) {
      setSubscribedIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(snapshot.id);
        else copy.add(snapshot.id);
        return copy;
      });
      const message = formatError(err);
      if (
        next &&
        (message.includes("已订阅") ||
          message.includes("已经收藏") ||
          message.includes("重复"))
      ) {
        setSubscribedIds((prev) => new Set(prev).add(snapshot.id));
      } else {
        setSubError(message);
      }
    } finally {
      setSubBusy(false);
    }
  };

  const sortedVideos = useMemo(() => {
    const copy = [...videos];
    copy.sort((a, b) =>
      sortOrder === "desc" ? b.pubdate - a.pubdate : a.pubdate - b.pubdate,
    );
    return copy;
  }, [videos, sortOrder]);

  const videoTotalPages = Math.max(1, Math.ceil(videoTotal / VIDEO_PAGE_SIZE));

  const officialItems = useMemo(
    () => (tab === "created" ? [...seasons, ...series] : subscribed),
    [tab, seasons, series, subscribed],
  );

  const { tree, ungrouped } = useMemo(
    () => buildCollectionTree(localItems ?? [], groups),
    [localItems, groups],
  );
  const moveTree = useMemo(() => buildTreeFromGroups(groups), [groups]);

  const listSections: ListSection[] = useMemo(() => {
    if (!localMode) return [{ name: "", items: officialItems }];
    const filtered = (localItems ?? []).filter((item) =>
      matchesCollectionSelection(item, groups, groupSelection),
    );
    if (groupSelection.l1 == null) return sectionize(filtered, groups, "l1");
    if (
      groupSelection.l2 == null &&
      groupSelection.l1 !== UNGROUPED_COLLECTION_L1
    ) {
      return sectionize(filtered, groups, "l2");
    }
    return [{ name: "", items: filtered }];
  }, [localMode, officialItems, localItems, groups, groupSelection]);

  const listCount = listSections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );

  const listTitle = localMode
    ? groupSelection.l1 == null
      ? "全部合集"
      : groupSelection.l2
        ? `${groupSelection.l1} / ${groupSelection.l2}`
        : groupSelection.l1
    : tab === "created"
      ? "我创建的"
      : "我收藏的";

  const listBusy = localMode
    ? localLoading && localItems == null
    : loading && officialItems.length === 0;
  const listError = localMode ? localError : error;

  const sidebarRow = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
      active ? "bg-primary/10 text-primary" : "hover:bg-secondary",
    );

  return (
    <div
      className={cn(
        "grid min-h-0 gap-4 lg:grid-cols-[220px_300px_minmax(0,1fr)]",
        layout === "page" ? "h-full" : "h-[calc(100vh-13rem)] min-h-[520px]",
      )}
    >
      <aside className="bili-glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/25">
        {isSelf && (
          <div className="border-b border-border/60 p-3">
            <div className="flex rounded-lg bg-secondary p-1">
              {(
                [
                  ["bilibili", "B 站合集"],
                  ["local", "本地分类"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => switchMode(value)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                    mode === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {localMode && (
          <div className="space-y-2 border-b border-border/60 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              合并「我收藏的」和「我创建的」，按标题与简介用规则 + AI
              分成两级目录。手动移动过的不会被覆盖，双击分类可重命名。
            </p>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="flex-1 gap-1.5"
                disabled={classifying}
                onClick={() => void runClassify("new")}
                title="只整理还没有分类的合集"
              >
                {classifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                整理新增
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1 px-2"
                disabled={classifying}
                onClick={() => void runClassify("all")}
                title="除手动移动的以外，全部重新分类"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                全部重整
              </Button>
            </div>
            {classifying && classifyPercent > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${classifyPercent}%` }}
                />
              </div>
            )}
            {classifyMessage && (
              <p className="text-[11px] text-muted-foreground">
                {classifyMessage}
              </p>
            )}
          </div>
        )}

        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-2">
          {localMode ? (
            <CollectionGroupTree
              tree={tree}
              total={localItems?.length ?? 0}
              ungrouped={ungrouped}
              selection={groupSelection}
              onSelect={selectGroup}
              onRename={(l1, l2, name) => void renameGroup(l1, l2, name)}
            />
          ) : (
            <div className="space-y-0.5">
              <button
                type="button"
                className={sidebarRow(tab === "subscribed")}
                onClick={() => switchTab("subscribed")}
              >
                <Bookmark className="h-4 w-4 shrink-0" />
                <span className="flex-1">我收藏的</span>
              </button>
              <button
                type="button"
                className={sidebarRow(tab === "created")}
                onClick={() => switchTab("created")}
              >
                <PenSquare className="h-4 w-4 shrink-0" />
                <span className="flex-1">我创建的</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="bili-glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/25">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
          <p className="min-w-0 truncate text-sm font-medium">{listTitle}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {listCount}
            {!localMode && hasMore ? "+" : ""} 个
          </span>
        </div>
        <div
          ref={listScrollRef}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
        >
          {listBusy ? (
            <p className="flex items-center px-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {localMode ? "正在拉取全部合集…" : "加载合集..."}
            </p>
          ) : listError && listCount === 0 ? (
            <p className="px-2 py-6 text-sm text-red-400">{listError}</p>
          ) : listCount === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {localMode
                ? "这个分类下还没有合集"
                : tab === "created"
                  ? "暂无自建合集或系列"
                  : "暂无收藏/订阅的合集"}
            </p>
          ) : (
            listSections.map((section) => (
              <div key={section.name || "__all"} className="space-y-1">
                {section.name && (
                  <p className="sticky top-0 z-[1] flex items-center justify-between rounded-md bg-card/90 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                    <span className="truncate">{section.name}</span>
                    <span>{section.items.length}</span>
                  </p>
                )}
                {section.items.map((item) => {
                  const active =
                    selected != null &&
                    collectionGroupKey(selected) === collectionGroupKey(item);
                  const group = groups[collectionGroupKey(item)];
                  return (
                    <div
                      key={`${item.source ?? tab}-${collectionGroupKey(item)}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectCollection(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") selectCollection(item);
                      }}
                      className={cn(
                        "group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-primary/15 ring-1 ring-primary/35"
                          : "hover:bg-secondary/70",
                      )}
                    >
                      {item.cover ? (
                        <BiliImage
                          src={item.cover}
                          alt=""
                          className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-[4.5rem] shrink-0 items-center justify-center rounded-lg bg-muted">
                          {item.kind === "season" ? (
                            <Folder className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Layers className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {itemLabel(item)} · {formatCount(item.total)} 个
                          {group && (!localMode || groupSelection.l1 == null)
                            ? ` · ${group.l1}/${group.l2}`
                            : ""}
                        </p>
                      </div>
                      {isSelf && (
                        <button
                          type="button"
                          title="移动到本地分类"
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMoveItem(item);
                          }}
                        >
                          <FolderInput className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
          {!localMode && officialItems.length > 0 && (
            <div
              ref={listSentinelRef}
              className="py-3 text-center text-xs text-muted-foreground"
            >
              {loadingMore
                ? "加载更多..."
                : hasMore
                  ? "继续下滑加载更多"
                  : "已经到底啦"}
            </div>
          )}
        </div>
      </div>

      <div className="bili-glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/20">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <Layers className="h-8 w-8 opacity-40" />
            <p>选择中间的合集查看视频</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative shrink-0 overflow-hidden border-b border-border/60">
              {selected.cover ? (
                <BiliImage
                  src={selected.cover}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
                />
              ) : null}
              <div className="relative flex flex-wrap items-start gap-4 px-4 py-4">
                {selected.cover ? (
                  <BiliImage
                    src={selected.cover}
                    alt=""
                    className="h-20 w-[7.5rem] shrink-0 rounded-xl object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-20 w-[7.5rem] shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Folder className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold tracking-tight">
                        {selected.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selected.kind === "season" ? "合集" : "系列"} ·{" "}
                        {formatCount(selected.total || videoTotal)} 个内容
                        {groups[collectionGroupKey(selected)]
                          ? ` · ${groups[collectionGroupKey(selected)].l1}/${groups[collectionGroupKey(selected)].l2}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {canSubscribeSelected && (
                        <Button
                          size="sm"
                          variant={selectedSubscribed ? "outline" : "default"}
                          disabled={subBusy}
                          onClick={() => void handleToggleSubscribe()}
                        >
                          {subBusy
                            ? "处理中..."
                            : selectedSubscribed
                              ? "取消订阅"
                              : "订阅合集"}
                        </Button>
                      )}
                      {videoTotal > 0 && (
                        <>
                          <Button
                            size="sm"
                            variant={
                              sortOrder === "desc" ? "default" : "outline"
                            }
                            className="gap-1"
                            onClick={() => setSortOrder("desc")}
                          >
                            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                            最新
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              sortOrder === "asc" ? "default" : "outline"
                            }
                            className="gap-1"
                            onClick={() => setSortOrder("asc")}
                          >
                            <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                            最早
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {selected.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {selected.description}
                    </p>
                  ) : null}
                  {subError ? (
                    <p className="text-xs text-red-400">{subError}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {videosLoading && videos.length === 0 ? (
              <p className="flex items-center px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载视频中...
              </p>
            ) : videosError && videos.length === 0 ? (
              <p className="px-4 py-8 text-sm text-red-400">{videosError}</p>
            ) : sortedVideos.length > 0 ? (
              <>
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto px-4 pt-4",
                    videosLoading && "pointer-events-none opacity-60",
                  )}
                >
                  <div className="grid grid-cols-2 gap-4 pb-2 xl:grid-cols-3">
                    {sortedVideos.map((video) => (
                      <VideoCard key={video.bvid} video={video} meta="stats" />
                    ))}
                  </div>
                  {videosLoading && (
                    <p className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      加载中...
                    </p>
                  )}
                  {videosError && (
                    <p className="pb-2 text-sm text-red-400">{videosError}</p>
                  )}
                </div>

                {videoTotal > 0 && (
                  <PaginationBar
                    page={videoPage}
                    totalPages={videoTotalPages}
                    disabled={videosLoading}
                    onPageChange={goToVideoPage}
                    className="mt-auto shrink-0 border-t border-border/60 bg-transparent px-4 py-3"
                    info={
                      <>
                        共 {videoTotal} 个视频 · 第 {videoPage} /{" "}
                        {videoTotalPages} 页
                      </>
                    }
                  />
                )}
              </>
            ) : (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                该合集暂无视频
              </p>
            )}
          </div>
        )}
      </div>

      <CollectionMoveDialog
        item={moveItem}
        current={moveItem ? groups[collectionGroupKey(moveItem)] : undefined}
        tree={moveTree}
        onClose={() => setMoveItem(null)}
        onConfirm={async (group) => {
          if (!moveItem) return;
          const next = await window.biliDesk.bili.setCollectionGroup(
            collectionGroupKey(moveItem),
            group,
          );
          setGroups(next);
        }}
      />
    </div>
  );
}
