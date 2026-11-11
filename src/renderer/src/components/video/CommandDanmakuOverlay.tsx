import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, X } from "lucide-react";
import type { CommandDanmakuItem } from "@shared/types";
import { cn } from "@/lib/utils";

interface CommandDanmakuOverlayProps {
  aid: number;
  cid: number;
  /** 当前播放秒数；由父组件从播放器同步 */
  currentTime: number;
  className?: string;
}

export function CommandDanmakuOverlay({
  aid,
  cid,
  currentTime,
  className,
}: CommandDanmakuOverlayProps) {
  const [items, setItems] = useState<CommandDanmakuItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setDismissed(new Set());
    setError("");
    void window.biliDesk.bili
      .getCommandDanmakuList(aid, cid)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [aid, cid]);

  const active = useMemo(() => {
    const ms = currentTime * 1000;
    return (
      items.find((item) => {
        if (dismissed.has(item.id)) return false;
        return ms >= item.progress && ms <= item.progress + item.duration;
      }) ?? null
    );
  }, [items, currentTime, dismissed]);

  const patchItem = useCallback(
    (id: string, patch: Partial<CommandDanmakuItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const submitGrade = async (item: CommandDanmakuItem, hearts: number) => {
    if (!item.gradeId || busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      const res = await window.biliDesk.bili.postCommandGrade({
        aid,
        cid,
        progress: item.progress,
        gradeId: item.gradeId,
        hearts,
      });
      patchItem(item.id, {
        midScore: res.midScore,
        count: item.count + (item.midScore ? 0 : 1),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  };

  const submitVote = async (item: CommandDanmakuItem, idx: number) => {
    if (!item.voteId || busyId || item.myVote) return;
    setBusyId(item.id);
    setError("");
    try {
      const res = await window.biliDesk.bili.postCommandVote({
        aid,
        cid,
        progress: item.progress,
        voteId: item.voteId,
        idx,
      });
      const options = (item.options ?? []).map((opt) =>
        opt.idx === idx ? { ...opt, count: opt.count + 1 } : opt,
      );
      patchItem(item.id, {
        myVote: res.myVote,
        count: item.count + 1,
        options,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  };

  if (!active) return null;

  const accent = active.skinFontColor || "#FA5555";
  const done =
    (active.kind === "grade" && (active.midScore ?? 0) > 0) ||
    (active.kind === "vote" && (active.myVote ?? 0) > 0);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-[3.6rem] z-40 flex justify-center px-3 sm:bottom-[4.5rem]",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[min(92%,26rem)] rounded-2xl border border-white/15",
          "bg-black/78 px-3.5 py-3 text-white shadow-xl backdrop-blur-md",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium">{active.title}</p>
              <span className="shrink-0 text-[11px] text-white/65">
                {active.count > 0 ? `${active.count}人参与` : "互动"}
              </span>
            </div>

            {active.kind === "grade" && (
              <div className="mt-2.5 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((heart) => {
                  const selected = (active.midScore ?? 0) >= heart * 2;
                  return (
                    <button
                      key={heart}
                      type="button"
                      disabled={Boolean(busyId) || done}
                      onClick={() => void submitGrade(active, heart)}
                      className="rounded-md p-0.5 transition-transform hover:scale-110 disabled:opacity-70"
                      title={done ? "已评分" : `打 ${heart} 分`}
                    >
                      <Heart
                        className="h-6 w-6"
                        style={{
                          color: accent,
                          fill: selected ? accent : "transparent",
                        }}
                      />
                    </button>
                  );
                })}
                {done && active.avgScore != null && (
                  <span className="ml-2 text-xs text-white/70">
                    均分 {active.avgScore.toFixed(1)}
                  </span>
                )}
              </div>
            )}

            {active.kind === "vote" && (
              <div className="mt-2.5 space-y-1.5">
                {(active.options ?? []).map((opt) => {
                  const total = Math.max(
                    1,
                    (active.options ?? []).reduce((s, o) => s + o.count, 0),
                  );
                  const percent = Math.round((opt.count / total) * 100);
                  const picked = active.myVote === opt.idx;
                  return (
                    <button
                      key={opt.idx}
                      type="button"
                      disabled={Boolean(busyId) || done}
                      onClick={() => void submitVote(active, opt.idx)}
                      className={cn(
                        "relative flex w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-xs",
                        picked
                          ? "border-primary/60 bg-primary/20"
                          : "border-white/15 bg-white/5 hover:bg-white/10",
                      )}
                    >
                      {done && (
                        <span
                          className="absolute inset-y-0 left-0 bg-white/15"
                          style={{ width: `${percent}%` }}
                        />
                      )}
                      <span className="relative z-[1] flex w-full items-center justify-between gap-2">
                        <span className="truncate">{opt.desc}</span>
                        {done && (
                          <span className="shrink-0 text-white/70">
                            {percent}%
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() => setDismissed((prev) => new Set(prev).add(active.id))}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
