import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Bookmark,
  Users,
  Clock,
  Settings,
  LogIn,
  UserCircle2,
  Radio,
  History,
  Flame,
  ShieldAlert,
  Activity,
  Layers,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { BiliImage } from "@/components/ui/bili-image";

const navItems = [
  { to: "/", icon: Home, label: "首页" },
  { to: "/popular", icon: Flame, label: "热门" },
  { to: "/dynamics", icon: Radio, label: "动态" },
  { to: "/messages", icon: MessageCircle, label: "消息" },
  { to: "/me", icon: UserCircle2, label: "我的" },
  { to: "/favorites", icon: Bookmark, label: "收藏" },
  { to: "/collections", icon: Layers, label: "合集" },
  { to: "/following", icon: Users, label: "关注" },
  { to: "/history", icon: History, label: "历史记录" },
  { to: "/watch-later", icon: Clock, label: "稍后再看" },
  { to: "/integrity", icon: ShieldAlert, label: "失效检测" },
  { to: "/up-activity", icon: Activity, label: "UP活跃" },
  { to: "/settings", icon: Settings, label: "设置" },
];

const NAV_ORDER_KEY = "bilidesk:sidebar-order";
const DEFAULT_ORDER = navItems.map((item) => item.to);

function readNavOrder(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? "null");
    if (!Array.isArray(raw)) return DEFAULT_ORDER;
    const known = raw.filter(
      (to): to is string =>
        typeof to === "string" && DEFAULT_ORDER.includes(to),
    );
    // 新版本加的入口按默认位置补在末尾
    return [...known, ...DEFAULT_ORDER.filter((to) => !known.includes(to))];
  } catch {
    return DEFAULT_ORDER;
  }
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((to, index) => to === b[index]);
}

const DETAIL_PREFIXES = [
  "/up/",
  "/video/",
  "/live/",
  "/article/",
  "/dynamic/",
  "/topic/",
  "/season/",
  "/channel/",
  "/audio/",
];

export function Sidebar() {
  const location = useLocation();
  const { user } = useAppStore();
  const lastSection = useNavigationStore((state) => state.lastSection);
  const [messageUnread, setMessageUnread] = useState(0);
  const [order, setOrder] = useState<string[]>(readNavOrder);
  const [dragging, setDragging] = useState<string | null>(null);
  const orderedItems = useMemo(
    () =>
      order
        .map((to) => navItems.find((item) => item.to === to))
        .filter((item): item is (typeof navItems)[number] => Boolean(item)),
    [order],
  );
  const customized = !sameOrder(order, DEFAULT_ORDER);

  const saveOrder = (next: string[]) => {
    setOrder(next);
    if (sameOrder(next, DEFAULT_ORDER)) localStorage.removeItem(NAV_ORDER_KEY);
    else localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next));
  };

  const moveDragged = (overTo: string) => {
    if (!dragging || dragging === overTo) return;
    setOrder((prev) => {
      const from = prev.indexOf(dragging);
      const to = prev.indexOf(overTo);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragging);
      return next;
    });
  };

  const path = location.pathname;
  const inDetailFlow = DETAIL_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  );

  useEffect(() => {
    if (!user?.isLogin) {
      setMessageUnread(0);
      return;
    }
    let stop = false;
    const load = () => {
      void window.biliDesk.bili
        .getMessageUnread()
        .then((data) => {
          if (stop) return;
          setMessageUnread(
            data.reply +
              data.at +
              data.like +
              data.sys +
              data.chat +
              data.group +
              data.dustbin,
          );
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener("bilidesk:msg-unread", load);
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.removeEventListener("bilidesk:msg-unread", load);
    };
  }, [user?.isLogin]);

  return (
    <aside
      data-app-chrome
      data-app-sidebar
      className="bili-glass flex w-56 shrink-0 flex-col border-r border-border bg-card/30 px-3 py-4"
    >
      <div className="mb-8 px-2">
        <h1 className="text-lg font-semibold tracking-tight">
          Bili<span className="text-primary">Loft</span>
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          简洁 · 智能 · 你的 B 站
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {orderedItems.map(({ to, icon: Icon, label }) => {
          const active =
            path === to ||
            (to !== "/" && path.startsWith(`${to}/`)) ||
            (inDetailFlow && lastSection === to);
          return (
            <Link
              key={to}
              to={to}
              draggable
              title="拖动可调整顺序"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", to);
                setDragging(to);
              }}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                moveDragged(to);
              }}
              onDrop={(event) => {
                event.preventDefault();
                saveOrder(order);
                setDragging(null);
              }}
              onDragEnd={() => {
                if (dragging) saveOrder(order);
                setDragging(null);
              }}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                dragging === to && "opacity-50 ring-1 ring-primary/50",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {to === "/messages" && messageUnread > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground">
                  {messageUnread > 99 ? "99+" : messageUnread}
                </span>
              )}
            </Link>
          );
        })}
        {customized && (
          <button
            type="button"
            onClick={() => saveOrder(DEFAULT_ORDER)}
            className="mt-1 self-start rounded px-3 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            恢复默认顺序
          </button>
        )}
      </nav>

      {user?.isLogin ? (
        <Link
          to="/me"
          className="mt-auto flex items-center gap-2 rounded-lg border-t border-border px-3 py-3 text-sm transition-colors hover:bg-secondary"
        >
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
        </Link>
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
