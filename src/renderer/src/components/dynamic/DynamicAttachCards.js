import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { openBiliHref } from "@/lib/open-bili-href";
import { cn, formatCount } from "@/lib/utils";
import { Gift, Vote } from "lucide-react";
import { useNavigate } from "react-router-dom";
function joinLabel(vote) {
    const text = vote.joinText?.replace(/\s*·.*$/, "").trim();
    if (text)
        return text;
    if (vote.joinNum > 0)
        return `${formatCount(vote.joinNum)}人参与`;
    return "";
}
function deadlineLabel(endTime) {
    if (!endTime)
        return "";
    const remain = endTime - Math.floor(Date.now() / 1000);
    if (remain <= 0)
        return "已截止";
    const days = Math.floor(remain / 86400);
    const hours = Math.floor((remain % 86400) / 3600);
    const minutes = Math.floor((remain % 3600) / 60);
    const parts = [];
    if (days > 0)
        parts.push(`${days}天`);
    if (hours > 0)
        parts.push(`${hours}小时`);
    if (minutes > 0 || parts.length === 0)
        parts.push(`${minutes}分钟`);
    return `${parts.join("")}后截止`;
}
function voteEnded(vote) {
    return vote.endTime > 0 && vote.endTime <= Math.floor(Date.now() / 1000);
}
function optionPercents(counts) {
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total <= 0)
        return counts.map(() => 0);
    return counts.map((count) => (count / total) * 100);
}
export function DynamicVoteCardView({ vote, mode, }) {
    const [card, setCard] = useState(vote);
    const [picked, setPicked] = useState(vote.myVotes);
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
    const submit = async (idxs) => {
        if (busy || card.voted || ended || idxs.length === 0)
            return;
        setBusy(true);
        setError("");
        try {
            const next = await window.biliDesk.bili.doDynamicVote(card.voteId, idxs);
            setCard(next);
            setPicked(next.myVotes);
        }
        catch (err) {
            setError(formatDisplayedError(err, "投票失败"));
        }
        finally {
            setBusy(false);
        }
    };
    if (mode === "compact" || card.options.length === 0) {
        return (_jsxs("div", { className: "flex items-center gap-3 rounded-lg bg-black/25 px-3 py-2.5", children: [_jsx("span", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10 text-foreground/80", children: _jsx(Vote, { className: "h-5 w-5" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-sm font-medium", children: card.title }), join ? (_jsx("p", { className: "mt-0.5 text-xs text-muted-foreground", children: join })) : null] }), _jsx("span", { className: cn("shrink-0 rounded-md px-3.5 py-1.5 text-sm", card.voted || ended
                        ? "bg-white/10 text-muted-foreground"
                        : "bg-[#00aeec] text-white"), children: actionText })] }));
    }
    return (_jsxs("div", { className: "space-y-3 rounded-xl bg-black/25 px-4 py-3", onClick: (event) => event.stopPropagation(), children: [_jsx("p", { className: "text-[15px] font-medium", children: card.title }), _jsx("div", { className: "space-y-2", children: card.options.map((option, index) => {
                    const selected = card.myVotes.includes(option.idx);
                    const percent = percents[index] ?? 0;
                    const interactive = !showResult && !busy;
                    return (_jsxs("button", { type: "button", disabled: !interactive, onClick: () => {
                            if (card.choiceCount > 1) {
                                setPicked((current) => {
                                    if (current.includes(option.idx)) {
                                        return current.filter((idx) => idx !== option.idx);
                                    }
                                    if (current.length >= card.choiceCount)
                                        return current;
                                    return [...current, option.idx];
                                });
                                return;
                            }
                            void submit([option.idx]);
                        }, className: cn("relative block w-full overflow-hidden rounded-md text-left", interactive && "hover:bg-white/5", !showResult &&
                            picked.includes(option.idx) &&
                            "ring-1 ring-[#00aeec]"), children: [showResult ? (_jsx("span", { className: "absolute inset-y-0 left-0", style: {
                                    width: `${Math.max(0, Math.min(100, percent))}%`,
                                    background: selected ? "#00aeec" : "rgba(255,255,255,0.16)",
                                } })) : (_jsx("span", { className: "absolute inset-0 bg-white/5" })), _jsxs("span", { className: "relative flex items-center justify-between gap-3 px-3 py-2 text-sm", children: [_jsx("span", { className: "truncate", children: option.text }), showResult ? (_jsxs("span", { className: "shrink-0 tabular-nums", children: [percent.toFixed(1), "%"] })) : null] })] }, option.idx));
                }) }), card.choiceCount > 1 && !showResult ? (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("span", { className: "text-xs text-muted-foreground", children: ["\u6700\u591A\u9009 ", card.choiceCount, " \u9879"] }), _jsx("button", { type: "button", disabled: busy || picked.length === 0, onClick: () => void submit(picked), className: "rounded-md bg-[#00aeec] px-3 py-1 text-sm text-white disabled:opacity-50", children: "\u6295\u7968" })] })) : null, _jsxs("div", { className: "flex items-center justify-between gap-3 text-xs text-muted-foreground", children: [_jsx("span", { children: footer }), showResult ? _jsx("span", { children: card.voted ? "已投票" : "已截止" }) : null] }), error ? _jsx("p", { className: "text-xs text-red-400", children: error }) : null] }));
}
export function DynamicLotteryCardView({ lottery, }) {
    const navigate = useNavigate();
    const open = () => {
        if (lottery.disabled || !lottery.jumpUrl)
            return;
        void openBiliHref(lottery.jumpUrl, navigate);
    };
    return (_jsxs("div", { className: "rounded-lg bg-black/25 px-3 py-3", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-medium", children: lottery.title }), lottery.hint ? (_jsx("p", { className: "mt-1 text-xs leading-relaxed text-muted-foreground", children: lottery.hint })) : null] }), _jsx("button", { type: "button", disabled: lottery.disabled && !lottery.jumpUrl, onClick: (event) => {
                            event.stopPropagation();
                            open();
                        }, className: cn("shrink-0 rounded-md px-3 py-1.5 text-sm", lottery.disabled
                            ? "bg-white/10 text-muted-foreground"
                            : "bg-[#00aeec] text-white"), children: lottery.buttonText })] }), lottery.prize ? (_jsxs("p", { className: "mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-[#00aeec]", children: [_jsx(Gift, { className: "mt-0.5 h-4 w-4 shrink-0" }), _jsx("span", { children: lottery.prize })] })) : null] }));
}
export function DynamicAttachCards({ item, voteMode, }) {
    if (!item.vote && !item.lottery)
        return null;
    return (_jsxs("div", { className: "space-y-2", children: [item.vote ? (_jsx(DynamicVoteCardView, { vote: item.vote, mode: voteMode }, item.vote.voteId)) : null, item.lottery ? _jsx(DynamicLotteryCardView, { lottery: item.lottery }) : null] }));
}
