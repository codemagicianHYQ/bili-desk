import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
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
import { useNavigationStore } from "@/stores/navigation-store";
import { useHomeSearchStore } from "@/stores/home-search-store";
import { useHomeTabStore } from "@/stores/home-tab-store";
import { cn } from "@/lib/utils";

const titles: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "推荐", subtitle: "为你精选的内容" },
  "/popular": { title: "热门", subtitle: "综合热门、每周必看与排行榜" },
  "/dynamics": { title: "动态", subtitle: "关注 UP 的最新更新" },
  "/history": { title: "历史记录", subtitle: "与官方账号同步" },
  "/favorites": { title: "收藏夹", subtitle: "本地二级分类管理" },
  "/following": { title: "关注", subtitle: "AI 与规则智能分组" },
  "/watch-later": { title: "稍后再看", subtitle: "同步 B 站官方列表" },
  "/me": { title: "我的", subtitle: "个人主页" },
  "/settings": { title: "设置", subtitle: "外观、隐私、黑名单与 AI" },
  "/login": { title: "登录", subtitle: "扫码登录 B 站账号" },
};

export function MainLayout() {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const syncKeepAlive = useNavigationStore((state) => state.syncKeepAlive);
  const followingKeepAlive = useNavigationStore(
    (state) => state.followingKeepAlive,
  );
  const favoritesKeepAlive = useNavigationStore(
    (state) => state.favoritesKeepAlive,
  );
  const watchLaterKeepAlive = useNavigationStore(
    (state) => state.watchLaterKeepAlive,
  );
  const dynamicsKeepAlive = useNavigationStore(
    (state) => state.dynamicsKeepAlive,
  );
  const historyKeepAlive = useNavigationStore(
    (state) => state.historyKeepAlive,
  );
  const popularKeepAlive = useNavigationStore(
    (state) => state.popularKeepAlive,
  );
  const videoKeepAlive = useNavigationStore((state) => state.videoKeepAlive);
  const liveKeepAlive = useNavigationStore((state) => state.liveKeepAlive);
  const activeVideoBvid = useNavigationStore((state) => state.activeVideoBvid);
  const activeLiveRoomId = useNavigationStore(
    (state) => state.activeLiveRoomId,
  );
  const searchQuery = useHomeSearchStore((state) => state.query);
  const homeTab = useHomeTabStore((state) => state.tab);

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
  const effectiveLiveRoomId =
    activeLiveRoomId ??
    (Number.isFinite(pathLiveRoomId) && (pathLiveRoomId ?? 0) > 0
      ? pathLiveRoomId
      : null);

  const meta = path.startsWith("/up/")
    ? { title: "UP 主主页", subtitle: "投稿与关注" }
    : path.startsWith("/dynamic/")
      ? { title: "动态详情", subtitle: "内容与评论" }
      : path.startsWith("/video/")
        ? { title: "视频", subtitle: "正在播放" }
        : path.startsWith("/live/")
          ? { title: "直播", subtitle: "应用内观看" }
          : path === "/" && searchQuery
            ? { title: `搜索「${searchQuery}」`, subtitle: "已过滤无关结果" }
            : path === "/" && homeTab === "live"
              ? { title: "直播", subtitle: "推荐直播与关注开播" }
              : (titles[path] ?? { title: "BiliDesk" });

  if (path === "/login") {
    return <Outlet />;
  }

  const isHome = path === "/";
  const isFollowing = path === "/following";
  const isFavorites = path === "/favorites";
  const isWatchLater = path === "/watch-later";
  const isDynamics = path === "/dynamics";
  const isHistory = path === "/history";
  const isPopular = path === "/popular";
  const isMe = path === "/me";
  const isUpSpace = path.startsWith("/up/");
  const isDynamicDetail = path.startsWith("/dynamic/");
  const isVideo = path.startsWith("/video/");
  const isLive = path.startsWith("/live/");
  const isSettings = path === "/settings";
  const showOutlet = isUpSpace || isSettings || isDynamicDetail;
  const showVideo = isVideo && effectiveVideoBvid != null;
  const showLive = isLive && effectiveLiveRoomId != null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        <main className="flex-1 overflow-hidden">
          <div
            className={cn("h-full", !isHome && "hidden")}
            aria-hidden={!isHome}
          >
            <HomePage />
          </div>
          {(dynamicsKeepAlive || isDynamics) && (
            <div
              className={cn("h-full", !isDynamics && "hidden")}
              aria-hidden={!isDynamics}
            >
              <DynamicsPage />
            </div>
          )}
          {(historyKeepAlive || isHistory) && (
            <div
              className={cn("h-full", !isHistory && "hidden")}
              aria-hidden={!isHistory}
            >
              <HistoryPage />
            </div>
          )}
          {(popularKeepAlive || isPopular) && (
            <div
              className={cn("h-full", !isPopular && "hidden")}
              aria-hidden={!isPopular}
            >
              <PopularPage />
            </div>
          )}
          {(followingKeepAlive || isFollowing) && (
            <div
              className={cn("h-full", !isFollowing && "hidden")}
              aria-hidden={!isFollowing}
            >
              <FollowingPage />
            </div>
          )}
          {(favoritesKeepAlive || isFavorites) && (
            <div
              className={cn("h-full", !isFavorites && "hidden")}
              aria-hidden={!isFavorites}
            >
              <FavoritesPage />
            </div>
          )}
          {(watchLaterKeepAlive || isWatchLater) && (
            <div
              className={cn("h-full", !isWatchLater && "hidden")}
              aria-hidden={!isWatchLater}
            >
              <WatchLaterPage />
            </div>
          )}
          <div className={cn("h-full", !isMe && "hidden")} aria-hidden={!isMe}>
            <MyPage />
          </div>
          {(videoKeepAlive || showVideo) && effectiveVideoBvid && (
            <div
              className={cn("h-full", !showVideo && "hidden")}
              aria-hidden={!showVideo}
            >
              <VideoPage bvid={effectiveVideoBvid} active={showVideo} />
            </div>
          )}
          {(liveKeepAlive || showLive) && effectiveLiveRoomId && (
            <div
              className={cn("h-full", !showLive && "hidden")}
              aria-hidden={!showLive}
            >
              <LivePage roomId={effectiveLiveRoomId} active={showLive} />
            </div>
          )}
          {showOutlet && (
            <div
              className={cn(
                "h-full",
                isSettings
                  ? "overflow-hidden"
                  : "scrollbar-overlay overflow-y-auto",
              )}
            >
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
