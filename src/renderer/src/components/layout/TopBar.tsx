import { Moon, RefreshCw, Sun, UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BiliImage } from '@/components/ui/bili-image'
import { HomeGridLayoutPicker } from '@/components/layout/HomeGridLayoutPicker'
import { useAppStore } from '@/stores/app-store'
import { useFavoritesStore } from '@/stores/favorites-store'
import { useFollowingStore } from '@/stores/following-store'
import { useHomeFeedStore } from '@/stores/home-feed-store'
import { Link, useLocation } from 'react-router-dom'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const location = useLocation()
  const { theme, setTheme, user } = useAppStore()
  const homeRefresh = useHomeFeedStore((state) => state.refresh)
  const homeRefreshing = useHomeFeedStore((state) => state.refreshing)
  const followingRefresh = useFollowingStore((state) => state.refresh)
  const followingRefreshing = useFollowingStore((state) => state.refreshing)
  const favoritesRefresh = useFavoritesStore((state) => state.refresh)
  const favoritesRefreshing = useFavoritesStore((state) => state.refreshing)

  const isHome = location.pathname === '/'
  const isFollowing = location.pathname === '/following'
  const isFavorites = location.pathname === '/favorites'
  const showRefresh = isHome || isFollowing || isFavorites

  const refreshing = isHome
    ? homeRefreshing
    : isFollowing
      ? followingRefreshing
      : isFavorites
        ? favoritesRefreshing
        : false

  const handleRefresh = () => {
    if (isHome) void homeRefresh()
    else if (isFollowing) void followingRefresh()
    else if (isFavorites) void favoritesRefresh()
  }

  const refreshLabel = isHome ? '刷新推荐' : isFollowing ? '刷新关注' : '刷新收藏'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isHome && <HomeGridLayoutPicker />}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="切换主题"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {user?.isLogin ? (
          <Link to="/settings">
            <Button variant="ghost" size="sm" className="gap-2">
              {user.face ? (
                <BiliImage src={user.face} alt="" className="h-6 w-6 rounded-full object-cover" />
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
  )
}
