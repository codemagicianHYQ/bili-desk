import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BILI_SPECIAL_FOLLOW_TAG_ID,
  type FollowingOrder,
  type FollowingSort,
  type FollowingUp,
  type UpGroupSelection,
  type UpGroupTreeNode,
} from "@shared/types";
import { useFollowingStore, type TagListCache } from "@/stores/following-store";
import { UpGroupTree } from "@/components/taxonomy/UpGroupTree";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Folder, Loader2, Sparkles, Upload } from "lucide-react";
import { FollowTagDialog } from "./FollowTagDialog";
import { FollowingUpCard } from "./FollowingUpCard";
import { UnfollowConfirmDialog } from "./UnfollowConfirmDialog";
import { CreateFollowTagControl } from "@/components/following/CreateFollowTagControl";
import { FollowTagList } from "@/components/following/FollowTagList";
import { FollowTagSyncDialog } from "@/components/following/FollowTagSyncDialog";
import { upRelationCache, upSpaceCache } from "@/lib/session-data-cache";

type SidebarMode = "bilibili" | "local";

const SORT_STORAGE_KEY = "bilidesk:following-sort";

const SORT_OPTIONS: Array<{ value: FollowingSort; label: string }> = [
  { value: "recent", label: "最近关注" },
  { value: "attention", label: "最常访问" },
  { value: "earliest", label: "最早关注" },
  { value: "name", label: "名称" },
];

function readSort(): FollowingSort {
  const saved = localStorage.getItem(SORT_STORAGE_KEY);
  return SORT_OPTIONS.some((option) => option.value === saved)
    ? (saved as FollowingSort)
    : "recent";
}

function tagCacheKey(tagId: number, order: FollowingOrder): number | string {
  return order === "attention" ? `${tagId}:attention` : tagId;
}

function isSpecialFollowTag(
  tagId: number | null,
  tag: { tagId: number; name: string } | undefined,
): boolean {
  if (tagId === BILI_SPECIAL_FOLLOW_TAG_ID) return true;
  return tag?.name === "特别关注";
}

function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : "加载失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  return message;
}

function getLocalSelectionLabel(
  tree: UpGroupTreeNode[],
  selection: UpGroupSelection,
): string {
  if (selection.level === "uncategorized") return "未分组";
  if (selection.level === "l1" && selection.id != null) {
    return tree.find((node) => node.id === selection.id)?.name ?? "...";
  }
  if (selection.level === "l2" && selection.id != null) {
    for (const l1 of tree) {
      const l2 = l1.children.find((child) => child.id === selection.id);
      if (l2) return `${l1.name} / ${l2.name}`;
    }
  }
  return "...";
}

