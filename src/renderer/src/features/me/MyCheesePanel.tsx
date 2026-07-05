import { useCallback, useEffect, useRef, useState } from "react";
import type { CheeseCourseItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { cn, formatCount } from "@/lib/utils";
import { BookOpen, Loader2 } from "lucide-react";

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

export function MyCheesePanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<CheeseCourseItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }

    try {
      const result = await window.biliDesk.bili.getCheeseFollowList(nextPage);
      setItems((prev) => (append ? [...prev, ...result.list] : result.list));
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(page + 1, true);
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, load, loading, loadingMore, page]);

  if (loading && items.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载课堂...
      </p>
    );
  }

  if (error && items.length === 0) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无追课或已购课堂</p>;
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[60vh] space-y-2 overflow-y-auto pr-1"
    >
      {items.map((item) => (
        <a
          key={item.seasonId}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          {item.cover ? (
            <BiliImage
              src={item.cover}
              alt=""
              className="h-20 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {[
                item.epCount > 0 ? `${item.epCount} 课时` : "",
                item.playCount > 0 ? `${formatCount(item.playCount)} 播放` : "",
                item.status,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </a>
      ))}
      <div
        ref={sentinelRef}
        className={cn("py-4 text-center text-sm text-muted-foreground")}
      >
        {loadingMore
          ? "加载更多..."
          : hasMore
            ? "继续下滑加载更多"
            : "已经到底啦"}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
