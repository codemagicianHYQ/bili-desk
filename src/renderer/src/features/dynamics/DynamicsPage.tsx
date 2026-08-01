import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  DynamicFeedType,
  LiveRoomItem,
  SpaceDynamicItem,
} from "@shared/types";
import { DynamicFeedCard } from "@/components/dynamic/DynamicFeedCard";
import { FollowingLiveList } from "@/components/live/FollowingLiveList";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Loader2 } from "lucide-react";

type UiTab = "all" | "video" | "live" | "text";

/** 过滤 Tab 连续空页上限，避免 IntersectionObserver 死循环狂拉 */
const MAX_EMPTY_FILTER_PAGES = 8;
const MAX_DYNAMIC_ITEMS = 300;

const TABS: Array<{ id: UiTab; label: string }> = [
  { id: "all", label: "全部" },
  { id: "video", label: "视频" },
  { id: "live", label: "直播" },
  { id: "text", label: "图文" },
];

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

function matchesTab(item: SpaceDynamicItem, tab: UiTab): boolean {
  if (tab === "all") return true;
  if (tab === "video") return item.kind === "video";
  if (tab === "live") return item.kind === "live";
  return (
    item.kind === "text" ||
    item.kind === "draw" ||
    item.kind === "opus" ||
    item.kind === "forward"
  );
}

function apiTypeForTab(tab: UiTab): DynamicFeedType {
  if (tab === "video") return "video";
  return "all";
}

export function DynamicsPage() {
  const user = useAppStore((state) => state.user);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef("");
  const emptyFilterPagesRef = useRef(0);
  const [tab, setTab] = useState<UiTab>("all");
  const [items, setItems] = useState<SpaceDynamicItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  // 直播 Tab：与首页一致，展示关注 UP 当前开播状态（非动态流）
  const [liveRooms, setLiveRooms] = useState<LiveRoomItem[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");

  const loadLives = useCallback(async () => {
    if (!user?.isLogin) {
      setLiveRooms([]);
      setLiveCount(0);
      setLiveLoading(false);
      setLiveError("");
      return;
    }

    setLiveLoading(true);
    setLiveError("");
    try {
      const result = await window.biliDesk.bili.getFollowingLives();
      setLiveRooms(result.rooms);
      setLiveCount(result.count);
    } catch (err) {
      setLiveError(formatError(err));
      setLiveRooms([]);
      setLiveCount(0);
    } finally {
      setLiveLoading(false);
    }
  }, [user?.isLogin]);

  const load = useCallback(
    async (nextTab: UiTab, append: boolean) => {
      if (nextTab === "live") return;

      if (!user?.isLogin) {
        setItems([]);
        setHasMore(false);
        setLoading(false);
        setError("");
        return;
      }

      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
        emptyFilterPagesRef.current = 0;
      }

      try {
        const apiType = apiTypeForTab(nextTab);
        const result = await window.biliDesk.bili.getFollowDynamics(
          append ? offsetRef.current : "",
          apiType,
        );
        offsetRef.current = result.offset;

        const filtered = result.items.filter((item) =>
          matchesTab(item, nextTab),
        );

        if (filtered.length === 0) {
          emptyFilterPagesRef.current += 1;
        } else {
          emptyFilterPagesRef.current = 0;
        }

        let nextLen = 0;
        setItems((prev) => {
          const next = append ? [...prev, ...filtered] : filtered;
          const capped = next.slice(0, MAX_DYNAMIC_ITEMS);
          nextLen = capped.length;
          return capped;
        });

        setHasMore(
          result.hasMore &&
            nextLen < MAX_DYNAMIC_ITEMS &&
            emptyFilterPagesRef.current < MAX_EMPTY_FILTER_PAGES,
        );
      } catch (err) {
        setError(formatError(err));
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user?.isLogin],
  );

  useEffect(() => {
    if (tab === "live") {
      void loadLives();
      return;
    }
    offsetRef.current = "";
    emptyFilterPagesRef.current = 0;
    void load(tab, false);
  }, [load, loadLives, tab]);

  useEffect(() => {
    const onRefresh = () => {
      scrollRef.current?.scrollTo({ top: 0 });
      if (tab === "live") {
        void loadLives();
        return;
      }
      offsetRef.current = "";
      void load(tab, false);
    };
    window.addEventListener("bilidesk:refresh-dynamics", onRefresh);
    return () =>
      window.removeEventListener("bilidesk:refresh-dynamics", onRefresh);
  }, [load, loadLives, tab]);

  useEffect(() => {
    if (tab === "live") return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(tab, true);
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, load, loading, loadingMore, tab]);

  if (!user?.isLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          登录后可查看关注的 UP 主动态更新
        </p>
        <Button asChild>
          <Link to="/login">去登录</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 gap-2 border-b border-border px-6 py-3">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTab(option.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              tab === option.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="scrollbar-overlay flex-1 overflow-y-auto">
        {tab === "live" ? (
          <div className="mx-auto max-w-3xl p-6">
            {liveLoading && liveRooms.length === 0 ? (
              <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载关注直播...
              </p>
            ) : liveError && liveRooms.length === 0 ? (
              <div className="space-y-3 py-16 text-center">
                <p className="text-sm text-red-400">{liveError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadLives()}
                >
                  重试
                </Button>
              </div>
            ) : liveRooms.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                关注的 UP 暂无开播
              </p>
            ) : (
              <FollowingLiveList rooms={liveRooms} count={liveCount} />
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4 p-6">
            {loading && items.length === 0 ? (
              <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载动态...
              </p>
            ) : error && items.length === 0 ? (
              <div className="space-y-3 py-16 text-center">
                <p className="text-sm text-red-400">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void load(tab, false)}
                >
                  重试
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                暂无相关动态
              </p>
            ) : (
              <>
                {items.map((item) => (
                  <DynamicFeedCard key={item.id} item={item} />
                ))}
                <div
                  ref={sentinelRef}
                  className="py-4 text-center text-sm text-muted-foreground"
                >
                  {loadingMore
                    ? "加载更多..."
                    : hasMore
                      ? "继续下滑加载更多"
                      : "已经到底啦"}
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
