import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { SpaceDynamicItem, TopicHead } from "@shared/types";
import { DynamicFeedCard } from "@/components/dynamic/DynamicFeedCard";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { Loader2 } from "lucide-react";

export function TopicPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const topicId = Number(id);
  const name = searchParams.get("name") || "话题";
  const offsetRef = useRef("");
  const [items, setItems] = useState<SpaceDynamicItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [head, setHead] = useState<TopicHead | null>(null);
  const [favBusy, setFavBusy] = useState(false);

  const load = useCallback(
    async (append: boolean) => {
      if (!Number.isFinite(topicId) || topicId <= 0) {
        setError("话题 ID 无效");
        setLoading(false);
        return;
      }
      setLoading(true);
      if (!append) setError("");
      try {
        const page = await window.biliDesk.bili.getTopicDynamics(
          topicId,
          append ? offsetRef.current : "",
        );
        offsetRef.current = page.offset;
        setHasMore(page.hasMore);
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      } catch (err) {
        setError(err instanceof Error ? err.message : "话题加载失败");
      } finally {
        setLoading(false);
      }
    },
    [topicId],
  );

  useEffect(() => {
    offsetRef.current = "";
    void load(false);
    if (!Number.isFinite(topicId) || topicId <= 0) return;
    void window.biliDesk.bili
      .getTopicHead(topicId)
      .then(setHead)
      .catch(() => setHead(null));
  }, [load, topicId]);

  return (
    <div className="flex h-full flex-col">
      <PageBackHeader fallback="/" label="返回" />
      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">
                #{head?.name || name}
              </h1>
              {head?.desc ? (
                <p className="mt-1 text-sm text-muted-foreground">{head.desc}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={favBusy}
              className="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary"
              onClick={() => {
                if (!head) return;
                const next = !head.favorited;
                setFavBusy(true);
                void window.biliDesk.bili
                  .favoriteTopic(topicId, next)
                  .then(() => setHead({ ...head, favorited: next }))
                  .finally(() => setFavBusy(false));
              }}
            >
              {head?.favorited ? "已关注" : "关注话题"}
            </button>
          </div>
          {loading && items.length === 0 ? (
            <p className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载话题...
            </p>
          ) : error && items.length === 0 ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">这个话题还没有动态</p>
          ) : (
            items.map((item) => (
              <DynamicFeedCard
                key={item.id}
                item={item}
                onRemoved={(id) =>
                  setItems((prev) => prev.filter((entry) => entry.id !== id))
                }
              />
            ))
          )}
          {hasMore && (
            <button
              type="button"
              className="w-full py-3 text-sm text-primary"
              onClick={() => void load(true)}
            >
              {loading ? "加载中..." : "加载更多"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
