import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import type {
  HistoryCursor,
  HistoryDeviceFilter,
  HistoryDurationFilter,
  HistoryFeedType,
  HistoryFilters,
  HistoryItem,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { savePlaybackProgress } from "@/lib/playback-progress";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  LayoutGrid,
  List,
  Loader2,
  Monitor,
  Radio,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  Tv,
} from "lucide-react";

const PAGE_SIZE = 20;

const TABS: Array<{ id: HistoryFeedType; label: string }> = [
  { id: "all", label: "综合" },
  { id: "archive", label: "视频" },
  { id: "live", label: "直播" },
  { id: "article", label: "专栏" },
];

const DURATION_OPTIONS: Array<{ id: HistoryDurationFilter; label: string }> = [
  { id: 0, label: "全部时长" },
  { id: 1, label: "10分钟以下" },
  { id: 2, label: "10-30分钟" },
  { id: 3, label: "30-60分钟" },
  { id: 4, label: "60分钟以上" },
];

const TIME_OPTIONS: Array<{
  id: "all" | "today" | "yesterday" | "week" | "custom";
  label: string;
}> = [
  { id: "all", label: "全部时间" },
  { id: "today", label: "今天" },
  { id: "yesterday", label: "昨天" },
  { id: "week", label: "近一周" },
];

const DEVICE_OPTIONS: Array<{ id: HistoryDeviceFilter; label: string }> = [
  { id: "all", label: "全部设备" },
  { id: "pc", label: "PC" },
  { id: "phone", label: "手机" },
  { id: "pad", label: "平板" },
  { id: "tv", label: "TV" },
];

type TimePreset = (typeof TIME_OPTIONS)[number]["id"];
type HistoryLayout = "grid" | "list";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function resolveTimeRange(
  preset: TimePreset,
  fromDate: string,
  toDate: string,
): { fromTime?: number; toTime?: number } {
  const today = startOfLocalDay(Date.now());
  if (preset === "today") {
    return { fromTime: Math.floor(today / 1000) };
  }
  if (preset === "yesterday") {
    return {
      fromTime: Math.floor((today - 86400000) / 1000),
      toTime: Math.floor(today / 1000) - 1,
    };
  }
  if (preset === "week") {
    return { fromTime: Math.floor((Date.now() - 7 * 86400000) / 1000) };
  }
  if (preset === "custom") {
    const fromTime = fromDate
      ? Math.floor(new Date(`${fromDate}T00:00:00`).getTime() / 1000)
      : undefined;
    const toTime = toDate
      ? Math.floor(new Date(`${toDate}T23:59:59`).getTime() / 1000)
      : undefined;
    return { fromTime, toTime };
  }
  return {};
}

function DeviceIcon({ dt, className }: { dt?: number; className?: string }) {
  const iconClass = cn("h-3 w-3", className);
  if (dt === 2) return <Monitor className={iconClass} />;
  if (dt === 4 || dt === 6) return <Tablet className={iconClass} />;
  if (dt === 33) return <Tv className={iconClass} />;
  if (dt === 1 || dt === 3 || dt === 5 || dt === 7) {
    return <Smartphone className={iconClass} />;
  }
  return null;
}

interface PageCacheEntry {
  items: HistoryItem[];
  nextCursor: HistoryCursor;
  hasMore: boolean;
}

const MAX_HISTORY_PAGE_CACHE = 12;

