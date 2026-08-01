import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  HistoryCursor,
  HistoryFeedType,
  HistoryItem,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { savePlaybackProgress } from "@/lib/playback-progress";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Clock, ExternalLink, Loader2, Radio, Trash2 } from "lucide-react";

const PAGE_SIZE = 20;

const TABS: Array<{ id: HistoryFeedType; label: string }> = [
  { id: "all", label: "综合" },
  { id: "archive", label: "视频" },
  { id: "live", label: "直播" },
  { id: "article", label: "专栏" },
];

interface PageCacheEntry {
  items: HistoryItem[];
  nextCursor: HistoryCursor;
  hasMore: boolean;
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "加载失败";
}

function padDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function coverProgressLabel(item: HistoryItem): string {
  if (!(item.business === "archive" || item.bvid) || item.duration <= 0) {
    return "";
  }
  if (item.progress < 0) {
    return `${padDuration(item.duration)}/${padDuration(item.duration)}`;
  }
  const seen = Math.min(item.progress, item.duration);
  return `${padDuration(seen)}/${padDuration(item.duration)}`;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dateGroupLabel(viewAt: number): string {
  if (!viewAt) return "更早";
  const day = startOfLocalDay(viewAt * 1000);
  const today = startOfLocalDay(Date.now());
  const yesterday = today - 24 * 60 * 60 * 1000;
  if (day === today) return "今天";
  if (day === yesterday) return "昨天";

  const date = new Date(viewAt * 1000);
  const nowYear = new Date().getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (date.getFullYear() === nowYear) return `${m}月${d}日`;
  return `${date.getFullYear()}年${m}月${d}日`;
}

function formatViewClock(viewAt: number): string {
  if (!viewAt) return "";
  const date = new Date(viewAt * 1000);
  const day = startOfLocalDay(viewAt * 1000);
  const today = startOfLocalDay(Date.now());
  const yesterday = today - 24 * 60 * 60 * 1000;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (day === today) return `今天 ${time}`;
  if (day === yesterday) return `昨天 ${time}`;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (date.getFullYear() === new Date().getFullYear()) {
    return `${m}-${d} ${time}`;
  }
  return `${date.getFullYear()}-${m}-${d} ${time}`;
}

function resolveExternalUrl(item: HistoryItem): string {
  if (item.uri?.startsWith("http")) return item.uri;
  if (item.business === "live" && item.oid) {
    return `https://live.bilibili.com/${item.oid}`;
  }
  if (
    (item.business === "article" || item.business === "article-list") &&
    item.oid
  ) {
    return `https://www.bilibili.com/read/cv${item.oid}`;
  }
  if (item.bvid) return `https://www.bilibili.com/video/${item.bvid}`;
  return "";
}

/** 历史续播链接：带上进度与分 P cid */
function resolveVideoResumePath(item: HistoryItem): string | null {
  if (!item.bvid) return null;
  const params = new URLSearchParams();
  if (item.cid) params.set("cid", String(item.cid));
  // progress < 0 表示已看完，从头播；> 0 则续播
  if (item.progress > 0) {
    params.set("t", String(Math.floor(item.progress)));
  }
  const query = params.toString();
  return query ? `/video/${item.bvid}?${query}` : `/video/${item.bvid}`;
}

function seedLocalResumeProgress(item: HistoryItem): void {
  if (!item.bvid || !item.cid || item.progress < 5) return;
  if (item.duration > 0 && item.progress >= item.duration - 15) return;
  savePlaybackProgress(item.bvid, item.cid, item.progress, item.duration);
}

function groupItemsByDate(items: HistoryItem[]): Array<{
  label: string;
  items: HistoryItem[];
}> {
  const groups: Array<{ label: string; items: HistoryItem[] }> = [];
  for (const item of items) {
    const label = dateGroupLabel(item.viewAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function HistoryCard({
  item,
  deleting,
  onDelete,
}: {
  item: HistoryItem;
  deleting: boolean;
  onDelete: (item: HistoryItem) => void;
}) {
  const isVideo = item.business === "archive" || Boolean(item.bvid);
  const isLive = item.business === "live";
  const isArticle =
    item.business === "article" || item.business === "article-list";
  const external = resolveExternalUrl(item);
  const cover = item.cover || item.covers?.[0] || "";
  const progressText = coverProgressLabel(item);
  const percent =
    item.progress < 0
      ? 100
      : item.duration > 0 && item.progress > 0
        ? Math.min(100, Math.round((item.progress / item.duration) * 100))
        : 0;

  const media = (
    <div className="relative overflow-hidden rounded-lg bg-secondary">
      {cover ? (
        <BiliImage
          src={cover}
          alt={item.title}
          variant="cover"
          className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="aspect-video w-full bg-secondary" />
      )}
      {isLive && (
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Radio className="h-3 w-3" />
          {item.liveStatus === 1 ? "直播中" : "直播"}
        </span>
      )}
      {isArticle && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          专栏
        </span>
      )}
      {item.badge && !isLive && !isArticle && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          {item.badge}
        </span>
      )}
      {progressText && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
          {progressText}
        </span>
      )}
      {percent > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/35">
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );

  const meta = (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-start gap-1">
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug group-hover:text-primary">
          {item.title}
        </p>
        <button
          type="button"
          title="删除这条历史"
          disabled={deleting}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(item);
          }}
          className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-colors hover:bg-secondary hover:text-red-400 disabled:opacity-40 group-hover:opacity-100"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {item.showTitle && (
        <p className="truncate text-xs text-muted-foreground">
          {item.showTitle}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {item.authorName ? (
            <>
              <span className="rounded bg-secondary px-1 py-px text-[10px] font-medium text-muted-foreground">
                UP
              </span>
              <span className="truncate">{item.authorName}</span>
            </>
          ) : isArticle ? (
            <span className="inline-flex items-center gap-1">
              专栏
              <ExternalLink className="h-3 w-3" />
            </span>
          ) : (
            <span>{isLive ? "直播" : "内容"}</span>
          )}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatViewClock(item.viewAt)}
        </span>
      </div>
    </div>
  );

  const body = (
    <div className="group">
      {media}
      {meta}
    </div>
  );

  if (isVideo && item.bvid) {
    const to = resolveVideoResumePath(item) ?? `/video/${item.bvid}`;
    return (
      <Link to={to} onClick={() => seedLocalResumeProgress(item)}>
        {body}
      </Link>
    );
  }
  if (isLive && item.oid) {
    return <Link to={`/live/${item.oid}`}>{body}</Link>;
  }
  if (external) {
    return (
      <a href={external} target="_blank" rel="noreferrer" className="block">
        {body}
      </a>
    );
  }
  return body;
}

