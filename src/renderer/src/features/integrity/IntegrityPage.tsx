import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AbnormalFollowingRecord,
  IntegrityScanProgress,
  IntegrityScanResult,
  IntegrityScanScope,
  InvalidVideoRecord,
  InvalidVideoSource,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserX,
} from "lucide-react";

type TabId = IntegrityScanScope;

const TABS: Array<{ id: TabId; label: string; scanLabel: string }> = [
  { id: "favorites", label: "失效收藏", scanLabel: "扫描失效收藏" },
  { id: "toview", label: "失效稍后再看", scanLabel: "扫描稍后再看" },
  { id: "following", label: "异常关注", scanLabel: "扫描异常关注" },
];

function sourceLabel(source: InvalidVideoSource): string {
  if (source === "favorite") return "收藏";
  if (source === "toview") return "稍后再看";
  return "本地稍后再看";
}

function formatTime(ts: number): string {
  if (!ts) return "尚未扫描";
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function emptyArchive(): IntegrityScanResult {
  return {
    invalidVideos: [],
    abnormalFollowings: [],
    scannedAt: 0,
    stats: {
      invalidFavorites: 0,
      invalidToView: 0,
      abnormalFollowings: 0,
    },
  };
}

export function IntegrityPage() {
  const user = useAppStore((s) => s.user);
  const [tab, setTab] = useState<TabId>("favorites");
  const [archive, setArchive] = useState<IntegrityScanResult>(emptyArchive);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<IntegrityScanProgress | null>(null);
  const [error, setError] = useState("");

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await window.biliDesk.bili.getIntegrityArchive();
      setArchive(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载归档失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    return window.biliDesk.bili.onIntegrityProgress((p) => setProgress(p));
  }, []);

  const currentTab = TABS.find((item) => item.id === tab) ?? TABS[0];

  const runScan = async () => {
    if (!user?.isLogin) {
      setError("请先登录");
      return;
    }
    setScanning(true);
    setError("");
    setProgress({
      phase: tab,
      message: `开始${currentTab.scanLabel}…`,
      current: 0,
      total: 0,
    });
    try {
      const result = await window.biliDesk.bili.scanIntegrity(tab);
      setArchive(result);
      setProgress({
        phase: "done",
        message: "扫描完成",
        current: 1,
        total: 1,
      });
      if (result.warnings && result.warnings.length > 0) {
        setError(
          `扫描完成，但有 ${result.warnings.length} 处跳过：${result.warnings.slice(0, 3).join("；")}${result.warnings.length > 3 ? "…" : ""}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
      setProgress(null);
    } finally {
      setScanning(false);
    }
  };

  const favVideos = useMemo(
    () => archive.invalidVideos.filter((v) => v.source === "favorite"),
    [archive.invalidVideos],
  );
  const toviewVideos = useMemo(
    () =>
      archive.invalidVideos.filter(
        (v) => v.source === "toview" || v.source === "toview-local",
      ),
    [archive.invalidVideos],
  );

  const dismissVideo = async (id: string) => {
    const next = await window.biliDesk.bili.dismissInvalidVideo(id);
    setArchive(next);
  };

  const dismissFollowing = async (mid: number) => {
    const next = await window.biliDesk.bili.dismissAbnormalFollowing(mid);
    setArchive(next);
  };

  const clearCurrent = async () => {
    const next = await window.biliDesk.bili.clearIntegrityArchive(tab);
    setArchive(next);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert className="h-5 w-5 text-primary" />
            失效与异常检测
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            三个分类互相独立：切换 Tab
            后点「扫描当前分类」只跑这一项，不会每次都从收藏开始。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            上次扫描：{formatTime(archive.scannedAt)}
            {archive.stats
              ? ` · 收藏失效 ${archive.stats.invalidFavorites} · 稍后再看 ${archive.stats.invalidToView} · 异常关注 ${archive.stats.abnormalFollowings}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={scanning || loading}
            onClick={() => void clearCurrent()}
          >
            清空当前分类
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
                {currentTab.scanLabel}
              </>
            )}
          </Button>
        </div>
      </div>

      {(scanning || (progress && progress.phase !== "done")) && (
        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-foreground">
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

      <div className="flex gap-2 border-b border-border pb-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={scanning}
            onClick={() => {
              setTab(item.id);
              setError("");
              setProgress(null);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              tab === item.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {item.label}
            <span className="ml-1.5 text-xs opacity-70">
              {item.id === "favorites"
                ? favVideos.length
                : item.id === "toview"
                  ? toviewVideos.length
                  : archive.abnormalFollowings.length}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : tab === "following" ? (
          <FollowingList
            items={archive.abnormalFollowings}
            onDismiss={dismissFollowing}
          />
        ) : (
          <VideoList
            items={tab === "favorites" ? favVideos : toviewVideos}
            onDismiss={dismissVideo}
            emptyHint={
              tab === "favorites"
                ? "暂无失效收藏。点右上角「扫描失效收藏」开始检测。"
                : "暂无失效稍后再看。点右上角「扫描稍后再看」开始检测。"
            }
          />
        )}
      </div>
    </div>
  );
}

function VideoList({
  items,
  onDismiss,
  emptyHint,
}: {
  items: InvalidVideoRecord[];
  onDismiss: (id: string) => Promise<void>;
  emptyHint: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle className="h-5 w-5 opacity-50" />
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex gap-3 rounded-xl border border-border bg-card/40 p-3"
        >
          <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-secondary">
            {item.cover ? (
              <BiliImage
                src={item.cover}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                无封面
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "line-clamp-2 text-sm font-medium",
                item.titlePlaceholder && "text-muted-foreground",
              )}
              title={item.title}
            >
              {item.title}
              {item.titlePlaceholder ? "（原标题未知）" : ""}
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.upperMid > 0 ? (
                <Link
                  to={`/up/${item.upperMid}`}
                  className="hover:text-primary"
                >
                  {item.upperName}
                </Link>
              ) : (
                item.upperName
              )}
              {item.bvid ? ` · ${item.bvid}` : ""}
            </p>
            <p className="mt-1 text-xs text-amber-500/90">
              {item.reason}
              {item.folderTitle ? ` · ${item.folderTitle}` : ""}
              {` · ${sourceLabel(item.source)}`}
            </p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => void onDismiss(item.id)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                从归档移除
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FollowingList({
  items,
  onDismiss,
}: {
  items: AbnormalFollowingRecord[];
  onDismiss: (mid: number) => Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <UserX className="h-5 w-5 opacity-50" />
        暂无异常关注。点右上角「扫描异常关注」开始检测。
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.mid}
          className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3"
        >
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
            <Link
              to={`/up/${item.mid}`}
              className="truncate text-sm font-medium hover:text-primary"
            >
              {item.name || `UID ${item.mid}`}
            </Link>
            <p className="mt-0.5 text-xs text-amber-500/90">
              {item.reasonText}
            </p>
            {item.sign ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {item.sign}
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-xs text-muted-foreground"
            onClick={() => void onDismiss(item.mid)}
          >
            移除
          </Button>
        </article>
      ))}
    </div>
  );
}
