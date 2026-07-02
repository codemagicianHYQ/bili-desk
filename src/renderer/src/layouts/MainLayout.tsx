import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { HomePage } from '@/features/home/HomePage'
import { FavoritesPage } from '@/features/favorites/FavoritesPage'
import { FollowingPage } from '@/features/following/FollowingPage'
import { useNavigationStore } from '@/stores/navigation-store'
import { cn } from '@/lib/utils'

const titles: Record<string, { title: string; subtitle?: string }> = {
  '/': { title: '推荐', subtitle: '为你精选的内容' },
  '/favorites': { title: '收藏夹', subtitle: '本地二级分类管理' },
  '/following': { title: '关注', subtitle: 'AI 与规则智能分组' },
  '/search': { title: '搜索', subtitle: '即将上线' },
  '/settings': { title: '设置', subtitle: '主题与 AI 配置' },
  '/login': { title: '登录', subtitle: '扫码登录 B 站账号' }
}

export function MainLayout() {
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)
  const syncKeepAlive = useNavigationStore((state) => state.syncKeepAlive)
  const followingKeepAlive = useNavigationStore((state) => state.followingKeepAlive)
  const favoritesKeepAlive = useNavigationStore((state) => state.favoritesKeepAlive)

  useEffect(() => {
    const path = location.pathname
    syncKeepAlive(path, prevPathRef.current)
    prevPathRef.current = path
  }, [location.pathname, syncKeepAlive])

  const meta =
    location.pathname.startsWith('/up/')
      ? { title: 'UP 主主页', subtitle: '投稿与关注' }
      : location.pathname.startsWith('/video/')
        ? { title: '视频', subtitle: '正在播放' }
        : (titles[location.pathname] ?? { title: 'BiliDesk' })

  if (location.pathname === '/login') {
    return <Outlet />
  }

  const path = location.pathname
  const isHome = path === '/'
  const isFollowing = path === '/following'
  const isFavorites = path === '/favorites'
  const isUpSpace = path.startsWith('/up/')
  const isVideo = path.startsWith('/video/')
  const isSearch = path === '/search'
  const isSettings = path === '/settings'
  const showOutlet = isUpSpace || isVideo || isSearch || isSettings

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        <main className="flex-1 overflow-hidden">
          <div className={cn('h-full', !isHome && 'hidden')} aria-hidden={!isHome}>
            <HomePage />
          </div>
          {(followingKeepAlive || isFollowing) && (
            <div className={cn('h-full', !isFollowing && 'hidden')} aria-hidden={!isFollowing}>
              <FollowingPage />
            </div>
          )}
          {(favoritesKeepAlive || isFavorites) && (
            <div className={cn('h-full', !isFavorites && 'hidden')} aria-hidden={!isFavorites}>
              <FavoritesPage />
            </div>
          )}
          {showOutlet && (
            <div className="h-full">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
