import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { formatDisplayedError } from "@/lib/ipc-error";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AtSign, Bell, BellOff, Eye, Heart, History, ImageIcon, Loader2, MapPin, MessageCircle, MessageSquare, MessageSquareText, Pin, RefreshCw, Reply, Search, Send, Share2, Settings2, ShieldAlert, Subtitles, Trash2, UserPlus, } from "lucide-react";
import { parseBiliAppPath } from "@shared/utils/bili-app-link";
import { BiliEmoteText } from "@/components/comment/BiliEmoteText";
import { EmotePickerButton } from "@/components/comment/EmotePickerButton";
import { BiliImage } from "@/components/ui/bili-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { FollowActionButton } from "@/components/video/FollowActionButton";
import { useReplyEmotes } from "@/hooks/use-reply-emotes";
import { normalizeBiliImage } from "@/lib/bili-image";
import { openBiliHref } from "@/lib/open-bili-href";
import { usePageRefresh } from "@/lib/page-refresh";
import { cn, formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
const REFRESH_EVENT = "bilidesk:refresh-messages";
const TABS = [
    {
        id: "chat",
        label: "私信",
        icon: MessageCircle,
        hint: "会话、应援团与小助手",
    },
    { id: "reply", label: "回复我的", icon: Reply, hint: "别人回复你的评论" },
    {
        id: "sent",
        label: "我回复的",
        icon: MessageSquare,
        hint: "别人回复过的、你发出的评论",
    },
    {
        id: "myComments",
        label: "我的评论",
        icon: MessageSquareText,
        hint: "尽量收录的过往评论（含手机端）",
    },
    {
        id: "myDanmaku",
        label: "我的弹幕",
        icon: Subtitles,
        hint: "尽量收录的过往弹幕（含手机端）",
    },
    { id: "at", label: "@ 我的", icon: AtSign, hint: "评论与动态里的提及" },
    { id: "like", label: "收到的赞", icon: Heart, hint: "赞过你的人" },
    { id: "fans", label: "新增粉丝", icon: UserPlus, hint: "最近关注你的人" },
    { id: "sys", label: "系统通知", icon: Bell, hint: "官方通知" },
    {
        id: "settings",
        label: "消息设置",
        icon: Settings2,
        hint: "提醒、折叠与屏蔽词",
    },
];
const FILTERS = [
    { id: "all", label: "全部" },
    { id: "followed", label: "已关注" },
    { id: "unfollowed", label: "未关注" },
    { id: "group", label: "应援团" },
    { id: "intercepted", label: "已拦截" },
];
const EMPTY_UNREAD = {
    reply: 0,
    at: 0,
    like: 0,
    sys: 0,
    chat: 0,
    group: 0,
    dustbin: 0,
    fans: 0,
};
function tidyError(error) {
    return formatDisplayedError(error, undefined, "操作失败");
}
function pad(value) {
    return String(value).padStart(2, "0");
}
function formatMessageTime(seconds, fallback = "") {
    if (!seconds)
        return fallback;
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime()))
        return fallback;
    const now = new Date();
    const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (date.toDateString() === now.toDateString())
        return hm;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString())
        return `昨天 ${hm}`;
    if (date.getFullYear() === now.getFullYear()) {
        return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function formatChatStamp(seconds) {
    if (!seconds)
        return "";
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime()))
        return "";
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function needsChatStamp(previous, current) {
    if (!previous)
        return true;
    if (current.time - previous.time >= 5 * 60)
        return true;
    const prevDate = new Date(previous.time * 1000);
    const nextDate = new Date(current.time * 1000);
    return prevDate.toDateString() !== nextDate.toDateString();
}
function unreadOf(tab, unread) {
    if (tab === "chat")
        return unread.chat + unread.group + unread.dustbin;
    if (tab === "reply")
        return unread.reply;
    if (tab === "at")
        return unread.at;
    if (tab === "like")
        return unread.like;
    if (tab === "sys")
        return unread.sys;
    if (tab === "fans")
        return unread.fans;
    return 0;
}
function aidToBvid(aid) {
    const xor = 23442827791579n;
    const maxAid = 1n << 51n;
    const alphabet = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
    const bytes = ["B", "V", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
    let index = bytes.length - 1;
    let tmp = (maxAid | BigInt(aid)) ^ xor;
    while (tmp > 0n) {
        bytes[index] = alphabet[Number(tmp % 58n)];
        tmp /= 58n;
        index -= 1;
    }
    [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
    [bytes[4], bytes[7]] = [bytes[7], bytes[4]];
    return bytes.join("");
}
function schemeToHttps(uri) {
    const video = uri.match(/^bilibili:\/\/video\/(\d+)/);
    if (video)
        return `https://www.bilibili.com/video/av${video[1]}`;
    const space = uri.match(/^bilibili:\/\/space\/(\d+)/);
    if (space)
        return `https://space.bilibili.com/${space[1]}`;
    const live = uri.match(/^bilibili:\/\/live\/(\d+)/);
    if (live)
        return `https://live.bilibili.com/${live[1]}`;
    const article = uri.match(/^bilibili:\/\/article\/(\d+)/);
    if (article)
        return `https://www.bilibili.com/read/cv${article[1]}`;
    const opus = uri.match(/^bilibili:\/\/(?:opus\/detail|following\/detail)\/(\d+)/);
    if (opus)
        return `https://www.bilibili.com/opus/${opus[1]}`;
    return null;
}
function includesTerm(text, keyword) {
    const term = keyword.trim().toLowerCase();
    if (!term)
        return true;
    return text.toLowerCase().includes(term);
}
function canLocate(item) {
    return item.subjectId > 0 && (item.sourceId > 0 || item.rootId > 0);
}
function locateComment(item, navigate) {
    const rpid = item.sourceId || item.rootId;
    const root = item.rootId || rpid;
    const type = item.businessId || 1;
    const oid = item.subjectId;
    if (!rpid || !oid) {
        void openTarget(item.uri, navigate);
        return;
    }
    const query = `?rpid=${rpid}&root=${root}`;
    const bv = item.uri.match(/\/video\/(BV[0-9A-Za-z]+)/);
    if (bv) {
        navigate(`/video/${bv[1]}${query}`);
        return;
    }
    if (type === 1) {
        navigate(`/video/${aidToBvid(oid)}${query}`);
        return;
    }
    if (type === 12) {
        navigate(`/article/${oid}${query}`);
        return;
    }
    if (type === 11 || type === 17) {
        navigate(`/dynamic/${oid}${query}`);
        return;
    }
    void openTarget(item.uri, navigate);
}
async function openTarget(uri, navigate) {
    const raw = uri.trim();
    if (!raw)
        return;
    const href = raw.startsWith("bilibili://")
        ? (schemeToHttps(raw) ?? raw)
        : raw;
    const av = href.match(/\/video\/av(\d+)/i);
    if (av) {
        navigate(`/video/${aidToBvid(Number(av[1]))}`);
        return;
    }
    const direct = parseBiliAppPath(href);
    if (direct) {
        navigate(direct);
        return;
    }
    await openBiliHref(href, navigate);
}
function refreshUnread() {
    window.dispatchEvent(new Event("bilidesk:msg-unread"));
}
const LOCAL_SENT_KEY = "bilidesk:my-sent-replies";
function readLocalSent() {
    try {
        const raw = localStorage.getItem(LOCAL_SENT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
    }
    catch {
        return [];
    }
}
function rememberLocalSent(item) {
    const next = [
        item,
        ...readLocalSent().filter((row) => row.id !== item.id),
    ].slice(0, 40);
    localStorage.setItem(LOCAL_SENT_KEY, JSON.stringify(next));
}
function withSelfAvatar(item) {
    const self = useAppStore.getState().user;
    if (!self)
        return item;
    const face = self.face || "";
    const name = self.name || "我";
    const users = item.users.length
        ? item.users.map((user, index) => index === 0
            ? {
                mid: user.mid || self.mid || 0,
                name: user.name === "我" || !user.name ? name : user.name,
                face: user.face || face,
            }
            : user)
        : [{ mid: self.mid || 0, name, face }];
    return { ...item, users };
}
function sourceNote(source) {
    if (source >= 8 && source <= 11)
        return "自动回复";
    return "";
}
/** 系统提示正文是一段 JSON，界面上只显示里面的 text */
function systemHintText(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("["))
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || parsed.length === 0)
            return null;
        const parts = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object" || !("text" in item))
                return null;
            const value = item.text;
            if (typeof value !== "string")
                return null;
            parts.push(value);
        }
        return parts.join("") || null;
    }
    catch {
        return null;
    }
}
function isSystemHint(message) {
    return message.source === 18 || systemHintText(message.text) !== null;
}
function RichText({ text, emotes }) {
    const extra = useMemo(() => {
        const map = {};
        for (const item of emotes)
            map[item.text] = item.url;
        return map;
    }, [emotes]);
    return _jsx(BiliEmoteText, { text: text, emotes: extra });
}
function EmptyState({ title, detail }) {
    return (_jsxs("div", { className: "flex h-full min-h-[240px] flex-col items-center justify-center px-8 text-center", children: [_jsx("div", { className: "mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary", children: _jsx(MessageCircle, { className: "h-5 w-5" }) }), _jsx("p", { className: "text-sm font-medium", children: title }), _jsx("p", { className: "mt-1 max-w-xs text-xs leading-5 text-muted-foreground", children: detail })] }));
}
export function MessagesPage() {
    const user = useAppStore((state) => state.user);
    const loggedIn = Boolean(user?.isLogin && (user.mid ?? 0) > 0);
    const [tab, setTab] = useState("chat");
    const [keyword, setKeyword] = useState("");
    const [unread, setUnread] = useState(EMPTY_UNREAD);
    const loadUnread = useCallback(async () => {
        try {
            setUnread(await window.biliDesk.bili.getMessageUnread());
        }
        catch {
            // 侧边栏会继续轮询
        }
    }, []);
    useEffect(() => {
        if (!loggedIn)
            return;
        void loadUnread();
        const onRefresh = () => void loadUnread();
        window.addEventListener("bilidesk:msg-unread", onRefresh);
        window.addEventListener(REFRESH_EVENT, onRefresh);
        return () => {
            window.removeEventListener("bilidesk:msg-unread", onRefresh);
            window.removeEventListener(REFRESH_EVENT, onRefresh);
        };
    }, [loggedIn, loadUnread]);
    if (!loggedIn) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-4 px-6 text-center", children: [_jsx("div", { className: "flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card/40", children: _jsx(MessageCircle, { className: "h-7 w-7 text-primary" }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\u6D88\u606F" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u767B\u5F55\u540E\u53EF\u67E5\u770B\u79C1\u4FE1\u3001\u56DE\u590D\u3001@\u3001\u8D5E\u548C\u7CFB\u7EDF\u901A\u77E5" })] }), _jsx(Button, { asChild: true, children: _jsx(Link, { to: "/login", children: "\u53BB\u767B\u5F55" }) })] }));
    }
    const current = TABS.find((item) => item.id === tab) ?? TABS[0];
    return (_jsxs("div", { className: "flex h-full min-h-0 overflow-hidden", children: [_jsxs("aside", { className: "flex w-[212px] shrink-0 flex-col border-r border-border/70 bg-card/20", children: [_jsxs("div", { className: "px-4 pb-3 pt-5", children: [_jsx("h2", { className: "text-base font-semibold tracking-tight", children: "\u6D88\u606F" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "\u4E0E\u5B98\u7F51\u6D88\u606F\u4E2D\u5FC3\u540C\u6B65" })] }), _jsx("nav", { className: "flex flex-col gap-1 px-2", children: TABS.map((item) => {
                            const Icon = item.icon;
                            const count = unreadOf(item.id, unread);
                            const active = tab === item.id;
                            return (_jsxs("button", { type: "button", onClick: () => setTab(item.id), className: cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", active
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: [_jsx(Icon, { className: "h-4 w-4 shrink-0" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.label }), count > 0 && (_jsx("span", { className: "rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground", children: count > 99 ? "99+" : count }))] }, item.id));
                        }) })] }), _jsxs("section", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("header", { className: "flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-5 py-3.5", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "text-sm font-semibold", children: current.label }), _jsx("p", { className: "text-xs text-muted-foreground", children: current.hint })] }), tab !== "settings" && (_jsxs("label", { className: "relative w-64 shrink-0", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }), _jsx("input", { value: keyword, onChange: (event) => setKeyword(event.target.value), placeholder: "\u641C\u7D22\u5F53\u524D\u5217\u8868", className: "h-9 w-full rounded-full border border-border bg-background/70 pl-9 pr-3 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2" })] }))] }), _jsxs("div", { className: "min-h-0 flex-1", children: [tab === "chat" && (_jsx(ChatDesk, { keyword: keyword, onChanged: refreshUnread })), (tab === "reply" ||
                                tab === "at" ||
                                tab === "like" ||
                                tab === "sent") && (_jsx(FeedList, { kind: tab, keyword: keyword, onChanged: refreshUnread })), (tab === "myComments" || tab === "myDanmaku") && (_jsx(FootprintList, { kind: tab === "myComments" ? "comment" : "danmaku", keyword: keyword })), tab === "fans" && _jsx(FansList, { keyword: keyword }), tab === "sys" && (_jsx(NoticeList, { keyword: keyword, onChanged: refreshUnread })), tab === "settings" && _jsx(SettingsPanel, {})] })] })] }));
}
function rangeToTs(range, customFrom, customTo) {
    const now = Math.floor(Date.now() / 1000);
    if (range === "all")
        return { fromTs: undefined, toTs: undefined };
    if (range === "custom") {
        const from = customFrom
            ? Math.floor(new Date(`${customFrom}T00:00:00`).getTime() / 1000)
            : undefined;
        const to = customTo
            ? Math.floor(new Date(`${customTo}T23:59:59`).getTime() / 1000)
            : undefined;
        return {
            fromTs: Number.isFinite(from) ? from : undefined,
            toTs: Number.isFinite(to) ? to : undefined,
        };
    }
    const days = Number(range);
    return { fromTs: now - days * 86400, toTs: now };
}
function footprintTargetLabel(item) {
    if (item.bvid)
        return item.bvid;
    if (item.kind === "danmaku" && item.oid > 0)
        return `av${item.oid}`;
    if (item.type === 12)
        return `专栏 cv${item.oid}`;
    if (item.type === 11 || item.type === 17)
        return `动态 ${item.oid}`;
    if (item.oid > 0)
        return `av${item.oid}`;
    return "未知来源";
}
function openFootprintItem(item, navigate) {
    if (item.kind === "danmaku") {
        const bvid = item.bvid || (item.oid > 0 ? aidToBvid(item.oid) : "");
        if (!bvid)
            return;
        const t = item.progressMs != null
            ? Math.max(0, Math.floor(item.progressMs / 1000))
            : 0;
        navigate(t > 0 ? `/video/${bvid}?t=${t}` : `/video/${bvid}`);
        return;
    }
    const rpid = Number(item.rpid) || 0;
    const query = rpid > 0 ? `?rpid=${rpid}&root=${rpid}` : "";
    if (item.type === 12 && item.oid > 0) {
        navigate(`/article/${item.oid}${query}`);
        return;
    }
    if ((item.type === 11 || item.type === 17) && item.oid > 0) {
        navigate(`/dynamic/${item.oid}${query}`);
        return;
    }
    if (item.oid > 0) {
        navigate(`/video/${aidToBvid(item.oid)}${query}`);
    }
}
function FootprintList({ kind, keyword, }) {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [syncedAt, setSyncedAt] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [range, setRange] = useState("all");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [progress, setProgress] = useState({
        running: false,
        phase: "idle",
        fetched: 0,
        totalHint: 0,
        message: "",
    });
    const debouncedKeyword = useDebounced(keyword, 280);
    const load = useCallback(async (offset, append) => {
        setLoading(true);
        setError("");
        try {
            const { fromTs, toTs } = rangeToTs(range, customFrom, customTo);
            const page = await window.biliDesk.bili.listFootprint({
                kind,
                keyword: debouncedKeyword,
                fromTs,
                toTs,
                offset,
                limit: 40,
            });
            setItems((prev) => (append ? [...prev, ...page.items] : page.items));
            setTotal(page.total);
            setSyncedAt(page.syncedAt);
            setHasMore(page.hasMore);
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "操作失败"));
        }
        finally {
            setLoading(false);
        }
    }, [kind, debouncedKeyword, range, customFrom, customTo]);
    useEffect(() => {
        void load(0, false);
    }, [load]);
    useEffect(() => {
        let timer;
        const refresh = (delay) => {
            if (timer)
                clearTimeout(timer);
            timer = setTimeout(() => {
                void load(0, false);
            }, delay);
        };
        void window.biliDesk.bili.getFootprintSyncStatus().then(setProgress);
        const stop = window.biliDesk.bili.onFootprintProgress((next) => {
            setProgress(next);
            const finished = !next.running &&
                (next.phase === "done" ||
                    next.phase === "idle" ||
                    next.phase === "error");
            if (finished)
                refresh(0);
            else if (next.phase === "recent")
                refresh(600);
        });
        return () => {
            if (timer)
                clearTimeout(timer);
            stop();
        };
    }, [load]);
    const sync = async (reset = false) => {
        setError("");
        try {
            const status = await window.biliDesk.bili.syncFootprint(kind, { reset });
            if (status.phase === "error" && status.message) {
                setError(status.message);
            }
            await load(0, false);
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "操作失败"));
        }
    };
    return (_jsxs("div", { className: "flex h-full min-h-0 flex-col", children: [_jsxs("div", { className: "flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-5 py-2.5", children: [[
                        ["all", "全部"],
                        ["7", "近 7 天"],
                        ["30", "近 30 天"],
                        ["90", "近 90 天"],
                        ["custom", "自定义"],
                    ].map(([id, label]) => (_jsx("button", { type: "button", onClick: () => setRange(id), className: cn("rounded-full px-2.5 py-1 text-xs transition-colors", range === id
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"), children: label }, id))), range === "custom" && (_jsxs("div", { className: "flex items-center gap-1.5 text-xs", children: [_jsx("input", { type: "date", value: customFrom, onChange: (e) => setCustomFrom(e.target.value), className: "h-7 rounded-md border border-border bg-background/70 px-2" }), _jsx("span", { className: "text-muted-foreground", children: "\u81F3" }), _jsx("input", { type: "date", value: customTo, onChange: (e) => setCustomTo(e.target.value), className: "h-7 rounded-md border border-border bg-background/70 px-2" })] })), _jsx("div", { className: "ml-auto flex items-center gap-2", children: progress.running ? (_jsx(Button, { size: "sm", variant: "outline", onClick: () => void window.biliDesk.bili.abortFootprintSync(), children: "\u505C\u6B62" })) : (_jsxs(_Fragment, { children: [_jsxs(Button, { size: "sm", variant: "outline", onClick: () => void sync(false), children: [_jsx(RefreshCw, { className: "mr-1.5 h-3.5 w-3.5" }), "\u540C\u6B65\u5386\u53F2"] }), _jsx(Button, { size: "sm", variant: "ghost", title: "\u6E05\u7A7A\u6E38\u6807\u540E\u5168\u91CF\u91CD\u62C9", onClick: () => void sync(true), children: _jsx(History, { className: "h-3.5 w-3.5" }) })] })) })] }), _jsxs("div", { className: "shrink-0 space-y-2 border-b border-border/40 px-5 py-2.5 text-[11px] text-muted-foreground", children: [_jsxs("p", { children: ["\u5171 ", total, " \u6761", syncedAt
                                ? ` · 最近同步 ${formatMessageTime(Math.floor(syncedAt / 1000))}`
                                : " · 尚未同步", !progress.running && progress.message && progress.phase !== "idle"
                                ? ` · ${progress.message}`
                                : ""] }), (progress.running ||
                        progress.phase === "challenge" ||
                        progress.phase === "error") && (_jsxs("div", { className: cn("rounded-xl border px-3 py-2.5", progress.phase === "error"
                            ? "border-destructive/30 bg-destructive/10"
                            : progress.phase === "challenge"
                                ? "border-amber-500/30 bg-amber-500/10"
                                : "border-primary/25 bg-primary/10"), children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between gap-2", children: [_jsxs("p", { className: cn("text-xs font-medium", progress.phase === "error"
                                            ? "text-destructive"
                                            : progress.phase === "challenge"
                                                ? "text-amber-200"
                                                : "text-foreground"), children: [progress.phase === "challenge"
                                                ? "人机验证"
                                                : progress.phase === "comment"
                                                    ? "同步评论中"
                                                    : progress.phase === "danmaku"
                                                        ? "同步弹幕中"
                                                        : progress.phase === "verify"
                                                            ? "核对已删除"
                                                            : progress.phase === "recent"
                                                                ? "补近期发言"
                                                                : progress.phase === "error"
                                                                    ? "同步失败"
                                                                    : "同步中", progress.phase !== "verify" &&
                                                progress.phase !== "recent" &&
                                                progress.page
                                                ? ` · 第 ${progress.page} 页`
                                                : ""] }), _jsx("span", { className: "tabular-nums text-[11px] text-muted-foreground", children: progress.totalHint > 0
                                            ? `${Math.min(progress.fetched, progress.totalHint)} / ${progress.totalHint}`
                                            : progress.fetched > 0
                                                ? `已拉取 ${progress.fetched}`
                                                : progress.running
                                                    ? "准备中"
                                                    : "" })] }), _jsx("div", { className: "h-2 overflow-hidden rounded-full bg-secondary/80", children: _jsx("div", { className: cn("h-full rounded-full transition-[width] duration-300", progress.phase === "error"
                                        ? "bg-destructive"
                                        : progress.phase === "challenge"
                                            ? "bg-amber-400"
                                            : "bg-primary"), style: {
                                        width: `${progress.phase === "challenge"
                                            ? 12
                                            : progress.totalHint > 0
                                                ? Math.min(100, Math.round((progress.fetched / progress.totalHint) * 100))
                                                : progress.running
                                                    ? Math.min(90, 8 + progress.fetched / 5)
                                                    : 0}%`,
                                    } }) }), progress.message && (_jsx("p", { className: "mt-1.5 text-[11px] leading-5 text-muted-foreground", children: progress.message }))] })), _jsx("p", { children: "AICU \u662F\u522B\u4EBA\u6309\u81EA\u5DF1\u7684\u8FDB\u5EA6\u722C\u7684\u5E93\uFF0C\u4E0D\u662F\u5B9E\u65F6\u63A5\u53E3\u3002\u4F60\u8FD9\u4E2A\u53F7\u5728\u4ED6\u4EEC\u5E93\u91CC\u6700\u65B0\u5230 10 \u6708 6 \u65E5\uFF0C\u6240\u4EE5\u7D22\u5F15\u518D\u540C\u6B65\u4E5F\u8FD8\u662F\u90A3\u5929\u3002\u540C\u6B65\u8FD8\u4F1A\u628A\u300C\u6211\u56DE\u590D\u7684\u300D\uFF0C\u4EE5\u53CA\u8FD9\u6761\u65E5\u671F\u4E4B\u540E\u4F60\u770B\u8FC7\u7684\u89C6\u9891\u8BC4\u8BBA\u533A\uFF08\u542B\u697C\u4E2D\u697C\uFF09\u5C3D\u91CF\u8865\u8FDB\u6765\u3002\u6CA1\u770B\u8FC7\u7684\u89C6\u9891\u3001\u6216\u697C\u4E2D\u697C\u57CB\u5F97\u7279\u522B\u6DF1\u7684\uFF0C\u8FD9\u91CC\u4ECD\u7136\u53EF\u80FD\u6CA1\u6709\u3002\u5728\u672C\u5E94\u7528\u91CC\u65B0\u53D1\u7684\u4F1A\u9A6C\u4E0A\u8BB0\u4E0A\u3002" })] }), _jsxs("div", { className: "min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3", children: [error && (_jsx("p", { className: "rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: error })), items.map((item) => (_jsx("article", { className: "rounded-2xl border border-border/60 bg-card/30 px-4 py-3", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0 flex-1 space-y-1.5", children: [_jsx("p", { className: "whitespace-pre-wrap break-words text-sm leading-6", children: _jsx(BiliEmoteText, { text: item.text || "（无内容）" }) }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground", children: [_jsx("span", { children: formatMessageTime(item.time) }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: footprintTargetLabel(item) }), item.kind === "danmaku" && item.progressMs != null && (_jsxs(_Fragment, { children: [_jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [Math.floor(item.progressMs / 1000 / 60), ":", String(Math.floor((item.progressMs / 1000) % 60)).padStart(2, "0")] })] })), _jsx(Badge, { variant: "secondary", className: "h-5 px-1.5 text-[10px]", children: item.source === "local"
                                                        ? "本机"
                                                        : item.source === "bili"
                                                            ? "官方"
                                                            : "索引" })] })] }), _jsxs("div", { className: "flex shrink-0 gap-1", children: [_jsxs(Button, { size: "sm", variant: "ghost", disabled: !(item.bvid || item.oid > 0), onClick: () => openFootprintItem(item, navigate), children: [_jsx(Eye, { className: "mr-1 h-3.5 w-3.5" }), "\u67E5\u770B"] }), item.kind === "comment" && item.rpid && item.oid > 0 && (_jsxs(Button, { size: "sm", variant: "ghost", onClick: () => openFootprintItem(item, navigate), children: [_jsx(MapPin, { className: "mr-1 h-3.5 w-3.5" }), "\u5B9A\u4F4D"] }))] })] }) }, item.id))), !loading && items.length === 0 && !error && (_jsx(EmptyState, { title: kind === "comment" ? "还没有评论足迹" : "还没有弹幕足迹", detail: "\u70B9\u53F3\u4E0A\u89D2\u300C\u540C\u6B65\u5386\u53F2\u300D\u62C9\u53D6\u8FC7\u5F80\u8BB0\u5F55\uFF0C\u5E76\u5BF9\u7167 B \u7AD9\u53BB\u6389\u5DF2\u7ECF\u5220\u9664\u7684\u8BC4\u8BBA\uFF1B\u4E4B\u540E\u5728\u672C\u5E94\u7528\u91CC\u53D1\u7684\u4F1A\u81EA\u52A8\u8BB0\u5165\u3002" })), hasMore && (_jsx(Button, { variant: "ghost", disabled: loading, onClick: () => void load(items.length, true), children: loading ? "加载中" : "加载更多" })), loading && items.length === 0 && (_jsx("p", { className: "py-10 text-center text-xs text-muted-foreground", children: "\u6B63\u5728\u52A0\u8F7D\u2026" }))] })] }));
}
function useDebounced(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}
function ChatDesk({ keyword, onChanged, }) {
    const [filter, setFilter] = useState("all");
    const [sessions, setSessions] = useState([]);
    const [endTs, setEndTs] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [menu, setMenu] = useState(null);
    const [removeTarget, setRemoveTarget] = useState(null);
    const load = useCallback(async (append, cursor) => {
        setLoading(true);
        setError("");
        try {
            const page = await window.biliDesk.bili.getMessageSessions(filter, cursor);
            setSessions((current) => {
                const merged = append ? [...current, ...page.items] : page.items;
                const seen = new Set();
                return merged.filter((item) => {
                    const key = `${item.sessionType}:${item.talkerId}`;
                    if (seen.has(key))
                        return false;
                    seen.add(key);
                    return true;
                });
            });
            setEndTs(page.endTs);
            setHasMore(page.hasMore);
            if (!append) {
                setSelectedId((current) => {
                    if (current &&
                        page.items.some((item) => `${item.sessionType}:${item.talkerId}` === current)) {
                        return current;
                    }
                    const first = page.items[0];
                    return first ? `${first.sessionType}:${first.talkerId}` : "";
                });
            }
        }
        catch (err) {
            setError(tidyError(err));
        }
        finally {
            setLoading(false);
        }
    }, [filter]);
    useEffect(() => {
        void load(false, 0);
    }, [load]);
    usePageRefresh(REFRESH_EVENT, () => load(false, 0));
    const listRef = useRef(null);
    const sentinelRef = useRef(null);
    const loadingRef = useRef(false);
    loadingRef.current = loading;
    useEffect(() => {
        const root = listRef.current;
        const target = sentinelRef.current;
        if (!root || !target || !hasMore || error)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && !loadingRef.current) {
                void load(true, endTs);
            }
        }, { root, rootMargin: "200px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, endTs, error, load]);
    useEffect(() => {
        if (!menu)
            return;
        const close = () => setMenu(null);
        const onKey = (event) => {
            if (event.key === "Escape")
                close();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [menu]);
    const dropSession = (session) => {
        const key = `${session.sessionType}:${session.talkerId}`;
        setSessions((current) => {
            const next = current.filter((item) => `${item.sessionType}:${item.talkerId}` !== key);
            setSelectedId((currentId) => {
                if (currentId !== key)
                    return currentId;
                const fallback = next[0];
                return fallback ? `${fallback.sessionType}:${fallback.talkerId}` : "";
            });
            return next;
        });
    };
    const runSessionAction = async (session, action) => {
        setMenu(null);
        try {
            if (action === "pin") {
                const next = !session.pinned;
                await window.biliDesk.bili.setChatPinned(session.talkerId, session.sessionType, next);
                patchSession(session.talkerId, session.sessionType, { pinned: next });
            }
            else {
                const next = !session.muted;
                await window.biliDesk.bili.setChatMuted(session.talkerId, session.sessionType, next);
                patchSession(session.talkerId, session.sessionType, { muted: next });
            }
        }
        catch (err) {
            setError(tidyError(err));
        }
    };
    const visibleSessions = sessions
        .filter((item) => includesTerm(`${item.name} ${item.preview}`, keyword))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned));
    const selected = sessions.find((item) => `${item.sessionType}:${item.talkerId}` === selectedId) ?? null;
    const patchSession = (talkerId, sessionType, patch) => {
        setSessions((current) => current.map((item) => item.talkerId === talkerId && item.sessionType === sessionType
            ? { ...item, ...patch }
            : item));
    };
    return (_jsxs("div", { className: "flex h-full min-h-0", children: [_jsxs("div", { className: "flex w-[320px] shrink-0 flex-col border-r border-border/60", children: [_jsx("div", { className: "flex gap-1 overflow-x-auto px-3 py-3", children: FILTERS.map((item) => (_jsx("button", { type: "button", onClick: () => setFilter(item.id), className: cn("shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors", filter === item.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-muted-foreground hover:text-foreground"), children: item.label }, item.id))) }), _jsxs("div", { ref: listRef, className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: [error && (_jsx("p", { className: "px-4 py-6 text-center text-xs text-destructive", children: error })), !error && sessions.length === 0 && !loading && (_jsx(EmptyState, { title: "\u6CA1\u6709\u4F1A\u8BDD", detail: "\u8FD9\u4E2A\u5206\u7C7B\u4E0B\u8FD8\u6CA1\u6709\u6D88\u606F\u3002" })), !error &&
                                sessions.length > 0 &&
                                visibleSessions.length === 0 &&
                                !loading && (_jsx(EmptyState, { title: "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD", detail: "\u6362\u4E2A\u5173\u952E\u8BCD\uFF0C\u6216\u5148\u52A0\u8F7D\u66F4\u65E9\u7684\u4F1A\u8BDD\u3002" })), visibleSessions.map((item) => {
                                const key = `${item.sessionType}:${item.talkerId}`;
                                return (_jsxs("button", { type: "button", onClick: () => setSelectedId(key), onContextMenu: (event) => {
                                        event.preventDefault();
                                        setSelectedId(key);
                                        setMenu({
                                            x: event.clientX,
                                            y: event.clientY,
                                            session: item,
                                        });
                                    }, className: cn("flex w-full items-start gap-3 px-3 py-3 text-left transition-colors", key === selectedId
                                        ? "bg-primary/10"
                                        : "hover:bg-secondary/70"), children: [_jsx(Avatar, { name: item.name, face: item.face }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: cn("truncate text-sm font-medium", item.special && "text-pink-400"), children: item.name || "用户" }), item.special && _jsx(SpecialFollowTag, {}), item.pinned && (_jsx(Pin, { className: "h-3 w-3 shrink-0 text-primary" })), item.muted && (_jsx(BellOff, { className: "h-3 w-3 shrink-0 text-muted-foreground" })), _jsx("span", { className: "ml-auto shrink-0 text-[10px] text-muted-foreground", children: formatMessageTime(item.time) })] }), _jsxs("span", { className: "mt-1 flex items-center gap-2", children: [_jsx("span", { className: "min-w-0 flex-1 truncate text-xs text-muted-foreground", children: item.preview || "暂无消息" }), item.unread > 0 && (_jsx("span", { className: "rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground", children: item.unread > 99 ? "99+" : item.unread }))] })] })] }, key));
                            }), hasMore && (_jsx("div", { ref: sentinelRef, className: "p-3", children: _jsxs(Button, { variant: "ghost", size: "sm", className: "w-full gap-1.5", disabled: loading, onClick: () => void load(true, endTs), children: [loading && _jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin" }), loading ? "正在加载更早的会话" : "更早的会话"] }) })), !hasMore && sessions.length > 20 && !loading && (_jsx("p", { className: "py-4 text-center text-[11px] text-muted-foreground", children: "\u6CA1\u6709\u66F4\u65E9\u7684\u4F1A\u8BDD\u4E86" })), loading && sessions.length === 0 && (_jsx("p", { className: "px-4 py-8 text-center text-xs text-muted-foreground", children: "\u6B63\u5728\u540C\u6B65\u4F1A\u8BDD\u2026" }))] })] }), _jsx(ChatPane, { session: selected, keyword: keyword, onChanged: onChanged, onPatch: patchSession, onRemoved: (talkerId, sessionType) => {
                    const target = sessions.find((item) => item.talkerId === talkerId && item.sessionType === sessionType);
                    if (target)
                        dropSession(target);
                    else
                        setSelectedId("");
                } }), menu &&
                createPortal(_jsx(SessionContextMenu, { x: menu.x, y: menu.y, session: menu.session, onClose: () => setMenu(null), onPin: () => void runSessionAction(menu.session, "pin"), onMute: () => void runSessionAction(menu.session, "mute"), onRemove: () => {
                        setRemoveTarget(menu.session);
                        setMenu(null);
                    } }), document.body), _jsx(ConfirmDialog, { open: Boolean(removeTarget), title: "\u79FB\u9664\u8FD9\u4E2A\u4F1A\u8BDD\uFF1F", description: "\u53EA\u4ECE\u5217\u8868\u91CC\u62FF\u6389\uFF0C\u804A\u5929\u8BB0\u5F55\u8FD8\u5728\u3002\u4E4B\u540E\u6709\u65B0\u6D88\u606F\u4F1A\u518D\u51FA\u73B0\u3002", confirmLabel: "\u79FB\u9664", destructive: true, onCancel: () => setRemoveTarget(null), onConfirm: () => {
                    const target = removeTarget;
                    setRemoveTarget(null);
                    if (!target)
                        return;
                    void window.biliDesk.bili
                        .removeChatSession(target.talkerId, target.sessionType)
                        .then(() => dropSession(target))
                        .catch((err) => setError(tidyError(err)));
                } })] }));
}
function SessionContextMenu({ x, y, session, onClose, onPin, onMute, onRemove, }) {
    const width = 168;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - 140));
    const itemClass = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary";
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "fixed inset-0 z-[20000] cursor-default", "aria-label": "\u5173\u95ED\u83DC\u5355", onClick: onClose, onContextMenu: (event) => {
                    event.preventDefault();
                    onClose();
                } }), _jsxs("div", { className: "fixed z-[20001] w-[168px] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-2xl", style: { left, top }, onContextMenu: (event) => event.preventDefault(), children: [_jsxs("button", { type: "button", className: itemClass, onClick: onPin, children: [_jsx(Pin, { className: "h-4 w-4 text-muted-foreground" }), session.pinned ? "取消置顶" : "置顶"] }), _jsxs("button", { type: "button", className: itemClass, onClick: onMute, children: [_jsx(BellOff, { className: "h-4 w-4 text-muted-foreground" }), session.muted ? "取消免打扰" : "免打扰"] }), _jsx("div", { className: "my-1 border-t border-border/70" }), _jsxs("button", { type: "button", className: cn(itemClass, "text-destructive"), onClick: onRemove, children: [_jsx(Trash2, { className: "h-4 w-4" }), "\u79FB\u9664\u4F1A\u8BDD"] })] })] }));
}
function SpecialFollowTag() {
    return (_jsx("span", { className: "shrink-0 rounded border border-pink-400/60 px-1 text-[10px] leading-4 text-pink-400", children: "\u7279\u522B\u5173\u6CE8" }));
}
function Avatar({ name, face }) {
    if (face) {
        return (_jsx(BiliImage, { src: face, alt: "", className: "h-10 w-10 shrink-0 rounded-full object-cover" }));
    }
    return (_jsx("span", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium", children: (name || "消").slice(0, 1) }));
}
function editorText(root) {
    const parts = [];
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent ?? "");
            return;
        }
        if (!(node instanceof HTMLElement))
            return;
        if (node.dataset.emote) {
            parts.push(node.dataset.emote);
            return;
        }
        if (node.tagName === "BR") {
            parts.push("\n");
            return;
        }
        const block = node.tagName === "DIV" || node.tagName === "P";
        if (block && parts.length > 0 && !parts[parts.length - 1]?.endsWith("\n")) {
            parts.push("\n");
        }
        node.childNodes.forEach(walk);
    };
    root.childNodes.forEach(walk);
    const text = parts.join("").replace(/\u00a0/g, " ");
    return text === "\n" ? "" : text;
}
function placeCaretAtEnd(root) {
    const selection = window.getSelection();
    if (!selection)
        return;
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}
function insertAtCaret(root, node) {
    root.focus();
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 && root.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    if (!range) {
        root.appendChild(node);
        placeCaretAtEnd(root);
        return;
    }
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
}
function sharePreview(kind) {
    if (kind === "article")
        return "[专栏]";
    if (kind === "dynamic")
        return "[动态]";
    if (kind === "live")
        return "[直播]";
    return "[视频]";
}
async function shareCardFromInput(raw) {
    const text = raw.trim();
    const video = text.match(/(?:bilibili\.com\/video\/)?(BV[0-9A-Za-z]+)/i);
    if (video && /BV/i.test(text) && !/live\.bilibili\.com/i.test(text)) {
        const detail = await window.biliDesk.bili.getVideo(video[1]);
        return {
            kind: "video",
            title: detail.title,
            cover: detail.cover,
            bvid: detail.bvid,
            aid: detail.aid,
            views: detail.stat?.view,
        };
    }
    const article = text.match(/(?:read\/cv|cv)(\d+)/i);
    if (article && /cv/i.test(text)) {
        const detail = await window.biliDesk.bili.getArticle(Number(article[1]));
        return {
            kind: "article",
            title: detail.title,
            cover: detail.banner || detail.images?.[0],
            cvid: detail.id,
            views: detail.view,
        };
    }
    const dynamic = text.match(/(?:opus\/|t\.bilibili\.com\/)(\d+)/i);
    if (dynamic) {
        const detail = await window.biliDesk.bili.getDynamicDetail(dynamic[1]);
        return {
            kind: "dynamic",
            title: detail.text.slice(0, 80) || "动态",
            cover: detail.cover || detail.images?.[0],
            dynId: detail.id || dynamic[1],
        };
    }
    const live = text.match(/live\.bilibili\.com\/(\d+)/i);
    if (live) {
        const room = await window.biliDesk.bili.getLiveRoom(Number(live[1]));
        return {
            kind: "live",
            title: room.title,
            cover: room.cover,
            roomId: room.roomId,
        };
    }
    return null;
}
async function sendShareIfLink(talkerId, sessionType, text) {
    const whole = /^(?:https?:\/\/)?(?:www\.)?(?:bilibili\.com\/(?:video\/BV|read\/cv|opus\/)|t\.bilibili\.com\/|live\.bilibili\.com\/)/i.test(text.trim()) || /^BV[0-9A-Za-z]+$/i.test(text.trim());
    if (!whole)
        return null;
    const card = await shareCardFromInput(text);
    if (!card)
        return null;
    await window.biliDesk.bili.sendChatShare(talkerId, sessionType, card);
    return sharePreview(card.kind);
}
function ChatComposer({ sending, onSend, onSendImage, onSendShare, }) {
    const editorRef = useRef(null);
    const imageInputRef = useRef(null);
    const snapshot = useRef("");
    const [draft, setDraft] = useState("");
    const [shareOpen, setShareOpen] = useState(false);
    const [shareRaw, setShareRaw] = useState("");
    const emoteMap = useReplyEmotes();
    const commit = () => {
        const root = editorRef.current;
        if (!root)
            return;
        const text = editorText(root);
        if (text.length > 500) {
            root.innerHTML = snapshot.current;
            placeCaretAtEnd(root);
            return;
        }
        snapshot.current = root.innerHTML;
        setDraft(text);
    };
    const insertEmote = (token, imageUrl) => {
        const root = editorRef.current;
        if (!root || sending)
            return;
        const url = imageUrl || emoteMap[token];
        if (url) {
            const image = document.createElement("img");
            image.src = normalizeBiliImage(url);
            image.alt = token;
            image.dataset.emote = token;
            image.draggable = false;
            image.contentEditable = "false";
            image.className = "mx-0.5 inline-block h-5 w-5 align-text-bottom";
            insertAtCaret(root, image);
        }
        else {
            insertAtCaret(root, document.createTextNode(token));
        }
        commit();
    };
    const submit = async () => {
        const text = editorRef.current
            ? editorText(editorRef.current).trim()
            : draft.trim();
        if (!text || sending)
            return;
        const ok = await onSend(text);
        if (!ok || !editorRef.current)
            return;
        editorRef.current.innerHTML = "";
        snapshot.current = "";
        setDraft("");
    };
    return (_jsxs("form", { className: "border-t border-border/60 px-4 py-2", onSubmit: (event) => {
            event.preventDefault();
            void submit();
        }, children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("input", { ref: imageInputRef, type: "file", accept: "image/jpeg,image/png,image/gif,image/webp", className: "hidden", onChange: (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            onSendImage(file);
                        } }), _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "h-8 w-8 text-muted-foreground", title: "\u5206\u4EAB\u5361\u7247", disabled: sending, onClick: () => setShareOpen((open) => !open), children: _jsx(Share2, { className: "h-4 w-4" }) }), _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "h-8 w-8 text-muted-foreground", title: "\u53D1\u9001\u56FE\u7247", disabled: sending, onClick: () => imageInputRef.current?.click(), children: _jsx(ImageIcon, { className: "h-4 w-4" }) }), _jsx(EmotePickerButton, { variant: "popover", onPick: (emote, imageUrl) => insertEmote(emote, imageUrl) })] }), shareOpen && (_jsxs("div", { className: "mb-2 flex items-center gap-2", children: [_jsx("input", { value: shareRaw, disabled: sending, placeholder: "\u7C98\u8D34\u89C6\u9891 BV\u3001\u4E13\u680F cv\u3001\u52A8\u6001\u6216\u76F4\u64AD\u94FE\u63A5", className: "h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2 text-sm outline-none", onChange: (event) => setShareRaw(event.target.value), onKeyDown: (event) => {
                            if (event.key !== "Enter")
                                return;
                            event.preventDefault();
                            const raw = shareRaw.trim();
                            if (!raw || sending)
                                return;
                            void onSendShare(raw).then((ok) => {
                                if (!ok)
                                    return;
                                setShareRaw("");
                                setShareOpen(false);
                            });
                        } }), _jsx(Button, { type: "button", size: "sm", disabled: sending || !shareRaw.trim(), onClick: () => {
                            void onSendShare(shareRaw.trim()).then((ok) => {
                                if (!ok)
                                    return;
                                setShareRaw("");
                                setShareOpen(false);
                            });
                        }, children: "\u53D1\u9001" })] })), _jsxs("div", { className: "relative", children: [draft.length === 0 && (_jsx("span", { className: "pointer-events-none absolute left-1 top-1 text-sm text-muted-foreground", children: "\u8BF7\u8F93\u5165\u6D88\u606F\u5185\u5BB9" })), _jsx("div", { ref: editorRef, contentEditable: !sending, suppressContentEditableWarning: true, role: "textbox", "aria-multiline": "true", spellCheck: false, className: "min-h-[52px] w-full whitespace-pre-wrap break-words px-1 py-1 text-sm outline-none", onInput: commit, onPaste: (event) => {
                            event.preventDefault();
                            const root = editorRef.current;
                            const text = event.clipboardData.getData("text/plain");
                            if (!root || !text)
                                return;
                            insertAtCaret(root, document.createTextNode(text));
                            commit();
                        }, onKeyDown: (event) => {
                            if (event.key === "Enter" &&
                                !event.shiftKey &&
                                !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                void submit();
                            }
                        } })] }), _jsxs("div", { className: "flex items-center justify-end gap-3 pb-1", children: [_jsxs("span", { className: "text-[11px] text-muted-foreground", children: [draft.length, "/500"] }), _jsxs(Button, { type: "submit", disabled: sending || !draft.trim(), children: [sending ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : (_jsx(Send, { className: "h-4 w-4" })), "\u53D1\u9001"] })] })] }));
}
function ChatPane({ session, keyword, onChanged, onPatch, onRemoved, }) {
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [emotes, setEmotes] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [minSeqno, setMinSeqno] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [preview, setPreview] = useState("");
    const scroller = useRef(null);
    const stickToBottom = useRef(true);
    const onChangedRef = useRef(onChanged);
    const onPatchRef = useRef(onPatch);
    onChangedRef.current = onChanged;
    onPatchRef.current = onPatch;
    const talkerId = session?.talkerId ?? "";
    const sessionType = session?.sessionType ?? 0;
    const pageVisible = useLocation().pathname === "/messages";
    const mergeEmotes = (incoming) => {
        setEmotes((current) => {
            const map = new Map(current.map((item) => [item.text, item]));
            for (const item of incoming)
                map.set(item.text, item);
            return [...map.values()];
        });
    };
    const loadLatest = useCallback(async () => {
        if (!talkerId)
            return;
        setLoading(true);
        setError("");
        try {
            const page = await window.biliDesk.bili.getChatMessages(talkerId, sessionType);
            setMessages(page.messages);
            mergeEmotes(page.emotes);
            setHasMore(page.hasMore);
            setMinSeqno(page.minSeqno);
            stickToBottom.current = true;
            if (page.maxSeqno) {
                await window.biliDesk.bili.markChatRead(talkerId, sessionType, page.maxSeqno);
                onPatchRef.current(talkerId, sessionType, { unread: 0 });
                onChangedRef.current();
            }
        }
        catch (err) {
            setError(tidyError(err));
        }
        finally {
            setLoading(false);
        }
    }, [sessionType, talkerId]);
    useEffect(() => {
        setMessages([]);
        setEmotes([]);
        setError("");
        if (!talkerId)
            return;
        void loadLatest();
    }, [loadLatest, talkerId]);
    useEffect(() => {
        if (!talkerId || !pageVisible)
            return;
        const timer = window.setInterval(() => {
            void window.biliDesk.bili
                .getChatMessages(talkerId, sessionType)
                .then((page) => {
                setMessages((current) => {
                    const map = new Map(current.map((item) => [item.seqno, item]));
                    for (const item of page.messages)
                        map.set(item.seqno, item);
                    return [...map.values()].sort((a, b) => a.time - b.time || a.seqno.localeCompare(b.seqno));
                });
                mergeEmotes(page.emotes);
            })
                .catch(() => undefined);
        }, 15000);
        return () => window.clearInterval(timer);
    }, [pageVisible, sessionType, talkerId]);
    useEffect(() => {
        const node = scroller.current;
        if (!node || !stickToBottom.current)
            return;
        node.scrollTop = node.scrollHeight;
    }, [messages]);
    const loadOlder = async () => {
        if (!session || !minSeqno || !hasMore)
            return;
        const node = scroller.current;
        const previous = node?.scrollHeight ?? 0;
        stickToBottom.current = false;
        try {
            const page = await window.biliDesk.bili.getChatMessages(session.talkerId, session.sessionType, minSeqno);
            setMessages((current) => {
                const map = new Map(page.messages.map((item) => [item.seqno, item]));
                for (const item of current)
                    map.set(item.seqno, item);
                return [...map.values()].sort((a, b) => a.time - b.time);
            });
            mergeEmotes(page.emotes);
            setHasMore(page.hasMore);
            setMinSeqno(page.minSeqno);
            requestAnimationFrame(() => {
                if (!node)
                    return;
                node.scrollTop = node.scrollHeight - previous;
            });
        }
        catch (err) {
            setError(tidyError(err));
        }
    };
    const send = async (text) => {
        if (!session || sending)
            return false;
        const content = text.trim();
        if (!content)
            return false;
        setSending(true);
        setError("");
        try {
            const shared = await sendShareIfLink(session.talkerId, session.sessionType, content);
            if (!shared) {
                await window.biliDesk.bili.sendChatMessage(session.talkerId, session.sessionType, content);
            }
            onPatch(session.talkerId, session.sessionType, {
                preview: shared || content,
                time: Math.floor(Date.now() / 1000),
            });
            await loadLatest();
            return true;
        }
        catch (err) {
            setError(tidyError(err));
            return false;
        }
        finally {
            setSending(false);
        }
    };
    const sendImage = async (file) => {
        if (!session || !file || sending)
            return;
        if (!file.type.startsWith("image/")) {
            setError("只能发送图片");
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setError("图片不能超过 20MB");
            return;
        }
        setSending(true);
        setError("");
        try {
            const data = new Uint8Array(await file.arrayBuffer());
            await window.biliDesk.bili.sendChatImage(session.talkerId, session.sessionType, { name: file.name, mime: file.type, data });
            onPatch(session.talkerId, session.sessionType, {
                preview: "[图片]",
                time: Math.floor(Date.now() / 1000),
            });
            await loadLatest();
        }
        catch (err) {
            setError(tidyError(err));
        }
        finally {
            setSending(false);
        }
    };
    if (!session) {
        return (_jsx(EmptyState, { title: "\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD", detail: "\u5DE6\u4FA7\u662F\u5168\u90E8\u3001\u5DF2\u5173\u6CE8\u3001\u672A\u5173\u6CE8\u3001\u5E94\u63F4\u56E2\u548C\u88AB\u62E6\u622A\u7684\u6D88\u606F\u3002" }));
    }
    const canSend = session.systemType === 0;
    return (_jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-border/60 px-4 py-3", children: [_jsx(Avatar, { name: session.name, face: session.face }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", className: cn("truncate text-sm font-semibold hover:text-primary", session.special && "text-pink-400"), onClick: () => {
                                            if (session.sessionType === 1 && session.systemType === 0) {
                                                navigate(`/up/${session.talkerId}`);
                                            }
                                        }, children: session.name || "用户" }), session.special ? (_jsx(SpecialFollowTag, {})) : (session.followed && _jsx(Badge, { children: "\u5DF2\u5173\u6CE8" })), session.live && _jsx(Badge, { variant: "ai", children: "\u76F4\u64AD\u4E2D" })] }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: session.sessionType === 2
                                    ? "应援团"
                                    : session.systemType
                                        ? "官方会话"
                                        : "私信" })] }), _jsx(Button, { variant: "ghost", size: "icon", title: session.pinned ? "取消置顶" : "置顶", onClick: () => {
                            const next = !session.pinned;
                            void window.biliDesk.bili
                                .setChatPinned(session.talkerId, session.sessionType, next)
                                .then(() => onPatch(session.talkerId, session.sessionType, {
                                pinned: next,
                            }))
                                .catch((err) => setError(tidyError(err)));
                        }, children: _jsx(Pin, { className: cn("h-4 w-4", session.pinned && "text-primary") }) }), _jsx(Button, { variant: "ghost", size: "icon", title: session.muted ? "取消免打扰" : "免打扰", onClick: () => {
                            const next = !session.muted;
                            void window.biliDesk.bili
                                .setChatMuted(session.talkerId, session.sessionType, next)
                                .then(() => onPatch(session.talkerId, session.sessionType, { muted: next }))
                                .catch((err) => setError(tidyError(err)));
                        }, children: _jsx(BellOff, { className: cn("h-4 w-4", session.muted && "text-primary") }) }), _jsx(Button, { variant: "ghost", size: "icon", title: "\u79FB\u9664\u4F1A\u8BDD", onClick: () => setConfirmRemove(true), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }), _jsxs("div", { ref: scroller, className: "scrollbar-overlay min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4", onScroll: (event) => {
                    const node = event.currentTarget;
                    stickToBottom.current =
                        node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                    if (node.scrollTop < 24 && hasMore && !loading)
                        void loadOlder();
                }, children: [hasMore && (_jsx("p", { className: "text-center text-[11px] text-muted-foreground", children: "\u4E0A\u6ED1\u52A0\u8F7D\u66F4\u65E9\u7684\u6D88\u606F" })), messages
                        .filter((item) => includesTerm(`${systemHintText(item.text) ?? item.text} ${item.title}`, keyword))
                        .map((item, index, list) => {
                        const hint = systemHintText(item.text);
                        const text = hint ?? item.text;
                        return (_jsxs(Fragment, { children: [needsChatStamp(list[index - 1], item) && (_jsx("p", { className: "py-2 text-center text-xs text-muted-foreground", children: formatChatStamp(item.time) })), isSystemHint(item) ? (_jsx("p", { className: "px-10 py-1 text-center text-xs leading-5 text-muted-foreground", children: text || "系统提示" })) : (_jsx(Bubble, { message: { ...item, text }, emotes: emotes, onOpen: (url) => void openTarget(url, navigate), onPreview: setPreview, onRecall: () => {
                                        void window.biliDesk.bili
                                            .recallChatMessage(session.talkerId, session.sessionType, item.msgKey)
                                            .then(() => loadLatest())
                                            .catch((err) => setError(tidyError(err)));
                                    } }))] }, item.seqno || item.msgKey));
                    }), !loading && messages.length === 0 && !error && (_jsx(EmptyState, { title: "\u8FD8\u6CA1\u6709\u6D88\u606F", detail: "\u53D1\u4E00\u6761\u6D88\u606F\u5F00\u59CB\u804A\u5929\u3002" }))] }), error && _jsx("p", { className: "px-4 pb-1 text-xs text-destructive", children: error }), canSend ? (_jsx(ChatComposer, { sending: sending, onSend: send, onSendImage: (file) => void sendImage(file), onSendShare: async (raw) => {
                    if (!session || sending)
                        return false;
                    setSending(true);
                    setError("");
                    try {
                        const card = await shareCardFromInput(raw);
                        if (!card) {
                            setError("请粘贴视频、专栏、动态或直播链接");
                            return false;
                        }
                        await window.biliDesk.bili.sendChatShare(session.talkerId, session.sessionType, card);
                        onPatch(session.talkerId, session.sessionType, {
                            preview: sharePreview(card.kind),
                            time: Math.floor(Date.now() / 1000),
                        });
                        await loadLatest();
                        return true;
                    }
                    catch (err) {
                        setError(tidyError(err));
                        return false;
                    }
                    finally {
                        setSending(false);
                    }
                } }, `${session.talkerId}:${session.sessionType}`)) : (_jsx("p", { className: "border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground", children: "\u5B98\u65B9\u4F1A\u8BDD\u53EA\u63A5\u6536\u901A\u77E5\uFF0C\u4E0D\u80FD\u56DE\u590D" })), _jsx(ConfirmDialog, { open: confirmRemove, title: "\u79FB\u9664\u8FD9\u4E2A\u4F1A\u8BDD\uFF1F", description: "\u53EA\u4ECE\u5217\u8868\u91CC\u62FF\u6389\uFF0C\u804A\u5929\u8BB0\u5F55\u8FD8\u5728\u3002\u4E4B\u540E\u6709\u65B0\u6D88\u606F\u4F1A\u518D\u51FA\u73B0\u3002", confirmLabel: "\u79FB\u9664", destructive: true, onCancel: () => setConfirmRemove(false), onConfirm: () => {
                    void window.biliDesk.bili
                        .removeChatSession(session.talkerId, session.sessionType)
                        .then(() => {
                        setConfirmRemove(false);
                        onRemoved(session.talkerId, session.sessionType);
                    })
                        .catch((err) => {
                        setConfirmRemove(false);
                        setError(tidyError(err));
                    });
                } }), _jsx(ImageLightbox, { images: preview ? [preview] : [], index: 0, open: Boolean(preview), onClose: () => setPreview("") })] }));
}
function Bubble({ message, emotes, onOpen, onPreview, onRecall, }) {
    const recalled = message.status === 1 || message.msgType === 5;
    const note = sourceNote(message.source);
    const canRecall = message.mine &&
        !recalled &&
        Boolean(message.msgKey) &&
        Date.now() / 1000 - message.time < 120;
    const picture = message.msgType === 2 || message.msgType === 6;
    const card = !recalled &&
        !picture &&
        message.msgType !== 1 &&
        Boolean(message.title || message.jumpUrl || message.cover);
    return (_jsx("div", { className: cn("flex", message.mine ? "justify-end" : "justify-start"), children: _jsxs("div", { className: cn("max-w-[78%]", card && "max-w-[320px]"), children: [_jsx("div", { className: cn("text-sm leading-6", card
                        ? "rounded-xl bg-card p-1 text-foreground shadow-sm ring-1 ring-border/60"
                        : "rounded-2xl px-3 py-2", !card &&
                        (recalled
                            ? "bg-secondary/60 text-muted-foreground"
                            : message.mine
                                ? "bg-primary/15 text-foreground"
                                : "bg-card text-foreground shadow-sm ring-1 ring-border/60")), children: recalled ? (message.text) : (_jsxs(_Fragment, { children: [message.imageUrl && picture && (_jsx("button", { type: "button", onClick: () => onPreview(message.imageUrl), children: _jsx(BiliImage, { src: message.imageUrl, alt: "", className: "max-h-52 rounded-lg object-cover" }) })), card ? (_jsxs("button", { type: "button", className: "flex w-full gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-secondary/70", onClick: () => message.jumpUrl && onOpen(message.jumpUrl), children: [message.cover ? (_jsx(BiliImage, { src: message.cover, alt: "", className: "h-16 w-[108px] shrink-0 rounded-md object-cover" })) : (message.text && (_jsx("span", { className: "line-clamp-3 h-16 w-[108px] shrink-0 overflow-hidden rounded-md bg-secondary/80 p-1.5 text-[10px] leading-4 text-muted-foreground", children: message.text }))), _jsxs("span", { className: "flex min-w-0 flex-1 flex-col", children: [_jsx("span", { className: "line-clamp-2 text-sm font-medium leading-5", children: message.title || "打开内容" }), _jsxs("span", { className: "mt-auto flex items-center gap-3 pt-1 text-[11px] text-muted-foreground", children: [message.pubDate && _jsx("span", { children: message.pubDate }), message.views > 0 && (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Eye, { className: "h-3 w-3" }), formatCount(message.views)] }))] })] })] })) : (message.text && _jsx(RichText, { text: message.text, emotes: emotes }))] })) }), (note || canRecall) && (_jsxs("div", { className: cn("mt-1 flex items-center gap-2 text-[10px] text-muted-foreground", message.mine && "justify-end"), children: [note && _jsx("span", { children: note }), canRecall && (_jsx("button", { type: "button", className: "hover:text-foreground", onClick: onRecall, children: "\u64A4\u56DE" }))] }))] }) }));
}
function FeedList({ kind, keyword, onChanged, }) {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [cursorId, setCursorId] = useState(0);
    const [cursorTime, setCursorTime] = useState(0);
    const [isEnd, setIsEnd] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [replyId, setReplyId] = useState("");
    const [replyText, setReplyText] = useState("");
    const [replying, setReplying] = useState(false);
    const [serverKeyword, setServerKeyword] = useState(keyword.trim());
    useEffect(() => {
        if (kind !== "sent")
            return;
        const timer = window.setTimeout(() => setServerKeyword(keyword.trim()), 280);
        return () => window.clearTimeout(timer);
    }, [keyword, kind]);
    const load = useCallback(async (append, id, time) => {
        setLoading(true);
        setError("");
        try {
            const page = kind === "sent"
                ? await window.biliDesk.bili.getMyReplies(append ? id : 0, append ? time : 0, serverKeyword)
                : await window.biliDesk.bili.getMessageFeed(kind, id, time);
            setItems((current) => {
                const mapped = kind === "sent" ? page.items.map(withSelfAvatar) : page.items;
                if (append)
                    return [...current, ...mapped];
                if (kind !== "sent")
                    return mapped;
                const local = readLocalSent()
                    .map(withSelfAvatar)
                    .filter((row) => !mapped.some((item) => item.id === row.id));
                return [...local, ...mapped];
            });
            setCursorId(page.cursorId);
            setCursorTime(page.cursorTime);
            setIsEnd(page.isEnd || (kind !== "sent" && page.items.length === 0));
            if (!append)
                onChanged();
        }
        catch (err) {
            setError(tidyError(err));
        }
        finally {
            setLoading(false);
        }
    }, [kind, onChanged, serverKeyword]);
    useEffect(() => {
        setItems([]);
        void load(false, 0, 0);
    }, [load]);
    usePageRefresh(REFRESH_EVENT, () => load(false, 0, 0));
    const headline = (item) => {
        const names = item.users
            .slice(0, 2)
            .map((user) => user.name)
            .filter(Boolean);
        const who = names.join("、") || "有人";
        const extra = item.counts > Math.max(1, names.length) ? ` 等 ${item.counts} 人` : "";
        if (kind === "sent") {
            const selfName = item.users[0]?.name;
            return selfName && selfName !== "我" ? `${selfName} 回复了` : "我回复了";
        }
        if (kind === "like")
            return `${who}${extra} 赞了你`;
        if (kind === "at")
            return `${who}${extra} @ 了你`;
        return `${who}${extra} 回复了你`;
    };
    const term = keyword.trim();
    const shown = items.filter((item) => includesTerm([
        item.content,
        item.quote,
        item.title,
        item.business,
        ...item.users.map((user) => user.name),
    ].join(" "), term));
    return (_jsxs("div", { className: "scrollbar-overlay h-full overflow-y-auto px-5 py-4", children: [error && _jsx("p", { className: "mb-3 text-sm text-destructive", children: error }), _jsxs("div", { className: "mx-auto flex max-w-3xl flex-col gap-3", children: [term && !isEnd && (_jsx("p", { className: "text-center text-[11px] text-muted-foreground", children: kind === "sent"
                            ? "按关键词向服务器查询，未加载完时可继续翻页"
                            : "当前只搜索已加载的内容，需要的话先加载更多" })), shown.map((item) => (_jsx("article", { className: "rounded-2xl border border-border/70 bg-card/40 p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsxs("div", { className: "flex shrink-0 flex-col items-center gap-1", children: [_jsx("div", { className: "flex -space-x-2", children: (item.users.slice(0, 3).length
                                                ? item.users.slice(0, 3)
                                                : [{ mid: 0, name: "用户", face: "" }]).map((user) => (_jsx("button", { type: "button", onClick: () => user.mid && navigate(`/up/${user.mid}`), title: user.name, children: _jsx(Avatar, { name: user.name, face: user.face }) }, `${user.mid}-${user.name}`))) }), kind === "reply" && item.users[0]?.name && (_jsx("button", { type: "button", className: "max-w-[4.5rem] truncate text-[11px] text-muted-foreground hover:text-primary", onClick: () => item.users[0]?.mid && navigate(`/up/${item.users[0].mid}`), children: item.users[0].name }))] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("p", { className: "min-w-0 flex-1 truncate text-sm font-medium", children: headline(item) }), item.business && (_jsx(Badge, { variant: "secondary", children: item.business }))] }), _jsx("p", { className: "mt-1 text-[11px] text-muted-foreground", children: formatMessageTime(item.time) }), item.content && (_jsx("p", { className: "mt-2 text-sm leading-6", children: item.content })), item.quote && (_jsx("p", { className: "mt-2 rounded-xl bg-secondary/70 px-3 py-2 text-xs leading-5 text-muted-foreground", children: item.quote })), (item.title || item.cover) && (_jsxs("button", { type: "button", className: "mt-3 flex w-full items-center gap-3 rounded-xl bg-secondary/50 p-2 text-left", onClick: () => void openTarget(item.uri, navigate), children: [item.cover && (_jsx(BiliImage, { src: item.cover, alt: "", className: "h-12 w-20 shrink-0 rounded-lg object-cover" })), _jsx("span", { className: "line-clamp-2 text-xs", children: item.title || "查看原内容" })] })), _jsxs("div", { className: "mt-3 flex gap-2", children: [item.uri && (_jsx(Button, { variant: "outline", size: "sm", onClick: () => void openTarget(item.uri, navigate), children: "\u67E5\u770B" })), canLocate(item) && (_jsxs(Button, { variant: "outline", size: "sm", onClick: () => locateComment(item, navigate), children: [_jsx(MapPin, { className: "h-3.5 w-3.5" }), "\u5B9A\u4F4D"] })), kind === "reply" &&
                                                    item.subjectId > 0 &&
                                                    item.businessId > 0 && (_jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                                                        setReplyId(item.id);
                                                        setReplyText("");
                                                    }, children: "\u56DE\u590D" })), kind !== "sent" && (_jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                                                        void window.biliDesk.bili
                                                            .deleteMessageFeed(kind, item.id)
                                                            .then(() => {
                                                            setItems((current) => current.filter((row) => row.id !== item.id));
                                                            onChanged();
                                                        })
                                                            .catch((err) => setError(tidyError(err)));
                                                    }, children: "\u5220\u9664" }))] }), replyId === item.id && (_jsxs("form", { className: "mt-3 flex gap-2", onSubmit: (event) => {
                                                event.preventDefault();
                                                const text = replyText.trim();
                                                if (!text || replying)
                                                    return;
                                                setReplying(true);
                                                void window.biliDesk.bili
                                                    .addTargetComment(String(item.subjectId), item.businessId, text, item.rootId || item.sourceId, item.sourceId || item.rootId)
                                                    .then((created) => {
                                                    const rpid = created?.rpid ?? 0;
                                                    const self = useAppStore.getState().user;
                                                    rememberLocalSent({
                                                        id: rpid ? String(rpid) : `local-${Date.now()}`,
                                                        time: Math.floor(Date.now() / 1000),
                                                        users: [
                                                            {
                                                                mid: self?.mid || 0,
                                                                name: self?.name || "我",
                                                                face: self?.face || "",
                                                            },
                                                        ],
                                                        counts: 1,
                                                        business: item.business,
                                                        title: item.title,
                                                        content: text,
                                                        quote: item.content
                                                            ? item.users[0]?.name
                                                                ? `回复 @${item.users[0].name}：${item.content}`
                                                                : item.content
                                                            : "",
                                                        cover: item.cover,
                                                        uri: item.uri,
                                                        subjectId: item.subjectId,
                                                        businessId: item.businessId,
                                                        rootId: item.rootId || item.sourceId || rpid,
                                                        sourceId: rpid || item.sourceId || item.rootId,
                                                    });
                                                    setReplyId("");
                                                    setReplyText("");
                                                })
                                                    .catch((err) => setError(tidyError(err)))
                                                    .finally(() => setReplying(false));
                                            }, children: [_jsx("input", { value: replyText, onChange: (event) => setReplyText(event.target.value), placeholder: "\u56DE\u590D\u8FD9\u6761\u8BC4\u8BBA", className: "h-9 flex-1 rounded-lg border border-border bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" }), _jsx(Button, { type: "submit", size: "sm", disabled: replying || !replyText.trim(), children: "\u53D1\u9001" })] }))] })] }) }, item.id))), !loading && items.length === 0 && !error && (_jsx(EmptyState, { title: kind === "sent" ? "还没有可显示的回复" : "这里是空的", detail: kind === "sent"
                            ? "这里列出别人回复过的、你发出的评论。你在「回复我的」里新写的回复也会出现在这里。"
                            : "新的互动会出现在这个列表里。" })), !loading && items.length > 0 && shown.length === 0 && !error && (_jsx(EmptyState, { title: "\u6CA1\u6709\u5339\u914D\u7684\u5185\u5BB9", detail: "\u6362\u4E2A\u5173\u952E\u8BCD\uFF0C\u6216\u5148\u52A0\u8F7D\u66F4\u591A\u518D\u641C\u3002" })), !isEnd && items.length > 0 && (_jsx(Button, { variant: "ghost", disabled: loading, onClick: () => void load(true, cursorId, cursorTime), children: loading ? "加载中" : "加载更多" })), loading && items.length === 0 && (_jsx("p", { className: "py-10 text-center text-xs text-muted-foreground", children: "\u6B63\u5728\u52A0\u8F7D\u2026" }))] })] }));
}
function FansList({ keyword }) {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async (nextPage) => {
        setLoading(true);
        setError("");
        try {
            const result = await window.biliDesk.bili.getNewFans(nextPage);
            setItems((current) => {
                const merged = nextPage > 1 ? [...current, ...result.items] : result.items;
                const seen = new Set();
                return merged.filter((item) => {
                    if (seen.has(item.mid))
                        return false;
                    seen.add(item.mid);
                    return true;
                });
            });
            setPage(result.page);
            setHasMore(result.hasMore);
            setTotal(result.total);
        }
        catch (err) {
            setError(tidyError(err));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load(1);
    }, [load]);
    usePageRefresh(REFRESH_EVENT, () => load(1));
    const setMutual = (mid, mutual) => {
        setItems((current) => current.map((item) => (item.mid === mid ? { ...item, mutual } : item)));
    };
    const term = keyword.trim();
    const shown = items.filter((item) => includesTerm(`${item.name} ${item.sign}`, term));
    return (_jsxs("div", { className: "scrollbar-overlay h-full overflow-y-auto px-5 py-4", children: [error && _jsx("p", { className: "mb-3 text-sm text-destructive", children: error }), _jsxs("div", { className: "mx-auto flex max-w-3xl flex-col gap-2", children: [total > 0 && (_jsxs("p", { className: "text-[11px] text-muted-foreground", children: ["\u5171 ", formatCount(total), " \u4F4D\u7C89\u4E1D\uFF0C\u6309\u5173\u6CE8\u65F6\u95F4\u4ECE\u65B0\u5230\u65E7"] })), shown.map((item) => (_jsxs("article", { className: "flex items-center gap-3 rounded-2xl border border-border/70 bg-card/40 px-4 py-3", children: [_jsx("button", { type: "button", className: "shrink-0", onClick: () => navigate(`/up/${item.mid}`), children: _jsx(Avatar, { name: item.name, face: item.face }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", className: "truncate text-sm font-medium hover:text-primary", onClick: () => navigate(`/up/${item.mid}`), children: item.name || `用户 ${item.mid}` }), item.mutual && _jsx(Badge, { variant: "secondary", children: "\u5DF2\u4E92\u7C89" })] }), _jsx("p", { className: "mt-0.5 truncate text-xs text-muted-foreground", children: item.officialTitle || item.sign || "这个人很懒，什么都没写" })] }), _jsxs("span", { className: "shrink-0 text-[11px] text-muted-foreground", children: [formatMessageTime(item.time), " \u5173\u6CE8\u4E86\u4F60"] }), _jsx(FollowActionButton, { mid: item.mid, uname: item.name, face: item.face, isFollowing: item.mutual, onFollowingChange: (following) => setMutual(item.mid, following), onError: setError })] }, item.mid))), loading && items.length === 0 && (_jsxs("p", { className: "flex items-center justify-center py-8 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u7C89\u4E1D\u2026"] })), !loading && items.length === 0 && !error && (_jsx(EmptyState, { title: "\u8FD8\u6CA1\u6709\u7C89\u4E1D", detail: "\u6709\u4EBA\u5173\u6CE8\u4F60\u540E\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002" })), !loading && items.length > 0 && shown.length === 0 && !error && (_jsx(EmptyState, { title: "\u6CA1\u6709\u5339\u914D\u7684\u7C89\u4E1D", detail: "\u6362\u4E2A\u5173\u952E\u8BCD\uFF0C\u6216\u5148\u52A0\u8F7D\u66F4\u591A\u518D\u641C\u3002" })), hasMore && items.length > 0 && (_jsx(Button, { variant: "ghost", disabled: loading, onClick: () => void load(page + 1), children: loading ? "加载中" : "加载更多" }))] })] }));
}
function NoticeList({ keyword, onChanged, }) {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [cursor, setCursor] = useState("");
    const [isEnd, setIsEnd] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async (append, nextCursor) => {
        setLoading(true);
        setError("");
        try {
            const page = await window.biliDesk.bili.getSystemNotices(nextCursor);
            setItems((current) => append ? [...current, ...page.items] : page.items);
            setCursor(page.cursor);
            setIsEnd(page.isEnd);
            if (!append)
                onChanged();
        }
        catch (err) {
            setError(tidyError(err));
        }
        finally {
            setLoading(false);
        }
    }, [onChanged]);
    useEffect(() => {
        void load(false, "");
    }, [load]);
    usePageRefresh(REFRESH_EVENT, () => load(false, ""));
    const term = keyword.trim();
    const shown = items.filter((item) => includesTerm(`${item.title} ${item.content} ${item.sourceName}`, term));
    return (_jsxs("div", { className: "scrollbar-overlay h-full overflow-y-auto px-5 py-4", children: [error && _jsx("p", { className: "mb-3 text-sm text-destructive", children: error }), _jsxs("div", { className: "mx-auto flex max-w-3xl flex-col gap-3", children: [term && !isEnd && (_jsx("p", { className: "text-center text-[11px] text-muted-foreground", children: "\u5F53\u524D\u53EA\u641C\u7D22\u5DF2\u52A0\u8F7D\u7684\u901A\u77E5\uFF0C\u9700\u8981\u7684\u8BDD\u5148\u52A0\u8F7D\u66F4\u591A" })), shown.map((item) => (_jsxs("article", { className: "rounded-2xl border border-border/70 bg-card/40 p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h4", { className: "text-sm font-semibold", children: item.title }), _jsx("p", { className: "mt-1 text-[11px] text-muted-foreground", children: [
                                                    item.sourceName,
                                                    item.timeText || formatMessageTime(item.time),
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ") })] }), _jsx(ShieldAlert, { className: "h-4 w-4 shrink-0 text-primary" })] }), item.content && (_jsx("p", { className: "mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90", children: item.content })), item.uri && (_jsx(Button, { className: "mt-3", variant: "outline", size: "sm", onClick: () => void openTarget(item.uri, navigate), children: "\u6253\u5F00" }))] }, item.id || item.cursor || item.title))), !loading && items.length === 0 && !error && (_jsx(EmptyState, { title: "\u6CA1\u6709\u7CFB\u7EDF\u901A\u77E5", detail: "\u5BA1\u6838\u3001\u6D3B\u52A8\u548C\u5176\u4ED6\u5B98\u65B9\u901A\u77E5\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002" })), !loading && items.length > 0 && shown.length === 0 && !error && (_jsx(EmptyState, { title: "\u6CA1\u6709\u5339\u914D\u7684\u901A\u77E5", detail: "\u6362\u4E2A\u5173\u952E\u8BCD\uFF0C\u6216\u5148\u52A0\u8F7D\u66F4\u591A\u518D\u641C\u3002" })), !isEnd && items.length > 0 && (_jsx(Button, { variant: "ghost", disabled: loading, onClick: () => void load(true, cursor), children: loading ? "加载中" : "加载更多" }))] })] }));
}
function SettingsPanel() {
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState("");
    const [word, setWord] = useState("");
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        setError("");
        try {
            setSettings(await window.biliDesk.bili.getMessageSettings());
        }
        catch (err) {
            setError(tidyError(err));
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);
    usePageRefresh(REFRESH_EVENT, load);
    const toggle = (key) => {
        if (!settings || saving)
            return;
        const next = !settings[key];
        setSaving(true);
        setSettings({ ...settings, [key]: next });
        void window.biliDesk.bili
            .setMessageSettings({ [key]: next })
            .then(setSettings)
            .catch((err) => {
            setError(tidyError(err));
            void load();
        })
            .finally(() => setSaving(false));
    };
    if (!settings && !error) {
        return (_jsx("p", { className: "px-6 py-10 text-sm text-muted-foreground", children: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026" }));
    }
    const rows = [
        {
            key: "msgNotify",
            title: "消息提醒",
            detail: "关闭后，新私信不再推送提醒。",
        },
        {
            key: "showUnfollowed",
            title: "接收未关注人消息",
            detail: "关闭后，未关注的人不能再给你发私信。",
        },
        {
            key: "foldUnfollowed",
            title: "折叠未关注人消息",
            detail: "未关注人的会话收进单独分组，不打乱主列表。",
        },
        {
            key: "foldGroup",
            title: "折叠应援团消息",
            detail: "应援团会话折叠显示，避免刷屏。",
        },
    ];
    return (_jsx("div", { className: "scrollbar-overlay h-full overflow-y-auto px-5 py-5", children: _jsxs("div", { className: "mx-auto flex max-w-2xl flex-col gap-4", children: [error && _jsx("p", { className: "text-sm text-destructive", children: error }), settings &&
                    rows.map((row) => (_jsxs("button", { type: "button", onClick: () => toggle(row.key), className: "flex items-center gap-4 rounded-2xl border border-border/70 bg-card/40 px-4 py-4 text-left", children: [_jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block text-sm font-medium", children: row.title }), _jsx("span", { className: "mt-1 block text-xs leading-5 text-muted-foreground", children: row.detail })] }), _jsx("span", { className: cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", settings[row.key] ? "bg-primary" : "bg-secondary"), children: _jsx("span", { className: cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform", settings[row.key] ? "translate-x-5" : "translate-x-0.5") }) })] }, row.key))), settings && (_jsxs("section", { className: "rounded-2xl border border-border/70 bg-card/40 p-4", children: [_jsx("h4", { className: "text-sm font-medium", children: "\u5C4F\u853D\u8BCD" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "\u547D\u4E2D\u8FD9\u4E9B\u8BCD\u7684\u79C1\u4FE1\u4F1A\u88AB\u62E6\u622A\u3002\u6BCF\u4E2A\u8BCD\u6700\u591A 20 \u4E2A\u5B57\u3002" }), _jsxs("form", { className: "mt-3 flex gap-2", onSubmit: (event) => {
                                event.preventDefault();
                                const next = word.trim();
                                if (!next)
                                    return;
                                setSaving(true);
                                void window.biliDesk.bili
                                    .addMessageBlockWord(next)
                                    .then((words) => {
                                    setWord("");
                                    setSettings((current) => current ? { ...current, blockWords: words } : current);
                                })
                                    .catch((err) => setError(tidyError(err)))
                                    .finally(() => setSaving(false));
                            }, children: [_jsx("input", { value: word, maxLength: 20, onChange: (event) => setWord(event.target.value), placeholder: "\u6DFB\u52A0\u5C4F\u853D\u8BCD", className: "h-9 flex-1 rounded-lg border border-border bg-background/70 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" }), _jsx(Button, { type: "submit", size: "sm", disabled: saving || !word.trim(), children: "\u6DFB\u52A0" })] }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [settings.blockWords.length === 0 && (_jsx("span", { className: "text-xs text-muted-foreground", children: "\u8FD8\u6CA1\u6709\u5C4F\u853D\u8BCD" })), settings.blockWords.map((item) => (_jsxs("button", { type: "button", className: "rounded-full bg-secondary px-2.5 py-1 text-xs hover:bg-destructive/15", onClick: () => {
                                        void window.biliDesk.bili
                                            .removeMessageBlockWord(item)
                                            .then((words) => setSettings((current) => current ? { ...current, blockWords: words } : current))
                                            .catch((err) => setError(tidyError(err)));
                                    }, children: [item, " \u00D7"] }, item)))] })] }))] }) }));
}
