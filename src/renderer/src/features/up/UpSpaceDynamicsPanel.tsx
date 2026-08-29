import { useCallback, useEffect, useRef, useState } from "react";
import type { SpaceDynamicItem } from "@shared/types";
import { DynamicFeedCard } from "@/components/dynamic/DynamicFeedCard";
import { Button } from "@/components/ui/button";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { Loader2 } from "lucide-react";

export function UpSpaceDynamicsPanel({
  mid,
  name,
  face,
}: {
  mid: number;
  name: string;
  face: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef("");
  const [items, setItems] = useState<SpaceDynamicItem[]>([]);
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
        const result = await window.biliDesk.bili.getSpaceDynamics(
          mid,
          append ? offsetRef.current : "",
        );
        offsetRef.current = result.offset;
        setHasMore(result.hasMore);
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
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
        加载动态...
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
    return <p className="text-sm text-muted-foreground">该 UP 暂无公开动态</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {items.map((item) => (
        <DynamicFeedCard
          key={item.id}
          item={item}
          fallbackName={name}
          fallbackFace={face}
        />
      ))}
      <div
        ref={sentinelRef}
        className="py-3 text-center text-xs text-muted-foreground"
      >
        {loadingMore ? "加载更多..." : hasMore ? "继续下滑" : "已经到底啦"}
      </div>
    </div>
  );
}
