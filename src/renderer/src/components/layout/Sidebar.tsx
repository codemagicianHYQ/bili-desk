import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  Bookmark,
  Users,
  Search,
  Settings,
  LogIn,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { BiliImage } from '@/components/ui/bili-image'

const navItems = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/favorites', icon: Bookmark, label: '收藏' },
  { to: '/following', icon: Users, label: '关注' },
  { to: '/search', icon: Search, label: '搜索' },
  { to: '/settings', icon: Settings, label: '设置' }
]

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, setUser } = useAppStore()

  const handleLogout = async () => {
    await window.biliDesk.auth.logout()
    setUser({ mid: 0, name: '未登录', face: '', isLogin: false })
    navigate('/login')
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50 px-3 py-4">
      <div className="mb-8 px-2">
        <h1 className="text-lg font-semibold tracking-tight">
          Bili<span className="text-primary">Desk</span>
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">简洁 · 智能 · 你的 B 站</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      {user?.isLogin ? (
        <div className="mt-auto space-y-1 border-t border-border pt-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            {user.face ? (
              <BiliImage src={user.face} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-secondary" />
            )}
            <span className="min-w-0 flex-1 truncate">{user.name}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      ) : (
        <Link
          to="/login"
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogIn className="h-4 w-4" />
          登录
        </Link>
      )}
    </aside>
  )
}
