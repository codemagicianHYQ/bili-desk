import { useCallback, useEffect, useRef, useState } from "react";
import type { BangumiFollowItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Tv } from "lucide-react";

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

type FollowTab = "bangumi" | "cinema";

export function MyFollowPanel({ mid }: { mid: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [followTab, setFollowTab] = useState<FollowTab>("bangumi");
  const [items, setItems] = useState<BangumiFollowItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (tab: FollowTab, nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }

      try {
        const type = tab === "bangumi" ? 1 : 2;
        const result = await window.biliDesk.bili.getBangumiFollowList(
          mid,
          type,
          nextPage,
        );
        setItems((prev) => (append ? [...prev, ...result.list] : result.list));
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(formatError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mid],
  );

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(false);
    void load(followTab, 1, false);
  }, [followTab, load]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(followTab, page + 1, true);
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [followTab, hasMore, load, loading, loadingMore, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={followTab === "bangumi" ? "default" : "outline"}
          onClick={() => setFollowTab("bangumi")}
        >
          追番
        </Button>
        <Button
          size="sm"
          variant={followTab === "cinema" ? "default" : "outline"}
          onClick={() => setFollowTab("cinema")}
        >
          追剧
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <p className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </p>
      ) : error && items.length === 0 ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {followTab === "bangumi"
            ? "暂无追番（需在 B 站公开追番列表）"
            : "暂无追剧（需在 B 站公开追剧列表）"}
        </p>
      ) : (
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
                  <Tv className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                {item.progress && (
                  <p className="mt-1 text-xs text-primary">{item.progress}</p>
                )}
                {item.evaluate && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.evaluate}
                  </p>
                )}
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
      )}
    </div>
  );
}
