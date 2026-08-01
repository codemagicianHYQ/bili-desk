import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Bookmark,
  Users,
  Clock,
  Settings,
  LogIn,
  LogOut,
  UserCircle2,
  Radio,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { BiliImage } from "@/components/ui/bili-image";

const navItems = [
  { to: "/", icon: Home, label: "首页" },
  { to: "/dynamics", icon: Radio, label: "动态" },
  { to: "/me", icon: UserCircle2, label: "我的" },
  { to: "/favorites", icon: Bookmark, label: "收藏" },
  { to: "/following", icon: Users, label: "关注" },
  { to: "/history", icon: History, label: "历史记录" },
  { to: "/watch-later", icon: Clock, label: "稍后再看" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAppStore();
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

  const path = location.pathname;
  const inFollowingFlow =
    followingKeepAlive &&
    (path === "/following" ||
      path.startsWith("/up/") ||
      ((path.startsWith("/video/") || path.startsWith("/live/")) &&
        !favoritesKeepAlive &&
        !watchLaterKeepAlive &&
        !dynamicsKeepAlive &&
        !historyKeepAlive));
  const inFavoritesFlow =
    favoritesKeepAlive &&
    (path === "/favorites" ||
      path.startsWith("/video/") ||
      path.startsWith("/live/") ||
      path.startsWith("/up/"));
  const inWatchLaterFlow =
    watchLaterKeepAlive &&
    (path === "/watch-later" ||
      path.startsWith("/video/") ||
      path.startsWith("/live/") ||
      path.startsWith("/up/"));
  const inDynamicsFlow =
    dynamicsKeepAlive &&
    (path === "/dynamics" ||
      path.startsWith("/video/") ||
      path.startsWith("/live/") ||
      path.startsWith("/up/"));
  const inHistoryFlow =
    historyKeepAlive &&
    (path === "/history" ||
      path.startsWith("/video/") ||
      path.startsWith("/live/") ||
      path.startsWith("/up/"));

  const handleLogout = async () => {
    await window.biliDesk.auth.logout();
    setUser({ mid: 0, name: "未登录", face: "", isLogin: false });
    useWatchLaterStore.getState().reset();
    navigate("/login");
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50 px-3 py-4">
      <div className="mb-8 px-2">
        <h1 className="text-lg font-semibold tracking-tight">
          Bili<span className="text-primary">Desk</span>
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          简洁 · 智能 · 你的 B 站
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active =
            location.pathname === to ||
            (to !== "/" && location.pathname.startsWith(to)) ||
            (to === "/following" && inFollowingFlow) ||
            (to === "/favorites" && inFavoritesFlow) ||
            (to === "/watch-later" && inWatchLaterFlow) ||
            (to === "/dynamics" && inDynamicsFlow) ||
            (to === "/history" && inHistoryFlow);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {user?.isLogin ? (
        <div className="mt-auto space-y-1 border-t border-border pt-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            {user.face ? (
              <BiliImage
                src={user.face}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
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
  );
}
