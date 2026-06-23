import { Moon, RefreshCw, Sun, UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BiliImage } from '@/components/ui/bili-image'
import { useAppStore } from '@/stores/app-store'
import { useHomeFeedStore } from '@/stores/home-feed-store'
import { Link, useLocation } from 'react-router-dom'
interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const location = useLocation()
  const { theme, setTheme, user } = useAppStore()
  const refresh = useHomeFeedStore((state) => state.refresh)
  const refreshing = useHomeFeedStore((state) => state.refreshing)
  const isHome = location.pathname === '/'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {isHome && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            disabled={refreshing}
            onClick={() => void refresh()}
            aria-label="刷新推荐"
            title="刷新推荐"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
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
