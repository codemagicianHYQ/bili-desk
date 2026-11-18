import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { BILI_SPECIAL_FOLLOW_TAG_ID, } from "@shared/types";
import { useFollowingStore } from "@/stores/following-store";
import { UpGroupTree } from "@/components/taxonomy/UpGroupTree";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS, OverlayPortal, } from "@/components/ui/overlay-portal";
import { FollowingSearch } from "@/components/following/FollowingSearch";
import { cn } from "@/lib/utils";
import { Loader2, Network, Sparkles, Upload } from "lucide-react";
import { FollowTagDialog } from "./FollowTagDialog";
import { FollowingUpCard } from "./FollowingUpCard";
import { UnfollowConfirmDialog } from "./UnfollowConfirmDialog";
import { CreateFollowTagControl } from "@/components/following/CreateFollowTagControl";
import { FollowTagList } from "@/components/following/FollowTagList";
import { FollowTagSyncDialog } from "@/components/following/FollowTagSyncDialog";
import { UpPortraitMap } from "./UpPortraitMap";
import { upRelationCache, upSpaceCache } from "@/lib/session-data-cache";
const SORT_STORAGE_KEY = "bilidesk:following-sort";
const SORT_OPTIONS = [
    { value: "recent", label: "最近关注" },
    { value: "attention", label: "最常访问" },
    { value: "earliest", label: "最早关注" },
    { value: "name", label: "名称" },
];
function readSort() {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_OPTIONS.some((option) => option.value === saved)
        ? saved
        : "recent";
}
function tagCacheKey(tagId, order) {
    return order === "attention" ? `${tagId}:attention` : tagId;
}
function isSpecialFollowTag(tagId, tag) {
    if (tagId === BILI_SPECIAL_FOLLOW_TAG_ID)
        return true;
    return tag?.name === "特别关注";
}
function formatError(err) {
    return formatDisplayedError(err, undefined, "加载失败");
}
function getLocalSelectionLabel(tree, selection) {
    if (selection.level === "uncategorized")
        return "未分组";
    if (selection.level === "l1" && selection.id != null) {
        return tree.find((node) => node.id === selection.id)?.name ?? "...";
    }
    if (selection.level === "l2" && selection.id != null) {
        for (const l1 of tree) {
            const l2 = l1.children.find((child) => child.id === selection.id);
            if (l2)
                return `${l1.name} / ${l2.name}`;
        }
    }
    return "...";
}
export function FollowingPage() {
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const loadSeqRef = useRef(0);
    const classifyPollRef = useRef(null);
    const followTags = useFollowingStore((state) => state.followTags);
    const sidebarReady = useFollowingStore((state) => state.sidebarReady);
    const upGroupTree = useFollowingStore((state) => state.upGroupTree);
    const uncategorizedCount = useFollowingStore((state) => state.uncategorizedCount);
    const allFollowings = useFollowingStore((state) => state.allFollowings);
    const followingsLoading = useFollowingStore((state) => state.followingsLoading);
    const followingsProgress = useFollowingStore((state) => state.followingsProgress);
    const refreshSidebar = useFollowingStore((state) => state.refreshSidebar);
    const filterLocalFollowings = useFollowingStore((state) => state.filterLocalFollowings);
    const invalidateFollowings = useFollowingStore((state) => state.invalidateFollowings);
    const invalidateSidebar = useFollowingStore((state) => state.invalidateSidebar);
    const patchFollowing = useFollowingStore((state) => state.patchFollowing);
    const patchFollowTagCount = useFollowingStore((state) => state.patchFollowTagCount);
    const patchSpecialFollowCount = useFollowingStore((state) => state.patchSpecialFollowCount);
    const refreshVersion = useFollowingStore((state) => state.refreshVersion);
    const attentionRank = useFollowingStore((state) => state.attentionRank);
    const ensureAttentionRank = useFollowingStore((state) => state.ensureAttentionRank);
    const ensureAllFollowings = useFollowingStore((state) => state.ensureAllFollowings);
    const [upSort, setUpSort] = useState(readSort);
    const [sortLoading, setSortLoading] = useState(false);
    const serverOrder = upSort === "attention" ? "attention" : "recent";
    /** 最早关注 / 名称要整组数据才排得准，B 站分组需拉完所有页 */
    const needsFullTag = upSort === "earliest" || upSort === "name";
    const [sidebarMode, setSidebarMode] = useState("bilibili");
    const [portraitOpen, setPortraitOpen] = useState(false);
    const [portraitFocus, setPortraitFocus] = useState(null);
    const [selectedTagId, setSelectedTagId] = useState(null);
    const [localSelection, setLocalSelection] = useState({
        level: "l1",
        id: null,
    });
    const [followings, setFollowings] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [listReady, setListReady] = useState(false);
    const [error, setError] = useState("");
    const [taskMessage, setTaskMessage] = useState("");
    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [classifyMenuOpen, setClassifyMenuOpen] = useState(false);
    const [classifyMenuPos, setClassifyMenuPos] = useState(null);
    const classifyAnchorRef = useRef(null);
    const [classifyInfo, setClassifyInfo] = useState(null);
    const [tagDialogUp, setTagDialogUp] = useState(null);
    const [unfollowTarget, setUnfollowTarget] = useState(null);
    const [unfollowing, setUnfollowing] = useState(false);
    const [unfollowError, setUnfollowError] = useState("");
    const [specialPendingMid, setSpecialPendingMid] = useState(null);
    const [actionMessage, setActionMessage] = useState("");
    const [assignments, setAssignments] = useState([]);
    const [highlightMid, setHighlightMid] = useState(null);
    const isLocalMode = sidebarMode === "local";
    const selectedTag = followTags.find((tag) => tag.tagId === selectedTagId);
    const inSpecialGroup = !isLocalMode && isSpecialFollowTag(selectedTagId, selectedTag);
    const localSelectionLabel = useMemo(() => getLocalSelectionLabel(upGroupTree, localSelection), [upGroupTree, localSelection]);
    const biliTagByMid = useMemo(() => {
        const map = new Map();
        const add = (mid, name) => {
            const list = map.get(mid) ?? [];
            if (!list.includes(name))
                list.push(name);
            map.set(mid, list);
        };
        for (const tag of followTags) {
            const cached = useFollowingStore.getState().getTagList(tag.tagId);
            if (!cached)
                continue;
            for (const up of cached.followings)
                add(up.mid, tag.name);
        }
        return map;
    }, [followTags, refreshVersion, followings.length]);
    const reloadAssignments = useCallback(async () => {
        try {
            setAssignments(await window.biliDesk.taxonomy.getUpAssignmentPaths());
        }
        catch {
            // 搜索时没有本地分组信息也能按昵称匹配
        }
    }, []);
    useEffect(() => {
        void ensureAllFollowings();
        void reloadAssignments();
    }, [ensureAllFollowings, reloadAssignments, refreshVersion]);
    useEffect(() => {
        if (highlightMid == null)
            return;
        const timer = window.setTimeout(() => setHighlightMid(null), 4000);
        return () => window.clearTimeout(timer);
    }, [highlightMid]);
    const handleSearchPick = useCallback((selection, mid) => {
        const up = (allFollowings ?? []).find((item) => item.mid === mid);
        const assignment = assignments.find((item) => item.mid === mid);
        const focus = {
            mid,
            uname: up?.uname ?? "",
            l1: assignment?.l1 ?? "",
            l2: assignment?.l2 ?? "",
        };
        setPortraitFocus(focus);
        if (portraitOpen) {
            const where = [focus.l1, focus.l2].filter(Boolean).join(" / ");
            setActionMessage(where ? `已在领域图标出「${where}」` : "已在领域图中标出这位 UP");
            return;
        }
        setSidebarMode("local");
        setLocalSelection(selection);
        setHighlightMid(mid);
        setActionMessage("已定位到搜索结果所在的本地分组");
    }, [allFollowings, assignments, portraitOpen]);
    const applyTagListCache = (list) => {
        loadSeqRef.current += 1;
        setFollowings(list.followings);
        setPage(list.page);
        setHasMore(list.hasMore);
        setError("");
        setLoading(false);
        setLoadingMore(false);
        setListReady(true);
    };
    const loadBilibiliPage = useCallback(async (tagId, nextPage, append, order = "recent") => {
        const seq = ++loadSeqRef.current;
        if (append) {
            setLoadingMore(true);
        }
        else {
            setLoading(true);
            setError("");
            setFollowings([]);
            setPage(1);
            setHasMore(false);
            setListReady(false);
        }
        try {
            const result = await window.biliDesk.bili.getFollowingsInTag(tagId, nextPage, order);
            if (seq !== loadSeqRef.current)
                return;
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
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            if (!append)
                setFollowings([]);
            setError(formatError(err));
        }
        finally {
            if (seq === loadSeqRef.current) {
                setLoading(false);
                setLoadingMore(false);
                setListReady(true);
            }
        }
    }, []);
    const loadLocalGroupMembers = useCallback(async (selection) => {
        if (selection.level !== "uncategorized" && selection.id == null)
            return;
        const seq = ++loadSeqRef.current;
        const hasCachedFollowings = useFollowingStore.getState().allFollowings != null;
        if (!hasCachedFollowings) {
            setLoading(true);
            setError("");
            setFollowings([]);
        }
        setHasMore(false);
        try {
            const result = await filterLocalFollowings(selection);
            if (seq !== loadSeqRef.current)
                return;
            setFollowings(result);
        }
        catch (err) {
            if (seq !== loadSeqRef.current)
                return;
            setFollowings([]);
            setError(formatError(err));
        }
        finally {
            if (seq === loadSeqRef.current) {
                setLoading(false);
                setListReady(true);
            }
        }
    }, [filterLocalFollowings]);
    useEffect(() => {
        if (isLocalMode)
            setListReady(false);
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
            const { followTags: tags, upGroupTree: tree } = useFollowingStore.getState();
            setSelectedTagId((prev) => prev ?? tags[0]?.tagId ?? null);
            setLocalSelection((prev) => {
                if (prev.id != null)
                    return prev;
                return { level: "l1", id: tree[0]?.id ?? null };
            });
        })();
    }, [refreshSidebar]);
    useEffect(() => {
        if (sidebarMode !== "bilibili" || selectedTagId == null)
            return;
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
        if (sidebarMode !== "local")
            return;
        if (localSelection.level !== "uncategorized" && localSelection.id == null)
            return;
        void loadLocalGroupMembers(localSelection);
    }, [sidebarMode, localSelection, loadLocalGroupMembers]);
    useEffect(() => {
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
    }, [sidebarMode, selectedTagId, localSelection]);
    const handleSidebarModeChange = (mode) => {
        setSidebarMode(mode);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
    };
    const handleSelectTag = (tagId) => {
        setError("");
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
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
        }
        else {
            setListReady(false);
        }
        setSelectedTagId(tagId);
    };
    const handleSelectLocalGroup = (selection) => {
        setError("");
        setListReady(false);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
        setLocalSelection(selection);
    };
    const loadMoreBilibili = useCallback(async () => {
        if (selectedTagId == null ||
            !hasMore ||
            loadingMore ||
            loading ||
            isLocalMode)
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
        if (!root || !target || !hasMore || isLocalMode)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (!entries[0]?.isIntersecting)
                return;
            void loadMoreBilibili();
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, isLocalMode, loadMoreBilibili, followings.length]);
    const openClassifyMenu = () => {
        const rect = classifyAnchorRef.current?.getBoundingClientRect();
        if (rect) {
            const width = 288;
            setClassifyMenuPos({
                top: rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
            });
        }
        setClassifyMenuOpen(true);
        void window.biliDesk.ai
            .getUpClassifyInfo()
            .then(setClassifyInfo)
            .catch(() => undefined);
    };
    const runAiClassify = async (mode) => {
        setClassifyMenuOpen(false);
        setTaskMessage(mode === "deep" ? "正在启动深度整理..." : "正在启动浅层整理...");
        const { taskId } = await window.biliDesk.ai.runUpClassification(mode);
        watchClassifyTask(taskId);
    };
    const watchClassifyTask = (taskId) => {
        if (classifyPollRef.current)
            clearInterval(classifyPollRef.current);
        const poll = setInterval(async () => {
            const task = await window.biliDesk.ai.getTaskStatus(taskId);
            if (!task)
                return;
            setTaskMessage(task.message);
            if (task.status === "done" || task.status === "failed") {
                clearInterval(poll);
                if (classifyPollRef.current === poll) {
                    classifyPollRef.current = null;
                }
                invalidateSidebar();
                await refreshSidebar({ force: true });
                void reloadAssignments();
                void loadLocalGroupMembers(localSelection);
            }
        }, 1000);
        classifyPollRef.current = poll;
    };
    const watchClassifyTaskRef = useRef(watchClassifyTask);
    watchClassifyTaskRef.current = watchClassifyTask;
    useEffect(() => {
        if (!isLocalMode || classifyPollRef.current)
            return;
        void window.biliDesk.ai
            .getUpClassifyInfo()
            .then((info) => {
            setClassifyInfo(info);
            if (info.runningTaskId != null && !classifyPollRef.current) {
                watchClassifyTaskRef.current(info.runningTaskId);
            }
        })
            .catch(() => undefined);
    }, [isLocalMode]);
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
        if (refreshVersion === 0)
            return;
        void reloadCurrentList();
    }, [refreshVersion, reloadCurrentList]);
    const handleUnfollow = () => {
        const up = unfollowTarget;
        if (!up || unfollowing)
            return;
        setUnfollowTarget(null);
        setUnfollowing(false);
        setUnfollowError("");
        setFollowings((prev) => prev.filter((item) => item.mid !== up.mid));
        if (selectedTagId != null)
            patchFollowTagCount(selectedTagId, -1);
        if (up.special)
            patchSpecialFollowCount(-1);
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
            }
            catch (err) {
                setFollowings((prev) => prev.some((item) => item.mid === up.mid) ? prev : [up, ...prev]);
                if (selectedTagId != null)
                    patchFollowTagCount(selectedTagId, 1);
                if (up.special)
                    patchSpecialFollowCount(1);
                setActionMessage(formatError(err));
            }
        })();
    };
    const handleToggleSpecial = async (up, special) => {
        if (specialPendingMid != null)
            return;
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
            }
            else {
                setFollowings((prev) => prev.map((item) => item.mid === up.mid ? { ...item, special } : item));
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
            setActionMessage(special
                ? `已将「${up.uname}」加入特别关注`
                : `已将「${up.uname}」移出特别关注`);
        }
        catch (err) {
            setActionMessage(formatError(err));
        }
        finally {
            setSpecialPendingMid(null);
        }
    };
    const handleTagSaved = (change) => {
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
        if (tagDialogUp &&
            !isLocalMode &&
            selectedTagId != null &&
            selectedTagId !== 0) {
            const wasIn = prev.has(selectedTagId);
            const nowIn = next.has(selectedTagId);
            if (wasIn && !nowIn) {
                setFollowings((list) => list.filter((item) => item.mid !== tagDialogUp.mid));
            }
        }
        setActionMessage("分组已更新");
    };
    const showListLoading = isLocalMode
        ? !listReady
        : !sidebarReady || selectedTagId == null || !listReady || loading;
    const changeSort = (next) => {
        localStorage.setItem(SORT_STORAGE_KEY, next);
        setUpSort(next);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
    };
    useEffect(() => {
        const needRank = upSort === "attention" && isLocalMode && !attentionRank;
        const needAll = upSort === "earliest" && !allFollowings;
        if (!needRank && !needAll)
            return;
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
    const recencyIndex = useMemo(() => new Map((allFollowings ?? []).map((up, index) => [up.mid, index])), [allFollowings]);
    const displayFollowings = useMemo(() => {
        if (upSort === "name") {
            return [...followings].sort((a, b) => a.uname.localeCompare(b.uname, "zh-CN"));
        }
        if (upSort === "earliest") {
            return [...followings].sort((a, b) => (recencyIndex.get(b.mid) ?? -1) - (recencyIndex.get(a.mid) ?? -1));
        }
        if (upSort === "attention" && isLocalMode && attentionRank) {
            const last = attentionRank.size;
            return [...followings].sort((a, b) => (attentionRank.get(a.mid) ?? last) -
                (attentionRank.get(b.mid) ?? last));
        }
        return followings;
    }, [followings, upSort, recencyIndex, isLocalMode, attentionRank]);
    const handleTagRenamed = (tagId, name) => {
        useFollowingStore.getState().renameFollowTagLocal(tagId, name);
    };
    const handleTagDeleted = (tagId) => {
        useFollowingStore.getState().removeFollowTagLocal(tagId);
        void useFollowingStore
            .getState()
            .refreshFollowTags()
            .catch(() => undefined);
        if (selectedTagId === tagId) {
            const fallback = useFollowingStore
                .getState()
                .followTags.find((tag) => tag.tagId !== tagId);
            if (fallback)
                handleSelectTag(fallback.tagId);
        }
    };
    const handleUpGroupRename = async (id, name) => {
        try {
            await window.biliDesk.taxonomy.renameUpGroup(id, name);
            await useFollowingStore.getState().reloadUpGroupTree();
            setActionMessage(`已重命名为「${name}」`);
        }
        catch (err) {
            setActionMessage(formatError(err));
        }
    };
    const handleUpGroupReorder = async (orders) => {
        try {
            for (const ids of orders) {
                await window.biliDesk.taxonomy.reorderUpGroups(ids);
            }
            await useFollowingStore.getState().reloadUpGroupTree();
        }
        catch (err) {
            setActionMessage(formatError(err));
        }
    };
    const fullSortPending = !isLocalMode && needsFullTag && (hasMore || loadingMore);
    return (_jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "flex w-60 shrink-0 flex-col border-r border-border", children: [_jsxs("div", { className: "space-y-3 border-b border-border p-3", children: [_jsx("p", { className: "text-sm font-medium", children: "\u5173\u6CE8" }), _jsx(CreateFollowTagControl, { className: "w-full justify-center", onCreated: (tag) => {
                                    setSidebarMode("bilibili");
                                    handleSelectTag(tag.tagId);
                                } }), _jsxs("div", { className: "flex rounded-lg bg-secondary p-1", children: [_jsx("button", { type: "button", onClick: () => handleSidebarModeChange("bilibili"), className: cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors", sidebarMode === "bilibili"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"), children: "B \u7AD9\u5206\u7EC4" }), _jsx("button", { type: "button", onClick: () => handleSidebarModeChange("local"), className: cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors", sidebarMode === "local"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"), children: "\u672C\u5730\u5206\u7EC4" })] })] }), isLocalMode && (_jsxs("div", { className: "space-y-2 border-b border-border p-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "AI \u4E0E\u89C4\u5219\u667A\u80FD\u5206\u7EC4" }), _jsxs("div", { className: "flex items-center", children: [_jsx(Button, { variant: "ghost", size: "icon", onClick: () => setSyncDialogOpen(true), title: "\u6309\u672C\u5730\u5206\u7C7B\u6574\u7406\u5230\u73B0\u6709 B \u7AD9\u5206\u7EC4\uFF08\u4E0D\u65B0\u5EFA\u5206\u7EC4\uFF09", children: _jsx(Upload, { className: "h-4 w-4" }) }), _jsxs("div", { ref: classifyAnchorRef, children: [_jsx(Button, { variant: "ghost", size: "icon", onClick: openClassifyMenu, title: "\u667A\u80FD\u6574\u7406\u5206\u7EC4", children: _jsx(Sparkles, { className: "h-4 w-4" }) }), classifyMenuOpen && classifyMenuPos && (_jsxs(OverlayPortal, { children: [_jsx("div", { className: cn("fixed inset-0", APP_OVERLAY_ZCLASS), onClick: () => setClassifyMenuOpen(false) }), _jsxs("div", { role: "menu", "data-glass-panel": true, className: cn("bili-glass fixed w-72 space-y-1 rounded-xl border border-border bg-card p-1.5 text-left shadow-2xl", APP_OVERLAY_ZCLASS), style: {
                                                                    top: classifyMenuPos.top,
                                                                    left: classifyMenuPos.left,
                                                                }, children: [_jsxs("button", { type: "button", onClick: () => void runAiClassify("shallow"), className: "w-full rounded-lg px-2.5 py-2 text-left hover:bg-secondary", children: [_jsx("div", { className: "text-sm font-medium text-foreground", children: "\u6D45\u5C42\u6574\u7406" }), _jsx("div", { className: "mt-0.5 text-xs leading-relaxed text-muted-foreground", children: "\u5224\u65AD\u65B0\u5173\u6CE8\u7684\uFF0C\u5E76\u91CD\u5224\u672A\u5206\u7EC4\u548C\u4F4E\u628A\u63E1\u7684\uFF1B\u5DF2\u7ECF\u786E\u5B9A\u7684\u5206\u7EC4\u6CBF\u7528\u4E0A\u6B21\u7ED3\u679C\u3002" })] }), _jsxs("button", { type: "button", onClick: () => void runAiClassify("deep"), className: "w-full rounded-lg px-2.5 py-2 text-left hover:bg-secondary", children: [_jsxs("div", { className: "text-sm font-medium text-foreground", children: ["\u6DF1\u5EA6\u6574\u7406", classifyInfo?.deepPending && (_jsx("span", { className: "ml-1.5 text-xs font-normal text-primary", children: "\u63A5\u7740\u4E0A\u6B21\u7EE7\u7EED" }))] }), _jsx("div", { className: "mt-0.5 text-xs leading-relaxed text-muted-foreground", children: "\u6309\u5F53\u524D\u89C4\u5219\u91CD\u65B0\u5224\u65AD\u5168\u90E8 UP\uFF0C\u5206\u7C7B\u89C4\u5219\u66F4\u65B0\u540E\u7528\u3002\u4E2D\u9014\u505C\u4E86\u4E0B\u6B21\u4F1A\u63A5\u7740\u8DD1\u3002" })] }), classifyInfo && classifyInfo.stale > 0 && (_jsxs("p", { className: "rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-400", children: ["\u5206\u7C7B\u89C4\u5219\u5DF2\u66F4\u65B0\uFF0C\u6709 ", classifyInfo.stale, " \u4F4D UP \u8FD8\u662F\u65E7\u89C4\u5219\u7684\u7ED3\u679C\uFF0C\u5EFA\u8BAE\u505A\u4E00\u6B21\u6DF1\u5EA6\u6574\u7406\u3002"] })), classifyInfo && (_jsxs("p", { className: "px-2.5 pb-0.5 text-[11px] text-muted-foreground", children: ["\u5DF2\u7F13\u5B58 ", classifyInfo.cached, " \u4F4D UP \u7684\u5206\u7C7B"] }))] })] }))] })] })] }), taskMessage && (_jsx("p", { className: "text-xs text-muted-foreground", children: taskMessage }))] })), _jsx("div", { className: "scrollbar-none flex-1 overflow-y-auto p-2", children: sidebarMode === "bilibili" ? (_jsx(FollowTagList, { tags: followTags, selectedTagId: selectedTagId, onSelect: handleSelectTag, onRenamed: handleTagRenamed, onDeleted: handleTagDeleted, onMessage: setActionMessage })) : (_jsx(UpGroupTree, { tree: upGroupTree, selection: localSelection, uncategorizedCount: uncategorizedCount, onSelect: handleSelectLocalGroup, onRename: (id, name) => void handleUpGroupRename(id, name), onReorder: (orders) => void handleUpGroupReorder(orders) })) })] }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground", children: [_jsx(FollowingSearch, { className: "w-full max-w-sm flex-1", followings: allFollowings, assignments: assignments, biliTagByMid: biliTagByMid, loading: followingsLoading, onPickLocal: handleSearchPick }), _jsxs("div", { className: "min-w-0 flex-1 truncate", children: [portraitOpen ? (_jsx(_Fragment, { children: "\u9886\u57DF\u753B\u50CF\uFF1A\u4E00\u4E2A\u70B9\u662F\u4E00\u4E2A\u65B9\u5411\uFF0C\u653E\u5927\u540E\u62C6\u6210\u66F4\u7EC6\u7684\u9886\u57DF\u548C\u5177\u4F53 UP" })) : isLocalMode ? (_jsxs(_Fragment, { children: ["\u672C\u5730\u5206\u7EC4\u300C", localSelectionLabel, "\u300D\uFF1A\u5171 ", followings.length, " \u4E2A UP"] })) : (_jsxs(_Fragment, { children: ["B \u7AD9\u5206\u7EC4\u300C", selectedTag?.name ?? "...", "\u300D\uFF1A\u5DF2\u52A0\u8F7D", " ", followings.length, selectedTag ? ` / ${selectedTag.count}` : "", " \u4E2A UP"] })), actionMessage && (_jsx("span", { className: "ml-2 text-foreground", children: actionMessage }))] }), _jsxs("button", { type: "button", onClick: () => setPortraitOpen((open) => !open), className: cn("flex h-7 shrink-0 items-center gap-1 rounded-md border px-2", portraitOpen
                                    ? "border-primary bg-primary/15 text-foreground"
                                    : "border-border text-muted-foreground hover:text-foreground"), children: [_jsx(Network, { className: "h-3.5 w-3.5" }), "\u9886\u57DF\u753B\u50CF"] }), !portraitOpen && (sortLoading || fullSortPending) && (_jsxs("span", { className: "flex shrink-0 items-center gap-1", children: [_jsx(Loader2, { className: "h-3 w-3 animate-spin" }), fullSortPending ? "正在拉取整组以排序…" : "正在准备排序…"] })), !portraitOpen && (_jsxs("label", { className: "flex shrink-0 items-center gap-1.5", children: ["\u6392\u5E8F", _jsx("select", { value: upSort, onChange: (event) => changeSort(event.target.value), className: "h-7 rounded-md border border-border bg-background/70 px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30", children: SORT_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }))] }), portraitOpen ? (_jsx(UpPortraitMap, { focus: portraitFocus })) : (_jsxs("div", { ref: scrollRef, className: "scrollbar-none flex-1 overflow-y-auto", children: [showListLoading ? (_jsxs("div", { className: "flex items-center justify-center py-16 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), isLocalMode && followingsLoading && followingsProgress > 0
                                        ? `正在从 B 站同步关注列表，已拿到 ${followingsProgress} 位（首次较慢，之后秒开）…`
                                        : "加载关注列表..."] })) : (_jsxs("div", { className: "grid grid-cols-1 gap-3 p-6 md:grid-cols-2 xl:grid-cols-3", children: [displayFollowings.map((up) => (_jsx(FollowingUpCard, { up: up, showGroupActions: !isLocalMode, isSpecial: Boolean(up.special) || inSpecialGroup, specialPending: specialPendingMid === up.mid, highlighted: highlightMid === up.mid, onSetGroup: setTagDialogUp, onToggleSpecial: (target, next) => void handleToggleSpecial(target, next), onUnfollow: (up) => {
                                            setUnfollowError("");
                                            setUnfollowTarget(up);
                                        } }, up.mid))), followings.length === 0 && (_jsx("p", { className: "col-span-full py-8 text-center text-sm text-muted-foreground", children: error ||
                                            (isLocalMode
                                                ? "该本地分组暂无成员，可点击上方 ✨ 运行智能分组"
                                                : "该分组暂无关注的 UP") }))] })), !isLocalMode &&
                                (hasMore || loadingMore) &&
                                followings.length > 0 && (_jsx("div", { ref: sentinelRef, className: "flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground", children: loadingMore ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u66F4\u591A..."] })) : ("继续下滑加载更多") }))] }))] }), _jsx(FollowTagDialog, { up: tagDialogUp, tags: followTags, onClose: () => setTagDialogUp(null), onSaved: handleTagSaved }), _jsx(UnfollowConfirmDialog, { up: unfollowTarget, loading: unfollowing, error: unfollowError, onConfirm: () => void handleUnfollow(), onCancel: () => {
                    if (!unfollowing) {
                        setUnfollowError("");
                        setUnfollowTarget(null);
                    }
                } }), _jsx(FollowTagSyncDialog, { open: syncDialogOpen, onClose: () => setSyncDialogOpen(false) })] }));
}
