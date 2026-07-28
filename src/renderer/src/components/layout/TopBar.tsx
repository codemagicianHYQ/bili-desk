import { RefreshCw, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BiliImage } from "@/components/ui/bili-image";
import { HomeGridLayoutPicker } from "@/components/layout/HomeGridLayoutPicker";
import { ThemeCustomizer } from "@/components/layout/ThemeCustomizer";
import { useAppStore } from "@/stores/app-store";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useFollowingStore } from "@/stores/following-store";
import { useHomeFeedStore } from "@/stores/home-feed-store";
import { useHomeSearchStore } from "@/stores/home-search-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { Link, useLocation } from "react-router-dom";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const location = useLocation();
  const user = useAppStore((state) => state.user);
  const homeRefresh = useHomeFeedStore((state) => state.refresh);
  const homeRefreshing = useHomeFeedStore((state) => state.refreshing);
  const searchQuery = useHomeSearchStore((state) => state.query);
  const searchOrder = useHomeSearchStore((state) => state.order);
  const followingRefresh = useFollowingStore((state) => state.refresh);
  const followingRefreshing = useFollowingStore((state) => state.refreshing);
  const favoritesRefresh = useFavoritesStore((state) => state.refresh);
  const favoritesRefreshing = useFavoritesStore((state) => state.refreshing);
  const watchLaterRefresh = useWatchLaterStore((state) => state.refresh);
  const watchLaterRefreshing = useWatchLaterStore((state) => state.refreshing);

  const isHome = location.pathname === "/";
  const isSearching = isHome && searchQuery.length > 0;
  const isFollowing = location.pathname === "/following";
  const isFavorites = location.pathname === "/favorites";
  const isWatchLater = location.pathname === "/watch-later";
  const isUpSpace = location.pathname.startsWith("/up/");
  const showRefresh = isHome || isFollowing || isFavorites || isWatchLater;
  const showGridPicker = isHome || isWatchLater || isUpSpace;

  const refreshing = isHome
    ? homeRefreshing
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
    if (isHome) void homeRefresh();
    else if (isFollowing) void followingRefresh();
    else if (isFavorites) void favoritesRefresh();
    else if (isWatchLater) void watchLaterRefresh();
  };

  const refreshLabel = isSearching
    ? "刷新搜索结果"
    : isHome
      ? "刷新推荐"
      : isFollowing
        ? "刷新关注"
        : isFavorites
          ? "刷新收藏"
          : "刷新稍后再看";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
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

      <div className="flex items-center gap-2">
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