export function HistoryPage() {
  const user = useAppStore((state) => state.user);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCacheRef = useRef(new Map<number, PageCacheEntry>());
  const loadSeqRef = useRef(0);

  const [tab, setTab] = useState<HistoryFeedType>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [discoveredPages, setDiscoveredPages] = useState(1);
  const [totalKnown, setTotalKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const groups = useMemo(() => groupItemsByDate(items), [items]);
  const totalPages = totalKnown
    ? Math.max(1, discoveredPages)
    : Math.max(1, discoveredPages, page);

  const syncPageMeta = useCallback(() => {
    const keys = [...pageCacheRef.current.keys()];
    if (keys.length === 0) {
      setDiscoveredPages(1);
      setTotalKnown(false);
      return;
    }
    const maxPage = Math.max(...keys);
    const last = pageCacheRef.current.get(maxPage);
    setDiscoveredPages(maxPage);
    setTotalKnown(Boolean(last && !last.hasMore));
  }, []);

  const resetCache = useCallback(() => {
    pageCacheRef.current = new Map();
    setDiscoveredPages(1);
    setTotalKnown(false);
  }, []);

  const applyPage = useCallback(
    (targetPage: number, entry: PageCacheEntry) => {
      setPage(targetPage);
      setItems(entry.items);
      setHasMore(entry.hasMore);
      syncPageMeta();
    },
    [syncPageMeta],
  );

  const fetchPage = useCallback(
    async (targetPage: number, options?: { force?: boolean }) => {
      if (!user?.isLogin) {
        setItems([]);
        setHasMore(false);
        setLoading(false);
        setError("");
        return;
      }

      const seq = ++loadSeqRef.current;
      setLoading(true);
      setError("");

      try {
        if (options?.force) resetCache();

        for (let p = 1; p <= targetPage; p++) {
          if (!options?.force && pageCacheRef.current.has(p)) continue;

          const prev = pageCacheRef.current.get(p - 1);
          if (p > 1 && prev && !prev.hasMore) break;

          const cursor = p === 1 ? undefined : prev?.nextCursor;
          const result = await window.biliDesk.bili.getWatchHistory(
            tab,
            cursor,
          );
          if (seq !== loadSeqRef.current) return;

          pageCacheRef.current.set(p, {
            items: result.items,
            nextCursor: result.cursor,
            hasMore: result.hasMore,
          });

          if (!result.hasMore) break;
        }

        const resolvedPage = pageCacheRef.current.has(targetPage)
          ? targetPage
          : Math.max(1, ...pageCacheRef.current.keys());
        const entry = pageCacheRef.current.get(resolvedPage);
        if (!entry) {
          setPage(1);
          setItems([]);
          setHasMore(false);
          return;
        }
        applyPage(resolvedPage, entry);
        scrollRef.current?.scrollTo({ top: 0 });
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setError(formatError(err));
        if (!pageCacheRef.current.has(targetPage)) {
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [applyPage, resetCache, tab, user?.isLogin],
  );

  useEffect(() => {
    resetCache();
    setPage(1);
    void fetchPage(1, { force: true });
  }, [fetchPage, resetCache, tab]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchPage(1, { force: true });
    };
    window.addEventListener("bilidesk:refresh-history", onRefresh);
    return () =>
      window.removeEventListener("bilidesk:refresh-history", onRefresh);
  }, [fetchPage]);

  const handleDelete = useCallback(
    async (item: HistoryItem) => {
      setDeletingId(item.id);
      setError("");
      try {
        await window.biliDesk.bili.deleteWatchHistory({
          business: item.business,
          oid: item.oid,
          kid: item.kid,
        });
        setItems((prev) => prev.filter((row) => row.id !== item.id));
        const cached = pageCacheRef.current.get(page);
        if (cached) {
          pageCacheRef.current.set(page, {
            ...cached,
            items: cached.items.filter((row) => row.id !== item.id),
          });
        }
        // 后续页缓存可能错位，清掉后面的页
        for (const key of [...pageCacheRef.current.keys()]) {
          if (key > page) pageCacheRef.current.delete(key);
        }
        syncPageMeta();
      } catch (err) {
        setError(formatError(err));
      } finally {
        setDeletingId(null);
      }
    },
    [page, syncPageMeta],
  );

  const handleClear = useCallback(async () => {
    setClearing(true);
    setError("");
    try {
      await window.biliDesk.bili.clearWatchHistory();
      resetCache();
      setPage(1);
      setItems([]);
      setHasMore(false);
      setClearOpen(false);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setClearing(false);
    }
  }, [resetCache]);

  if (!user?.isLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          登录后可查看与官方同步的观看历史
        </p>
        <Button asChild>
          <Link to="/login">去登录</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === option.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
              {tab === option.id && (
                <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={loading || clearing || (items.length === 0 && !hasMore)}
          onClick={() => setClearOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空历史
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-6xl px-6 py-5">
          {loading && items.length === 0 ? (
            <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载历史记录...
            </p>
          ) : error && items.length === 0 ? (
            <div className="space-y-3 py-16 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchPage(page, { force: true })}
              >
                重试
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              暂无历史记录
            </p>
          ) : (
            <div className={cn("space-y-8", loading && "opacity-60")}>
              {groups.map((group) => (
                <section key={group.label} className="relative pl-6">
                  <div className="absolute bottom-0 left-[7px] top-2 w-px bg-border" />
                  <div className="absolute left-0 top-1.5 flex items-center gap-2">
                    <span className="relative z-10 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background" />
                  </div>
                  <h3 className="mb-4 text-sm font-medium text-foreground">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                    {group.items.map((item) => (
                      <HistoryCard
                        key={item.id}
                        item={item}
                        deleting={deletingId === item.id}
                        onDelete={(row) => void handleDelete(row)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {error && (
                <p className="text-center text-sm text-red-400">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {(items.length > 0 || page > 1) && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          openEnded={!totalKnown}
          disabled={loading || clearing}
          disableNext={!hasMore}
          onPageChange={(next) => void fetchPage(next)}
          info={
            totalKnown ? (
              <>
                第 {page} / {discoveredPages} 页 · 本页 {items.length} 条
                <span className="ml-1 text-muted-foreground/70">
                  （每页约 {PAGE_SIZE} 条 · 共 {discoveredPages} 页）
                </span>
              </>
            ) : (
              <>
                第 {page} 页 · 本页 {items.length} 条 · 已探知 {discoveredPages}{" "}
                页（还有更多，可直接输入页码跳转）
                <span className="ml-1 text-muted-foreground/70">
                  （每页约 {PAGE_SIZE} 条）
                </span>
              </>
            )
          }
        />
      )}

      <ConfirmDialog
        open={clearOpen}
        title="清空历史记录？"
        description="将同步清空 B 站账号下的全部观看历史，此操作不可恢复。"
        confirmLabel="全部清空"
        destructive
        loading={clearing}
        onConfirm={() => void handleClear()}
        onCancel={() => {
          if (!clearing) setClearOpen(false);
        }}
      />
    </div>
  );
}