function trimHistoryPageCache(
  cache: Map<number, PageCacheEntry>,
  aroundPage: number,
) {
  if (cache.size <= MAX_HISTORY_PAGE_CACHE) return;
  const keys = [...cache.keys()].sort(
    (a, b) => Math.abs(a - aroundPage) - Math.abs(b - aroundPage),
  );
  const keep = new Set(keys.slice(0, MAX_HISTORY_PAGE_CACHE));
  for (const key of [...cache.keys()]) {
    if (!keep.has(key)) cache.delete(key);
  }
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
  layout = "grid",
  editing = false,
  selected = false,
  onToggleSelect,
}: {
  item: HistoryItem;
  deleting: boolean;
  onDelete: (item: HistoryItem) => void;
  layout?: HistoryLayout;
  editing?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
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
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-secondary",
        layout === "list" && "w-[210px] shrink-0",
      )}
    >
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
      {item.favorited && (
        <span className="absolute right-1.5 top-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] text-primary-foreground">
          已收藏
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
    <div
      className={cn(
        "space-y-1.5",
        layout === "grid" ? "mt-2" : "min-w-0 flex-1 py-0.5",
      )}
    >
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
          <DeviceIcon dt={item.dt} />
          <Clock className="h-3 w-3" />
          {formatViewClock(item.viewAt)}
        </span>
      </div>
    </div>
  );

  const body = (
    <div
      className={cn(
        "group",
        layout === "list" && "flex gap-3 rounded-xl p-2 hover:bg-secondary/60",
        editing &&
          selected &&
          "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {media}
      {meta}
    </div>
  );

  if (editing) {
    return (
      <button
        type="button"
        className="block w-full text-left"
        onClick={onToggleSelect}
      >
        {body}
      </button>
    );
  }

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
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [duration, setDuration] = useState<HistoryDurationFilter>(0);
  const [device, setDevice] = useState<HistoryDeviceFilter>("all");
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [layout, setLayout] = useState<HistoryLayout>("grid");
  const [recording, setRecording] = useState(true);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const filters = useMemo<HistoryFilters>(() => {
    const range = resolveTimeRange(timePreset, fromDate, toDate);
    return {
      keyword: keyword.trim() || undefined,
      duration,
      device,
      fromTime: range.fromTime,
      toTime: range.toTime,
    };
  }, [keyword, duration, device, timePreset, fromDate, toDate]);

  const filterKey = `${tab}|${keyword}|${duration}|${device}|${timePreset}|${fromDate}|${toDate}`;
  const isSearchMode = Boolean(keyword.trim());
  const hasExtraFilters =
    duration !== 0 ||
    device !== "all" ||
    timePreset !== "all" ||
    Boolean(fromDate || toDate);

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
            isSearchMode ? undefined : cursor,
            {
              ...filters,
              page: isSearchMode ? p : undefined,
            },
          );
          if (seq !== loadSeqRef.current) return;

          pageCacheRef.current.set(p, {
            items: result.items,
            nextCursor: result.cursor,
            hasMore: result.hasMore,
          });
          trimHistoryPageCache(pageCacheRef.current, targetPage);

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
    [applyPage, filters, isSearchMode, resetCache, tab, user?.isLogin],
  );

  useEffect(() => {
    resetCache();
    setPage(1);
    setSelectedIds(new Set());
    void fetchPage(1, { force: true });
  }, [fetchPage, filterKey, resetCache]);

  useEffect(() => {
    if (!user?.isLogin) return;
    void window.biliDesk.bili
      .getHistoryShadow()
      .then(setRecording)
      .catch(() => {});
  }, [user?.isLogin]);

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
      setSelectedIds(new Set());
      setEditing(false);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setClearing(false);
    }
  }, [resetCache]);

  const applySearch = () => {
    setKeyword(searchInput.trim());
  };

  const handleToggleRecording = async () => {
    if (recordingBusy) return;
    const next = !recording;
    setRecordingBusy(true);
    try {
      await window.biliDesk.bili.setHistoryShadow(next);
      setRecording(next);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setRecordingBusy(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    setError("");
    const selected = items.filter((item) => selectedIds.has(item.id));
    try {
      for (const item of selected) {
        await window.biliDesk.bili.deleteWatchHistory({
          business: item.business,
          oid: item.oid,
          kid: item.kid,
        });
      }
      const removed = new Set(selected.map((item) => item.id));
      setItems((prev) => prev.filter((row) => !removed.has(row.id)));
      setSelectedIds(new Set());
      void fetchPage(1, { force: true });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBatchDeleting(false);
    }
  };

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
      <div className="shrink-0 border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
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
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs",
                hasExtraFilters || filtersOpen
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              更多筛选
              {filtersOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                role="switch"
                aria-checked={recording}
                disabled={recordingBusy}
                onClick={() => void handleToggleRecording()}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  recording ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    recording ? "left-4" : "left-0.5",
                  )}
                />
              </button>
              记录浏览历史
            </label>
            <button
              type="button"
              title="网格"
              onClick={() => setLayout("grid")}
              className={cn(
                "rounded-md p-1.5",
                layout === "grid"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="列表"
              onClick={() => setLayout("list")}
              className={cn(
                "rounded-md p-1.5",
                layout === "list"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applySearch();
              }}
              placeholder="搜索标题 / UP 主昵称"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchInput ? (
              <button
                type="button"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setSearchInput("");
                  setKeyword("");
                }}
              >
                清除
              </button>
            ) : null}
          </div>
          <Button size="sm" variant="secondary" onClick={applySearch}>
            搜索
          </Button>
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
          <Button
            type="button"
            size="sm"
            variant={editing ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => {
              setEditing((value) => !value);
              setSelectedIds(new Set());
            }}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : null}
            批量管理
          </Button>
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-red-400"
              disabled={selectedIds.size === 0 || batchDeleting}
              onClick={() => void handleBatchDelete()}
            >
              {batchDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              删除 {selectedIds.size || ""}
            </Button>
          ) : null}
        </div>

        {filtersOpen ? (
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {DURATION_OPTIONS.map((option) => (
                <FilterChip
                  key={option.id}
                  active={duration === option.id}
                  onClick={() => setDuration(option.id)}
                >
                  {option.label}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {TIME_OPTIONS.map((option) => (
                <FilterChip
                  key={option.id}
                  active={timePreset === option.id}
                  onClick={() => setTimePreset(option.id)}
                >
                  {option.label}
                </FilterChip>
              ))}
              <span className="ml-1 text-muted-foreground">自定义</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setTimePreset("custom");
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
              />
              <span className="text-muted-foreground">至</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setTimePreset("custom");
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {DEVICE_OPTIONS.map((option) => (
                <FilterChip
                  key={option.id}
                  active={device === option.id}
                  onClick={() => setDevice(option.id)}
                >
                  {option.label}
                </FilterChip>
              ))}
            </div>
          </div>
        ) : null}
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
              {keyword || hasExtraFilters
                ? "没有符合筛选条件的历史记录"
                : "暂无历史记录"}
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
                  <div
                    className={cn(
                      layout === "list"
                        ? "grid grid-cols-1 gap-1 xl:grid-cols-2"
                        : "grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4",
                    )}
                  >
                    {group.items.map((item) => (
                      <HistoryCard
                        key={item.id}
                        item={item}
                        layout={layout}
                        editing={editing}
                        selected={selectedIds.has(item.id)}
                        deleting={deletingId === item.id}
                        onToggleSelect={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
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
