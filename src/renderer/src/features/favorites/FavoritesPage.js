import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { useAppStore } from "@/stores/app-store";
import { useFavoritesStore, } from "@/stores/favorites-store";
import { assignmentToFavResource, enrichTreeWithCounts, filterAssignmentsByCategory, } from "@shared/utils/local-category";
import { CategoryTree } from "@/components/taxonomy/CategoryTree";
import { CreateFavFolderControl } from "@/components/favorites/CreateFavFolderControl";
import { EditFavFolderDialog } from "@/components/favorites/EditFavFolderDialog";
import { FavFolderGroupedNav } from "@/components/favorites/FavFolderGroupedNav";
import { FavMoveDialog } from "@/components/favorites/FavMoveDialog";
import { Badge } from "@/components/ui/badge";
import { BiliImage } from "@/components/ui/bili-image";
import { ChargeCoverBadge, useCoverChargeBadge, } from "@/components/video/charge-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Link } from "react-router-dom";
import { extractIpcErrorMessage, formatDisplayedError } from "@/lib/ipc-error";
import { useFollowedMidSet } from "@/lib/use-followed-mids";
import { cn, formatDuration } from "@/lib/utils";
import { moveFavFolderIntoGroup, reorderGroupedFavFolders, isDumpFolderTitle, listDuplicateGeneratedFolderPairs, } from "@shared/utils/fav-folder-groups";
import { loadFavFolderGroupOverrides, saveFavFolderGroupOverrides, } from "@/lib/fav-folder-group-overrides";
import { Check, Eraser, FolderInput, Loader2, Pencil, Sparkles, Trash2, } from "lucide-react";
function pickDefaultFavFolder(list) {
    return (list.find((folder) => folder.isDefault) ??
        list.find((folder) => folder.title === "默认收藏夹") ??
        list.find((folder) => folder.title.toLowerCase() === "default") ??
        null);
}
const LOCAL_PAGE_SIZE = 40;
const DEFAULT_ORGANIZE_THRESHOLD = 100;
const AUTO_ORGANIZE_CONTINUE_MS = 180_000;
function formatFolderError(err, mediaCount = 0) {
    const message = extractIpcErrorMessage(err) || "加载失败";
    if (message.includes("412") || message.includes("安全策略")) {
        if (mediaCount > 0) {
            return `这个夹有 ${mediaCount} 条，列表被风控拦了所以是 0。请等 2～3 分钟再点重新加载，不要连点`;
        }
        return "请求太密，被 B 站风控拦了。请等 1～2 分钟再打开这个收藏夹";
    }
    return message;
}
const FAV_GRID_COLS_CLASS = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
};
function FavVideoCard({ item, editing, selected, removing, showFollowedBadge = false, roomy = false, onToggleSelect, onRemove, }) {
    const coverSize = roomy ? "h-24 w-[10.5rem]" : "h-16 w-28";
    const chargeBadge = useCoverChargeBadge(item.bvid);
    const body = (_jsxs(_Fragment, { children: [item.cover ? (_jsxs("div", { className: cn(coverSize, "relative shrink-0"), children: [_jsx(BiliImage, { src: item.cover, alt: "", className: "h-full w-full rounded-lg object-cover" }), _jsx(ChargeCoverBadge, { label: chargeBadge, className: "right-1 top-1 px-1 py-px text-[10px]" })] })) : (_jsx("div", { className: cn(coverSize, "flex shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground"), children: "\u65E0\u5C01\u9762" })), _jsxs("div", { className: "min-w-0 flex-1 pr-6", children: [_jsx("p", { className: "line-clamp-2 text-sm font-medium", children: item.title }), item.upper.name && (_jsxs("p", { className: "mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground", children: [_jsx("span", { className: cn("truncate", showFollowedBadge && "font-medium text-primary"), children: item.upper.name }), showFollowedBadge && (_jsx(Badge, { variant: "default", className: "shrink-0 px-1.5 py-0 text-[10px] leading-4", children: "\u5DF2\u5173\u6CE8" }))] })), item.duration > 0 && (_jsx("p", { className: "text-xs text-muted-foreground", children: formatDuration(item.duration) }))] })] }));
    return (_jsxs("div", { className: cn("group relative rounded-xl border border-border bg-card transition-colors", editing &&
            selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background", editing ? "hover:bg-secondary/40" : "hover:bg-secondary/50"), children: [editing ? (_jsx("button", { type: "button", className: "flex w-full gap-3 p-3 text-left", onClick: onToggleSelect, children: body })) : (_jsx(Link, { to: item.bvid ? `/video/${item.bvid}` : "#", className: "flex gap-3 p-3", children: body })), editing ? (_jsx("button", { type: "button", title: selected ? "取消选择" : "选择", onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleSelect();
                }, className: cn("absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors", selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/80 bg-black/55 text-white hover:bg-black/75"), children: selected && _jsx(Check, { className: "h-3.5 w-3.5" }) })) : (_jsx("button", { type: "button", title: "\u4ECE\u5F53\u524D\u6536\u85CF\u5939\u79FB\u9664", disabled: removing, onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemove();
                }, className: cn("absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full", "bg-black/55 text-white opacity-0 transition-opacity hover:bg-red-500/90", "group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"), children: removing ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Trash2, { className: "h-3.5 w-3.5" })) }))] }));
}
export function FavoritesPage() {
    const followedMidSet = useFollowedMidSet();
    const favGridColumns = useAppStore((state) => state.favGridColumns);
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const folderLoadSeqRef = useRef(0);
    const classifyPollRef = useRef(null);
    const classifyProgressRef = useRef(0);
    const tree = useFavoritesStore((state) => state.tree);
    const assignments = useFavoritesStore((state) => state.assignments);
    const folders = useFavoritesStore((state) => state.folders);
    const foldersReady = useFavoritesStore((state) => state.foldersReady);
    const taxonomyReady = useFavoritesStore((state) => state.taxonomyReady);
    const ensureTaxonomy = useFavoritesStore((state) => state.ensureTaxonomy);
    const ensureFolders = useFavoritesStore((state) => state.ensureFolders);
    const enrichCoversOnce = useFavoritesStore((state) => state.enrichCoversOnce);
    const invalidateTaxonomy = useFavoritesStore((state) => state.invalidateTaxonomy);
    const invalidateFolders = useFavoritesStore((state) => state.invalidateFolders);
    const setFolders = useFavoritesStore((state) => state.setFolders);
    const patchFolderCounts = useFavoritesStore((state) => state.patchFolderCounts);
    const clearFolderList = useFavoritesStore((state) => state.clearFolderList);
    const refreshVersion = useFavoritesStore((state) => state.refreshVersion);
    const foldersRef = useRef(folders);
    foldersRef.current = folders;
    const [sidebarMode, setSidebarMode] = useState("bilibili");
    const [resources, setResources] = useState([]);
    const [folderPage, setFolderPage] = useState(1);
    const [folderHasMore, setFolderHasMore] = useState(false);
    const [folderLoading, setFolderLoading] = useState(false);
    const [folderLoadingMore, setFolderLoadingMore] = useState(false);
    const [listReady, setListReady] = useState(false);
    const [folderError, setFolderError] = useState("");
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [localSelection, setLocalSelection] = useState({
        level: "all",
        id: null,
    });
    const [localVisibleCount, setLocalVisibleCount] = useState(LOCAL_PAGE_SIZE);
    const [classifying, setClassifying] = useState(false);
    const [classifyMessage, setClassifyMessage] = useState(null);
    const [classifyProgress, setClassifyProgress] = useState(0);
    const [editing, setEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [removingId, setRemovingId] = useState(null);
    const [batchRemoving, setBatchRemoving] = useState(false);
    const [batchMoving, setBatchMoving] = useState(false);
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
    const [organizeConfirmOpen, setOrganizeConfirmOpen] = useState(false);
    const [draggingFolderId, setDraggingFolderId] = useState(null);
    const [dropFolderId, setDropFolderId] = useState(null);
    const [dropEdge, setDropEdge] = useState("after");
    const [dropGroupName, setDropGroupName] = useState(null);
    const [groupOverrides, setGroupOverrides] = useState(() => loadFavFolderGroupOverrides());
    const [sortError, setSortError] = useState("");
    const dragFolderIdRef = useRef(null);
    const folderDraggedRef = useRef(false);
    const folderDragClickLockTimerRef = useRef(null);
    const autoOrganizeTimerRef = useRef(null);
    const mergeDumpKickRef = useRef(false);
    const mergeDupKickRef = useRef(false);
    const classifyingRef = useRef(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [actionError, setActionError] = useState("");
    const [moveError, setMoveError] = useState("");
    const [editFolder, setEditFolder] = useState(null);
    const [cleanFolder, setCleanFolder] = useState(null);
    const [cleanLoading, setCleanLoading] = useState(false);
    const [deleteFolder, setDeleteFolder] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [folderNotice, setFolderNotice] = useState("");
    const isLocalMode = sidebarMode === "local";
    classifyingRef.current = classifying;
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
            if (folderDragClickLockTimerRef.current != null) {
                window.clearTimeout(folderDragClickLockTimerRef.current);
                folderDragClickLockTimerRef.current = null;
            }
            if (autoOrganizeTimerRef.current != null) {
                window.clearTimeout(autoOrganizeTimerRef.current);
                autoOrganizeTimerRef.current = null;
            }
        };
    }, []);
    const applyFolderListCache = (list) => {
        folderLoadSeqRef.current += 1;
        setResources(list.resources);
        setFolderPage(list.page);
        setFolderHasMore(list.hasMore);
        setFolderError("");
        setFolderLoading(false);
        setFolderLoadingMore(false);
        setListReady(true);
    };
    const loadFolderPage = useCallback(async (mediaId, page, append) => {
        const seq = ++folderLoadSeqRef.current;
        if (append) {
            setFolderLoadingMore(true);
        }
        else {
            setFolderLoading(true);
            setListReady(false);
            setFolderError("");
            setResources([]);
            setFolderPage(1);
            setFolderHasMore(false);
        }
        const expected = foldersRef.current.find((folder) => folder.id === mediaId)
            ?.mediaCount ?? 0;
        if (!append && expected === 0) {
            if (seq !== folderLoadSeqRef.current)
                return;
            setResources([]);
            setFolderPage(1);
            setFolderHasMore(false);
            setFolderError("");
            setFolderLoading(false);
            setFolderLoadingMore(false);
            setListReady(true);
            return;
        }
        try {
            let result = await window.biliDesk.bili.getFavResources(mediaId, page, "long", expected);
            if (seq !== folderLoadSeqRef.current)
                return;
            const latestExpected = foldersRef.current.find((folder) => folder.id === mediaId)
                ?.mediaCount ?? expected;
            if (!append && result.resources.length === 0 && latestExpected > 0) {
                useFavoritesStore.getState().clearFolderList(mediaId);
                setResources([]);
                setFolderPage(1);
                setFolderHasMore(false);
                setFolderError(`这个夹有 ${latestExpected} 条，列表没返回内容，多半是风控。请等 2～3 分钟再点重新加载，不要连点`);
                return;
            }
            setResources((prev) => {
                const next = append
                    ? [...prev, ...result.resources]
                    : result.resources;
                // 空列表且夹里有稿：绝不写入缓存，否则下次点开会跳过请求、误显示「0 条」
                if (!(next.length === 0 && latestExpected > 0)) {
                    useFavoritesStore.getState().putFolderList(mediaId, {
                        resources: next,
                        page: result.page,
                        hasMore: result.hasMore,
                    });
                }
                return next;
            });
            setFolderPage(result.page);
            setFolderHasMore(result.hasMore);
        }
        catch (err) {
            if (seq !== folderLoadSeqRef.current)
                return;
            if (!append)
                setResources([]);
            const countNow = foldersRef.current.find((folder) => folder.id === mediaId)
                ?.mediaCount ?? 0;
            if (countNow === 0) {
                setFolderError("");
            }
            else {
                setFolderError(formatFolderError(err, countNow));
            }
        }
        finally {
            if (seq === folderLoadSeqRef.current) {
                setFolderLoading(false);
                setFolderLoadingMore(false);
                setListReady(true);
            }
        }
    }, []);
    useEffect(() => {
        setEditing(false);
        setSelectedIds(new Set());
        setActionError("");
        setMoveError("");
        setMoveOpen(false);
        setBatchConfirmOpen(false);
    }, [sidebarMode, selectedFolder, localSelection]);
    useEffect(() => {
        if (sidebarMode !== "bilibili" || !selectedFolder)
            return;
        const expected = foldersRef.current.find((folder) => folder.id === selectedFolder)
            ?.mediaCount ?? 0;
        const cached = useFavoritesStore.getState().getFolderList(selectedFolder);
        if (cached) {
            if (cached.resources.length === 0 && expected > 0) {
                useFavoritesStore.getState().clearFolderList(selectedFolder);
                void loadFolderPage(selectedFolder, 1, false);
                return;
            }
            applyFolderListCache(cached);
            return;
        }
        void loadFolderPage(selectedFolder, 1, false);
    }, [selectedFolder, sidebarMode, loadFolderPage]);
    useEffect(() => {
        if (refreshVersion === 0)
            return;
        if (sidebarMode === "bilibili" && selectedFolder != null) {
            void loadFolderPage(selectedFolder, 1, false);
        }
        if (sidebarMode === "local") {
            setLocalVisibleCount(LOCAL_PAGE_SIZE);
        }
    }, [refreshVersion, sidebarMode, selectedFolder, loadFolderPage]);
    useEffect(() => {
        setLocalVisibleCount(LOCAL_PAGE_SIZE);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
    }, [localSelection, sidebarMode]);
    const handleSidebarModeChange = (mode) => {
        setSidebarMode(mode);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
    };
    const handleSelectFolder = (folderId) => {
        setFolderError("");
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
        if (folderId === selectedFolder) {
            useFavoritesStore.getState().clearFolderList(folderId);
            void loadFolderPage(folderId, 1, false);
            return;
        }
        const expected = foldersRef.current.find((folder) => folder.id === folderId)?.mediaCount ??
            0;
        const cached = useFavoritesStore.getState().getFolderList(folderId);
        if (cached && !(cached.resources.length === 0 && expected > 0)) {
            applyFolderListCache(cached);
        }
        else {
            if (cached)
                useFavoritesStore.getState().clearFolderList(folderId);
            setListReady(false);
        }
        setSelectedFolder(folderId);
    };
    const treeWithCounts = useMemo(() => enrichTreeWithCounts(tree, assignments), [tree, assignments]);
    const localCategoryItems = useMemo(() => {
        if (!isLocalMode)
            return [];
        return filterAssignmentsByCategory(assignments, localSelection, tree).map(assignmentToFavResource);
    }, [assignments, isLocalMode, localSelection, tree]);
    const displayItems = isLocalMode
        ? localCategoryItems.slice(0, localVisibleCount)
        : resources;
    const loadMoreFolder = useCallback(async () => {
        if (!selectedFolder ||
            !folderHasMore ||
            folderLoadingMore ||
            folderLoading ||
            isLocalMode)
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
        if (localVisibleCount >= localCategoryItems.length)
            return;
        setLocalVisibleCount((prev) => Math.min(prev + LOCAL_PAGE_SIZE, localCategoryItems.length));
    }, [localVisibleCount, localCategoryItems.length]);
    const hasMore = isLocalMode
        ? localVisibleCount < localCategoryItems.length
        : folderHasMore;
    const loadingMore = isLocalMode ? false : folderLoadingMore;
    useEffect(() => {
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (!entries[0]?.isIntersecting)
                return;
            if (isLocalMode)
                loadMoreLocal();
            else
                void loadMoreFolder();
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [
        hasMore,
        isLocalMode,
        loadMoreFolder,
        loadMoreLocal,
        displayItems.length,
    ]);
    const refreshFolderMeta = useCallback(async (optimistic) => {
        if (optimistic)
            patchFolderCounts(optimistic);
        // 官方 media_count 偶发延迟，稍后强制拉取一次校准
        window.setTimeout(() => {
            void ensureFolders({ force: true }).catch(() => undefined);
        }, 800);
    }, [ensureFolders, patchFolderCounts]);
    const removeFromFolder = useCallback(async (aids) => {
        if (!selectedFolder || aids.length === 0)
            return;
        await window.biliDesk.bili.removeFavResources(selectedFolder, aids);
        const removed = new Set(aids);
        setResources((prev) => prev.filter((item) => !removed.has(item.id)));
        useFavoritesStore
            .getState()
            .removeItemsFromFolderList(selectedFolder, aids);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of aids)
                next.delete(id);
            return next;
        });
        await refreshFolderMeta({ [selectedFolder]: -aids.length });
    }, [refreshFolderMeta, selectedFolder]);
    const handleQuickRemove = useCallback(async (item) => {
        if (!selectedFolder || isLocalMode)
            return;
        setRemovingId(item.id);
        setActionError("");
        try {
            await removeFromFolder([item.id]);
        }
        catch (err) {
            setActionError(formatFolderError(err));
        }
        finally {
            setRemovingId(null);
        }
    }, [isLocalMode, removeFromFolder, selectedFolder]);
    const handleBatchRemove = useCallback(async () => {
        if (!selectedFolder || selectedIds.size === 0)
            return;
        setBatchRemoving(true);
        setActionError("");
        try {
            await removeFromFolder([...selectedIds]);
            setBatchConfirmOpen(false);
        }
        catch (err) {
            setActionError(formatFolderError(err));
        }
        finally {
            setBatchRemoving(false);
        }
    }, [removeFromFolder, selectedFolder, selectedIds]);
    const handleBatchMove = useCallback(async (targetFolderId) => {
        if (!selectedFolder || selectedIds.size === 0)
            return;
        setBatchMoving(true);
        setMoveError("");
        setActionError("");
        try {
            const aids = [...selectedIds];
            await window.biliDesk.bili.moveFavResources(selectedFolder, targetFolderId, aids);
            const moved = new Set(aids);
            setResources((prev) => prev.filter((item) => !moved.has(item.id)));
            useFavoritesStore
                .getState()
                .removeItemsFromFolderList(selectedFolder, aids);
            useFavoritesStore.getState().clearFolderList(targetFolderId);
            setSelectedIds(new Set());
            setMoveOpen(false);
            await refreshFolderMeta({
                [selectedFolder]: -aids.length,
                [targetFolderId]: aids.length,
            });
        }
        catch (err) {
            setMoveError(formatFolderError(err));
        }
        finally {
            setBatchMoving(false);
        }
    }, [refreshFolderMeta, selectedFolder, selectedIds]);
    const batchBusy = batchRemoving || batchMoving;
    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    const selectAllLoaded = () => {
        setSelectedIds(new Set(resources.map((item) => item.id)));
    };
    const clearSelection = () => setSelectedIds(new Set());
    const waitForFavTask = (taskId) => new Promise((resolve, reject) => {
        if (classifyPollRef.current)
            clearInterval(classifyPollRef.current);
        const poll = setInterval(() => {
            void (async () => {
                try {
                    const task = await window.biliDesk.taxonomy.getFavTaskStatus(taskId);
                    if (!task)
                        return;
                    setClassifyMessage(task.message);
                    setClassifyProgress(task.progress);
                    classifyProgressRef.current = task.progress;
                    if (task.status === "done" || task.status === "failed") {
                        clearInterval(poll);
                        if (classifyPollRef.current === poll) {
                            classifyPollRef.current = null;
                        }
                        if (task.status === "failed") {
                            reject(new Error(task.message));
                        }
                        else {
                            resolve(task.message ?? "");
                        }
                    }
                }
                catch (err) {
                    clearInterval(poll);
                    if (classifyPollRef.current === poll) {
                        classifyPollRef.current = null;
                    }
                    reject(err);
                }
            })();
        }, 1000);
        classifyPollRef.current = poll;
    });
    const handleClassifyAll = async (options = {}) => {
        if (classifyingRef.current)
            return;
        classifyingRef.current = true;
        setClassifying(true);
        setClassifyMessage(options.resumeHint ?? "正在启动分类任务...");
        setClassifyProgress(0);
        // 进度只在分完一个收藏夹时前进；没前进就不重拉，避免后台分类时列表反复重渲染
        let reloadedAtProgress = classifyProgressRef.current;
        const treeTimer = window.setInterval(() => {
            if (classifyProgressRef.current === reloadedAtProgress)
                return;
            reloadedAtProgress = classifyProgressRef.current;
            invalidateTaxonomy();
            void reloadTaxonomy();
        }, 20_000);
        try {
            const taskId = options.attachTaskId ??
                (await window.biliDesk.taxonomy.classifyAllFavorites()).taskId;
            await waitForFavTask(taskId);
            invalidateTaxonomy();
            await reloadTaxonomy();
            void enrichCoversOnce();
        }
        catch (err) {
            const message = formatDisplayedError(err, undefined, "分类失败，请确认已登录");
            setClassifyMessage(message.startsWith("[412]")
                ? "请求被 B 站安全策略拦截，请等 3～5 分钟再点，会接着上次继续"
                : message);
            // 中途失败也已经分好了一部分，刷新出来
            invalidateTaxonomy();
            void reloadTaxonomy();
        }
        finally {
            window.clearInterval(treeTimer);
            classifyingRef.current = false;
            setClassifying(false);
        }
    };
    const classifyResumeCheckedRef = useRef(false);
    useEffect(() => {
        if (classifyResumeCheckedRef.current)
            return;
        classifyResumeCheckedRef.current = true;
        void window.biliDesk.taxonomy
            .getFavClassifyResume()
            .then((info) => {
            if (info.runningTaskId != null) {
                void handleClassifyAll({
                    attachTaskId: info.runningTaskId,
                    resumeHint: "分类还在后台进行...",
                });
                return;
            }
            if (info.pending) {
                void handleClassifyAll({
                    resumeHint: `上次分到第 ${info.doneFolders} 个收藏夹（已分 ${info.classified} 条），自动接着继续...`,
                });
            }
        })
            .catch(() => undefined);
    }, []);
    const handleOrganizeBiliFolders = async (auto = false) => {
        if (classifyingRef.current && !auto)
            return;
        if (classifyingRef.current && auto)
            return;
        setOrganizeConfirmOpen(false);
        setClassifying(true);
        setClassifyMessage(auto ? "default 已满 100 条，正在自动整理..." : "正在启动整理任务...");
        setClassifyProgress(0);
        try {
            const { taskId } = await window.biliDesk.taxonomy.organizeBiliFavorites(groupOverrides);
            const message = await waitForFavTask(taskId);
            invalidateFolders();
            const list = await ensureFolders({ force: true });
            if (selectedFolder != null) {
                await loadFolderPage(selectedFolder, 1, false);
            }
            const def = pickDefaultFavFolder(list);
            const defaultLeft = def?.mediaCount ?? 0;
            const movedNothing = /已整理 0 |没有可整理|暂时没有能搬走|看过 \d+ 条/.test(message);
            const windControl = /风控|412|请求太密|安全策略/.test(message);
            if (autoOrganizeTimerRef.current != null) {
                window.clearTimeout(autoOrganizeTimerRef.current);
                autoOrganizeTimerRef.current = null;
            }
            if (!movedNothing &&
                !windControl &&
                defaultLeft >= DEFAULT_ORGANIZE_THRESHOLD) {
                setClassifyMessage(`${message} 约 3 分钟后自动继续整理 default`);
                autoOrganizeTimerRef.current = window.setTimeout(() => {
                    autoOrganizeTimerRef.current = null;
                    void handleOrganizeBiliFolders(true);
                }, AUTO_ORGANIZE_CONTINUE_MS);
            }
        }
        catch (err) {
            setClassifyMessage(formatDisplayedError(err, undefined, "整理失败，请确认已登录"));
        }
        finally {
            setClassifying(false);
        }
    };
    const organizeBiliRef = useRef(handleOrganizeBiliFolders);
    organizeBiliRef.current = handleOrganizeBiliFolders;
    const handleMergeDumpIntoDefault = async () => {
        if (classifyingRef.current)
            return;
        setClassifying(true);
        setClassifyMessage("正在把「其他」搬进 default，随后删除该夹...");
        setClassifyProgress(0);
        try {
            const { taskId } = await window.biliDesk.taxonomy.mergeDumpFavIntoDefault();
            await waitForFavTask(taskId);
            invalidateFolders();
            await ensureFolders({ force: true });
            if (selectedFolder != null) {
                await loadFolderPage(selectedFolder, 1, false);
            }
        }
        catch (err) {
            mergeDumpKickRef.current = false;
            setClassifyMessage(formatDisplayedError(err, undefined, "把「其他」并入 default 失败"));
        }
        finally {
            setClassifying(false);
        }
    };
    const mergeDumpRef = useRef(handleMergeDumpIntoDefault);
    mergeDumpRef.current = handleMergeDumpIntoDefault;
    const handleMergeDuplicateTopics = async () => {
        if (classifyingRef.current)
            return;
        setClassifying(true);
        setClassifyMessage("正在把「计算机-算法」这类重复夹并入已有夹...");
        setClassifyProgress(0);
        try {
            const { taskId } = await window.biliDesk.taxonomy.mergeDuplicateTopicFolders();
            await waitForFavTask(taskId);
            invalidateFolders();
            await ensureFolders({ force: true });
            if (selectedFolder != null) {
                await loadFolderPage(selectedFolder, 1, false);
            }
        }
        catch (err) {
            mergeDupKickRef.current = false;
            setClassifyMessage(formatDisplayedError(err, undefined, "合并同主题收藏夹失败"));
        }
        finally {
            setClassifying(false);
        }
    };
    const mergeDupRef = useRef(handleMergeDuplicateTopics);
    mergeDupRef.current = handleMergeDuplicateTopics;
    useEffect(() => {
        if (isLocalMode || !foldersReady || classifyingRef.current)
            return;
        const dumps = folders.filter((folder) => isDumpFolderTitle(folder.title) && !folder.isDefault);
        if (dumps.length > 0) {
            if (mergeDumpKickRef.current)
                return;
            mergeDumpKickRef.current = true;
            void mergeDumpRef.current();
            return;
        }
        if (listDuplicateGeneratedFolderPairs(folders).length > 0) {
            if (mergeDupKickRef.current)
                return;
            mergeDupKickRef.current = true;
            void mergeDupRef.current();
        }
    }, [folders, foldersReady, isLocalMode]);
    const persistFolderOrder = async (ordered) => {
        setFolders(ordered);
        setSortError("");
        try {
            await window.biliDesk.bili.sortFavFolders(ordered.map((folder) => folder.id));
        }
        catch (err) {
            await ensureFolders({ force: true });
            const message = extractIpcErrorMessage(err) || "排序失败";
            setSortError(message.includes("412") || message.includes("安全策略")
                ? "请求太密，请稍后再拖动排序"
                : message);
        }
    };
    const unlockFolderClicksSoon = () => {
        if (folderDragClickLockTimerRef.current != null) {
            window.clearTimeout(folderDragClickLockTimerRef.current);
        }
        folderDragClickLockTimerRef.current = window.setTimeout(() => {
            folderDraggedRef.current = false;
            folderDragClickLockTimerRef.current = null;
        }, 80);
    };
    const handleFolderDragStart = (folderId) => {
        if (folderDragClickLockTimerRef.current != null) {
            window.clearTimeout(folderDragClickLockTimerRef.current);
            folderDragClickLockTimerRef.current = null;
        }
        dragFolderIdRef.current = folderId;
        folderDraggedRef.current = false;
        setDraggingFolderId(folderId);
    };
    const persistGroupOverrides = (next) => {
        setGroupOverrides(next);
        saveFavFolderGroupOverrides(next);
    };
    const handleFolderDragOver = (event, folderId) => {
        event.preventDefault();
        if (dragFolderIdRef.current == null ||
            dragFolderIdRef.current === folderId) {
            return;
        }
        folderDraggedRef.current = true;
        setDropGroupName(null);
        setDropFolderId(folderId);
        const rect = event.currentTarget.getBoundingClientRect();
        const edge = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
        setDropEdge(edge);
    };
    const handleGroupDragOver = (event, groupName) => {
        event.preventDefault();
        if (dragFolderIdRef.current == null)
            return;
        folderDraggedRef.current = true;
        setDropFolderId(null);
        setDropGroupName(groupName);
    };
    const handleFolderDrop = (event, folderId) => {
        const fromId = dragFolderIdRef.current;
        const rect = event.currentTarget.getBoundingClientRect();
        const after = event.clientY >= rect.top + rect.height / 2;
        dragFolderIdRef.current = null;
        setDraggingFolderId(null);
        setDropFolderId(null);
        setDropGroupName(null);
        unlockFolderClicksSoon();
        if (fromId == null || fromId === folderId)
            return;
        const next = reorderGroupedFavFolders(folders, fromId, folderId, groupOverrides, { after });
        if (!next)
            return;
        persistGroupOverrides(next.overrides);
        void persistFolderOrder(next.folders);
    };
    const handleGroupDrop = (groupName) => {
        const fromId = dragFolderIdRef.current;
        dragFolderIdRef.current = null;
        setDraggingFolderId(null);
        setDropFolderId(null);
        setDropGroupName(null);
        unlockFolderClicksSoon();
        if (fromId == null)
            return;
        const next = moveFavFolderIntoGroup(folders, fromId, groupName, groupOverrides);
        if (!next)
            return;
        persistGroupOverrides(next.overrides);
        void persistFolderOrder(next.folders);
    };
    const handleFolderDragEnd = () => {
        dragFolderIdRef.current = null;
        setDraggingFolderId(null);
        setDropFolderId(null);
        setDropGroupName(null);
        unlockFolderClicksSoon();
    };
    const handleCleanInvalid = async () => {
        if (!cleanFolder)
            return;
        setCleanLoading(true);
        setActionError("");
        try {
            const result = await window.biliDesk.bili.cleanFavResources(cleanFolder.id);
            clearFolderList(cleanFolder.id);
            await ensureFolders({ force: true });
            if (selectedFolder === cleanFolder.id) {
                void loadFolderPage(cleanFolder.id, 1, false);
            }
            setFolderNotice(result.cleaned != null && result.cleaned > 0
                ? `已清除 ${result.cleaned} 条失效内容`
                : "已清除失效内容（若没有失效稿件则数量不变）");
            setCleanFolder(null);
        }
        catch (err) {
            setActionError(formatFolderError(err));
        }
        finally {
            setCleanLoading(false);
        }
    };
    const handleDeleteFolder = async () => {
        if (!deleteFolder || deleteFolder.isDefault)
            return;
        setDeleteLoading(true);
        setActionError("");
        try {
            await window.biliDesk.bili.deleteFavFolder(deleteFolder.id);
            clearFolderList(deleteFolder.id);
            const nextOverrides = { ...groupOverrides };
            delete nextOverrides[String(deleteFolder.id)];
            persistGroupOverrides(nextOverrides);
            invalidateFolders();
            const list = await ensureFolders({ force: true });
            if (selectedFolder === deleteFolder.id) {
                const nextId = list[0]?.id ?? null;
                if (nextId != null)
                    handleSelectFolder(nextId);
                else
                    setSelectedFolder(null);
            }
            setFolderNotice(`已删除收藏夹「${deleteFolder.title}」`);
            setDeleteFolder(null);
        }
        catch (err) {
            setActionError(formatFolderError(err));
        }
        finally {
            setDeleteLoading(false);
        }
    };
    const handleRename = async (level, id, currentName) => {
        const next = window.prompt("编辑分类名称", currentName);
        if (!next || next.trim() === currentName)
            return;
        await window.biliDesk.taxonomy.updateCategoryName(level, id, next.trim());
        await reloadTaxonomy();
    };
    const selectedFolderInfo = folders.find((f) => f.id === selectedFolder);
    const folderMediaCount = selectedFolderInfo?.mediaCount ?? 0;
    const showListLoading = isLocalMode
        ? !taxonomyReady
        : !foldersReady || selectedFolder == null || !listReady || folderLoading;
    return (_jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "flex w-60 shrink-0 flex-col border-r border-border", children: [_jsxs("div", { className: "space-y-3 border-b border-border p-3", children: [_jsx("p", { className: "text-sm font-medium", children: "\u6536\u85CF\u5939" }), _jsx(CreateFavFolderControl, { className: "w-full justify-center", onCreated: (folder) => {
                                    setSidebarMode("bilibili");
                                    setFolderError("");
                                    setListReady(false);
                                    if (scrollRef.current)
                                        scrollRef.current.scrollTop = 0;
                                    setSelectedFolder(folder.id);
                                } }), _jsxs("div", { className: "flex rounded-lg bg-secondary p-1", children: [_jsx("button", { type: "button", onClick: () => handleSidebarModeChange("bilibili"), className: cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors", sidebarMode === "bilibili"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"), children: "B \u7AD9\u6536\u85CF\u5939" }), _jsx("button", { type: "button", onClick: () => handleSidebarModeChange("local"), className: cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors", sidebarMode === "local"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"), children: "\u672C\u5730\u5206\u7C7B" })] })] }), _jsxs("div", { className: "space-y-2 border-b border-border p-3", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: isLocalMode
                                    ? "按标题打分归类，只在本地记录、不改 B 站收藏夹；被风控打断后再点会接着上次继续"
                                    : "一条一条看标题就搬走，不再攒一批。本轮最多约 40 条，中间会停几秒。请不要连点。官方「其他」夹仍会并进 default 后删除。" }), _jsxs(Button, { type: "button", size: "sm", variant: "secondary", className: "w-full gap-1.5", disabled: classifying, onClick: () => {
                                    if (isLocalMode) {
                                        void handleClassifyAll();
                                        return;
                                    }
                                    setOrganizeConfirmOpen(true);
                                }, children: [classifying ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Sparkles, { className: "h-3.5 w-3.5" })), isLocalMode ? "智能分类全部收藏" : "智能整理（一条一条搬）"] }), classifyMessage && (_jsx("p", { className: "whitespace-pre-line text-xs text-muted-foreground first-line:font-medium first-line:text-foreground", children: classifyMessage })), classifying && (_jsx("div", { className: "h-1.5 overflow-hidden rounded-full bg-secondary", children: _jsx("div", { className: "h-full rounded-full bg-primary transition-all duration-300", style: { width: `${classifyProgress}%` } }) }))] }), _jsx("div", { className: "scrollbar-none flex-1 overflow-y-auto p-2", children: sidebarMode === "bilibili" ? (_jsxs("div", { className: "space-y-0.5", children: [sortError && (_jsx("p", { className: "px-1 pb-1 text-[11px] text-red-400", children: sortError })), _jsx(FavFolderGroupedNav, { folders: folders, groupOverrides: groupOverrides, selectedFolder: selectedFolder, draggingFolderId: draggingFolderId, dropFolderId: dropFolderId, dropEdge: dropEdge, dropGroupName: dropGroupName, onSelect: handleSelectFolder, onDragStart: (event, folder) => {
                                        event.dataTransfer.effectAllowed = "move";
                                        event.dataTransfer.setData("text/plain", String(folder.id));
                                        handleFolderDragStart(folder.id);
                                    }, onDragOver: (event, folderId) => {
                                        event.dataTransfer.dropEffect = "move";
                                        handleFolderDragOver(event, folderId);
                                    }, onDrop: (event, folderId) => {
                                        handleFolderDrop(event, folderId);
                                    }, onDragOverGroup: (event, groupName) => {
                                        event.dataTransfer.dropEffect = "move";
                                        handleGroupDragOver(event, groupName);
                                    }, onDropOnGroup: (_event, groupName) => {
                                        handleGroupDrop(groupName);
                                    }, onDragEnd: handleFolderDragEnd, onEdit: (folder) => {
                                        setEditFolder(folder);
                                        setFolderNotice("");
                                    }, onCleanInvalid: (folder) => {
                                        setCleanFolder(folder);
                                        setFolderNotice("");
                                    }, onDelete: (folder) => {
                                        setDeleteFolder(folder);
                                        setFolderNotice("");
                                    }, shouldIgnoreClick: () => {
                                        if (folderDraggedRef.current) {
                                            folderDraggedRef.current = false;
                                            return true;
                                        }
                                        return false;
                                    } }), folders.length === 0 && (_jsx("p", { className: "px-2 py-4 text-center text-xs text-muted-foreground", children: "\u767B\u5F55\u540E\u53EF\u540C\u6B65 B \u7AD9\u6536\u85CF\u5939" }))] })) : (_jsx(CategoryTree, { tree: treeWithCounts, selection: localSelection, onSelect: setLocalSelection, onRename: (level, id, name) => void handleRename(level, id, name), showCollapseAll: true })) })] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: isLocalMode ? (_jsxs(_Fragment, { children: ["\u672C\u5730\u5206\u7C7B", localSelection.level !== "all" && " · 已筛选", "\uFF1A\u5171 ", localCategoryItems.length, " \u4E2A\u89C6\u9891", localCategoryItems.length > 0 &&
                                            `，已显示 ${displayItems.length} 个`] })) : (_jsxs(_Fragment, { children: ["B \u7AD9\u6536\u85CF\u5939\u300C", selectedFolderInfo?.title ?? "...", "\u300D\uFF1A\u5DF2\u52A0\u8F7D", " ", resources.length, selectedFolderInfo
                                            ? ` / ${selectedFolderInfo.mediaCount}`
                                            : "", " ", "\u4E2A\u89C6\u9891"] })) }), !isLocalMode && selectedFolderInfo && (_jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [_jsxs(Button, { size: "sm", variant: "outline", className: "gap-1", disabled: batchBusy || cleanLoading || editing, onClick: () => {
                                            setFolderNotice("");
                                            setEditFolder(selectedFolderInfo);
                                        }, children: [_jsx(Pencil, { className: "h-3.5 w-3.5" }), "\u7F16\u8F91\u4FE1\u606F"] }), _jsxs(Button, { size: "sm", variant: "outline", className: "gap-1", disabled: batchBusy || cleanLoading || editing, onClick: () => {
                                            setFolderNotice("");
                                            setCleanFolder(selectedFolderInfo);
                                        }, children: [_jsx(Eraser, { className: "h-3.5 w-3.5" }), "\u6E05\u9664\u5DF2\u5931\u6548"] }), resources.length > 0 &&
                                        (editing ? (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "outline", disabled: batchBusy, onClick: selectAllLoaded, children: "\u5168\u9009\u5DF2\u52A0\u8F7D" }), _jsx(Button, { size: "sm", variant: "outline", disabled: batchBusy || selectedIds.size === 0, onClick: clearSelection, children: "\u53D6\u6D88\u9009\u62E9" }), _jsxs(Button, { size: "sm", variant: "outline", className: "gap-1", disabled: batchBusy || selectedIds.size === 0, onClick: () => {
                                                        setMoveError("");
                                                        setMoveOpen(true);
                                                    }, children: [batchMoving ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(FolderInput, { className: "h-3.5 w-3.5" })), "\u79FB\u52A8", selectedIds.size > 0 ? ` (${selectedIds.size})` : ""] }), _jsxs(Button, { size: "sm", variant: "outline", className: "gap-1 border-red-500/30 text-red-400 hover:bg-red-500/15", disabled: batchBusy || selectedIds.size === 0, onClick: () => setBatchConfirmOpen(true), children: [batchRemoving ? (_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" })) : (_jsx(Trash2, { className: "h-3.5 w-3.5" })), "\u79FB\u9664", selectedIds.size > 0 ? ` (${selectedIds.size})` : ""] }), _jsx(Button, { size: "sm", variant: "secondary", disabled: batchBusy, onClick: () => {
                                                        setEditing(false);
                                                        clearSelection();
                                                    }, children: "\u5B8C\u6210" })] })) : (_jsx(Button, { size: "sm", variant: "outline", onClick: () => {
                                                setEditing(true);
                                                setActionError("");
                                            }, children: "\u6279\u91CF\u7BA1\u7406" })))] }))] }), folderNotice && !actionError && (_jsx("p", { className: "border-b border-border px-4 py-2 text-xs text-muted-foreground", children: folderNotice })), actionError && (_jsx("p", { className: "border-b border-border px-4 py-2 text-xs text-red-400", children: actionError })), _jsxs("div", { ref: scrollRef, className: "flex-1 overflow-y-auto", children: [showListLoading ? (_jsxs("div", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u6536\u85CF\u4E2D..."] })) : (_jsxs("div", { className: cn("grid gap-3 p-4", FAV_GRID_COLS_CLASS[favGridColumns]), children: [displayItems.map((item) => (_jsx(FavVideoCard, { roomy: favGridColumns <= 2, item: item, editing: !isLocalMode && editing, selected: selectedIds.has(item.id), removing: removingId === item.id, showFollowedBadge: item.upper.mid > 0 && followedMidSet.has(item.upper.mid), onToggleSelect: () => toggleSelect(item.id), onRemove: () => void handleQuickRemove(item) }, `${item.id}-${item.bvid}`))), displayItems.length === 0 &&
                                        (isLocalMode ? (_jsx("p", { className: "col-span-full py-8 text-center text-sm text-muted-foreground", children: assignments.length === 0
                                                ? "暂无本地分类数据，请先点击「智能分类全部收藏」"
                                                : "该分类下暂无视频" })) : folderMediaCount === 0 ? (_jsx("p", { className: "col-span-full py-8 text-center text-sm text-muted-foreground", children: "\u8BE5\u6536\u85CF\u5939\u6682\u65E0\u89C6\u9891" })) : folderError || folderMediaCount > 0 ? (_jsxs("div", { className: "col-span-full flex flex-col items-center gap-3 py-8 text-center", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: folderError ||
                                                        "收藏夹有视频但列表没返回，请稍后再重新加载" }), selectedFolder != null && (_jsx(Button, { size: "sm", variant: "outline", onClick: () => {
                                                        useFavoritesStore
                                                            .getState()
                                                            .clearFolderList(selectedFolder);
                                                        void loadFolderPage(selectedFolder, 1, false);
                                                    }, children: "\u91CD\u65B0\u52A0\u8F7D" }))] })) : (_jsx("p", { className: "col-span-full py-8 text-center text-sm text-muted-foreground", children: "\u8BE5\u6536\u85CF\u5939\u6682\u65E0\u89C6\u9891" })))] })), (hasMore || loadingMore) && displayItems.length > 0 && (_jsx("div", { ref: sentinelRef, className: "flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground", children: loadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u66F4\u591A..."] })) : ("继续下滑加载更多") }))] })] }), _jsx(ConfirmDialog, { open: batchConfirmOpen, title: `移除 ${selectedIds.size} 个视频？`, description: "\u5C06\u4ECE\u5F53\u524D B \u7AD9\u6536\u85CF\u5939\u4E2D\u79FB\u9664\u6240\u9009\u89C6\u9891\uFF0C\u4E0D\u4F1A\u5220\u9664\u7A3F\u4EF6\u672C\u8EAB\u3002\u6B64\u64CD\u4F5C\u4E0E\u5B98\u65B9\u8D26\u53F7\u540C\u6B65\u3002", confirmLabel: "\u786E\u8BA4\u79FB\u9664", destructive: true, loading: batchRemoving, onConfirm: () => void handleBatchRemove(), onCancel: () => {
                    if (!batchRemoving)
                        setBatchConfirmOpen(false);
                } }), _jsx(ConfirmDialog, { open: organizeConfirmOpen, title: "\u6574\u7406\u4E00\u6279\u6536\u85CF\uFF1F", description: "\u6309\u6807\u9898\u5F53\u573A\u5206\u7C7B\u3001\u5F53\u573A\u642C\u8D70\uFF0C\u4E0D\u518D\u5148\u6293\u7B80\u4ECB/\u70ED\u8BC4\u518D\u6210\u6279\u79FB\u52A8\u3002\u672C\u8F6E\u6700\u591A\u7EA6 40 \u6761\uFF0C\u6BCF\u6761\u95F4\u9694\u51E0\u79D2\uFF0C\u964D\u4F4E\u98CE\u63A7\u3002\u5148\u6574\u7406 default\uFF0C\u518D\u6574\u7406\u672A\u5206\u7EC4\u3002\u6B64\u64CD\u4F5C\u4F1A\u540C\u6B65\u5230\u5B98\u65B9\u8D26\u53F7\u3002", confirmLabel: "\u6574\u7406\u8FD9\u4E00\u6279", loading: classifying, onConfirm: () => void handleOrganizeBiliFolders(), onCancel: () => {
                    if (!classifying)
                        setOrganizeConfirmOpen(false);
                } }), _jsx(ConfirmDialog, { open: cleanFolder != null, title: `清除「${cleanFolder?.title ?? ""}」里的失效内容？`, description: "\u4F1A\u628A\u8FD9\u4E2A\u6536\u85CF\u5939\u91CC\u5DF2\u88AB UP \u5220\u9664\u6216\u4E0B\u67B6\u7684\u7A3F\u4EF6\u6E05\u6389\uFF0C\u548C\u5B98\u7F51\u300C\u4E00\u952E\u6E05\u9664\u5DF2\u5931\u6548\u300D\u4E00\u6837\uFF0C\u4F1A\u540C\u6B65\u5230\u5B98\u65B9\u8D26\u53F7\u3002", confirmLabel: "\u6E05\u9664\u5931\u6548", destructive: true, loading: cleanLoading, onConfirm: () => void handleCleanInvalid(), onCancel: () => {
                    if (!cleanLoading)
                        setCleanFolder(null);
                } }), _jsx(ConfirmDialog, { open: deleteFolder != null, title: `删除收藏夹「${deleteFolder?.title ?? ""}」？`, description: (deleteFolder?.mediaCount ?? 0) > 0
                    ? `这个夹里还有 ${deleteFolder?.mediaCount} 条。稿件本身不会删，只是从这个夹里拿掉，和官网删除收藏夹一样，会同步到官方账号。`
                    : "这个夹是空的。删除后会从账号里去掉，和官网同步。", confirmLabel: "\u5220\u9664\u6536\u85CF\u5939", destructive: true, loading: deleteLoading, onConfirm: () => void handleDeleteFolder(), onCancel: () => {
                    if (!deleteLoading)
                        setDeleteFolder(null);
                } }), _jsx(EditFavFolderDialog, { folder: editFolder, onClose: () => setEditFolder(null) }), selectedFolder != null && (_jsx(FavMoveDialog, { open: moveOpen, folders: folders, sourceFolderId: selectedFolder, selectedCount: selectedIds.size, loading: batchMoving, error: moveError, onConfirm: (targetId) => void handleBatchMove(targetId), onClose: () => {
                    if (!batchMoving)
                        setMoveOpen(false);
                } }))] }));
}
