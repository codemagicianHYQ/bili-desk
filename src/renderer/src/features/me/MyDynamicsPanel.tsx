import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SpaceDynamicItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { cn, formatCount } from "@/lib/utils";
import { Loader2 } from "lucide-react";

function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
  }
  return "";
}

function DynamicCard({ item }: { item: SpaceDynamicItem }) {
  const text = displayText(item.text);
  const title = displayText(item.title) || item.title;
  const body = (
    <article className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/30">
      <p className="text-xs text-muted-foreground">
        {formatTime(item.pubTime)}
      </p>
      {title && (
        <h3 className="mt-1 line-clamp-2 text-sm font-medium">{title}</h3>
      )}
      {text && (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
          {text}
        </p>
      )}
      {item.cover && (
        <BiliImage
          src={item.cover}
          alt=""
          className="mt-3 max-h-48 w-full rounded-lg object-cover"
        />
      )}
      {item.stats?.view != null && item.stats.view > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {formatCount(item.stats.view)} 播放
        </p>
      )}
    </article>
  );

  if (item.bvid) {
    return <Link to={`/video/${item.bvid}`}>{body}</Link>;
  }
  return body;
}

export function MyDynamicsPanel({ mid }: { mid: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items,
        );
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
    offsetRef.current = "";
    void load(false);
  }, [load]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(true);
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, load, loading, loadingMore]);

  if (loading && items.length === 0) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载动态...
      </p>
    );
  }

  if (error && items.length === 0) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无动态</p>;
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[60vh] space-y-3 overflow-y-auto pr-1"
    >
      {items.map((item) => (
        <DynamicCard key={item.id} item={item} />
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
