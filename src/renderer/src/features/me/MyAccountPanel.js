import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BiliImage } from "@/components/ui/bili-image";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import { Check, Coins, Crown, Gift, History, Loader2, LogIn, Medal, PlayCircle, Share2, Sparkles, } from "lucide-react";
const DAILY_EXP_LIMIT = 65;
const COIN_EXP_LIMIT = 50;
function Section({ icon: Icon, title, description, extra, className, children, }) {
    return (_jsxs("section", { className: cn("flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-5", className), children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary", children: _jsx(Icon, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "text-sm font-semibold", children: title }), description && (_jsx("p", { className: "mt-0.5 text-xs text-muted-foreground", children: description }))] }), extra] }), children] }));
}
function formatDate(ms) {
    if (!ms)
        return "—";
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function TaskRow({ icon: Icon, label, hint, done, progress, }) {
    return (_jsxs("li", { className: "flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2.5", children: [_jsx(Icon, { className: cn("h-4 w-4 shrink-0", done ? "text-emerald-500" : "text-muted-foreground") }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-sm", children: label }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: hint })] }), done ? (_jsxs("span", { className: "inline-flex items-center gap-1 text-xs text-emerald-500", children: [_jsx(Check, { className: "h-3.5 w-3.5" }), "\u5DF2\u5B8C\u6210"] })) : (_jsx("span", { className: "text-xs text-muted-foreground", children: progress ?? "未完成" }))] }));
}
function LogList({ items }) {
    if (items.length === 0) {
        return _jsx("p", { className: "text-xs text-muted-foreground", children: "\u8FD1\u671F\u6CA1\u6709\u53D8\u52A8" });
    }
    return (_jsx("ul", { className: "max-h-72 divide-y divide-border overflow-y-auto text-xs", children: items.map((item, index) => (_jsxs("li", { className: "flex items-center gap-3 py-2", children: [_jsx("span", { className: "w-36 shrink-0 text-muted-foreground", children: item.time }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.reason }), _jsx("span", { className: cn("shrink-0 font-mono", item.delta >= 0 ? "text-emerald-500" : "text-red-400"), children: item.delta > 0 ? `+${item.delta}` : item.delta })] }, `${item.time}-${index}`))) }));
}
export function MyAccountPanel() {
    const [vip, setVip] = useState();
    const [privileges, setPrivileges] = useState([]);
    const [reward, setReward] = useState();
    const [medals, setMedals] = useState([]);
    const [medalPage, setMedalPage] = useState(1);
    const [medalHasMore, setMedalHasMore] = useState(false);
    const [logTab, setLogTab] = useState("coin");
    const [logs, setLogs] = useState(null);
    const [busy, setBusy] = useState("");
    const [tip, setTip] = useState("");
    const showTip = (message) => {
        setTip(message);
        window.setTimeout(() => setTip((prev) => (prev === message ? "" : prev)), 2600);
    };
    const run = async (key, task) => {
        if (busy)
            return;
        setBusy(key);
        try {
            const message = await task();
            if (message)
                showTip(message);
        }
        catch (err) {
            showTip(extractIpcErrorMessage(err) || "操作失败");
        }
        finally {
            setBusy("");
        }
    };
    const loadMedals = useCallback(async (page) => {
        const result = await window.biliDesk.bili.getFansMedals(page);
        setMedals((prev) => (page === 1 ? result.list : [...prev, ...result.list]));
        setMedalPage(result.page);
        setMedalHasMore(result.hasMore);
    }, []);
    useEffect(() => {
        const api = window.biliDesk.bili;
        void api
            .getVipCenter()
            .then(setVip)
            .catch(() => setVip(null));
        void api
            .getVipPrivileges()
            .then(setPrivileges)
            .catch(() => setPrivileges([]));
        void api
            .getExpReward()
            .then(setReward)
            .catch(() => setReward(null));
        void loadMedals(1).catch(() => setMedals([]));
    }, [loadMedals]);
    useEffect(() => {
        setLogs(null);
        const task = logTab === "coin"
            ? window.biliDesk.bili.getCoinLog()
            : window.biliDesk.bili.getExpLog();
        void task.then(setLogs).catch(() => setLogs([]));
    }, [logTab]);
    const vipActive = Boolean(vip?.active);
    const todayExp = reward
        ? (reward.login ? 5 : 0) +
            (reward.watch ? 5 : 0) +
            (reward.share ? 5 : 0) +
            Math.min(reward.coinExp, COIN_EXP_LIMIT)
        : 0;
    return (_jsxs("div", { className: "space-y-4", children: [tip && (_jsx("p", { className: "rounded-lg bg-secondary/60 px-3 py-2 text-xs text-foreground", children: tip })), _jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsx(Section, { icon: Sparkles, title: "\u4ECA\u65E5\u7ECF\u9A8C", description: "\u6BCF\u5929\u6700\u591A 65 \u7ECF\u9A8C\uFF0C\u7528\u6765\u63D0\u5347\u8D26\u53F7\u7B49\u7EA7", children: reward ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("p", { className: "text-sm", children: [_jsx("span", { className: "text-2xl font-semibold text-primary", children: todayExp }), _jsxs("span", { className: "ml-1 text-muted-foreground", children: ["/ ", DAILY_EXP_LIMIT] })] }), _jsx("div", { className: "h-1.5 overflow-hidden rounded-full bg-secondary", children: _jsx("div", { className: "h-full rounded-full bg-primary transition-[width]", style: {
                                                    width: `${Math.min(100, (todayExp / DAILY_EXP_LIMIT) * 100)}%`,
                                                } }) })] }), _jsxs("ul", { className: "space-y-2", children: [_jsx(TaskRow, { icon: LogIn, label: "\u6BCF\u65E5\u767B\u5F55", hint: "+5 \u7ECF\u9A8C", done: reward.login }), _jsx(TaskRow, { icon: PlayCircle, label: "\u89C2\u770B\u4E00\u4E2A\u89C6\u9891", hint: "+5 \u7ECF\u9A8C", done: reward.watch }), _jsx(TaskRow, { icon: Share2, label: "\u5206\u4EAB\u4E00\u4E2A\u89C6\u9891", hint: "+5 \u7ECF\u9A8C", done: reward.share }), _jsx(TaskRow, { icon: Coins, label: "\u7ED9\u89C6\u9891\u6295\u5E01", hint: "\u6BCF\u679A +10 \u7ECF\u9A8C\uFF0C\u6700\u591A 50", done: reward.coinExp >= COIN_EXP_LIMIT, progress: `${reward.coinExp} / ${COIN_EXP_LIMIT}` })] })] })) : (_jsx("p", { className: "text-xs text-muted-foreground", children: reward === null ? "经验任务获取失败，稍后再试" : "加载中…" })) }), _jsx(Section, { icon: Crown, title: "\u5927\u4F1A\u5458\u798F\u5229", description: vip === undefined
                            ? "加载中…"
                            : vipActive
                                ? `${vip?.vipType === 2 ? "年度大会员" : "大会员"} · ${formatDate(vip?.dueDate ?? 0)} 到期`
                                : "未开通大会员", children: vipActive ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-3 rounded-lg bg-[#fb7299]/10 px-3 py-2.5", children: [_jsx(Sparkles, { className: "h-4 w-4 shrink-0 text-[#fb7299]" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-sm", children: "\u6BCF\u65E5\u5927\u4F1A\u5458\u7ECF\u9A8C" }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: "\u6BCF\u5929\u53EF\u989D\u5916\u9886\u53D6 +10 \u7ECF\u9A8C" })] }), _jsxs(Button, { type: "button", size: "sm", disabled: busy === "vip-exp", onClick: () => void run("vip-exp", () => window.biliDesk.bili.claimVipExperience()), children: [busy === "vip-exp" && (_jsx(Loader2, { className: "h-3 w-3 animate-spin" })), "\u9886\u53D6"] })] }), privileges.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: "\u6BCF\u6708\u798F\u5229\u5238\uFF08\u6BCF\u6708 1 \u65E5\u5237\u65B0\uFF09" }), _jsx("ul", { className: "grid gap-2 sm:grid-cols-2", children: privileges.map((item) => (_jsxs("li", { className: "flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2", children: [_jsx(Gift, { className: "h-4 w-4 shrink-0 text-muted-foreground" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-sm", children: item.name }), item.received ? (_jsx("span", { className: "text-xs text-muted-foreground", children: "\u5DF2\u9886" })) : (_jsx(Button, { type: "button", size: "sm", variant: "outline", className: "h-7 px-2.5 text-xs", disabled: busy === `pri-${item.type}`, onClick: () => void run(`pri-${item.type}`, async () => {
                                                            await window.biliDesk.bili.receiveVipPrivilege(item.type);
                                                            setPrivileges((prev) => prev.map((entry) => entry.type === item.type
                                                                ? { ...entry, received: true }
                                                                : entry));
                                                            return `已领取${item.name}`;
                                                        }), children: "\u9886\u53D6" }))] }, item.type))) })] }))] })) : (vip !== undefined && (_jsx("p", { className: "rounded-lg bg-secondary/40 px-3 py-3 text-xs leading-relaxed text-muted-foreground", children: "\u5F00\u901A\u5927\u4F1A\u5458\u540E\uFF0C\u8FD9\u91CC\u53EF\u4EE5\u4E00\u952E\u9886\u53D6\u6BCF\u65E5 +10 \u7ECF\u9A8C\uFF0C\u4EE5\u53CA\u6BCF\u6708\u7684 B \u5E01\u5238\u3001\u4F1A\u5458\u8D2D\u4F18\u60E0\u5238\u3001\u88C5\u626E\u4F53\u9A8C\u5361\u7B49\u798F\u5229\u3002" }))) })] }), _jsx(Section, { icon: History, title: "\u786C\u5E01 / \u7ECF\u9A8C\u8BB0\u5F55", description: "\u8FD1\u671F\u6BCF\u4E00\u7B14\u786C\u5E01\u548C\u7ECF\u9A8C\u7684\u53D8\u52A8", extra: _jsx("div", { className: "flex gap-1 rounded-full bg-secondary/50 p-0.5 text-xs", children: ["coin", "exp"].map((key) => (_jsx("button", { type: "button", className: cn("rounded-full px-3 py-1", logTab === key
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground"), onClick: () => setLogTab(key), children: key === "coin" ? "硬币" : "经验" }, key))) }), children: logs ? (_jsx(LogList, { items: logs })) : (_jsx(Loader2, { className: "h-4 w-4 animate-spin text-muted-foreground" })) }), _jsxs(Section, { icon: Medal, title: `粉丝勋章（${medals.length}）`, description: "\u4F69\u6234\u540E\u4F1A\u663E\u793A\u5728\u76F4\u64AD\u95F4\u5F39\u5E55\u548C\u8BC4\u8BBA\u533A\u6635\u79F0\u65C1", children: [medals.length === 0 ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u8FD8\u6CA1\u6709\u7C89\u4E1D\u52CB\u7AE0" })) : (_jsx("div", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-3", children: medals.map((medal) => (_jsxs("div", { className: cn("flex items-center gap-3 rounded-lg border p-2", medal.wearing ? "border-primary/60" : "border-border"), children: [_jsx(Link, { to: `/up/${medal.upMid}`, className: "shrink-0", children: _jsx(BiliImage, { src: medal.upFace, alt: medal.upName, className: "h-9 w-9 rounded-full object-cover" }) }), _jsxs("div", { className: "min-w-0 flex-1 space-y-0.5", children: [_jsxs("p", { className: "flex items-center gap-1.5 text-sm", children: [_jsxs("span", { className: "rounded bg-[#fb7299]/15 px-1.5 text-xs text-[#fb7299]", children: [medal.name, " ", medal.level] }), _jsx("span", { className: "truncate", children: medal.upName }), medal.living && (_jsx(Link, { to: `/live/${medal.roomId}`, className: "shrink-0 text-[10px] text-primary", children: "\u76F4\u64AD\u4E2D" }))] }), _jsxs("p", { className: "text-[11px] text-muted-foreground", children: ["\u4EB2\u5BC6\u5EA6 ", medal.intimacy, "/", medal.nextIntimacy || "—", " \u00B7 \u4ECA\u65E5", " ", medal.todayFeed, "/", medal.dayLimit || "—"] })] }), _jsx(Button, { type: "button", size: "sm", variant: medal.wearing ? "secondary" : "outline", disabled: busy === `medal-${medal.medalId}`, onClick: () => void run(`medal-${medal.medalId}`, async () => {
                                        await window.biliDesk.bili.wearFansMedal(medal.wearing ? null : medal.medalId);
                                        setMedals((prev) => prev.map((entry) => ({
                                            ...entry,
                                            wearing: medal.wearing
                                                ? false
                                                : entry.medalId === medal.medalId,
                                        })));
                                        return medal.wearing
                                            ? "已摘下勋章"
                                            : `已佩戴「${medal.name}」`;
                                    }), children: medal.wearing ? "摘下" : "佩戴" })] }, medal.medalId))) })), medalHasMore && (_jsx(Button, { type: "button", size: "sm", variant: "ghost", onClick: () => void loadMedals(medalPage + 1).catch(() => undefined), children: "\u52A0\u8F7D\u66F4\u591A\u52CB\u7AE0" }))] })] }));
}
