import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { midHashOf } from "@/components/video/danmaku-match";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatDuration } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
export function VideoWatchExtras({ bvid, cid, onSeek, }) {
    const [chapters, setChapters] = useState([]);
    const [filters, setFilters] = useState([]);
    const [kind, setKind] = useState("text");
    const [word, setWord] = useState("");
    const [likedIds, setLikedIds] = useState(() => new Set());
    const selfMid = useAppStore((state) => state.user?.mid ?? 0);
    const selfHash = selfMid > 0 ? midHashOf(selfMid) : "";
    const [filterError, setFilterError] = useState("");
    const [filterTip, setFilterTip] = useState("");
    const [danmakuOpen, setDanmakuOpen] = useState(false);
    const [danmaku, setDanmaku] = useState([]);
    const [danmakuLoading, setDanmakuLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [busyId, setBusyId] = useState("");
    const [historyMonth, setHistoryMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [historyDates, setHistoryDates] = useState([]);
    const [historyDate, setHistoryDate] = useState("");
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const [latestDanmaku, setLatestDanmaku] = useState([]);
    useEffect(() => {
        let cancelled = false;
        setChapters([]);
        void window.biliDesk.bili
            .getVideoChapters(bvid, cid)
            .then((list) => {
            if (!cancelled)
                setChapters(list);
        })
            .catch(() => {
            if (!cancelled)
                setChapters([]);
        });
        void window.biliDesk.bili
            .getDanmakuFilters()
            .then((list) => {
            if (!cancelled)
                setFilters(list);
        })
            .catch(() => {
            if (!cancelled)
                setFilters([]);
        });
        return () => {
            cancelled = true;
        };
    }, [bvid, cid]);
    const visibleDanmaku = useMemo(() => {
        const term = query.trim();
        const source = term
            ? danmaku.filter((item) => item.text.includes(term))
            : danmaku;
        return source.slice(0, 40);
    }, [danmaku, query]);
    const addFilter = async () => {
        const text = word.trim();
        if (!text)
            return;
        setFilterError("");
        try {
            await window.biliDesk.bili.addDanmakuFilter(text, kind);
            setWord("");
            setFilters(await window.biliDesk.bili.getDanmakuFilters());
        }
        catch (err) {
            setFilterError(extractIpcErrorMessage(err) || "添加屏蔽词失败");
        }
    };
    const loadDanmaku = async () => {
        if (danmakuOpen) {
            setDanmakuOpen(false);
            return;
        }
        setDanmakuOpen(true);
        if (danmaku.length > 0)
            return;
        setDanmakuLoading(true);
        try {
            const list = await window.biliDesk.bili.getDanmakuList(cid);
            setDanmaku(list);
            setLatestDanmaku(list);
        }
        catch (err) {
            setFilterError(extractIpcErrorMessage(err) || "弹幕加载失败");
        }
        finally {
            setDanmakuLoading(false);
        }
    };
    useEffect(() => {
        setHistoryDates([]);
        setHistoryDate("");
        setHistoryError("");
        setLatestDanmaku([]);
        setDanmaku([]);
        setDanmakuOpen(false);
    }, [cid]);
    const loadHistoryMonth = async (month) => {
        setHistoryMonth(month);
        setHistoryDates([]);
        setHistoryError("");
        if (!month)
            return;
        try {
            const dates = await window.biliDesk.bili.getDanmakuHistoryDates(cid, month);
            setHistoryDates(dates);
            if (dates.length === 0)
                setHistoryError("这个月没有历史弹幕");
        }
        catch (err) {
            setHistoryError(extractIpcErrorMessage(err) || "历史弹幕日期获取失败");
        }
    };
    const loadHistoryDate = async (date) => {
        setHistoryLoading(true);
        setHistoryError("");
        try {
            setDanmaku(await window.biliDesk.bili.getDanmakuHistory(cid, date));
            setHistoryDate(date);
        }
        catch (err) {
            setHistoryError(extractIpcErrorMessage(err) || "历史弹幕获取失败");
        }
        finally {
            setHistoryLoading(false);
        }
    };
    const backToLatest = () => {
        setHistoryDate("");
        setDanmaku(latestDanmaku);
    };
    return (_jsxs("div", { className: "space-y-3", children: [chapters.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-2", children: chapters.map((chapter) => (_jsxs("button", { type: "button", className: "rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground", onClick: () => onSeek(chapter.from), children: [formatDuration(chapter.from), " ", chapter.content] }, `${chapter.from}-${chapter.content}`))) })), _jsxs("div", { className: "space-y-2 rounded-xl border border-border bg-card/60 p-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("input", { value: word, onChange: (event) => setWord(event.target.value), placeholder: kind === "user"
                                    ? "屏蔽用户 UID"
                                    : kind === "regex"
                                        ? "屏蔽正则，如 .{20,}"
                                        : "添加弹幕屏蔽词", className: "h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50", onKeyDown: (event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        void addFilter();
                                    }
                                } }), _jsxs("select", { value: kind, onChange: (event) => setKind(event.target.value), className: "h-8 rounded-lg border border-border bg-background px-2 text-xs", children: [_jsx("option", { value: "text", children: "\u6587\u5B57" }), _jsx("option", { value: "regex", children: "\u6B63\u5219" }), _jsx("option", { value: "user", children: "\u7528\u6237" })] }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void addFilter(), children: "\u5C4F\u853D" }), _jsx(Button, { type: "button", size: "sm", variant: "ghost", onClick: () => void loadDanmaku(), children: danmakuOpen ? "收起弹幕" : "弹幕列表 / 历史弹幕" })] }), filters.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-2", children: filters.map((item) => (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground", children: [item.kind === "regex"
                                    ? "正则 "
                                    : item.kind === "user"
                                        ? "用户 "
                                        : "", item.text, _jsx("button", { type: "button", "aria-label": "\u5220\u9664\u5C4F\u853D\u8BCD", onClick: () => {
                                        void window.biliDesk.bili
                                            .removeDanmakuFilter(item.id)
                                            .then(() => setFilters((prev) => prev.filter((entry) => entry.id !== item.id)))
                                            .catch((err) => setFilterError(extractIpcErrorMessage(err) || "删除失败"));
                                    }, children: _jsx(X, { className: "h-3 w-3" }) })] }, item.id))) })), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u5C4F\u853D\u8BCD\u4F1A\u5728\u4E0B\u6B21\u6253\u5F00\u8FD9\u4E2A\u89C6\u9891\u65F6\u751F\u6548\u3002" }), filterError && _jsx("p", { className: "text-xs text-red-400", children: filterError }), filterTip && (_jsx("p", { className: "text-xs text-muted-foreground", children: filterTip })), danmakuOpen && (_jsxs("div", { className: "max-h-64 space-y-1 overflow-y-auto", children: [_jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "\u641C\u7D22\u8FD9\u6761\u89C6\u9891\u7684\u5F39\u5E55", className: "mb-2 h-8 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none" }), _jsxs("div", { className: "mb-2 space-y-1.5 rounded-lg bg-secondary/40 p-2", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs text-muted-foreground", children: [_jsx("span", { children: "\u5386\u53F2\u5F39\u5E55" }), _jsx("input", { type: "month", value: historyMonth, max: new Date().toISOString().slice(0, 7), onChange: (event) => void loadHistoryMonth(event.target.value), className: "h-7 rounded-md border border-border bg-background px-2 text-xs" }), historyDates.length === 0 && !historyError && (_jsx("button", { type: "button", className: "text-primary hover:underline", onClick: () => void loadHistoryMonth(historyMonth), children: "\u67E5\u770B\u6709\u8BB0\u5F55\u7684\u65E5\u671F" })), historyDate && (_jsxs(_Fragment, { children: [_jsxs("span", { className: "text-foreground", children: ["\u6B63\u5728\u770B ", historyDate, " \u7684\u5F39\u5E55"] }), _jsx("button", { type: "button", className: "text-primary hover:underline", onClick: backToLatest, children: "\u56DE\u5230\u6700\u65B0" })] })), historyLoading && _jsx(Loader2, { className: "h-3 w-3 animate-spin" })] }), historyDates.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1", children: historyDates.map((date) => (_jsx("button", { type: "button", disabled: historyLoading, className: cn("rounded-full px-2 py-0.5 text-xs transition-colors", date === historyDate
                                                ? "bg-primary/20 text-primary"
                                                : "bg-background text-muted-foreground hover:text-foreground"), onClick: () => void loadHistoryDate(date), children: date.slice(5) }, date))) })), historyError && (_jsx("p", { className: "text-xs text-muted-foreground", children: historyError }))] }), danmakuLoading ? (_jsxs("p", { className: "flex items-center text-xs text-muted-foreground", children: [_jsx(Loader2, { className: "mr-1 h-3 w-3 animate-spin" }), "\u52A0\u8F7D\u5F39\u5E55..."] })) : visibleDanmaku.length === 0 ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5F39\u5E55" })) : (visibleDanmaku.map((item, index) => (_jsxs("div", { className: "flex items-center gap-2 rounded-lg px-1 py-1 text-xs", children: [_jsx("span", { className: "w-12 shrink-0 text-muted-foreground", children: formatDuration(item.time) }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.text }), item.id ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", disabled: busyId === item.id, className: "text-muted-foreground hover:text-pink-400", onClick: () => {
                                                    const id = item.id;
                                                    if (!id)
                                                        return;
                                                    const next = !likedIds.has(id);
                                                    setBusyId(id);
                                                    void window.biliDesk.bili
                                                        .likeDanmaku(cid, id, next)
                                                        .then(() => setLikedIds((prev) => {
                                                        const copy = new Set(prev);
                                                        if (next)
                                                            copy.add(id);
                                                        else
                                                            copy.delete(id);
                                                        return copy;
                                                    }))
                                                        .catch((err) => setFilterError(extractIpcErrorMessage(err) || "点赞失败"))
                                                        .finally(() => setBusyId(""));
                                                }, children: likedIds.has(item.id) ? "取消赞" : "赞" }), selfHash &&
                                                item.midHash &&
                                                item.midHash.toLowerCase() === selfHash && (_jsx("button", { type: "button", disabled: busyId === item.id, className: "text-muted-foreground hover:text-foreground", onClick: () => {
                                                    const id = item.id;
                                                    if (!id)
                                                        return;
                                                    setBusyId(id);
                                                    void window.biliDesk.bili
                                                        .recallDanmaku(cid, id)
                                                        .then((message) => {
                                                        setFilterError("");
                                                        setFilterTip(message || "已撤回");
                                                    })
                                                        .catch((err) => setFilterError(extractIpcErrorMessage(err) || "撤回失败"))
                                                        .finally(() => setBusyId(""));
                                                }, children: "\u64A4\u56DE" })), _jsx("button", { type: "button", disabled: busyId === item.id, className: "text-muted-foreground hover:text-red-400", onClick: () => {
                                                    const id = item.id;
                                                    if (!id)
                                                        return;
                                                    setBusyId(id);
                                                    void window.biliDesk.bili
                                                        .reportDanmaku(cid, id, 11)
                                                        .catch((err) => setFilterError(extractIpcErrorMessage(err) || "举报失败"))
                                                        .finally(() => setBusyId(""));
                                                }, children: "\u4E3E\u62A5" })] })) : null] }, `${item.id ?? "dm"}-${item.time}-${index}`))))] }))] })] }));
}
