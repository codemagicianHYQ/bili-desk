import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { FavResource, LocalCategorySelection } from "@shared/types";
import { useFavoritesStore } from "@/stores/favorites-store";
import {
  assignmentToFavResource,
  enrichTreeWithCounts,
  filterAssignmentsByCategory,
} from "@shared/utils/local-category";
import { CategoryTree } from "@/components/taxonomy/CategoryTree";
import { CreateFavFolderControl } from "@/components/favorites/CreateFavFolderControl";
import { FavMoveDialog } from "@/components/favorites/FavMoveDialog";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Link } from "react-router-dom";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatDuration } from "@/lib/utils";
import {
  Check,
  Folder,
  FolderInput,
  GripVertical,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";

const LOCAL_PAGE_SIZE = 40;

type SidebarMode = "bilibili" | "local";

function formatFolderError(err: unknown): string {
  const message = extractIpcErrorMessage(err) || "加载失败";
  if (message.includes("412") || message.includes("安全策略")) {
    return "请求太密，被 B 站风控拦了。请等 1～2 分钟再打开这个收藏夹";
  }
  return message;
}

function FavVideoCard({
  item,
  editing,
  selected,
  removing,
  onToggleSelect,
  onRemove,
}: {
  item: FavResource;
  editing: boolean;
  selected: boolean;
  removing: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
}) {
  const body = (
    <>
      {item.cover ? (
        <BiliImage
          src={item.cover}
          alt=""
          className="h-16 w-28 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          无封面
        </div>
      )}
      <div className="min-w-0 flex-1 pr-6">
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        {item.upper.name && (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.upper.name}
          </p>
        )}
        {item.duration > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatDuration(item.duration)}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border bg-card transition-colors",
        editing &&
          selected &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
        editing ? "hover:bg-secondary/40" : "hover:bg-secondary/50",
      )}
    >
      {editing ? (
        <button
          type="button"
          className="flex w-full gap-3 p-3 text-left"
          onClick={onToggleSelect}
        >
          {body}
        </button>
      ) : (
        <Link
          to={item.bvid ? `/video/${item.bvid}` : "#"}
          className="flex gap-3 p-3"
        >
          {body}
        </Link>
      )}

      {editing ? (
        <button
          type="button"
          title={selected ? "取消选择" : "选择"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            "absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/80 bg-black/55 text-white hover:bg-black/75",
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <button
          type="button"
          title="从当前收藏夹移除"
          disabled={removing}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className={cn(
            "absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full",
            "bg-black/55 text-white opacity-0 transition-opacity hover:bg-red-500/90",
            "group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60",
          )}
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

export function FavoritesPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const folderLoadSeqRef = useRef(0);
  const classifyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tree = useFavoritesStore((state) => state.tree);
  const assignments = useFavoritesStore((state) => state.assignments);
  const folders = useFavoritesStore((state) => state.folders);
  const foldersReady = useFavoritesStore((state) => state.foldersReady);
  const taxonomyReady = useFavoritesStore((state) => state.taxonomyReady);
  const ensureTaxonomy = useFavoritesStore((state) => state.ensureTaxonomy);
  const ensureFolders = useFavoritesStore((state) => state.ensureFolders);
  const enrichCoversOnce = useFavoritesStore((state) => state.enrichCoversOnce);
  const invalidateTaxonomy = useFavoritesStore(
    (state) => state.invalidateTaxonomy,
  );
  const invalidateFolders = useFavoritesStore(
    (state) => state.invalidateFolders,
  );
  const setFolders = useFavoritesStore((state) => state.setFolders);
  const patchFolderCounts = useFavoritesStore(
    (state) => state.patchFolderCounts,
  );
  const refreshVersion = useFavoritesStore((state) => state.refreshVersion);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("bilibili");
  const [resources, setResources] = useState<FavResource[]>([]);
  const [folderPage, setFolderPage] = useState(1);
  const [folderHasMore, setFolderHasMore] = useState(false);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderLoadingMore, setFolderLoadingMore] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [localSelection, setLocalSelection] = useState<LocalCategorySelection>({
    level: "all",
    id: null,
  });
  const [localVisibleCount, setLocalVisibleCount] = useState(LOCAL_PAGE_SIZE);
  const [classifying, setClassifying] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);
  const [classifyProgress, setClassifyProgress] = useState(0);

  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [batchRemoving, setBatchRemoving] = useState(false);
  const [batchMoving, setBatchMoving] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [organizeConfirmOpen, setOrganizeConfirmOpen] = useState(false);
  const [draggingFolderId, setDraggingFolderId] = useState<number | null>(null);
  const [dropFolderId, setDropFolderId] = useState<number | null>(null);
  const [sortError, setSortError] = useState("");
  const dragFolderIdRef = useRef<number | null>(null);
  const folderDraggedRef = useRef(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [moveError, setMoveError] = useState("");

  const isLocalMode = sidebarMode === "local";

  const reloadTaxonomy = useCallback(async () => {
    await ensureTaxonomy({ force: true });
  }, [ensureTaxonomy]);

  useEffect(() => {
    void (async () => {
      await ensureTaxonomy();
      void enrichCoversOnce();
      const list = await ensureFolders();
      setSelectedFolder((prev) => prev ?? list[0]?.id ?? null);
    })();
  }, [ensureTaxonomy, ensureFolders, enrichCoversOnce]);

  useEffect(() => {
    return () => {
      if (classifyPollRef.current) {
        clearInterval(classifyPollRef.current);
        classifyPollRef.current = null;
      }
    };
  }, []);

  const loadFolderPage = useCallback(
    async (mediaId: number, page: number, append: boolean) => {
      const seq = ++folderLoadSeqRef.current;

      if (append) {
        setFolderLoadingMore(true);
      } else {
        setFolderLoading(true);
        setListReady(false);
        setFolderError("");
        setResources([]);
        setFolderPage(1);
        setFolderHasMore(false);
      }

      try {
        let result = await window.biliDesk.bili.getFavResources(
          mediaId,
          page,
        );
        if (seq !== folderLoadSeqRef.current) return;

        const expected =
          foldersRef.current.find((folder) => folder.id === mediaId)
            ?.mediaCount ?? 0;
        if (!append && result.resources.length === 0 && expected > 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (seq !== folderLoadSeqRef.current) return;
          result = await window.biliDesk.bili.getFavResources(mediaId, page);
          if (seq !== folderLoadSeqRef.current) return;
          if (result.resources.length === 0) {
            setResources([]);
            setFolderPage(1);
            setFolderHasMore(false);
            setFolderError("收藏夹有视频但未能加载，请点击重试");
            return;
          }
        }

        setResources((prev) =>
          append ? [...prev, ...result.resources] : result.resources,
        );
        setFolderPage(result.page);
        setFolderHasMore(result.hasMore);
      } catch (err) {
        if (seq !== folderLoadSeqRef.current) return;
        if (!append) setResources([]);
        setFolderError(formatFolderError(err));
      } finally {
        if (seq === folderLoadSeqRef.current) {
          setFolderLoading(false);
          setFolderLoadingMore(false);
          setListReady(true);
        }
      }
    },
    [],
  );

  useEffect(() => {
    setListReady(false);
    setEditing(false);
    setSelectedIds(new Set());
    setActionError("");
    setMoveError("");
    setMoveOpen(false);
    setBatchConfirmOpen(false);
  }, [sidebarMode, selectedFolder, localSelection]);

  useEffect(() => {
    if (sidebarMode !== "bilibili" || !selectedFolder) return;
    void loadFolderPage(selectedFolder, 1, false);
  }, [selectedFolder, sidebarMode, loadFolderPage]);

  useEffect(() => {
    if (refreshVersion === 0) return;
    if (sidebarMode === "bilibili" && selectedFolder != null) {
      void loadFolderPage(selectedFolder, 1, false);
    }
    if (sidebarMode === "local") {
      setLocalVisibleCount(LOCAL_PAGE_SIZE);
    }
  }, [refreshVersion, sidebarMode, selectedFolder, loadFolderPage]);

  useEffect(() => {
    setLocalVisibleCount(LOCAL_PAGE_SIZE);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [localSelection, sidebarMode]);

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const handleSelectFolder = (folderId: number) => {
    setFolderError("");
    setListReady(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    if (folderId === selectedFolder) {
      setFolderLoading(true);
      void loadFolderPage(folderId, 1, false);
      return;
    }

    setSelectedFolder(folderId);
  };

  const treeWithCounts = useMemo(
    () => enrichTreeWithCounts(tree, assignments),
    [tree, assignments],
  );

  const localCategoryItems = useMemo(() => {
    if (!isLocalMode) return [];
    return filterAssignmentsByCategory(assignments, localSelection, tree).map(
      assignmentToFavResource,
    );
  }, [assignments, isLocalMode, localSelection, tree]);

  const displayItems = isLocalMode
    ? localCategoryItems.slice(0, localVisibleCount)
    : resources;

  const loadMoreFolder = useCallback(async () => {
    if (
      !selectedFolder ||
      !folderHasMore ||
      folderLoadingMore ||
      folderLoading ||
      isLocalMode
    )
      return;
    await loadFolderPage(selectedFolder, folderPage + 1, true);
  }, [
    selectedFolder,
    folderHasMore,
    folderLoadingMore,
    folderLoading,
    isLocalMode,
    loadFolderPage,
    folderPage,
  ]);

  const loadMoreLocal = useCallback(() => {
    if (localVisibleCount >= localCategoryItems.length) return;
    setLocalVisibleCount((prev) =>
      Math.min(prev + LOCAL_PAGE_SIZE, localCategoryItems.length),
    );
  }, [localVisibleCount, localCategoryItems.length]);

  const hasMore = isLocalMode
    ? localVisibleCount < localCategoryItems.length
    : folderHasMore;
  const loadingMore = isLocalMode ? false : folderLoadingMore;

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (isLocalMode) loadMoreLocal();
        else void loadMoreFolder();
      },
      { root, rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    hasMore,
    isLocalMode,
    loadMoreFolder,
    loadMoreLocal,
    displayItems.length,
  ]);

  const refreshFolderMeta = useCallback(
    async (optimistic?: Record<number, number>) => {
      if (optimistic) patchFolderCounts(optimistic);
      // 官方 media_count 偶发延迟，稍后强制拉取一次校准
      window.setTimeout(() => {
        void ensureFolders({ force: true }).catch(() => undefined);
      }, 800);
    },
    [ensureFolders, patchFolderCounts],
  );

  const removeFromFolder = useCallback(
    async (aids: number[]) => {
      if (!selectedFolder || aids.length === 0) return;
      await window.biliDesk.bili.removeFavResources(selectedFolder, aids);
      const removed = new Set(aids);
      setResources((prev) => prev.filter((item) => !removed.has(item.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of aids) next.delete(id);
        return next;
      });
      await refreshFolderMeta({ [selectedFolder]: -aids.length });
    },
    [refreshFolderMeta, selectedFolder],
  );

  const handleQuickRemove = useCallback(
    async (item: FavResource) => {
      if (!selectedFolder || isLocalMode) return;
      setRemovingId(item.id);
      setActionError("");
      try {
        await removeFromFolder([item.id]);
      } catch (err) {
        setActionError(formatFolderError(err));
      } finally {
        setRemovingId(null);
      }
    },
    [isLocalMode, removeFromFolder, selectedFolder],
  );

  const handleBatchRemove = useCallback(async () => {
    if (!selectedFolder || selectedIds.size === 0) return;
    setBatchRemoving(true);
    setActionError("");
    try {
      await removeFromFolder([...selectedIds]);
      setBatchConfirmOpen(false);
    } catch (err) {
      setActionError(formatFolderError(err));
    } finally {
      setBatchRemoving(false);
    }
  }, [removeFromFolder, selectedFolder, selectedIds]);

  const handleBatchMove = useCallback(
    async (targetFolderId: number) => {
      if (!selectedFolder || selectedIds.size === 0) return;
      setBatchMoving(true);
      setMoveError("");
      setActionError("");
      try {
        const aids = [...selectedIds];
        await window.biliDesk.bili.moveFavResources(
          selectedFolder,
          targetFolderId,
          aids,
        );
        const moved = new Set(aids);
        setResources((prev) => prev.filter((item) => !moved.has(item.id)));
        setSelectedIds(new Set());
        setMoveOpen(false);
        await refreshFolderMeta({
          [selectedFolder]: -aids.length,
          [targetFolderId]: aids.length,
        });
      } catch (err) {
        setMoveError(formatFolderError(err));
      } finally {
        setBatchMoving(false);
      }
    },
    [refreshFolderMeta, selectedFolder, selectedIds],
  );

  const batchBusy = batchRemoving || batchMoving;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllLoaded = () => {
    setSelectedIds(new Set(resources.map((item) => item.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const waitForFavTask = (taskId: number) =>
    new Promise<void>((resolve, reject) => {
      if (classifyPollRef.current) clearInterval(classifyPollRef.current);
      const poll = setInterval(() => {
        void (async () => {
          try {
            const task =
              await window.biliDesk.taxonomy.getFavTaskStatus(taskId);
            if (!task) return;

            setClassifyMessage(task.message);
            setClassifyProgress(task.progress);

            if (task.status === "done" || task.status === "failed") {
              clearInterval(poll);
              if (classifyPollRef.current === poll) {
                classifyPollRef.current = null;
              }
              if (task.status === "failed") {
                reject(new Error(task.message));
              } else {
                resolve();
              }
            }
          } catch (err) {
            clearInterval(poll);
            if (classifyPollRef.current === poll) {
              classifyPollRef.current = null;
            }
            reject(err);
          }
        })();
      }, 500);
      classifyPollRef.current = poll;
    });

  const handleClassifyAll = async () => {
    setClassifying(true);
    setClassifyMessage("正在启动分类任务...");
    setClassifyProgress(0);

    try {
      const { taskId } = await window.biliDesk.taxonomy.classifyAllFavorites();
      await waitForFavTask(taskId);
      invalidateTaxonomy();
      await reloadTaxonomy();
      void enrichCoversOnce();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "分类失败，请确认已登录";
      setClassifyMessage(
        message.includes("412") || message.includes("安全策略")
          ? "请求被 B 站安全策略拦截，请等待几秒后重试"
          : message,
      );
    } finally {
      setClassifying(false);
    }
  };

  const handleOrganizeBiliFolders = async () => {
    setOrganizeConfirmOpen(false);
    setClassifying(true);
    setClassifyMessage("正在启动整理任务...");
    setClassifyProgress(0);

    try {
      const { taskId } = await window.biliDesk.taxonomy.organizeBiliFavorites();
      await waitForFavTask(taskId);
      invalidateFolders();
      await ensureFolders({ force: true });
      if (selectedFolder != null) {
        await loadFolderPage(selectedFolder, 1, false);
      }
    } catch (err) {
      setClassifyMessage(
        err instanceof Error ? err.message : "整理失败，请确认已登录",
      );
    } finally {
      setClassifying(false);
    }
  };

  const persistFolderOrder = async (ordered: typeof folders) => {
    setFolders(ordered);
    setSortError("");
    try {
      await window.biliDesk.bili.sortFavFolders(
        ordered.map((folder) => folder.id),
      );
    } catch (err) {
      await ensureFolders({ force: true });
      const message = extractIpcErrorMessage(err) || "排序失败";
      setSortError(
        message.includes("412") || message.includes("安全策略")
          ? "请求太密，请稍后再拖动排序"
          : message,
      );
    }
  };

  const handleFolderDragStart = (folderId: number) => {
    dragFolderIdRef.current = folderId;
    folderDraggedRef.current = false;
    setDraggingFolderId(folderId);
  };

  const handleFolderDragOver = (
    event: DragEvent<HTMLDivElement>,
    folderId: number,
  ) => {
    event.preventDefault();
    if (
      dragFolderIdRef.current == null ||
      dragFolderIdRef.current === folderId
    ) {
      return;
    }
    folderDraggedRef.current = true;
    setDropFolderId(folderId);
  };

  const handleFolderDrop = (folderId: number) => {
    const fromId = dragFolderIdRef.current;
    dragFolderIdRef.current = null;
    setDraggingFolderId(null);
    setDropFolderId(null);
    if (fromId == null || fromId === folderId) return;

    const pinned = folders.filter((folder) => folder.isDefault);
    const rest = folders.filter((folder) => !folder.isDefault);
    const from = rest.findIndex((folder) => folder.id === fromId);
    const to = rest.findIndex((folder) => folder.id === folderId);
    if (from < 0 || to < 0) return;

    const next = [...rest];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistFolderOrder([...pinned, ...next]);
  };

  const handleFolderDragEnd = () => {
    dragFolderIdRef.current = null;
    setDraggingFolderId(null);
    setDropFolderId(null);
  };

  const handleRename = async (
    level: "l1" | "l2" | "l3",
    id: number,
    currentName: string,
  ) => {
    const next = window.prompt("编辑分类名称", currentName);
    if (!next || next.trim() === currentName) return;
    await window.biliDesk.taxonomy.updateCategoryName(level, id, next.trim());
    await reloadTaxonomy();
  };

  const selectedFolderInfo = folders.find((f) => f.id === selectedFolder);
  const folderMediaCount = selectedFolderInfo?.mediaCount ?? 0;

  const showListLoading = isLocalMode
    ? !taxonomyReady
    : !foldersReady || selectedFolder == null || !listReady || folderLoading;

  return (
    <div className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="space-y-3 border-b border-border p-3">
          <p className="text-sm font-medium">收藏夹</p>
          <CreateFavFolderControl
            className="w-full justify-center"
            onCreated={(folder) => {
              setSidebarMode("bilibili");
              setFolderError("");
              setListReady(false);
              if (scrollRef.current) scrollRef.current.scrollTop = 0;
              setSelectedFolder(folder.id);
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
              B 站收藏夹
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
              本地分类
            </button>
          </div>
        </div>

        <div className="space-y-2 border-b border-border p-3">
          <p className="text-xs text-muted-foreground">
            {isLocalMode
              ? "按标题打分归类，计算机会分到前端 / 后端 / AI 等方向；全量分类会重建本地目录"
              : "每次约 100 条。会优先放进你已经建好的夹（例如「算法与数据结构」），不再重复新建「计算机-算法」。被风控就隔几分钟再点"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full gap-1.5"
            disabled={classifying}
            onClick={() => {
              if (isLocalMode) {
                void handleClassifyAll();
                return;
              }
              setOrganizeConfirmOpen(true);
            }}
          >
            {classifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isLocalMode ? "智能分类全部收藏" : "智能整理一批（约 100 条）"}
          </Button>
          {classifyMessage && (
            <p className="text-xs text-muted-foreground">{classifyMessage}</p>
          )}
          {classifying && classifyProgress > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${classifyProgress}%` }}
              />
            </div>
          )}
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto p-2">
          {sidebarMode === "bilibili" ? (
            <div className="space-y-0.5">
              {sortError && (
                <p className="px-1 pb-1 text-[11px] text-red-400">
                  {sortError}
                </p>
              )}
              {folders.map((folder) => {
                const canDrag = !folder.isDefault;
                const dragging = draggingFolderId === folder.id;
                const dropTarget =
                  dropFolderId === folder.id &&
                  draggingFolderId != null &&
                  draggingFolderId !== folder.id;
                return (
                  <div
                    key={folder.id}
                    draggable={canDrag}
                    onDragStart={(event) => {
                      if (!canDrag) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "text/plain",
                        String(folder.id),
                      );
                      handleFolderDragStart(folder.id);
                    }}
                    onDragOver={(event) => {
                      if (!canDrag) return;
                      event.dataTransfer.dropEffect = "move";
                      handleFolderDragOver(event, folder.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!canDrag) return;
                      handleFolderDrop(folder.id);
                    }}
                    onDragEnd={handleFolderDragEnd}
                    className={cn(
                      "flex items-center gap-0.5 rounded-lg",
                      dragging && "bg-primary/20 text-primary opacity-90",
                      dropTarget && "ring-1 ring-primary/70 bg-primary/10",
                      !dragging &&
                        !dropTarget &&
                        selectedFolder === folder.id &&
                        "bg-primary/10 text-primary",
                      !dragging &&
                        !dropTarget &&
                        selectedFolder !== folder.id &&
                        "text-foreground hover:bg-secondary",
                    )}
                  >
                    {canDrag ? (
                      <span
                        className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
                        title="拖动排序"
                        aria-hidden
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="w-5 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (folderDraggedRef.current) return;
                        handleSelectFolder(folder.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-sm"
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {folder.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {folder.mediaCount}
                      </span>
                    </button>
                  </div>
                );
              })}
              {folders.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  登录后可同步 B 站收藏夹
                </p>
              )}
            </div>
          ) : (
            <CategoryTree
              tree={treeWithCounts}
              selection={localSelection}
              onSelect={setLocalSelection}
              onRename={(level, id, name) => void handleRename(level, id, name)}
            />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {isLocalMode ? (
              <>
                本地分类
                {localSelection.level !== "all" && " · 已筛选"}
                ：共 {localCategoryItems.length} 个视频
                {localCategoryItems.length > 0 &&
                  `，已显示 ${displayItems.length} 个`}
              </>
            ) : (
              <>
                B 站收藏夹「{selectedFolderInfo?.title ?? "..."}」：已加载{" "}
                {resources.length}
                {selectedFolderInfo
                  ? ` / ${selectedFolderInfo.mediaCount}`
                  : ""}{" "}
                个视频
              </>
            )}
          </p>

          {!isLocalMode && resources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={batchBusy}
                    onClick={selectAllLoaded}
                  >
                    全选已加载
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={batchBusy || selectedIds.size === 0}
                    onClick={clearSelection}
                  >
                    取消选择
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={batchBusy || selectedIds.size === 0}
                    onClick={() => {
                      setMoveError("");
                      setMoveOpen(true);
                    }}
                  >
                    {batchMoving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderInput className="h-3.5 w-3.5" />
                    )}
                    移动
                    {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 border-red-500/30 text-red-400 hover:bg-red-500/15"
                    disabled={batchBusy || selectedIds.size === 0}
                    onClick={() => setBatchConfirmOpen(true)}
                  >
                    {batchRemoving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    移除
                    {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={batchBusy}
                    onClick={() => {
                      setEditing(false);
                      clearSelection();
                    }}
                  >
                    完成
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(true);
                    setActionError("");
                  }}
                >
                  批量管理
                </Button>
              )}
            </div>
          )}
        </div>

        {actionError && (
          <p className="border-b border-border px-4 py-2 text-xs text-red-400">
            {actionError}
          </p>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {showListLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载收藏中...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 xl:grid-cols-3">
              {displayItems.map((item) => (
                <FavVideoCard
                  key={`${item.id}-${item.bvid}`}
                  item={item}
                  editing={!isLocalMode && editing}
                  selected={selectedIds.has(item.id)}
                  removing={removingId === item.id}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onRemove={() => void handleQuickRemove(item)}
                />
              ))}

              {displayItems.length === 0 && (
                isLocalMode ? (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    {assignments.length === 0
                      ? "暂无本地分类数据，请先点击「智能分类全部收藏」"
                      : "该分类下暂无视频"}
                  </p>
                ) : folderError || folderMediaCount > 0 ? (
                  <div className="col-span-full flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {folderError || "收藏夹有视频但未能加载"}
                    </p>
                    {selectedFolder != null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void loadFolderPage(selectedFolder, 1, false);
                        }}
                      >
                        重新加载
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    该收藏夹暂无视频
                  </p>
                )
              )}
            </div>
          )}

          {(hasMore || loadingMore) && displayItems.length > 0 && (
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

      <ConfirmDialog
        open={batchConfirmOpen}
        title={`移除 ${selectedIds.size} 个视频？`}
        description="将从当前 B 站收藏夹中移除所选视频，不会删除稿件本身。此操作与官方账号同步。"
        confirmLabel="确认移除"
        destructive
        loading={batchRemoving}
        onConfirm={() => void handleBatchRemove()}
        onCancel={() => {
          if (!batchRemoving) setBatchConfirmOpen(false);
        }}
      />

      <ConfirmDialog
        open={organizeConfirmOpen}
        title="整理一批收藏？"
        description="每次只扫描大约 120 条、最多搬走 100 条。会优先放进你已经建好的收藏夹，不重复新建「计算机-算法」这种夹。已经误建的同类夹，整理时会往你原来的夹里并。隔几分钟再点一次继续。此操作会同步到官方账号。"
        confirmLabel="整理这一批"
        loading={classifying}
        onConfirm={() => void handleOrganizeBiliFolders()}
        onCancel={() => {
          if (!classifying) setOrganizeConfirmOpen(false);
        }}
      />

      {selectedFolder != null && (
        <FavMoveDialog
          open={moveOpen}
          folders={folders}
          sourceFolderId={selectedFolder}
          selectedCount={selectedIds.size}
          loading={batchMoving}
          error={moveError}
          onConfirm={(targetId) => void handleBatchMove(targetId)}
          onClose={() => {
            if (!batchMoving) setMoveOpen(false);
          }}
        />
      )}
    </div>
  );
}