export function FollowingPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadSeqRef = useRef(0);
  const classifyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const followTags = useFollowingStore((state) => state.followTags);
  const sidebarReady = useFollowingStore((state) => state.sidebarReady);
  const upGroupTree = useFollowingStore((state) => state.upGroupTree);
  const uncategorizedCount = useFollowingStore(
    (state) => state.uncategorizedCount,
  );
  const allFollowings = useFollowingStore((state) => state.allFollowings);
  const refreshSidebar = useFollowingStore((state) => state.refreshSidebar);
  const filterLocalFollowings = useFollowingStore(
    (state) => state.filterLocalFollowings,
  );
  const invalidateFollowings = useFollowingStore(
    (state) => state.invalidateFollowings,
  );
  const invalidateSidebar = useFollowingStore(
    (state) => state.invalidateSidebar,
  );
  const patchFollowing = useFollowingStore((state) => state.patchFollowing);
  const patchFollowTagCount = useFollowingStore(
    (state) => state.patchFollowTagCount,
  );
  const patchSpecialFollowCount = useFollowingStore(
    (state) => state.patchSpecialFollowCount,
  );
  const refreshVersion = useFollowingStore((state) => state.refreshVersion);
  const attentionRank = useFollowingStore((state) => state.attentionRank);
  const ensureAttentionRank = useFollowingStore(
    (state) => state.ensureAttentionRank,
  );
  const ensureAllFollowings = useFollowingStore(
    (state) => state.ensureAllFollowings,
  );

  const [upSort, setUpSort] = useState<FollowingSort>(readSort);
  const [sortLoading, setSortLoading] = useState(false);
  const serverOrder: FollowingOrder =
    upSort === "attention" ? "attention" : "recent";
  /** 最早关注 / 名称要整组数据才排得准，B 站分组需拉完所有页 */
  const needsFullTag = upSort === "earliest" || upSort === "name";

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("bilibili");
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [localSelection, setLocalSelection] = useState<UpGroupSelection>({
    level: "l1",
    id: null,
  });
  const [followings, setFollowings] = useState<FollowingUp[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [error, setError] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [tagDialogUp, setTagDialogUp] = useState<FollowingUp | null>(null);
  const [unfollowTarget, setUnfollowTarget] = useState<FollowingUp | null>(
    null,
  );
  const [unfollowing, setUnfollowing] = useState(false);
  const [unfollowError, setUnfollowError] = useState("");
  const [specialPendingMid, setSpecialPendingMid] = useState<number | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState("");

  const isLocalMode = sidebarMode === "local";
  const selectedTag = followTags.find((tag) => tag.tagId === selectedTagId);
  const inSpecialGroup =
    !isLocalMode && isSpecialFollowTag(selectedTagId, selectedTag);
  const localSelectionLabel = useMemo(
    () => getLocalSelectionLabel(upGroupTree, localSelection),
    [upGroupTree, localSelection],
  );

  const applyTagListCache = (list: TagListCache) => {
    loadSeqRef.current += 1;
    setFollowings(list.followings);
    setPage(list.page);
    setHasMore(list.hasMore);
    setError("");
    setLoading(false);
    setLoadingMore(false);
    setListReady(true);
  };

  const loadBilibiliPage = useCallback(
    async (
      tagId: number,
      nextPage: number,
      append: boolean,
      order: FollowingOrder = "recent",
    ) => {
      const seq = ++loadSeqRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError("");
        setFollowings([]);
        setPage(1);
        setHasMore(false);
        setListReady(false);
      }

      try {
        const result = await window.biliDesk.bili.getFollowingsInTag(
          tagId,
          nextPage,
          order,
        );
        if (seq !== loadSeqRef.current) return;

        setFollowings((prev) => {
          const next = append
            ? [...prev, ...result.followings]
            : result.followings;
          useFollowingStore.getState().putTagList(tagCacheKey(tagId, order), {
            followings: next,
            page: result.page,
            hasMore: result.hasMore,
          });
          return next;
        });
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        if (!append) setFollowings([]);
        setError(formatError(err));
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setListReady(true);
        }
      }
    },
    [],
  );

  const loadLocalGroupMembers = useCallback(
    async (selection: UpGroupSelection) => {
      if (selection.level !== "uncategorized" && selection.id == null) return;

      const seq = ++loadSeqRef.current;
      const hasCachedFollowings =
        useFollowingStore.getState().allFollowings != null;

      if (!hasCachedFollowings) {
        setLoading(true);
        setError("");
        setFollowings([]);
      }
      setHasMore(false);

      try {
        const result = await filterLocalFollowings(selection);
        if (seq !== loadSeqRef.current) return;
        setFollowings(result);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setFollowings([]);
        setError(formatError(err));
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setListReady(true);
        }
      }
    },
    [filterLocalFollowings],
  );

  useEffect(() => {
    if (isLocalMode) setListReady(false);
  }, [sidebarMode, selectedTagId, localSelection, isLocalMode]);

  useEffect(() => {
    return () => {
      if (classifyPollRef.current) {
        clearInterval(classifyPollRef.current);
        classifyPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshSidebar();
      const { followTags: tags, upGroupTree: tree } =
        useFollowingStore.getState();
      setSelectedTagId((prev) => prev ?? tags[0]?.tagId ?? null);
      setLocalSelection((prev) => {
        if (prev.id != null) return prev;
        return { level: "l1", id: tree[0]?.id ?? null };
      });
    })();
  }, [refreshSidebar]);

  useEffect(() => {
    if (sidebarMode !== "bilibili" || selectedTagId == null) return;
    const cached = useFollowingStore
      .getState()
      .getTagList(tagCacheKey(selectedTagId, serverOrder));
    if (cached) {
      applyTagListCache(cached);
      return;
    }
    void loadBilibiliPage(selectedTagId, 1, false, serverOrder);
  }, [sidebarMode, selectedTagId, loadBilibiliPage, serverOrder]);

  useEffect(() => {
    if (sidebarMode !== "local") return;
    if (localSelection.level !== "uncategorized" && localSelection.id == null)
      return;
    void loadLocalGroupMembers(localSelection);
  }, [sidebarMode, localSelection, loadLocalGroupMembers]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sidebarMode, selectedTagId, localSelection]);

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const handleSelectTag = (tagId: number) => {
    setError("");
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (tagId === selectedTagId) {
      useFollowingStore.getState().clearTagList(tagId);
      void loadBilibiliPage(tagId, 1, false, serverOrder);
      return;
    }

    const cached = useFollowingStore
      .getState()
      .getTagList(tagCacheKey(tagId, serverOrder));
    if (cached) {
      applyTagListCache(cached);
    } else {
      setListReady(false);
    }
    setSelectedTagId(tagId);
  };

  const handleSelectLocalGroup = (selection: UpGroupSelection) => {
    setError("");
    setListReady(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setLocalSelection(selection);
  };

  const loadMoreBilibili = useCallback(async () => {
    if (
      selectedTagId == null ||
      !hasMore ||
      loadingMore ||
      loading ||
      isLocalMode
    )
      return;
    await loadBilibiliPage(selectedTagId, page + 1, true, serverOrder);
  }, [
    selectedTagId,
    hasMore,
    loadingMore,
    loading,
    isLocalMode,
    loadBilibiliPage,
    page,
    serverOrder,
  ]);

  useEffect(() => {
    if (!needsFullTag || isLocalMode || !hasMore || loading || loadingMore) {
      return;
    }
    void loadMoreBilibili();
  }, [
    needsFullTag,
    isLocalMode,
    hasMore,
    loading,
    loadingMore,
    loadMoreBilibili,
  ]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || isLocalMode) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreBilibili();
      },
      { root, rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLocalMode, loadMoreBilibili, followings.length]);

  const runAiClassify = async () => {
    setTaskMessage("正在启动智能分组...");
    const { taskId } = await window.biliDesk.ai.runUpClassification();

    if (classifyPollRef.current) clearInterval(classifyPollRef.current);
    const poll = setInterval(async () => {
      const task = await window.biliDesk.ai.getTaskStatus(taskId);
      if (!task) return;
      setTaskMessage(task.message);
      if (task.status === "done" || task.status === "failed") {
        clearInterval(poll);
        if (classifyPollRef.current === poll) {
          classifyPollRef.current = null;
        }
        invalidateSidebar();
        await refreshSidebar({ force: true });
        void loadLocalGroupMembers(localSelection);
      }
    }, 1000);
    classifyPollRef.current = poll;
  };

  const reloadCurrentList = useCallback(async () => {
    if (sidebarMode === "bilibili" && selectedTagId != null) {
      await loadBilibiliPage(selectedTagId, 1, false, serverOrder);
      return;
    }
    if (sidebarMode === "local") {
      await loadLocalGroupMembers(localSelection);
    }
  }, [
    sidebarMode,
    selectedTagId,
    localSelection,
    loadBilibiliPage,
    loadLocalGroupMembers,
    serverOrder,
  ]);

  useEffect(() => {
    if (refreshVersion === 0) return;
    void reloadCurrentList();
  }, [refreshVersion, reloadCurrentList]);

  const handleUnfollow = () => {
    const up = unfollowTarget;
    if (!up || unfollowing) return;

    setUnfollowTarget(null);
    setUnfollowing(false);
    setUnfollowError("");
    setFollowings((prev) => prev.filter((item) => item.mid !== up.mid));
    if (selectedTagId != null) patchFollowTagCount(selectedTagId, -1);
    if (up.special) patchSpecialFollowCount(-1);
    setActionMessage(`正在取消关注「${up.uname}」`);

    void (async () => {
      try {
        await window.biliDesk.bili.modifyFollow(up.mid, false);
        patchFollowing(up.mid, null);
        useFollowingStore.getState().removeMidFromTagLists(up.mid);
        const relationKey = String(up.mid);
        const prevRelation = upRelationCache.get(relationKey);
        const nextRelation = prevRelation
          ? { ...prevRelation, isFollowing: false, special: false }
          : { isFollowing: false, attribute: 0, special: false };
        upRelationCache.set(relationKey, nextRelation);
        const space = upSpaceCache.get(relationKey);
        if (space) {
          upSpaceCache.set(relationKey, { ...space, relation: nextRelation });
        }
        setActionMessage(`已取消关注「${up.uname}」`);
        void useFollowingStore
          .getState()
          .refreshFollowTags()
          .catch(() => undefined);
      } catch (err) {
        setFollowings((prev) =>
          prev.some((item) => item.mid === up.mid) ? prev : [up, ...prev],
        );
        if (selectedTagId != null) patchFollowTagCount(selectedTagId, 1);
        if (up.special) patchSpecialFollowCount(1);
        setActionMessage(formatError(err));
      }
    })();
  };

  const handleToggleSpecial = async (up: FollowingUp, special: boolean) => {
    if (specialPendingMid != null) return;

    setSpecialPendingMid(up.mid);
    setActionMessage("");
    try {
      await window.biliDesk.bili.modifySpecialFollow(up.mid, special);

      if (!special && inSpecialGroup) {
        setFollowings((prev) => {
          const next = prev.filter((item) => item.mid !== up.mid);
          if (selectedTagId != null) {
            const cached = useFollowingStore
              .getState()
              .getTagList(selectedTagId);
            if (cached) {
              useFollowingStore.getState().putTagList(selectedTagId, {
                ...cached,
                followings: next,
              });
            }
          }
          return next;
        });
      } else {
        setFollowings((prev) =>
          prev.map((item) =>
            item.mid === up.mid ? { ...item, special } : item,
          ),
        );
      }

      patchFollowing(up.mid, { special });
      patchSpecialFollowCount(special ? 1 : -1);
      const relationKey = String(up.mid);
      const prevRelation = upRelationCache.get(relationKey);
      const nextRelation = prevRelation
        ? { ...prevRelation, special, isFollowing: true }
        : { isFollowing: true, attribute: 2, special };
      upRelationCache.set(relationKey, nextRelation);
      const space = upSpaceCache.get(relationKey);
      if (space) {
        upSpaceCache.set(relationKey, { ...space, relation: nextRelation });
      }
      setActionMessage(
        special
          ? `已将「${up.uname}」加入特别关注`
          : `已将「${up.uname}」移出特别关注`,
      );
    } catch (err) {
      setActionMessage(formatError(err));
    } finally {
      setSpecialPendingMid(null);
    }
  };

  const handleTagSaved = (change: {
    prevTagIds: number[];
    nextTagIds: number[];
  }) => {
    const prev = new Set(change.prevTagIds.filter((id) => id !== 0));
    const next = new Set(change.nextTagIds.filter((id) => id !== 0));

    for (const tagId of next) {
      if (!prev.has(tagId)) {
        patchFollowTagCount(tagId, 1);
        useFollowingStore.getState().clearTagList(tagId);
      }
    }
    for (const tagId of prev) {
      if (!next.has(tagId)) {
        patchFollowTagCount(tagId, -1);
        useFollowingStore.getState().clearTagList(tagId);
      }
    }

    if (
      tagDialogUp &&
      !isLocalMode &&
      selectedTagId != null &&
      selectedTagId !== 0
    ) {
      const wasIn = prev.has(selectedTagId);
      const nowIn = next.has(selectedTagId);
      if (wasIn && !nowIn) {
        setFollowings((list) =>
          list.filter((item) => item.mid !== tagDialogUp.mid),
        );
      }
    }

    setActionMessage("分组已更新");
  };

  const showListLoading = isLocalMode
    ? !listReady
    : !sidebarReady || selectedTagId == null || !listReady || loading;

  const changeSort = (next: FollowingSort) => {
    localStorage.setItem(SORT_STORAGE_KEY, next);
    setUpSort(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  useEffect(() => {
    const needRank = upSort === "attention" && isLocalMode && !attentionRank;
    const needAll = upSort === "earliest" && !allFollowings;
    if (!needRank && !needAll) return;
    setSortLoading(true);
    void (needRank ? ensureAttentionRank() : ensureAllFollowings())
      .catch((err) => setActionMessage(formatError(err)))
      .finally(() => setSortLoading(false));
  }, [
    upSort,
    isLocalMode,
    attentionRank,
    allFollowings,
    ensureAttentionRank,
    ensureAllFollowings,
  ]);

  /** 全量关注列表是按关注时间从新到旧排的，下标就是新旧顺序 */
  const recencyIndex = useMemo(
    () => new Map((allFollowings ?? []).map((up, index) => [up.mid, index])),
    [allFollowings],
  );

  const displayFollowings = useMemo(() => {
    if (upSort === "name") {
      return [...followings].sort((a, b) =>
        a.uname.localeCompare(b.uname, "zh-CN"),
      );
    }
    if (upSort === "earliest") {
      return [...followings].sort(
        (a, b) =>
          (recencyIndex.get(b.mid) ?? -1) - (recencyIndex.get(a.mid) ?? -1),
      );
    }
    if (upSort === "attention" && isLocalMode && attentionRank) {
      const last = attentionRank.size;
      return [...followings].sort(
        (a, b) =>
          (attentionRank.get(a.mid) ?? last) -
          (attentionRank.get(b.mid) ?? last),
      );
    }
    return followings;
  }, [followings, upSort, recencyIndex, isLocalMode, attentionRank]);

  const handleTagRenamed = (tagId: number, name: string) => {
    useFollowingStore.getState().renameFollowTagLocal(tagId, name);
  };

  const handleTagDeleted = (tagId: number) => {
    useFollowingStore.getState().removeFollowTagLocal(tagId);
    void useFollowingStore
      .getState()
      .refreshFollowTags()
      .catch(() => undefined);
    if (selectedTagId === tagId) {
      const fallback = useFollowingStore
        .getState()
        .followTags.find((tag) => tag.tagId !== tagId);
      if (fallback) handleSelectTag(fallback.tagId);
    }
  };

  const handleUpGroupRename = async (id: number, name: string) => {
    try {
      await window.biliDesk.taxonomy.renameUpGroup(id, name);
      await useFollowingStore.getState().reloadUpGroupTree();
      setActionMessage(`已重命名为「${name}」`);
    } catch (err) {
      setActionMessage(formatError(err));
    }
  };

  const handleUpGroupReorder = async (orders: number[][]) => {
    try {
      for (const ids of orders) {
        await window.biliDesk.taxonomy.reorderUpGroups(ids);
      }
      await useFollowingStore.getState().reloadUpGroupTree();
    } catch (err) {
      setActionMessage(formatError(err));
    }
  };

  const fullSortPending =
    !isLocalMode && needsFullTag && (hasMore || loadingMore);

  return (
    <div className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="space-y-3 border-b border-border p-3">
          <p className="text-sm font-medium">关注</p>
          <CreateFollowTagControl
            className="w-full justify-center"
            onCreated={(tag) => {
              setSidebarMode("bilibili");
              handleSelectTag(tag.tagId);
            }}
          />
          <div className="flex rounded-lg bg-secondary p-1">
            <button
              type="button"
              onClick={() => handleSidebarModeChange("bilibili")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                sidebarMode === "bilibili"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              B 站分组
            </button>
            <button
              type="button"
              onClick={() => handleSidebarModeChange("local")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                sidebarMode === "local"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              本地分组
            </button>
          </div>
        </div>

        {isLocalMode && (
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">AI 与规则智能分组</p>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSyncDialogOpen(true)}
                  title="同步到 B 站分组（手机上也能看到）"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void runAiClassify()}
                  title="运行智能分组"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {taskMessage && (
              <p className="text-xs text-muted-foreground">{taskMessage}</p>
            )}
          </div>
        )}

        <div className="scrollbar-none flex-1 overflow-y-auto p-2">
          {sidebarMode === "bilibili" ? (
            <FollowTagList
              tags={followTags}
              selectedTagId={selectedTagId}
              onSelect={handleSelectTag}
              onRenamed={handleTagRenamed}
              onDeleted={handleTagDeleted}
              onMessage={setActionMessage}
            />
          ) : (
            <UpGroupTree
              tree={upGroupTree}
              selection={localSelection}
              uncategorizedCount={uncategorizedCount}
              onSelect={handleSelectLocalGroup}
              onRename={(id, name) => void handleUpGroupRename(id, name)}
              onReorder={(orders) => void handleUpGroupReorder(orders)}
            />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <div className="min-w-0 flex-1 truncate">
            {isLocalMode ? (
              <>
                本地分组「{localSelectionLabel}」：共 {followings.length} 个 UP
              </>
            ) : (
              <>
                B 站分组「{selectedTag?.name ?? "..."}」：已加载{" "}
                {followings.length}
                {selectedTag ? ` / ${selectedTag.count}` : ""} 个 UP
              </>
            )}
            {actionMessage && (
              <span className="ml-2 text-foreground">{actionMessage}</span>
            )}
          </div>
          {(sortLoading || fullSortPending) && (
            <span className="flex shrink-0 items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {fullSortPending ? "正在拉取整组以排序…" : "正在准备排序…"}
            </span>
          )}
          <label className="flex shrink-0 items-center gap-1.5">
            排序
            <select
              value={upSort}
              onChange={(event) =>
                changeSort(event.target.value as FollowingSort)
              }
              className="h-7 rounded-md border border-border bg-background/70 px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div ref={scrollRef} className="scrollbar-none flex-1 overflow-y-auto">
          {showListLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载关注列表...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
              {displayFollowings.map((up) => (
                <FollowingUpCard
                  key={up.mid}
                  up={up}
                  showGroupActions={!isLocalMode}
                  isSpecial={Boolean(up.special) || inSpecialGroup}
                  specialPending={specialPendingMid === up.mid}
                  onSetGroup={setTagDialogUp}
                  onToggleSpecial={(target, next) =>
                    void handleToggleSpecial(target, next)
                  }
                  onUnfollow={(up) => {
                    setUnfollowError("");
                    setUnfollowTarget(up);
                  }}
                />
              ))}

              {followings.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  {isLocalMode
                    ? "该本地分组暂无成员，可点击上方 ✨ 运行智能分组"
                    : error || "该分组暂无关注的 UP"}
                </p>
              )}
            </div>
          )}

          {!isLocalMode &&
            (hasMore || loadingMore) &&
            followings.length > 0 && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载更多...
                  </>
                ) : (
                  "继续下滑加载更多"
                )}
              </div>
            )}
        </div>
      </div>

      <FollowTagDialog
        up={tagDialogUp}
        tags={followTags}
        onClose={() => setTagDialogUp(null)}
        onSaved={handleTagSaved}
      />

      <UnfollowConfirmDialog
        up={unfollowTarget}
        loading={unfollowing}
        error={unfollowError}
        onConfirm={() => void handleUnfollow()}
        onCancel={() => {
          if (!unfollowing) {
            setUnfollowError("");
            setUnfollowTarget(null);
          }
        }}
      />

      <FollowTagSyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
      />
    </div>
  );
}
