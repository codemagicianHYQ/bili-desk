import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Heart, X } from "lucide-react";
import type { CommandDanmakuItem } from "@shared/types";
import { cn } from "@/lib/utils";

/** 官网按票数向下取整，最后一项吃掉余数，保证加总是 100 */
function voteOptionPercents(counts: number[]): number[] {
  const safe = counts.map((count) => Math.max(0, count));
  const total = safe.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return safe.map(() => 0);
  let used = 0;
  return safe.map((count, index) => {
    if (index === safe.length - 1) return Math.max(100 - used, 0);
    const percent = Math.floor((count / total) * 100);
    used += percent;
    return percent;
  });
}

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
  const [voteRevealId, setVoteRevealId] = useState("");
  const [voteAnim, setVoteAnim] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setDismissed(new Set());
    setError("");
    setVoteRevealId("");
    setVoteAnim(1);
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

  useEffect(() => {
    if (!voteRevealId) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1000);
      setVoteAnim(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [voteRevealId]);

  const active = useMemo(() => {
    const ms = currentTime * 1000;
    return (
      items.find((item) => {
        if (dismissed.has(item.id)) return false;
        return ms >= item.progress && ms <= item.progress + item.duration;
      }) ?? null
    );
  }, [items, currentTime, dismissed]);

  const openingVotedId =
    active?.kind === "vote" && (active.myVote ?? 0) > 0 ? active.id : "";
  if (openingVotedId && openingVotedId !== voteRevealId) {
    setVoteAnim(0);
    setVoteRevealId(openingVotedId);
  }

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
      setError(formatDisplayedError(err, undefined, "操作失败"));
    } finally {
      setBusyId("");
    }
  };

  const submitVote = async (
    item: CommandDanmakuItem,
    idx: number,
    hasSelfDef = false,
  ) => {
    if (!item.voteId || busyId || item.myVote) return;
    setBusyId(item.id);
    setError("");
    try {
      const res = await window.biliDesk.bili.postCommandVote({
        aid,
        cid,
        progress: Math.max(0, Math.round(currentTime * 1000)),
        voteId: item.voteId,
        idx,
        voteType: item.voteType ?? 0,
        cmdId: item.id,
        hasSelfDef: hasSelfDef ? 1 : 0,
      });
      const options = (item.options ?? []).map((opt) =>
        opt.idx === idx ? { ...opt, count: opt.count + 1 } : opt,
      );
      setVoteAnim(0);
      setVoteRevealId(item.id);
      patchItem(item.id, {
        myVote: res.myVote,
        count: item.count + 1,
        options,
      });
    } catch (err) {
      setError(formatDisplayedError(err, undefined, "操作失败"));
    } finally {
      setBusyId("");
    }
  };

  if (!active) return null;

  if (active.kind === "vote") {
    const voted = (active.myVote ?? 0) > 0;
    const revealing = voted && voteRevealId === active.id;
    const progress = revealing ? voteAnim : 1;
    const counts = (active.options ?? []).map((opt) => opt.count);
    const percents = voteOptionPercents(counts);
    return (
      <div
        className={cn("pointer-events-none absolute inset-0 z-40", className)}
      >
        <div
          className={cn(
            "pointer-events-auto absolute left-1/2 top-1/2 w-[248px] -translate-x-1/2 -translate-y-1/2",
            "rounded-lg bg-[rgba(24,25,28,0.86)] px-2.5 pb-1.5 pt-2.5 text-white shadow-lg",
          )}
        >
          <button
            type="button"
            className="absolute -right-1.5 -top-2.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/80 bg-black/45 text-white hover:bg-black/70"
            onClick={() => setDismissed((prev) => new Set(prev).add(active.id))}
            aria-label="关闭"
          >
            <X className="h-3 w-3" />
          </button>
          <p className="truncate px-1 text-[13px] leading-[16px]">
            {active.title}
          </p>
          <div className="mt-1.5">
            {(active.options ?? []).map((opt, index) => {
              const percent = percents[index] ?? 0;
              const picked = active.myVote === opt.idx;
              const shown = voted ? Math.round(percent * progress) : 0;
              const width = voted ? percent * progress : 0;
              return (
                <button
                  key={opt.idx}
                  type="button"
                  disabled={Boolean(busyId) || voted}
                  onClick={() =>
                    void submitVote(active, opt.idx, Boolean(opt.hasSelfDef))
                  }
                  className={cn(
                    "relative mb-1.5 block h-[28px] w-full overflow-hidden rounded-[4px] text-left",
                    "transition-colors duration-300",
                    voted
                      ? "cursor-default bg-black/45"
                      : "cursor-pointer bg-white/20 hover:bg-white/30",
                  )}
                >
                  {voted && (
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${width}%`,
                        background: picked
                          ? "#00A1D6"
                          : "rgba(255,255,255,0.28)",
                        borderRadius: percent >= 100 ? 4 : "4px 0 0 4px",
                      }}
                    />
                  )}
                  <span className="relative z-[1] flex h-full items-center pl-2.5 pr-11 text-[12px] leading-none text-white">
                    <span className="truncate">{opt.desc}</span>
                  </span>
                  {voted && (
                    <span className="absolute right-1.5 top-0 z-[1] flex h-full items-center text-[12px] tabular-nums text-white">
                      {shown}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="mb-1 px-1 text-[11px] text-red-300">{error}</p>
          )}
        </div>
      </div>
    );
  }

  const accent = active.skinFontColor || "#FA5555";
  const done = (active.midScore ?? 0) > 0;

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
