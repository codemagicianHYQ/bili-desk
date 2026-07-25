import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SpaceDynamicItem, UpProfile } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { Loader2, MessageCircle, Share2, ThumbsUp } from "lucide-react";

interface MyDynamicsPanelProps {
  mid: number;
  profile: Pick<UpProfile, "name" | "face"> | null;
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

function DynamicActionBar({ item }: { item: SpaceDynamicItem }) {
  const reply = item.stats?.reply ?? 0;
  const like = item.stats?.like ?? 0;

  return (
    <div className="grid grid-cols-3 border-t border-white/5">
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]"
      >
        <Share2 className="h-4 w-4" />
        转发
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]"
      >
        <MessageCircle className="h-4 w-4" />
        {reply > 0 ? reply : "评论"}
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-1.5 py-3 text-sm text-[#9499a0] transition-colors hover:text-[#e3e5e7]"
      >
        <ThumbsUp className="h-4 w-4" />
        {like > 0 ? like : "点赞"}
      </button>
    </div>
  );
}

function VideoDynamicBody({ item }: { item: SpaceDynamicItem }) {
  const content = (
    <div className="flex gap-3 rounded-lg bg-black/25 p-3 transition-colors hover:bg-black/35">
      <div className="relative shrink-0 overflow-hidden rounded-md">
        {item.cover ? (
          <BiliImage
            src={item.cover}
            alt={item.title ?? ""}
            className="h-[86px] w-[136px] object-cover"
          />
        ) : (
          <div className="h-[86px] w-[136px] bg-secondary" />
        )}
        {item.duration != null && item.duration > 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[11px] text-white">
            {formatDuration(item.duration)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <p className="line-clamp-2 text-sm leading-snug text-[#e3e5e7]">
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#9499a0]">
          {item.stats?.view != null && item.stats.view > 0 && (
            <span>{formatCount(item.stats.view)} 播放</span>
          )}
          {item.stats?.danmaku != null && item.stats.danmaku > 0 && (
            <span>{formatCount(item.stats.danmaku)} 评论</span>
          )}
        </div>
      </div>
    </div>
  );

  if (item.bvid) {
    return <Link to={`/video/${item.bvid}`}>{content}</Link>;
  }
  return content;
}

function DynamicCard({
  item,
  fallbackName,
  fallbackFace,
}: {
  item: SpaceDynamicItem;
  fallbackName: string;
  fallbackFace: string;
}) {
  const authorName = item.authorName || fallbackName;
  const authorFace = item.authorFace || fallbackFace;
  const meta = [item.pubTimeLabel, item.pubAction].filter(Boolean).join(" · ");

  return (
    <article className="overflow-hidden rounded-xl bg-[#232527] shadow-sm ring-1 ring-white/5">
      <div className="flex items-start gap-3 px-5 pb-1 pt-5">
        {authorFace ? (
          <BiliImage
            src={authorFace}
            alt={authorName}
            className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-full bg-secondary" />
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-medium text-[#00aeec]">
            {authorName}
          </p>
          {meta && <p className="mt-0.5 text-xs text-[#9499a0]">{meta}</p>}
        </div>
      </div>

      <div className="space-y-3 px-5 py-3">
        {item.kind === "video" ? (
          <VideoDynamicBody item={item} />
        ) : (
          <>
            {item.title && item.kind !== "text" && (
              <h3 className="text-sm font-medium leading-snug text-[#e3e5e7]">
                {item.title}
              </h3>
            )}
            {item.text && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e3e5e7]">
                {item.text}
              </p>
            )}
            {item.cover && (
              <BiliImage
                src={item.cover}
                alt=""
                className="max-h-80 w-full rounded-lg object-cover"
              />
            )}
          </>
        )}
      </div>

      <DynamicActionBar item={item} />
    </article>
  );
}

export function MyDynamicsPanel({ mid, profile }: MyDynamicsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef("");
  const [items, setItems] = useState<SpaceDynamicItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fallbackName = profile?.name ?? "用户";
  const fallbackFace = profile?.face ?? "";

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
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
    >
      {items.map((item) => (
        <DynamicCard
          key={item.id}
          item={item}
          fallbackName={fallbackName}
          fallbackFace={fallbackFace}
        />
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
