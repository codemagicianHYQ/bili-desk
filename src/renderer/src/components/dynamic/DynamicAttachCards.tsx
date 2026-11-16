import { useState } from "react";
import type {
  DynamicLotteryCard,
  DynamicVoteCard,
  SpaceDynamicItem,
} from "@shared/types";
import { formatDisplayedError } from "@/lib/ipc-error";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn, formatCount } from "@/lib/utils";
import { Gift, Vote } from "lucide-react";
import { useNavigate } from "react-router-dom";

function joinLabel(vote: DynamicVoteCard): string {
  const text = vote.joinText?.replace(/\s*·.*$/, "").trim();
  if (text) return text;
  if (vote.joinNum > 0) return `${formatCount(vote.joinNum)}人参与`;
  return "";
}

function deadlineLabel(endTime: number): string {
  if (!endTime) return "";
  const remain = endTime - Math.floor(Date.now() / 1000);
  if (remain <= 0) return "已截止";
  const days = Math.floor(remain / 86400);
  const hours = Math.floor((remain % 86400) / 3600);
  const minutes = Math.floor((remain % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}分钟`);
  return `${parts.join("")}后截止`;
}

function voteEnded(vote: DynamicVoteCard): boolean {
  return vote.endTime > 0 && vote.endTime <= Math.floor(Date.now() / 1000);
}

function optionPercents(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return counts.map(() => 0);
  return counts.map((count) => (count / total) * 100);
}

export function DynamicVoteCardView({
  vote,
  mode,
}: {
  vote: DynamicVoteCard;
  mode: "compact" | "detail";
}) {
  const [card, setCard] = useState(vote);
  const [picked, setPicked] = useState<number[]>(vote.myVotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ended = voteEnded(card);
  const showResult = card.voted || ended;
  const percents = optionPercents(card.options.map((option) => option.count));
  const join = joinLabel(card);
  const deadline = deadlineLabel(card.endTime);
  const footer = [join, deadline].filter(Boolean).join(" · ");
  const actionText = card.voted
    ? "已投票"
    : ended
      ? "已截止"
      : card.buttonText || "参与";

  const submit = async (idxs: number[]) => {
    if (busy || card.voted || ended || idxs.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const next = await window.biliDesk.bili.doDynamicVote(card.voteId, idxs);
      setCard(next);
      setPicked(next.myVotes);
    } catch (err) {
      setError(formatDisplayedError(err, "投票失败"));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "compact" || card.options.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-black/25 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10 text-foreground/80">
          <Vote className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.title}</p>
          {join ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{join}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-3.5 py-1.5 text-sm",
            card.voted || ended
              ? "bg-white/10 text-muted-foreground"
              : "bg-[#00aeec] text-white",
          )}
        >
          {actionText}
        </span>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-xl bg-black/25 px-4 py-3"
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-[15px] font-medium">{card.title}</p>
      <div className="space-y-2">
        {card.options.map((option, index) => {
          const selected = card.myVotes.includes(option.idx);
          const percent = percents[index] ?? 0;
          const interactive = !showResult && !busy;
          return (
            <button
              key={option.idx}
              type="button"
              disabled={!interactive}
              onClick={() => {
                if (card.choiceCount > 1) {
                  setPicked((current) => {
                    if (current.includes(option.idx)) {
                      return current.filter((idx) => idx !== option.idx);
                    }
                    if (current.length >= card.choiceCount) return current;
                    return [...current, option.idx];
                  });
                  return;
                }
                void submit([option.idx]);
              }}
              className={cn(
                "relative block w-full overflow-hidden rounded-md text-left",
                interactive && "hover:bg-white/5",
                !showResult &&
                  picked.includes(option.idx) &&
                  "ring-1 ring-[#00aeec]",
              )}
            >
              {showResult ? (
                <span
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${Math.max(0, Math.min(100, percent))}%`,
                    background: selected ? "#00aeec" : "rgba(255,255,255,0.16)",
                  }}
                />
              ) : (
                <span className="absolute inset-0 bg-white/5" />
              )}
              <span className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">{option.text}</span>
                {showResult ? (
                  <span className="shrink-0 tabular-nums">
                    {percent.toFixed(1)}%
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {card.choiceCount > 1 && !showResult ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            最多选 {card.choiceCount} 项
          </span>
          <button
            type="button"
            disabled={busy || picked.length === 0}
            onClick={() => void submit(picked)}
            className="rounded-md bg-[#00aeec] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            投票
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{footer}</span>
        {showResult ? <span>{card.voted ? "已投票" : "已截止"}</span> : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function DynamicLotteryCardView({
  lottery,
}: {
  lottery: DynamicLotteryCard;
}) {
  const navigate = useNavigate();
  const open = () => {
    if (lottery.disabled || !lottery.jumpUrl) return;
    void openBiliHref(lottery.jumpUrl, navigate);
  };

  return (
    <div className="rounded-lg bg-black/25 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{lottery.title}</p>
          {lottery.hint ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {lottery.hint}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={lottery.disabled && !lottery.jumpUrl}
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm",
            lottery.disabled
              ? "bg-white/10 text-muted-foreground"
              : "bg-[#00aeec] text-white",
          )}
        >
          {lottery.buttonText}
        </button>
      </div>
      {lottery.prize ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-[#00aeec]">
          <Gift className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{lottery.prize}</span>
        </p>
      ) : null}
    </div>
  );
}

export function DynamicAttachCards({
  item,
  voteMode,
}: {
  item: SpaceDynamicItem;
  voteMode: "compact" | "detail";
}) {
  if (!item.vote && !item.lottery) return null;
  return (
    <div className="space-y-2">
      {item.vote ? (
        <DynamicVoteCardView
          key={item.vote.voteId}
          vote={item.vote}
          mode={voteMode}
        />
      ) : null}
      {item.lottery ? <DynamicLotteryCardView lottery={item.lottery} /> : null}
    </div>
  );
}
