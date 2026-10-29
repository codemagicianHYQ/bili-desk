import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { FollowTagSyncPlan, FollowTagSyncStatus } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { useFollowingStore } from "@/stores/following-store";
import { cn } from "@/lib/utils";

const ACTION_LABEL = {
  create: "新建",
  adopt: "接管",
  rename: "改名",
  keep: "沿用",
} as const;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.ceil(seconds / 60)} 分钟`;
}

interface FollowTagSyncDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FollowTagSyncDialog({
  open,
  onClose,
}: FollowTagSyncDialogProps) {
  const [plan, setPlan] = useState<FollowTagSyncPlan | null>(null);
  const [status, setStatus] = useState<FollowTagSyncStatus | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const finishedRef = useRef(false);

  const running = status?.state === "running";
  const finished =
    status != null &&
    (status.state === "done" ||
      status.state === "failed" ||
      status.state === "cancelled");

  const preview = useCallback(async () => {
    setPreviewing(true);
    setError("");
    setPlan(null);
    try {
      const all = await useFollowingStore.getState().ensureAllFollowings();
      const next = await window.biliDesk.bili.previewFollowTagSync(
        all.map((up) => up.mid),
      );
      setPlan(next);
    } catch (err) {
      setError(extractIpcErrorMessage(err) || "预览失败");
    } finally {
      setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    finishedRef.current = false;
    setStatus(null);
    void window.biliDesk.bili.getFollowTagSyncStatus().then((current) => {
      if (current.state === "running") setStatus(current);
      else void preview();
    });
  }, [open, preview]);

  useEffect(() => {
    if (!open || !running) return;
    const timer = window.setInterval(() => {
      void window.biliDesk.bili.getFollowTagSyncStatus().then(setStatus);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, running]);

  useEffect(() => {
    if (!finished || finishedRef.current) return;
    finishedRef.current = true;
    const store = useFollowingStore.getState();
    store.clearTagLists();
    void store.refreshFollowTags().catch(() => undefined);
  }, [finished]);

  const start = async () => {
    if (!plan) return;
    setError("");
    try {
      await window.biliDesk.bili.startFollowTagSync(plan.planId);
      setStatus(await window.biliDesk.bili.getFollowTagSyncStatus());
    } catch (err) {
      setError(extractIpcErrorMessage(err) || "启动同步失败");
    }
  };

  if (!open) return null;

  const nothingToDo = plan != null && plan.writeRequests === 0;
  const percent =
    status && status.total > 0
      ? Math.min(100, Math.round((status.done / status.total) * 100))
      : 0;

  return (
    <OverlayPortal>
      <div
        className={cn(
          "fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm",
          APP_OVERLAY_ZCLASS,
        )}
        data-glass-scrim
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          data-glass-panel
          className="bili-glass flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card/40 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">同步本地分组到 B 站</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                每个二级分组对应一个 B
                站分组，名字为「一级·二级」。只增删由这里同步出来的分组，你手动建的分组不会动；未分组的
                UP 不处理。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 text-sm">
            {error && (
              <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            {status ? (
              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      status.state === "failed" ? "bg-red-400" : "bg-primary",
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {status.done} / {status.total}　{status.message}
                  </span>
                </p>
                {running && (
                  <p className="text-xs text-muted-foreground">
                    为避免触发风控，每个请求之间会间隔两三秒。可以关掉这个窗口，同步会在后台继续。
                  </p>
                )}
                {status.errors.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {status.errors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : previewing ? (
              <p className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在对比本地分组和 B 站分组…
              </p>
            ) : plan ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-secondary/60 px-2 py-2">
                    <div className="text-base font-semibold text-foreground">
                      {plan.groups.length}
                    </div>
                    同步分组
                  </div>
                  <div className="rounded-lg bg-secondary/60 px-2 py-2">
                    <div className="text-base font-semibold text-foreground">
                      {plan.writeRequests}
                    </div>
                    写请求
                  </div>
                  <div className="rounded-lg bg-secondary/60 px-2 py-2">
                    <div className="text-base font-semibold text-foreground">
                      {formatDuration(plan.estimatedSeconds)}
                    </div>
                    预计耗时
                  </div>
                </div>

                {plan.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {warning}
                  </p>
                ))}
                {plan.skippedUnfollowed > 0 && (
                  <p className="text-xs text-muted-foreground">
                    本地分组里有 {plan.skippedUnfollowed} 个已取关的
                    UP，不会同步。
                  </p>
                )}
                {nothingToDo && (
                  <p className="text-xs text-muted-foreground">
                    B 站分组已经和本地一致，不需要同步。
                  </p>
                )}

                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {plan.deleteTags.map((tag) => (
                    <li
                      key={`del-${tag.tagId}`}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs"
                    >
                      <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">
                        删除
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {tag.name}
                      </span>
                      <span className="text-muted-foreground">
                        本地已无此分组，{tag.count} 人回默认分组或留在其它分组
                      </span>
                    </li>
                  ))}
                  {plan.groups.map((group) => (
                    <li
                      key={group.groupId}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs"
                    >
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5",
                          group.action === "create" &&
                            "bg-primary/15 text-primary",
                          group.action === "adopt" &&
                            "bg-amber-500/15 text-amber-400",
                          group.action === "rename" &&
                            "bg-sky-500/15 text-sky-400",
                          group.action === "keep" &&
                            "bg-secondary text-muted-foreground",
                        )}
                      >
                        {ACTION_LABEL[group.action]}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={
                          group.oldName ? `原名：${group.oldName}` : undefined
                        }
                      >
                        {group.tagName}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {group.total} 人
                        {group.addCount > 0 && (
                          <span className="ml-1.5 text-emerald-400">
                            +{group.addCount}
                          </span>
                        )}
                        {group.removeCount > 0 && (
                          <span className="ml-1.5 text-red-400">
                            −{group.removeCount}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 p-4 pt-2">
            {running ? (
              <>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                >
                  后台继续
                </Button>
                <Button
                  className="flex-1 border border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                  onClick={() =>
                    void window.biliDesk.bili.cancelFollowTagSync()
                  }
                >
                  停止同步
                </Button>
              </>
            ) : finished ? (
              <>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setStatus(null);
                    void preview();
                  }}
                >
                  重新预览
                </Button>
                <Button className="flex-1" onClick={onClose}>
                  完成
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  disabled={previewing || !plan || nothingToDo}
                  onClick={() => void start()}
                >
                  开始同步
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
