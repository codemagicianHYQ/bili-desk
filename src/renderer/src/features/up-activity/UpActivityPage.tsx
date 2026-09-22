import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  UpActivityArchive,
  UpActivityRecord,
  UpActivityScanProgress,
  UpActivitySource,
  UpActivityTimeFilter,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { FollowActionButton } from "@/components/video/FollowActionButton";
import { useAppStore } from "@/stores/app-store";
import { useFollowingStore } from "@/stores/following-store";
import { cn } from "@/lib/utils";
import {
  Activity,
  Clapperboard,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Trash2,
} from "lucide-react";

const SOURCE_OPTIONS: Array<{ id: UpActivitySource; label: string }> = [
  { id: "video", label: "稿件" },
  { id: "dynamic", label: "动态" },
];

/** 互斥时间桶：每个 UP 只会出现在恰好一个区间里 */
const TIME_OPTIONS: Array<{ id: UpActivityTimeFilter; label: string }> = [
  { id: "age0_3", label: "3 天内有更新" },
  { id: "age3_7", label: "超过 3～7 天未更新" },
  { id: "age7_30", label: "超过 7～30 天未更新" },
  { id: "age30_90", label: "超过 30～90 天未更新" },
  { id: "age90_180", label: "超过 90 天～半年未更新" },
  { id: "age180_365", label: "超过半年～一年未更新" },
  { id: "age365_plus", label: "超过一年未更新" },
  { id: "never", label: "暂无稿件/动态" },
];

const DAY_SEC = 86400;
const PAGE_SIZE = 36;

/** 互斥区间上界（天）：(prev, bound]，最后一档 >365 */
const AGE_BUCKETS: Array<{ id: UpActivityTimeFilter; maxDays: number }> = [
  { id: "age0_3", maxDays: 3 },
  { id: "age3_7", maxDays: 7 },
  { id: "age7_30", maxDays: 30 },
  { id: "age30_90", maxDays: 90 },
  { id: "age90_180", maxDays: 180 },
  { id: "age180_365", maxDays: 365 },
];

function formatTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatScanAt(ts: number): string {
  if (!ts) return "尚未扫描";
  const d = new Date(ts * 1000);
  return `${formatTime(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatRelative(ts: number, now: number): string {
  if (!ts) return "无记录";
  const days = Math.floor((now - ts) / DAY_SEC);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function effectiveAt(
  item: UpActivityRecord,
  sources: Set<UpActivitySource>,
): number {
  const times: number[] = [];
  if (sources.has("video") && item.latestVideoAt > 0) {
    times.push(item.latestVideoAt);
  }
  if (sources.has("dynamic") && item.latestDynamicAt > 0) {
    times.push(item.latestDynamicAt);
  }
  return times.length > 0 ? Math.max(...times) : 0;
}

function matchTimeFilter(
  at: number,
  filter: UpActivityTimeFilter,
  now: number,
): boolean {
  if (filter === "never") return at <= 0;
  if (at <= 0) return false;

  const ageDays = (now - at) / DAY_SEC;
  if (filter === "age365_plus") return ageDays > 365;

  let prev = 0;
  for (const bucket of AGE_BUCKETS) {
    if (bucket.id === filter) {
      return ageDays > prev && ageDays <= bucket.maxDays;
    }
    prev = bucket.maxDays;
  }
  return false;
}

function emptyArchive(): UpActivityArchive {
  return { items: [], scannedAt: 0 };
}

export function UpActivityPage() {
  const user = useAppStore((s) => s.user);
  const [archive, setArchive] = useState<UpActivityArchive>(emptyArchive);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<UpActivityScanProgress | null>(null);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<Set<UpActivitySource>>(
    () => new Set(["video", "dynamic"]),
  );
  const [timeFilter, setTimeFilter] = useState<UpActivityTimeFilter>("age0_3");
  const [page, setPage] = useState(1);
  const now = Math.floor(Date.now() / 1000);
  const ensureAllFollowings = useFollowingStore((s) => s.ensureAllFollowings);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let data = await window.biliDesk.bili.getUpActivityArchive();
      // 取关后若只改了关注关系、缓存未剔，再进页会冒回来；对照当前关注列表清掉
      try {
        const followings = await ensureAllFollowings();
        const still = new Set(followings.map((u) => u.mid));
        const stale = data.items
          .filter((item) => !still.has(item.mid))
          .map((item) => item.mid);
        if (stale.length > 0) {
          data = await window.biliDesk.bili.removeUpActivityRecords(stale);
        }
      } catch {
        // 关注列表拉失败时仍展示缓存，取关时会单独剔缓存
      }
      setArchive(data);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [ensureAllFollowings]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    return window.biliDesk.bili.onUpActivityProgress((p) => setProgress(p));
  }, []);

  const toggleSource = (id: UpActivitySource) => {
    setSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // 至少保留一个
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setPage(1);
  };

  const runScan = async () => {
    if (!user?.isLogin) {
      setError("请先登录");
      return;
    }
    setScanning(true);
    setError("");
    setProgress({
      phase: "followings",
      message: "开始扫描…",
      current: 0,
      total: 0,
    });
    try {
      const result = await window.biliDesk.bili.scanUpActivity();
      setArchive(result);
      setPage(1);
      setProgress({
        phase: "done",
        message: "扫描完成",
        current: 1,
        total: 1,
      });
      if (result.warnings?.length) {
        setError(
          `扫描完成，部分 UP 失败 ${result.warnings.length} 个：${result.warnings.slice(0, 2).join("；")}${result.warnings.length > 2 ? "…" : ""}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
      setProgress(null);
    } finally {
      setScanning(false);
    }
  };

  const filtered = useMemo(() => {
    const list = archive.items
      .map((item) => ({
        item,
        at: effectiveAt(item, sources),
      }))
      .filter(({ at }) => matchTimeFilter(at, timeFilter, now));
    list.sort((a, b) => b.at - a.at);
    return list;
  }, [archive.items, sources, timeFilter, now]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            UP 活跃状态
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            拉取关注列表后，分别取每位 UP
            最新稿件与最新动态时间。来源可叠加；时间档为互斥区间（无重叠）。扫描结果会写入本地缓存，下次打开直接读，不必重扫。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            上次扫描：{formatScanAt(archive.scannedAt)} · 共{" "}
            {archive.items.length} 位 · 当前筛选 {filtered.length} 位
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={scanning || loading}
            onClick={async () => {
              const next = await window.biliDesk.bili.clearUpActivityArchive();
              setArchive(next);
              setPage(1);
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            清空
          </Button>
          <Button size="sm" disabled={scanning} onClick={() => void runScan()}>
            {scanning ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                扫描中
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                扫描活跃度
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">来源（可叠加）</span>
          {SOURCE_OPTIONS.map((opt) => {
            const active = sources.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleSource(opt.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.id === "video" ? (
                  <Clapperboard className="h-3.5 w-3.5" />
                ) : (
                  <MessageSquareText className="h-3.5 w-3.5" />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">时间（互斥）</span>
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setTimeFilter(opt.id);
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                timeFilter === opt.id
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {(scanning || (progress && progress.phase !== "done")) && (
        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {progress?.message ?? "扫描中…"}
          </div>
          {progress && progress.total > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            error.startsWith("扫描完成")
              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {error}
        </div>
      )}

      <div
        data-up-activity-scroll
        className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay"
      >
        {" "}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-5 w-5 opacity-50" />
            {archive.items.length === 0
              ? "还没有数据，点右上角「扫描活跃度」开始。"
              : "当前筛选条件下没有 UP，试试换时间窗或来源。"}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {paged.map(({ item, at }) => (
                <ActivityCard
                  key={item.mid}
                  item={item}
                  effectiveAt={at}
                  sources={sources}
                  now={now}
                  onRemoved={async (mid) => {
                    const next =
                      await window.biliDesk.bili.removeUpActivityRecords([mid]);
                    setArchive(next);
                  }}
                  onError={setError}
                />
              ))}
            </div>
            {filtered.length > PAGE_SIZE && (
              <PaginationBar
                variant="pages"
                className="mt-3 rounded-xl border border-border bg-card/30 px-4"
                page={safePage}
                totalPages={totalPages}
                totalCount={filtered.length}
                onPageChange={(next) => {
                  setPage(next);
                  const scroller = document.querySelector(
                    "[data-up-activity-scroll]",
                  );
                  if (scroller instanceof HTMLElement) {
                    scroller.scrollTop = 0;
                  }
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActivityCard({
  item,
  effectiveAt: at,
  sources,
  now,
  onRemoved,
  onError,
}: {
  item: UpActivityRecord;
  effectiveAt: number;
  sources: Set<UpActivitySource>;
  now: number;
  onRemoved: (mid: number) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [following, setFollowing] = useState(true);
  const storeEntry = useFollowingStore((state) =>
    state.allFollowings?.find((up) => up.mid === item.mid),
  );
  const [special, setSpecial] = useState(Boolean(storeEntry?.special));

  useEffect(() => {
    if (storeEntry?.special != null) {
      setSpecial(Boolean(storeEntry.special));
    }
  }, [storeEntry?.special]);

  if (!following) return null;

  return (
    <article className="flex gap-3 rounded-xl border border-border bg-card/40 p-3">
      <Link to={`/up/${item.mid}`} className="shrink-0">
        {item.face ? (
          <BiliImage
            src={item.face}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-xs">
            UP
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/up/${item.mid}`}
            className="truncate text-sm font-medium hover:text-primary"
          >
            {item.name || `UID ${item.mid}`}
          </Link>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px]",
                at <= 0
                  ? "bg-secondary text-muted-foreground"
                  : now - at > 90 * DAY_SEC
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-emerald-500/15 text-emerald-300",
              )}
            >
              {formatRelative(at, now)}
            </span>
            <FollowActionButton
              mid={item.mid}
              uname={item.name || `UID ${item.mid}`}
              face={item.face}
              isFollowing={following}
              isSpecial={special}
              size="sm"
              onFollowingChange={(next) => {
                setFollowing(next);
                if (!next) void onRemoved(item.mid);
              }}
              onSpecialChange={setSpecial}
              onError={onError}
            />
          </div>
        </div>

        {sources.has("video") && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground pr-[7.5rem]">
            <Clapperboard className="mr-1 inline h-3 w-3" />
            稿件 {formatTime(item.latestVideoAt)}
            {item.latestVideoTitle ? ` · ${item.latestVideoTitle}` : " · 无"}
          </p>
        )}
        {sources.has("dynamic") && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground pr-[7.5rem]">
            <MessageSquareText className="mr-1 inline h-3 w-3" />
            动态 {formatTime(item.latestDynamicAt)}
            {item.latestDynamicText ? ` · ${item.latestDynamicText}` : " · 无"}
          </p>
        )}

        {item.latestVideoBvid && sources.has("video") ? (
          <Link
            to={`/video/${item.latestVideoBvid}`}
            className="mt-1 inline-block text-xs text-primary hover:underline"
          >
            看最新稿件
          </Link>
        ) : null}
        {item.error ? (
          <p className="mt-1 text-xs text-destructive">{item.error}</p>
        ) : null}
      </div>
    </article>
  );
}
