import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { VideoCard } from "@/components/video/VideoCard";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { UpRelationListPanel } from "@/features/up/UpRelationListPanel";
import { UpSpaceChargePanel } from "@/features/up/UpSpaceChargePanel";
import { UpSpaceCoursePanel } from "@/features/up/UpSpaceCoursePanel";
import { UpSpaceCollectionsPanel } from "@/features/up/UpSpaceCollectionsPanel";
import { UpSpaceDynamicsPanel } from "@/features/up/UpSpaceDynamicsPanel";
import { SpaceTabBar } from "@/components/space/SpaceTabBar";
import { UpSpaceHeader } from "@/features/up/UpSpaceHeader";
import { UpSpaceHome } from "@/features/up/UpSpaceHome";
import { UpSpaceOpusPanel } from "@/features/up/UpSpaceOpusPanel";
import { cn } from "@/lib/utils";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { ErrorState } from "@/components/ui/content-unavailable";
import { upProfileCache, upRelationCache, upSpaceCache, upVideosCacheKey, } from "@/lib/session-data-cache";
import { useAppStore } from "@/stores/app-store";
const GRID_COLS_CLASS = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
};
const ORDER_OPTIONS = [
    { value: "pubdate", label: "按时间" },
    { value: "click", label: "按播放量" },
];
const PAGE_SIZE = 30;
function parseMid(value) {
    if (!value)
        return 0;
    const mid = Number(value);
    return Number.isFinite(mid) && mid > 0 ? mid : 0;
}
export function UpSpacePage() {
    const { mid: midParam } = useParams();
    const mid = parseMid(midParam);
    const homeGridColumns = useAppStore((state) => state.homeGridColumns);
    const currentMid = useAppStore((state) => state.user?.mid ?? 0);
    const scrollRef = useRef(null);
    const loadSeqRef = useRef(0);
    const [profile, setProfile] = useState(null);
    const [relation, setRelation] = useState(null);
    const [videos, setVideos] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [order, setOrder] = useState("pubdate");
    const [videoKeyword, setVideoKeyword] = useState("");
    const [videoKeywordInput, setVideoKeywordInput] = useState("");
    const [videoSpecial, setVideoSpecial] = useState("");
    const [videoSpecials, setVideoSpecials] = useState([]);
    const [allVideoTotal, setAllVideoTotal] = useState(0);
    const [profileError, setProfileError] = useState("");
    const [videosError, setVideosError] = useState("");
    const [videosLoading, setVideosLoading] = useState(true);
    const [relationPanel, setRelationPanel] = useState(null);
    const [toast, setToast] = useState("");
    const toastTimerRef = useRef(null);
    const [tab, setTab] = useState("home");
    const [opusPreview, setOpusPreview] = useState([]);
    const [collectionPreview, setCollectionPreview] = useState([]);
    const [showDynamics, setShowDynamics] = useState(true);
    const [showOpus, setShowOpus] = useState(false);
    const [showCollections, setShowCollections] = useState(false);
    const [showCharge, setShowCharge] = useState(false);
    const showToast = useCallback((message) => {
        setToast(message);
        if (toastTimerRef.current)
            clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(""), 2600);
    }, []);
    useEffect(() => {
        return () => {
            if (toastTimerRef.current)
                clearTimeout(toastTimerRef.current);
        };
    }, []);
    const totalPages = useMemo(() => {
        if (total > 0)
            return Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (hasMore)
            return Math.max(page + 1, 1);
        return Math.max(page, 1);
    }, [total, hasMore, page]);
    const loadVideos = useCallback(async (targetMid, nextPage, nextOrder, keyword = "", specialType = "") => {
        const kw = keyword.trim();
        const special = specialType.trim();
        // 搜索结果不走空间缓存，避免和全量投稿互相覆盖
        if (!kw) {
            const cachedSpace = upSpaceCache.get(String(targetMid));
            const cachedPage = cachedSpace?.videos[upVideosCacheKey(nextOrder, nextPage, special)];
            if (cachedPage &&
                (special ||
                    cachedPage.specialsKnown ||
                    (cachedPage.specials?.length ?? 0) > 0)) {
                loadSeqRef.current += 1;
                setVideos(cachedPage.videos);
                setPage(cachedPage.page);
                setTotal(cachedPage.total);
                setHasMore(cachedPage.hasMore);
                if (!special && Array.isArray(cachedPage.specials)) {
                    setVideoSpecials(cachedPage.specials);
                    setAllVideoTotal(cachedPage.total);
                }
                setVideosError("");
                setVideosLoading(false);
                scrollRef.current?.scrollTo({ top: 0 });
                return;
            }
        }
        const seq = ++loadSeqRef.current;
        setVideosLoading(true);
        setVideosError("");
        try {
            const result = await window.biliDesk.bili.getUpVideos(targetMid, nextPage, nextOrder, kw, special);
            if (seq !== loadSeqRef.current)
                return;
            const list = result.videos ?? [];
            const emptyOk = (Boolean(kw) && (result.total ?? 0) === 0) ||
                (Boolean(special) && (result.total ?? 0) === 0);
            if (list.length > 0 || emptyOk) {
                const profileTotal = upSpaceCache.get(String(targetMid))?.profile.videos ?? 0;
                const nextTotal = special || kw
                    ? (result.total ?? list.length)
                    : Math.max(result.total ?? 0, profileTotal);
                const nextHasMore = Boolean(result.hasMore);
                setVideos(list);
                setPage(result.page ?? nextPage);
                setTotal(nextTotal);
                setHasMore(nextHasMore);
                if (!special && Array.isArray(result.specials)) {
                    setVideoSpecials(result.specials);
                    if (list.length > 0)
                        setAllVideoTotal(nextTotal);
                }
                setVideosError("");
                scrollRef.current?.scrollTo({ top: 0 });
                if (!kw) {
                    const current = upSpaceCache.get(String(targetMid));
                    if (current) {
                        const cacheKey = upVideosCacheKey(nextOrder, nextPage, special);
                        const prev = current.videos[cacheKey];
                        const nextSpecials = special
                            ? prev?.specials
                            : (result.specials ?? prev?.specials);
                        const nextKnown = special
                            ? Boolean(prev?.specialsKnown)
                            : Boolean(result.specialsKnown ||
                                prev?.specialsKnown ||
                                (nextSpecials?.length ?? 0) > 0);
                        const videos = { ...current.videos };
                        if (!special && !nextKnown) {
                            delete videos[cacheKey];
                        }
                        else {
                            videos[cacheKey] = {
                                videos: list,
                                page: result.page ?? nextPage,
                                total: nextTotal,
                                hasMore: nextHasMore,
                                specials: nextSpecials,
                                specialsKnown: nextKnown,
                            };
                        }
                        upSpaceCache.set(String(targetMid), {
                            ...current,
                            videos,
                        });
                    }
                }
            }
            else {
                // 空成功不覆盖当前页，避免「有时有、有时暂无」
                setVideosError(kw ? "没有搜到相关投稿" : "本页投稿暂时无法获取，请点击重新加载");
                if (kw || special) {
                    setVideos([]);
                    setTotal(0);
                    setHasMore(false);
                }
            }
        }
        catch (e) {
            if (seq !== loadSeqRef.current)
                return;
            // 翻页失败时保留当前页内容，避免整页被清空
            setVideosError(formatUserSpaceError(e));
            if (special && nextPage === 1) {
                setVideos([]);
                setTotal(0);
                setHasMore(false);
            }
        }
        finally {
            if (seq === loadSeqRef.current)
                setVideosLoading(false);
        }
    }, []);
    useEffect(() => {
        if (!mid)
            return;
        let cancelled = false;
        loadSeqRef.current += 1;
        setProfileError("");
        setVideosError("");
        setRelationPanel(null);
        setOrder("pubdate");
        setVideoKeyword("");
        setVideoKeywordInput("");
        setVideoSpecial("");
        setVideoSpecials([]);
        setAllVideoTotal(0);
        setTab("home");
        setOpusPreview([]);
        setCollectionPreview([]);
        setShowDynamics(true);
        setShowOpus(false);
        setShowCollections(false);
        setShowCharge(false);
        const cached = upSpaceCache.get(String(mid));
        const firstPage = cached?.videos[upVideosCacheKey("pubdate", 1)];
        const specialsReady = Boolean(firstPage?.specialsKnown) ||
            (firstPage?.specials?.length ?? 0) > 0;
        if (cached && firstPage && specialsReady) {
            setProfile(cached.profile);
            setRelation(cached.relation);
            setVideos(firstPage.videos);
            setPage(firstPage.page);
            setTotal(firstPage.total);
            setHasMore(firstPage.hasMore);
            setVideoSpecials(firstPage.specials ?? []);
            setAllVideoTotal(firstPage.total);
            setVideosLoading(false);
            setVideosError(firstPage.videos.length === 0 && (cached.profile.videos || 0) > 0
                ? "投稿列表暂时无法获取，请点击重新加载"
                : "");
            void window.biliDesk.bili
                .getUpProfile(mid)
                .then((upProfile) => {
                if (cancelled)
                    return;
                setProfile(upProfile);
                upProfileCache.set(String(mid), upProfile);
                const space = upSpaceCache.get(String(mid));
                if (space) {
                    upSpaceCache.set(String(mid), { ...space, profile: upProfile });
                }
            })
                .catch(() => undefined);
            if (cached.relation?.special === undefined) {
                void window.biliDesk.bili
                    .getUpRelation(mid)
                    .then((upRelation) => {
                    if (cancelled)
                        return;
                    setRelation(upRelation);
                    upRelationCache.set(String(mid), upRelation);
                    const space = upSpaceCache.get(String(mid));
                    if (space) {
                        upSpaceCache.set(String(mid), { ...space, relation: upRelation });
                    }
                })
                    .catch(() => undefined);
            }
            return () => {
                cancelled = true;
            };
        }
        setVideosLoading(true);
        if (!cached) {
            setProfile(null);
            setRelation(null);
            setVideos([]);
            setPage(1);
            setTotal(0);
            setHasMore(false);
        }
        else {
            setProfile(cached.profile);
            setRelation(cached.relation);
        }
        void (async () => {
            try {
                const profilePromise = cached
                    ? Promise.resolve(cached.profile)
                    : window.biliDesk.bili.getUpProfile(mid);
                const videosPromise = window.biliDesk.bili.getUpVideos(mid, 1, "pubdate");
                const relationPromise = cached?.relation && cached.relation.special !== undefined
                    ? Promise.resolve(cached.relation)
                    : window.biliDesk.bili
                        .getUpRelation(mid)
                        .catch(() => ({ isFollowing: false, attribute: 0 }));
                const upProfile = await profilePromise;
                if (cancelled)
                    return;
                setProfile(upProfile);
                upProfileCache.set(String(mid), upProfile);
                void relationPromise.then((upRelation) => {
                    if (!cancelled) {
                        setRelation(upRelation);
                        upRelationCache.set(String(mid), upRelation);
                    }
                });
                try {
                    const result = await videosPromise;
                    if (cancelled)
                        return;
                    const list = result.videos ?? [];
                    setVideos(list);
                    setPage(result.page ?? 1);
                    let nextTotal = 0;
                    let nextHasMore = false;
                    // 列表为空时不要用资料页投稿数撑分页，否则会出现「暂无投稿 + 共 N 页」
                    if (list.length > 0) {
                        nextTotal = Math.max(result.total ?? 0, upProfile.videos || 0);
                        nextHasMore = Boolean(result.hasMore);
                        setTotal(nextTotal);
                        setHasMore(nextHasMore);
                        setAllVideoTotal(nextTotal);
                        if (Array.isArray(result.specials))
                            setVideoSpecials(result.specials);
                        setVideosError("");
                    }
                    else if ((upProfile.videos || 0) > 0) {
                        setTotal(0);
                        setHasMore(false);
                        setVideosError("投稿列表暂时无法获取，请点击重新加载");
                    }
                    else {
                        setTotal(0);
                        setHasMore(false);
                        setVideosError("");
                    }
                    const relation = (await relationPromise.catch(() => cached?.relation ?? null)) ??
                        null;
                    const known = Boolean(result.specialsKnown) || (result.specials?.length ?? 0) > 0;
                    upSpaceCache.set(String(mid), {
                        profile: upProfile,
                        relation,
                        videos: known
                            ? {
                                [upVideosCacheKey("pubdate", 1)]: {
                                    videos: list,
                                    page: result.page ?? 1,
                                    total: nextTotal,
                                    hasMore: nextHasMore,
                                    specials: result.specials,
                                    specialsKnown: true,
                                },
                            }
                            : {},
                    });
                }
                catch (videoErr) {
                    if (cancelled)
                        return;
                    setVideos([]);
                    setHasMore(false);
                    setVideosError(formatUserSpaceError(videoErr));
                }
            }
            catch (e) {
                if (cancelled)
                    return;
                setProfileError(formatUserSpaceError(e));
            }
            finally {
                if (!cancelled)
                    setVideosLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mid]);
    useEffect(() => {
        if (!mid || !profile)
            return;
        let cancelled = false;
        setShowOpus((profile.opusCount ?? 0) > 0 || (profile.articleCount ?? 0) > 0);
        setShowCollections((profile.seasonCount ?? 0) > 0);
        setShowCharge(Boolean(profile.upowerEnabled));
        void (async () => {
            const [opus, collections, dynamics] = await Promise.allSettled([
                window.biliDesk.bili.getSpaceOpus(mid),
                window.biliDesk.bili.getUserCollections(mid, 1),
                window.biliDesk.bili.getSpaceDynamics(mid),
            ]);
            if (cancelled)
                return;
            if (opus.status === "fulfilled") {
                setOpusPreview(opus.value.items);
                if (opus.value.items.length > 0)
                    setShowOpus(true);
            }
            else {
                const message = formatUserSpaceError(opus.reason);
                if (message.includes("隐私") ||
                    message.includes("无法查看") ||
                    message.includes("不可见")) {
                    setShowOpus(false);
                }
            }
            if (collections.status === "fulfilled") {
                const list = [
                    ...collections.value.seasons,
                    ...collections.value.series,
                ];
                setCollectionPreview(list);
                if (list.length > 0)
                    setShowCollections(true);
                if (list.some((item) => /充电|专属|upower/i.test(item.title))) {
                    setShowCharge(true);
                }
            }
            if (dynamics.status === "rejected") {
                const message = formatUserSpaceError(dynamics.reason);
                if (message.includes("隐私") ||
                    message.includes("无法查看") ||
                    message.includes("不可见")) {
                    setShowDynamics(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mid, profile?.mid]);
    const handleOrderChange = (nextOrder) => {
        if (!mid || nextOrder === order || videosLoading)
            return;
        setOrder(nextOrder);
        void loadVideos(mid, 1, nextOrder, videoKeyword, videoSpecial);
    };
    const submitVideoSearch = () => {
        if (!mid || videosLoading)
            return;
        const next = videoKeywordInput.trim();
        setVideoKeyword(next);
        void loadVideos(mid, 1, order, next, videoSpecial);
    };
    const clearVideoSearch = () => {
        if (!mid || videosLoading)
            return;
        setVideoKeywordInput("");
        setVideoKeyword("");
        void loadVideos(mid, 1, order, "", videoSpecial);
    };
    const selectVideoSpecial = (next) => {
        if (!mid || videosLoading || next === videoSpecial)
            return;
        setVideoSpecial(next);
        setVideos([]);
        void loadVideos(mid, 1, order, videoKeyword, next);
    };
    const goToPage = (nextPage) => {
        if (!mid || videosLoading || nextPage < 1 || nextPage === page)
            return;
        if (nextPage > totalPages && !hasMore)
            return;
        void loadVideos(mid, nextPage, order, videoKeyword, videoSpecial);
    };
    useEffect(() => {
        if (!mid || tab === "videos" || !videoSpecial)
            return;
        setVideoSpecial("");
        void loadVideos(mid, 1, order, videoKeyword, "");
    }, [loadVideos, mid, order, tab, videoKeyword, videoSpecial]);
    const openRelationList = useCallback((type) => {
        setRelationPanel(type);
    }, []);
    const closeRelationList = useCallback(() => {
        setRelationPanel(null);
    }, []);
    const spaceTabs = useMemo(() => {
        const items = [
            { id: "home", label: "主页" },
        ];
        if (showDynamics)
            items.push({ id: "dynamics", label: "动态" });
        if (showOpus)
            items.push({ id: "opus", label: "图文", count: profile?.opusCount });
        items.push({ id: "videos", label: "投稿", count: profile?.videos });
        if (showCollections)
            items.push({
                id: "collections",
                label: "合集",
                count: profile?.seasonCount,
            });
        if ((profile?.pugvCount ?? 0) > 0) {
            items.push({
                id: "cheese",
                label: "课堂",
                count: profile?.pugvCount,
            });
        }
        if (showCharge)
            items.push({ id: "charge", label: "充电" });
        return items;
    }, [profile, showCharge, showCollections, showDynamics, showOpus]);
    useEffect(() => {
        if (!spaceTabs.some((item) => item.id === tab))
            setTab("home");
    }, [spaceTabs, tab]);
    if (!mid) {
        return (_jsx(ErrorState, { error: "\u65E0\u6548\u7684 UP \u4E3B ID", hint: "user", fallback: "\u8FD9\u4E2A\u7528\u6237\u94FE\u63A5\u65E0\u6548\u3002" }));
    }
    if (profileError && !profile) {
        return (_jsx(ErrorState, { error: profileError, hint: "user", fallback: "\u8FD9\u4E2A\u7528\u6237\u6682\u65F6\u65E0\u6CD5\u8BBF\u95EE\uFF0C\u53EF\u80FD\u5DF2\u6CE8\u9500\u6216\u4E0D\u5B58\u5728\u3002" }));
    }
    if (!profile) {
        return (_jsx("div", { className: "flex h-full items-center justify-center text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." }));
    }
    const videosSection = (_jsxs("section", { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-3", children: [_jsx("h2", { className: "text-lg font-medium", children: "\u6295\u7A3F\u89C6\u9891" }), _jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [_jsxs("form", { className: "flex items-center gap-1.5", onSubmit: (event) => {
                                    event.preventDefault();
                                    submitVideoSearch();
                                }, children: [_jsx("input", { value: videoKeywordInput, onChange: (event) => setVideoKeywordInput(event.target.value), placeholder: "\u641C\u7D22\u6295\u7A3F", className: "h-8 w-40 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary sm:w-52" }), _jsx(Button, { type: "submit", size: "sm", variant: "outline", disabled: videosLoading, children: "\u641C\u7D22" }), videoKeyword ? (_jsx(Button, { type: "button", size: "sm", variant: "ghost", disabled: videosLoading, onClick: clearVideoSearch, children: "\u6E05\u7A7A" })) : null] }), ORDER_OPTIONS.map((option) => (_jsx(Button, { type: "button", size: "sm", variant: order === option.value ? "default" : "outline", disabled: videosLoading, onClick: () => handleOrderChange(option.value), children: option.label }, option.value)))] })] }), videoSpecials.length > 0 ? (_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsxs("button", { type: "button", disabled: videosLoading, onClick: () => selectVideoSpecial(""), className: cn("rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-60", videoSpecial === ""
                            ? "bg-[#00aeec] text-white"
                            : "bg-secondary text-foreground hover:bg-secondary/80"), children: ["\u5168\u90E8\u7C7B\u578B ", allVideoTotal || profile.videos || ""] }), videoSpecials.map((item) => (_jsxs("button", { type: "button", disabled: videosLoading, onClick: () => selectVideoSpecial(item.type), className: cn("rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-60", videoSpecial === item.type
                            ? "bg-[#00aeec] text-white"
                            : "bg-secondary text-foreground hover:bg-secondary/80"), children: [item.name, " ", item.count] }, item.type)))] })) : null, videosLoading && videos.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u6295\u7A3F\u4E2D..." })) : videosError && videos.length === 0 ? (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-red-400", children: videosError }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void loadVideos(mid, page, order, videoKeyword, videoSpecial), children: "\u91CD\u65B0\u52A0\u8F7D" })] })) : videos.length > 0 ? (_jsx("div", { className: cn("grid gap-4", GRID_COLS_CLASS[homeGridColumns], videosLoading && "opacity-60"), children: videos.map((video) => (_jsx(VideoCard, { video: video }, video.bvid))) })) : (profile.videos ?? 0) > 0 && !videoKeyword && !videoSpecial ? (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-red-400", children: "\u6295\u7A3F\u5217\u8868\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\uFF0C\u8BF7\u70B9\u51FB\u91CD\u65B0\u52A0\u8F7D" }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void loadVideos(mid, 1, order, videoKeyword, videoSpecial), children: "\u91CD\u65B0\u52A0\u8F7D" })] })) : (_jsx("p", { className: "text-sm text-muted-foreground", children: videoKeyword
                    ? "没有搜到相关投稿"
                    : videoSpecial
                        ? `没有${videoSpecials.find((item) => item.type === videoSpecial)?.name ?? "这类"}视频`
                        : "暂无投稿" })), videosError && videos.length > 0 && (_jsx("p", { className: "mt-3 text-sm text-red-400", children: videosError }))] }));
    return (_jsxs("div", { className: "flex h-full flex-col overflow-hidden", children: [_jsx(PageBackHeader, {}), _jsxs("div", { ref: scrollRef, className: "min-h-0 flex-1 overflow-y-auto", children: [_jsx(UpSpaceHeader, { profile: profile, relation: relation, currentMid: currentMid, onOpenRelation: openRelationList, onRelationChange: (following) => {
                            setRelation((prev) => {
                                const next = prev
                                    ? {
                                        ...prev,
                                        isFollowing: following,
                                        special: following ? prev.special : false,
                                    }
                                    : { isFollowing: following, attribute: 0, special: false };
                                upRelationCache.set(String(mid), next);
                                const space = upSpaceCache.get(String(mid));
                                if (space) {
                                    upSpaceCache.set(String(mid), {
                                        ...space,
                                        relation: next,
                                    });
                                }
                                return next;
                            });
                        }, onSpecialChange: (special) => {
                            setRelation((prev) => {
                                const next = prev
                                    ? { ...prev, special }
                                    : { isFollowing: true, attribute: 2, special };
                                upRelationCache.set(String(mid), next);
                                const space = upSpaceCache.get(String(mid));
                                if (space) {
                                    upSpaceCache.set(String(mid), {
                                        ...space,
                                        relation: next,
                                    });
                                }
                                return next;
                            });
                        }, onError: showToast }), _jsx("div", { className: "sticky top-0 z-10 bg-background/90 backdrop-blur", children: _jsx("div", { className: "mx-auto max-w-5xl px-6", children: _jsx(SpaceTabBar, { tabs: spaceTabs, value: tab, onChange: setTab }) }) }), _jsxs("div", { className: "mx-auto max-w-5xl space-y-6 px-6 py-6", children: [profileError && (_jsx("p", { className: "text-sm text-red-400", children: profileError })), tab === "home" &&
                                (videosLoading &&
                                    videos.length === 0 &&
                                    opusPreview.length === 0 &&
                                    collectionPreview.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4E3B\u9875..." })) : (_jsx(UpSpaceHome, { videos: videos, videoCount: total || profile.videos, opus: opusPreview, opusCount: profile.opusCount ?? opusPreview.length, collections: collectionPreview, collectionCount: profile.seasonCount ?? collectionPreview.length, gridClass: GRID_COLS_CLASS[homeGridColumns], onOpenTab: (next) => setTab(next) }))), tab === "dynamics" && (_jsx(UpSpaceDynamicsPanel, { mid: mid, name: profile.name, face: profile.face })), tab === "opus" && _jsx(UpSpaceOpusPanel, { mid: mid }), tab === "videos" && videosSection, tab === "collections" && _jsx(UpSpaceCollectionsPanel, { mid: mid }), tab === "cheese" && _jsx(UpSpaceCoursePanel, { mid: mid }), tab === "charge" && (_jsx(UpSpaceChargePanel, { mid: mid, enabled: profile.upowerEnabled }))] })] }), tab === "videos" &&
                videos.length > 0 &&
                (totalPages > 1 || hasMore || page > 1) && (_jsx(PaginationBar, { variant: "pages", page: page, totalPages: totalPages, totalCount: total, disabled: videosLoading, disableNext: !hasMore && page >= totalPages, openEnded: total <= 0 && hasMore, onPageChange: goToPage })), relationPanel && (_jsx(UpRelationListPanel, { mid: mid, type: relationPanel, ownerName: profile.name, onClose: closeRelationList, onPrivacyBlocked: showToast })), toast &&
                typeof document !== "undefined" &&
                createPortal(_jsx("div", { className: `pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/40 bg-black/85 px-5 py-3 text-sm font-semibold text-white shadow-2xl ${APP_OVERLAY_ZCLASS}`, children: toast }), document.body)] }));
}
