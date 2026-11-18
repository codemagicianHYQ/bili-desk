import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { HomePage } from "@/features/home/HomePage";
import { FavoritesPage } from "@/features/favorites/FavoritesPage";
import { FollowingPage } from "@/features/following/FollowingPage";
import { DynamicsPage } from "@/features/dynamics/DynamicsPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { PopularPage } from "@/features/popular/PopularPage";
import { VideoPage } from "@/features/video/VideoPage";
import { LivePage } from "@/features/live/LivePage";
import { WatchLaterPage } from "@/features/watch-later/WatchLaterPage";
import { MyPage } from "@/features/me/MyPage";
import { CollectionsPage } from "@/features/collections/CollectionsPage";
import { UpActivityPage } from "@/features/up-activity/UpActivityPage";
import { IntegrityPage } from "@/features/integrity/IntegrityPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { useNavigationStore } from "@/stores/navigation-store";
import { useHomeSearchStore } from "@/stores/home-search-store";
import { useHomeTabStore } from "@/stores/home-tab-store";
import { cn } from "@/lib/utils";
import { useAppShortcuts } from "@/hooks/use-app-shortcuts";
const titles = {
    "/": { title: "推荐", subtitle: "为你精选的内容" },
    "/popular": { title: "热门", subtitle: "综合热门、每周必看与排行榜" },
    "/dynamics": { title: "动态", subtitle: "关注 UP 的最新更新" },
    "/history": { title: "历史记录", subtitle: "与官方账号同步" },
    "/favorites": { title: "收藏夹", subtitle: "本地二级分类管理" },
    "/collections": { title: "合集", subtitle: "订阅与自建视频合集" },
    "/following": { title: "关注", subtitle: "AI 与规则智能分组" },
    "/watch-later": { title: "稍后再看", subtitle: "官方列表 + 本地溢出" },
    "/me": { title: "我的", subtitle: "个人主页" },
    "/integrity": {
        title: "失效检测",
        subtitle: "失效收藏 / 稍后再看 / 异常关注",
    },
    "/up-activity": {
        title: "UP 活跃状态",
        subtitle: "按稿件 / 动态筛活跃与停更",
    },
    "/settings": { title: "设置", subtitle: "外观、隐私、黑名单与 AI" },
    "/messages": { title: "消息", subtitle: "私信、回复、@、赞与系统通知" },
    "/login": { title: "登录", subtitle: "扫码登录 B 站账号" },
};
export function MainLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    useAppShortcuts();
    const prevPathRef = useRef(location.pathname);
    const syncKeepAlive = useNavigationStore((state) => state.syncKeepAlive);
    const followingKeepAlive = useNavigationStore((state) => state.followingKeepAlive);
    const favoritesKeepAlive = useNavigationStore((state) => state.favoritesKeepAlive);
    const collectionsKeepAlive = useNavigationStore((state) => state.collectionsKeepAlive);
    const watchLaterKeepAlive = useNavigationStore((state) => state.watchLaterKeepAlive);
    const dynamicsKeepAlive = useNavigationStore((state) => state.dynamicsKeepAlive);
    const historyKeepAlive = useNavigationStore((state) => state.historyKeepAlive);
    const popularKeepAlive = useNavigationStore((state) => state.popularKeepAlive);
    const upActivityKeepAlive = useNavigationStore((state) => state.upActivityKeepAlive);
    const integrityKeepAlive = useNavigationStore((state) => state.integrityKeepAlive);
    const settingsKeepAlive = useNavigationStore((state) => state.settingsKeepAlive);
    const messagesKeepAlive = useNavigationStore((state) => state.messagesKeepAlive);
    const videoKeepAlive = useNavigationStore((state) => state.videoKeepAlive);
    const liveKeepAlive = useNavigationStore((state) => state.liveKeepAlive);
    const activeVideoBvid = useNavigationStore((state) => state.activeVideoBvid);
    const activeLiveRoomId = useNavigationStore((state) => state.activeLiveRoomId);
    const searchQuery = useHomeSearchStore((state) => state.query);
    const homeTab = useHomeTabStore((state) => state.tab);
    const locationRef = useRef(location);
    locationRef.current = location;
    useEffect(() => {
        if (typeof window.biliDesk.app.onNavigate !== "function")
            return;
        return window.biliDesk.app.onNavigate((path) => {
            const current = locationRef.current.pathname + locationRef.current.search;
            if (path && path !== current)
                navigate(path);
        });
    }, [navigate]);
    useLayoutEffect(() => {
        const path = location.pathname;
        syncKeepAlive(path, prevPathRef.current);
        prevPathRef.current = path;
    }, [location.pathname, syncKeepAlive]);
    const path = location.pathname;
    const pathVideoBvid = path.startsWith("/video/")
        ? path.slice("/video/".length)
        : null;
    const pathLiveRoomId = path.startsWith("/live/")
        ? Number(path.slice("/live/".length))
        : null;
    const effectiveVideoBvid = activeVideoBvid ?? pathVideoBvid;
    const effectiveLiveRoomId = activeLiveRoomId ??
        (Number.isFinite(pathLiveRoomId) && (pathLiveRoomId ?? 0) > 0
            ? pathLiveRoomId
            : null);
    const meta = path.startsWith("/up/")
        ? { title: "UP 主主页", subtitle: "投稿与关注" }
        : path.startsWith("/dynamic/")
            ? { title: "动态详情", subtitle: "内容与评论" }
            : path.startsWith("/article/")
                ? { title: "专栏", subtitle: "应用内阅读" }
                : path.startsWith("/topic/")
                    ? { title: "话题", subtitle: "话题动态" }
                    : path.startsWith("/video/")
                        ? { title: "视频", subtitle: "正在播放" }
                        : path.startsWith("/live/")
                            ? { title: "直播", subtitle: "应用内观看" }
                            : path === "/" && searchQuery
                                ? {
                                    title: `搜索「${searchQuery}」`,
                                    subtitle: "已过滤无关结果",
                                }
                                : path === "/" && homeTab === "live"
                                    ? { title: "直播", subtitle: "推荐直播与关注开播" }
                                    : (titles[path] ?? { title: "BiliLoft" });
    if (path === "/login") {
        return _jsx(Outlet, {});
    }
    const isHome = path === "/";
    const isFollowing = path === "/following";
    const isFavorites = path === "/favorites";
    const isCollections = path === "/collections";
    const isWatchLater = path === "/watch-later";
    const isDynamics = path === "/dynamics";
    const isHistory = path === "/history";
    const isPopular = path === "/popular";
    const isMe = path === "/me";
    const isUpSpace = path.startsWith("/up/");
    const isDynamicDetail = path.startsWith("/dynamic/");
    const isArticleDetail = path.startsWith("/article/");
    const isTopic = path.startsWith("/topic/");
    const isSeason = path.startsWith("/season/");
    const isChannel = path.startsWith("/channel/");
    const isAudio = path.startsWith("/audio/");
    const isVideo = path.startsWith("/video/");
    const isLive = path.startsWith("/live/");
    const isSettings = path === "/settings";
    const isMessages = path === "/messages";
    const isIntegrity = path === "/integrity";
    const isUpActivity = path === "/up-activity";
    const showOutlet = isUpSpace ||
        isDynamicDetail ||
        isArticleDetail ||
        isTopic ||
        isSeason ||
        isChannel ||
        isAudio;
    const showVideo = isVideo && effectiveVideoBvid != null;
    const showLive = isLive && effectiveLiveRoomId != null;
    return (_jsxs("div", { "data-app-shell": true, className: "flex h-full overflow-hidden", children: [_jsx(Sidebar, {}), _jsxs("div", { "data-app-column": true, className: "flex min-w-0 flex-1 flex-col overflow-hidden", children: [_jsx(TopBar, { title: meta.title, subtitle: meta.subtitle }), _jsxs("main", { "data-app-main": true, className: "min-h-0 flex-1 overflow-hidden", children: [_jsx("div", { className: cn("h-full", !isHome && "hidden"), "aria-hidden": !isHome, children: _jsx(HomePage, {}) }), (dynamicsKeepAlive || isDynamics) && (_jsx("div", { className: cn("h-full", !isDynamics && "hidden"), "aria-hidden": !isDynamics, children: _jsx(DynamicsPage, {}) })), (historyKeepAlive || isHistory) && (_jsx("div", { className: cn("h-full", !isHistory && "hidden"), "aria-hidden": !isHistory, children: _jsx(HistoryPage, {}) })), (popularKeepAlive || isPopular) && (_jsx("div", { className: cn("h-full", !isPopular && "hidden"), "aria-hidden": !isPopular, children: _jsx(PopularPage, {}) })), (followingKeepAlive || isFollowing) && (_jsx("div", { className: cn("h-full", !isFollowing && "hidden"), "aria-hidden": !isFollowing, children: _jsx(FollowingPage, {}) })), (favoritesKeepAlive || isFavorites) && (_jsx("div", { className: cn("h-full", !isFavorites && "hidden"), "aria-hidden": !isFavorites, children: _jsx(FavoritesPage, {}) })), (collectionsKeepAlive || isCollections) && (_jsx("div", { className: cn("h-full overflow-hidden", !isCollections && "hidden"), "aria-hidden": !isCollections, children: _jsx(CollectionsPage, {}) })), (watchLaterKeepAlive || isWatchLater) && (_jsx("div", { className: cn("h-full", !isWatchLater && "hidden"), "aria-hidden": !isWatchLater, children: _jsx(WatchLaterPage, {}) })), _jsx("div", { className: cn("h-full", !isMe && "hidden"), "aria-hidden": !isMe, children: _jsx(MyPage, {}) }), (upActivityKeepAlive || isUpActivity) && (_jsx("div", { className: cn("h-full overflow-hidden", !isUpActivity && "hidden"), "aria-hidden": !isUpActivity, children: _jsx(UpActivityPage, {}) })), (integrityKeepAlive || isIntegrity) && (_jsx("div", { className: cn("h-full overflow-hidden", !isIntegrity && "hidden"), "aria-hidden": !isIntegrity, children: _jsx(IntegrityPage, {}) })), (messagesKeepAlive || isMessages) && (_jsx("div", { className: cn("h-full overflow-hidden", !isMessages && "hidden"), "aria-hidden": !isMessages, children: _jsx(MessagesPage, {}) })), (settingsKeepAlive || isSettings) && (_jsx("div", { className: cn("h-full overflow-hidden", !isSettings && "hidden"), "aria-hidden": !isSettings, children: _jsx(SettingsPage, {}) })), (videoKeepAlive || showVideo) && effectiveVideoBvid && (_jsx("div", { className: cn("h-full", !showVideo && "hidden"), "aria-hidden": !showVideo, children: _jsx(VideoPage, { bvid: effectiveVideoBvid, active: showVideo }) })), (liveKeepAlive || showLive) && effectiveLiveRoomId && (_jsx("div", { className: cn("h-full", !showLive && "hidden"), "aria-hidden": !showLive, children: _jsx(LivePage, { roomId: effectiveLiveRoomId, active: showLive }) })), showOutlet && (_jsx("div", { className: "scrollbar-overlay h-full overflow-y-auto", children: _jsx(Outlet, {}) }))] })] })] }));
}
