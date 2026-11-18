import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLogout } from "@/lib/use-logout";
import { useAppStore } from "@/stores/app-store";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video/VideoCard";
import { SpaceTabBar } from "@/components/space/SpaceTabBar";
import { formatCount } from "@/lib/utils";
import { extractIpcErrorMessage, formatUserSpaceError } from "@/lib/ipc-error";
import { ErrorState } from "@/components/ui/content-unavailable";
import { imageFilesToPayload } from "@/components/comment/comment-images";
import { upProfileCache } from "@/lib/session-data-cache";
import { MyCheesePanel, MyUpowerPanel } from "./MyCheesePanel";
import { MyCollectionsPanel } from "./MyCollectionsPanel";
import { MyDynamicsPanel } from "./MyDynamicsPanel";
import { MyFavoritesPanel } from "./MyFavoritesPanel";
import { MyFollowPanel } from "./MyFollowPanel";
import { MyAccountPanel } from "./MyAccountPanel";
import { Bookmark, Crown, GraduationCap, Home, Layers, Loader2, LogOut, Pencil, Radio, RefreshCw, Settings, Video, Zap, } from "lucide-react";
function normalizeUpVideosPage(data) {
    if (Array.isArray(data)) {
        return { videos: data, page: 1, hasMore: data.length >= 30 };
    }
    const payload = data;
    const videos = payload?.videos ?? [];
    return {
        videos,
        page: payload?.page ?? 1,
        hasMore: payload?.hasMore ?? videos.length >= 30,
    };
}
const TABS = [
    { id: "home", label: "主页", icon: Home },
    { id: "dynamics", label: "动态", icon: Radio },
    { id: "videos", label: "投稿", icon: Video },
    { id: "collections", label: "合集", icon: Layers },
    { id: "favorites", label: "收藏", icon: Bookmark },
    { id: "follow", label: "追更", icon: RefreshCw },
    { id: "cheese", label: "课堂", icon: GraduationCap },
    { id: "upower", label: "充电", icon: Zap },
    { id: "account", label: "账号", icon: Crown },
];
export function MyPage() {
    const user = useAppStore((state) => state.user);
    const setUser = useAppStore((state) => state.setUser);
    const logout = useLogout();
    const mid = user?.mid ?? 0;
    const scrollRef = useRef(null);
    const sentinelRef = useRef(null);
    const [tab, setTab] = useState("home");
    const [visitedTabs, setVisitedTabs] = useState(() => new Set(["home"]));
    const [profile, setProfile] = useState(null);
    const [profileError, setProfileError] = useState("");
    const [profileLoading, setProfileLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState("");
    const [draftSign, setDraftSign] = useState("");
    const [profileBusy, setProfileBusy] = useState(false);
    const [profileTip, setProfileTip] = useState("");
    const [bcoin, setBcoin] = useState("");
    const [videos, setVideos] = useState([]);
    const [videoPage, setVideoPage] = useState(1);
    const [videoHasMore, setVideoHasMore] = useState(false);
    const [videosLoading, setVideosLoading] = useState(false);
    const [videosError, setVideosError] = useState("");
    const [loadingMore, setLoadingMore] = useState(false);
    useEffect(() => {
        if (!user?.isLogin)
            return;
        let cancelled = false;
        void window.biliDesk.bili
            .getWallet()
            .then((wallet) => {
            if (!cancelled)
                setBcoin(wallet.bcoin);
        })
            .catch(() => {
            if (!cancelled)
                setBcoin("");
        });
        return () => {
            cancelled = true;
        };
    }, [user?.isLogin]);
    useEffect(() => {
        if (!user?.isLogin || !mid) {
            setProfileLoading(false);
            return;
        }
        const cached = upProfileCache.get(String(mid));
        if (cached) {
            setProfile(cached);
            setProfileLoading(false);
            setProfileError("");
            return;
        }
        let cancelled = false;
        setProfileLoading(true);
        setProfileError("");
        void window.biliDesk.bili
            .getUpProfile(mid)
            .then((data) => {
            if (!cancelled) {
                setProfile(data);
                upProfileCache.set(String(mid), data);
            }
        })
            .catch((err) => {
            if (!cancelled)
                setProfileError(formatUserSpaceError(err));
        })
            .finally(() => {
            if (!cancelled)
                setProfileLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [user?.isLogin, mid]);
    const loadVideos = useCallback(async (nextPage, append) => {
        if (!mid)
            return;
        if (append)
            setLoadingMore(true);
        else
            setVideosLoading(true);
        setVideosError("");
        try {
            const result = normalizeUpVideosPage(await window.biliDesk.bili.getUpVideos(mid, nextPage));
            setVideos((prev) => {
                if (!append)
                    return result.videos;
                const seen = new Set(prev.map((item) => item.bvid));
                const merged = [...prev];
                for (const item of result.videos) {
                    if (!seen.has(item.bvid))
                        merged.push(item);
                }
                return merged;
            });
            setVideoPage(result.page);
            setVideoHasMore(result.hasMore);
        }
        catch (err) {
            setVideosError(formatUserSpaceError(err));
        }
        finally {
            setVideosLoading(false);
            setLoadingMore(false);
        }
    }, [mid]);
    useEffect(() => {
        if (!mid || (tab !== "home" && tab !== "videos"))
            return;
        if (tab === "home" && videos.length > 0)
            return;
        if (tab === "videos" && videos.length > 0)
            return;
        void loadVideos(1, false);
    }, [mid, tab, loadVideos, videos.length]);
    const openTab = (next) => {
        setTab(next);
        setVisitedTabs((prev) => {
            if (prev.has(next))
                return prev;
            const copy = new Set(prev);
            copy.add(next);
            return copy;
        });
    };
    const loadMoreVideos = useCallback(async () => {
        if (!videoHasMore || loadingMore || videosLoading)
            return;
        await loadVideos(videoPage + 1, true);
    }, [videoHasMore, loadingMore, videosLoading, loadVideos, videoPage]);
    useEffect(() => {
        if (tab !== "videos")
            return;
        const root = scrollRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !videoHasMore)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                void loadMoreVideos();
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [tab, videoHasMore, loadMoreVideos]);
    if (!user?.isLogin) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 text-muted-foreground", children: [_jsx("p", { className: "text-sm", children: "\u767B\u5F55\u540E\u67E5\u770B\u4E2A\u4EBA\u4E3B\u9875" }), _jsx(Link, { to: "/login", children: _jsx(Button, { size: "sm", children: "\u53BB\u767B\u5F55" }) })] }));
    }
    if (profileLoading && !profile) {
        return (_jsxs("div", { className: "flex h-full items-center justify-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u4E2A\u4EBA\u8D44\u6599..."] }));
    }
    if (profileError && !profile) {
        return (_jsx(ErrorState, { error: profileError, hint: "user", fallback: "\u4E2A\u4EBA\u8D44\u6599\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" }));
    }
    const displayProfile = profile ?? {
        mid,
        name: user.name,
        face: user.face,
        sign: "",
        fans: 0,
        following: 0,
        videos: 0,
        topPhoto: "",
    };
    const homePreviewVideos = videos.slice(0, 6);
    const showVideoGrid = tab === "videos" ? videos : homePreviewVideos;
    return (_jsx("div", { className: "flex h-full flex-col overflow-hidden", children: _jsxs("div", { ref: scrollRef, className: "scrollbar-overlay flex-1 overflow-y-auto", children: [_jsxs("div", { className: "border-b border-border", children: [_jsxs("div", { className: "relative h-44 overflow-hidden", children: [displayProfile.topPhoto ? (_jsxs(_Fragment, { children: [_jsx(BiliImage, { src: displayProfile.topPhoto, alt: "", className: "absolute inset-0 h-full w-full object-cover" }), _jsx("div", { className: "absolute inset-0 bg-black/25" })] })) : (_jsx("div", { className: "absolute inset-0 bg-gradient-to-br from-sky-700/70 via-primary/55 to-rose-600/55" })), _jsx("div", { className: "absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background via-background/80 to-transparent" })] }), _jsxs("div", { className: "relative mx-auto max-w-5xl px-6 pb-4", children: [_jsxs("div", { className: "-mt-14 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", children: [_jsxs("div", { className: "flex items-end gap-4", children: [_jsx(BiliImage, { src: displayProfile.face || user.face, alt: displayProfile.name, className: "h-24 w-24 shrink-0 rounded-full border-4 border-background object-cover ring-2 ring-primary/30" }), _jsxs("div", { className: "min-w-0 pb-1", children: [_jsx("h1", { className: "truncate text-2xl font-semibold", children: displayProfile.name }), _jsx("p", { className: "mt-1 line-clamp-2 text-sm text-muted-foreground", children: displayProfile.sign || "这个人很懒，什么都没有写~" })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2 pb-1", children: [_jsxs(Button, { size: "sm", variant: "outline", className: "gap-1.5", onClick: () => {
                                                        setDraftName(displayProfile.name);
                                                        setDraftSign(displayProfile.sign);
                                                        setProfileTip("");
                                                        setEditing((open) => !open);
                                                    }, children: [_jsx(Pencil, { className: "h-4 w-4" }), "\u7F16\u8F91\u8D44\u6599"] }), _jsx(Link, { to: "/settings", children: _jsxs(Button, { size: "sm", variant: "outline", className: "gap-1.5", children: [_jsx(Settings, { className: "h-4 w-4" }), "\u8BBE\u7F6E"] }) }), _jsxs(Button, { size: "sm", variant: "outline", className: "gap-1.5", onClick: () => void logout(), children: [_jsx(LogOut, { className: "h-4 w-4" }), "\u9000\u51FA\u767B\u5F55"] })] })] }), _jsxs("div", { className: "mt-5 flex flex-wrap gap-6 text-sm", children: [_jsxs(Link, { to: "/following", className: "transition-colors hover:text-primary", children: [_jsx("span", { className: "font-semibold text-foreground", children: formatCount(displayProfile.following) }), _jsx("span", { className: "ml-1 text-muted-foreground", children: "\u5173\u6CE8" })] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-foreground", children: formatCount(displayProfile.fans) }), _jsx("span", { className: "ml-1 text-muted-foreground", children: "\u7C89\u4E1D" })] }), _jsxs("button", { type: "button", className: "transition-colors hover:text-primary", onClick: () => openTab("videos"), children: [_jsx("span", { className: "font-semibold text-foreground", children: formatCount(displayProfile.videos) }), _jsx("span", { className: "ml-1 text-muted-foreground", children: "\u6295\u7A3F" })] }), bcoin && (_jsxs("div", { children: [_jsx("span", { className: "font-semibold text-foreground", children: bcoin }), _jsx("span", { className: "ml-1 text-muted-foreground", children: "B\u5E01" })] }))] }), editing && (_jsxs("div", { className: "mt-4 space-y-2 rounded-xl border border-border p-3", children: [_jsx("input", { value: draftName, onChange: (event) => setDraftName(event.target.value), placeholder: "\u6635\u79F0", className: "h-9 w-full rounded-md border border-border bg-transparent px-2 text-sm outline-none" }), _jsx("textarea", { value: draftSign, onChange: (event) => setDraftSign(event.target.value), placeholder: "\u4E2A\u6027\u7B7E\u540D", className: "min-h-16 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none" }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Button, { size: "sm", disabled: profileBusy, onClick: () => {
                                                        setProfileBusy(true);
                                                        setProfileTip("");
                                                        void window.biliDesk.bili
                                                            .updateMyProfile({ name: draftName, sign: draftSign })
                                                            .then(() => {
                                                            setProfile((prev) => prev
                                                                ? {
                                                                    ...prev,
                                                                    name: draftName.trim(),
                                                                    sign: draftSign.trim(),
                                                                }
                                                                : prev);
                                                            if (user) {
                                                                setUser({
                                                                    ...user,
                                                                    name: draftName.trim() || user.name,
                                                                });
                                                            }
                                                            setProfileTip("资料已保存");
                                                            setEditing(false);
                                                        })
                                                            .catch((err) => setProfileTip(extractIpcErrorMessage(err) || "保存失败"))
                                                            .finally(() => setProfileBusy(false));
                                                    }, children: "\u4FDD\u5B58" }), _jsxs("label", { className: "cursor-pointer text-sm text-primary", children: ["\u66F4\u6362\u5934\u50CF", _jsx("input", { type: "file", accept: "image/jpeg,image/png,image/webp", className: "hidden", onChange: (event) => {
                                                                const file = event.target.files?.[0];
                                                                event.target.value = "";
                                                                if (!file)
                                                                    return;
                                                                setProfileBusy(true);
                                                                setProfileTip("");
                                                                void imageFilesToPayload([file])
                                                                    .then((files) => {
                                                                    const faceFile = files[0];
                                                                    if (!faceFile)
                                                                        throw new Error("头像文件是空的");
                                                                    return window.biliDesk.bili.updateMyFace(faceFile);
                                                                })
                                                                    .then((face) => {
                                                                    if (face) {
                                                                        setProfile((prev) => prev ? { ...prev, face } : prev);
                                                                        if (user)
                                                                            setUser({ ...user, face });
                                                                    }
                                                                    setProfileTip("头像已更新");
                                                                })
                                                                    .catch((err) => setProfileTip(extractIpcErrorMessage(err) || "更换头像失败"))
                                                                    .finally(() => setProfileBusy(false));
                                                            } })] })] }), profileTip && (_jsx("p", { className: "text-xs text-muted-foreground", children: profileTip }))] })), _jsx(SpaceTabBar, { className: "mt-4", tabs: TABS, value: tab, onChange: openTab })] })] }), _jsxs("div", { className: "mx-auto max-w-5xl space-y-6 px-6 py-6", children: [tab === "home" && (_jsxs("section", { children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-medium", children: "\u6700\u8FD1\u6295\u7A3F" }), videos.length > 6 && (_jsx("button", { type: "button", className: "text-sm text-primary hover:underline", onClick: () => openTab("videos"), children: "\u67E5\u770B\u5168\u90E8" }))] }), videosLoading && videos.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." })) : showVideoGrid.length > 0 ? (_jsx("div", { className: "grid grid-cols-2 gap-4 xl:grid-cols-3", children: showVideoGrid.map((video) => (_jsx(VideoCard, { video: video, meta: "stats" }, video.bvid))) })) : (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u6295\u7A3F\u89C6\u9891" }))] })), visitedTabs.has("dynamics") && (_jsx("div", { className: tab === "dynamics" ? undefined : "hidden", children: _jsx(MyDynamicsPanel, { mid: mid, profile: displayProfile }) })), visitedTabs.has("collections") && (_jsx("div", { className: tab === "collections" ? undefined : "hidden", children: _jsx(MyCollectionsPanel, { mid: mid, layout: "embedded" }) })), visitedTabs.has("follow") && (_jsx("div", { className: tab === "follow" ? undefined : "hidden", children: _jsx(MyFollowPanel, { mid: mid }) })), visitedTabs.has("cheese") && (_jsx("div", { className: tab === "cheese" ? undefined : "hidden", children: _jsx(MyCheesePanel, { mid: mid }) })), visitedTabs.has("upower") && (_jsx("div", { className: tab === "upower" ? undefined : "hidden", children: _jsx(MyUpowerPanel, { mid: mid }) })), tab === "videos" && (_jsx("section", { children: videosLoading && videos.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u6295\u7A3F\u4E2D..." })) : videosError && videos.length === 0 ? (_jsx("p", { className: "text-sm text-red-400", children: videosError })) : videos.length > 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid grid-cols-2 gap-4 xl:grid-cols-3", children: videos.map((video) => (_jsx(VideoCard, { video: video, meta: "stats" }, video.bvid))) }), _jsx("div", { ref: sentinelRef, className: "py-6 text-center text-sm text-muted-foreground", children: loadingMore
                                            ? "加载更多..."
                                            : videoHasMore
                                                ? "继续下滑加载更多"
                                                : "已经到底啦" }), videosError && (_jsx("p", { className: "text-sm text-red-400", children: videosError }))] })) : (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u6295\u7A3F" })) })), visitedTabs.has("favorites") && (_jsx("div", { className: tab === "favorites" ? undefined : "hidden", children: _jsx(MyFavoritesPanel, {}) })), visitedTabs.has("account") && (_jsx("div", { className: tab === "account" ? undefined : "hidden", children: _jsx(MyAccountPanel, {}) }))] })] }) }));
}
