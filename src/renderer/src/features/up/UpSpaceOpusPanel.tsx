import { useCallback, useEffect, useRef, useState } from "react";
import type { OpusFavItem } from "@shared/types";
import { OpusAppLink } from "@/components/opus/OpusAppLink";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { FileText, Loader2 } from "lucide-react";

export function UpSpaceOpusPanel({ mid }: { mid: number }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef("");
  const [items, setItems] = useState<OpusFavItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }
      try {
        const result = await window.biliDesk.bili.getSpaceOpus(
          mid,
          append ? offsetRef.current : "",
        );
        offsetRef.current = result.offset;
        setHasMore(result.hasMore);
        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items,
        );
      } catch (err) {
        setError(formatUserSpaceError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mid],
  );

  useEffect(() => {
    offsetRef.current = "";
    setItems([]);
    void load(false);
  }, [load]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) void load(true);
      },
      { rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, load]);

  if (loading && items.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载图文...
      </p>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load(false)}>
          重新加载
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">该 UP 暂无公开图文</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <OpusAppLink
          key={item.id}
          item={item}
          className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          {item.cover ? (
            <BiliImage
              src={item.cover}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
            {item.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {item.summary}
              </p>
            )}
          </div>
        </OpusAppLink>
      ))}
      <div
        ref={sentinelRef}
        className="col-span-full py-3 text-center text-xs text-muted-foreground"
      >
        {loadingMore ? "加载更多..." : hasMore ? "继续下滑" : "已经到底啦"}
      </div>
    </div>
  );
}
