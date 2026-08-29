import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ChargeUpItem, CheeseCourseItem } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { cn, formatCount } from "@/lib/utils";
import { BookOpen, Loader2, Zap } from "lucide-react";

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

function formatChargeExpire(expireTime: number, expired: boolean): string {
  if (!expireTime) return expired ? "已过期" : "";
  const date = new Date(expireTime > 1e12 ? expireTime : expireTime * 1000);
  if (Number.isNaN(date.getTime())) return expired ? "已过期" : "";
  const text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return expired ? `${text} 已过期` : `有效至 ${text}`;
}

export function MyCheesePanel({ mid }: { mid: number }) {
  return <MyCheeseList mid={mid} />;
}

export function MyUpowerPanel(_props: { mid: number }) {
  const [segment, setSegment] = useState<"active" | "expired">("active");
  const [active, setActive] = useState<ChargeUpItem[]>([]);
  const [expired, setExpired] = useState<ChargeUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void window.biliDesk.bili
      .getUpowerPaidList()
      .then((result) => {
        if (cancelled) return;
        setActive(result.active);
        setExpired(result.expired);
      })
      .catch((err) => {
        if (!cancelled) setError(formatError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载充电记录...
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  const list = segment === "active" ? active : expired;
  const emptyLabel =
    segment === "active" ? "暂无生效中的包月充电" : "暂无过期的充电记录";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          className={cn(
            "rounded-full px-3 py-1 text-sm",
            segment === "active"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSegment("active")}
        >
          生效中 {active.length}
        </button>
        <button
          type="button"
          className={cn(
            "rounded-full px-3 py-1 text-sm",
            segment === "expired"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSegment("expired")}
        >
          已过期 {expired.length}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-3 pb-8">
          {list.map((up) => (
            <ChargeUpCard key={up.mid || up.name} up={up} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChargeUpCard({ up }: { up: ChargeUpItem }) {
  const expireText = formatChargeExpire(up.expireTime, up.expired);
  const inner = (
    <>
      {up.face ? (
        <BiliImage
          src={up.face}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Zap className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{up.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[expireText || (up.expired ? "已过期" : "生效中"), up.privilegeName]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-3",
        up.expired && "opacity-80",
      )}
    >
      {up.mid > 0 ? (
        <Link
          to={`/up/${up.mid}`}
          className="flex items-center gap-3 hover:text-primary"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-3">{inner}</div>
      )}

      {up.exclusives.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {up.exclusives.map((item) => (
            <ExclusiveRow
              key={item.seasonId}
              item={item}
              expired={up.expired}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExclusiveRow({
  item,
  expired,
}: {
  item: CheeseCourseItem;
  expired: boolean;
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 rounded-lg p-1 transition-colors hover:bg-secondary/50"
    >
      {item.cover ? (
        <BiliImage
          src={item.cover}
          alt=""
          className="h-16 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
          <Zap className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            expired ? "充电专属 · 已过期" : "充电专属",
            item.epCount > 0 ? `${item.epCount} 个视频` : "",
            item.playCount > 0 ? `${formatCount(item.playCount)} 播放` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </a>
  );
}

function MyCheeseList({ mid }: { mid: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<CheeseCourseItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
      }

      try {
        const result = await window.biliDesk.bili.getCheeseFollowList(
          nextPage,
          mid,
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
