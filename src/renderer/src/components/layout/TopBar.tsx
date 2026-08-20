import { ArrowLeft, Eye, EyeOff, RefreshCw, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BiliImage } from "@/components/ui/bili-image";
import { HomeGridLayoutPicker } from "@/components/layout/HomeGridLayoutPicker";
import { ThemeCustomizer } from "@/components/layout/ThemeCustomizer";
import { useAppStore } from "@/stores/app-store";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useFollowingStore } from "@/stores/following-store";
import { useHomeFeedStore } from "@/stores/home-feed-store";
import { useHomeLiveStore } from "@/stores/home-live-store";
import { useHomeSearchStore } from "@/stores/home-search-store";
import { useHomeTabStore } from "@/stores/home-tab-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const incognitoMode = useAppStore((state) => state.incognitoMode);
  const setIncognitoMode = useAppStore((state) => state.setIncognitoMode);
  const homeRefresh = useHomeFeedStore((state) => state.refresh);
  const homeRefreshing = useHomeFeedStore((state) => state.refreshing);
  const homeLiveRefresh = useHomeLiveStore((state) => state.refresh);
  const homeLiveRefreshing = useHomeLiveStore((state) => state.refreshing);
  const homeTab = useHomeTabStore((state) => state.tab);
  const setHomeTab = useHomeTabStore((state) => state.setTab);
  const searchQuery = useHomeSearchStore((state) => state.query);
  const searchOrder = useHomeSearchStore((state) => state.order);
  const followingRefresh = useFollowingStore((state) => state.refresh);
  const followingRefreshing = useFollowingStore((state) => state.refreshing);
  const favoritesRefresh = useFavoritesStore((state) => state.refresh);
  const favoritesRefreshing = useFavoritesStore((state) => state.refreshing);
  const watchLaterRefresh = useWatchLaterStore((state) => state.refresh);
  const watchLaterRefreshing = useWatchLaterStore((state) => state.refreshing);

  const isHome = location.pathname === "/";
  const isHomeLive = isHome && homeTab === "live";
  const isSearching = isHome && homeTab === "video" && searchQuery.length > 0;
  const isFollowing = location.pathname === "/following";
  const isFavorites = location.pathname === "/favorites";
  const isWatchLater = location.pathname === "/watch-later";
  const isDynamics = location.pathname === "/dynamics";
  const isHistory = location.pathname === "/history";
  const isUpSpace = location.pathname.startsWith("/up/");
  const isVideo = location.pathname.startsWith("/video/");
  const isLive = location.pathname.startsWith("/live/");
  const showBack = isVideo || isLive;
  const showRefresh =
    isHome ||
    isFollowing ||
    isFavorites ||
    isWatchLater ||
    isDynamics ||
    isHistory ||
    isVideo ||
    isLive;
  const showGridPicker = isHome || isWatchLater || isUpSpace;
  const homeTabs = [
    { id: "video" as const, label: "视频" },
    { id: "live" as const, label: "直播" },
  ];

  const refreshing = isHome
    ? isHomeLive
      ? homeLiveRefreshing
      : homeRefreshing
    : isFollowing
      ? followingRefreshing
      : isFavorites
        ? favoritesRefreshing
        : isWatchLater
          ? watchLaterRefreshing
          : false;

  const handleRefresh = () => {
    if (isSearching) {
      window.dispatchEvent(
        new CustomEvent("bilidesk:refresh-search", {
          detail: { query: searchQuery, order: searchOrder },
        }),
      );
      return;
    }
    if (isHomeLive) void homeLiveRefresh();
    else if (isHome) void homeRefresh();
    else if (isFollowing) void followingRefresh();
    else if (isFavorites) void favoritesRefresh();
    else if (isWatchLater) void watchLaterRefresh();
    else if (isDynamics) {
      window.dispatchEvent(new CustomEvent("bilidesk:refresh-dynamics"));
    } else if (isHistory) {
      window.dispatchEvent(new CustomEvent("bilidesk:refresh-history"));
    } else if (isVideo) {
      window.dispatchEvent(new CustomEvent("bilidesk:refresh-video"));
    } else if (isLive) {
      window.dispatchEvent(new CustomEvent("bilidesk:refresh-live"));
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const refreshLabel = isSearching
    ? "刷新搜索结果"
    : isHomeLive
      ? "刷新直播"
      : isHome
        ? "刷新推荐"
        : isFollowing
          ? "刷新关注"
          : isFavorites
            ? "刷新收藏"
            : isDynamics
              ? "刷新动态"
              : isHistory
                ? "刷新历史"
                : isVideo
                  ? "刷新播放器"
                  : isLive
                    ? "刷新直播"
                    : "刷新稍后再看";

  return (
    <header
      data-app-chrome
      className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {showRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={refreshing}
              onClick={handleRefresh}
              aria-label={refreshLabel}
              title={refreshLabel}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          )}
        </div>

        {isHome && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5">
            {homeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHomeTab(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  homeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5",
            incognitoMode
              ? "text-primary hover:text-primary"
              : "text-muted-foreground",
          )}
          onClick={() => setIncognitoMode(!incognitoMode)}
          aria-label={incognitoMode ? "关闭无痕模式" : "开启无痕模式"}
          title={
            incognitoMode
              ? "无痕模式开启中：观看不会写入 B 站历史"
              : "开启无痕模式：本机观看不同步到 B 站历史"
          }
        >
          {incognitoMode ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {incognitoMode ? "无痕中" : "无痕"}
          </span>
        </Button>

        {showGridPicker && <HomeGridLayoutPicker />}
        <ThemeCustomizer />

        {user?.isLogin ? (
          <Link to="/me">
            <Button variant="ghost" size="sm" className="gap-2">
              {user.face ? (
                <BiliImage
                  src={user.face}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <UserCircle2 className="h-5 w-5" />
              )}
              <span className="max-w-24 truncate">{user.name}</span>
            </Button>
          </Link>
        ) : (
          <Link to="/login">
            <Button variant="ghost" size="sm" className="gap-2">
              <UserCircle2 className="h-5 w-5" />
              <span>未登录</span>
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
