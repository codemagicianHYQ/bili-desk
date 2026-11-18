import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { createLoginQr, currentUserId, getPlay, getPopular, getRecommend, isLoggedIn, logout, pollLogin, searchVideos, } from "./bili-client";
function formatCount(n) {
    if (n >= 100000000)
        return `${(n / 100000000).toFixed(1)}亿`;
    if (n >= 10000)
        return `${(n / 10000).toFixed(1)}万`;
    return String(n || 0);
}
function formatDuration(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const rest = value % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (hours > 0)
        return `${hours}:${pad(minutes)}:${pad(rest)}`;
    return `${minutes}:${pad(rest)}`;
}
function VideoGrid({ videos, onOpen, }) {
    return (_jsx("div", { className: "grid grid-cols-2 gap-3", children: videos.map((video) => (_jsxs("button", { type: "button", onClick: () => onOpen(video.bvid), className: "overflow-hidden rounded-xl bg-card text-left", children: [_jsxs("span", { className: "relative block aspect-video bg-secondary", children: [video.cover ? (_jsx("img", { src: video.cover, alt: "", referrerPolicy: "no-referrer", className: "h-full w-full object-cover" })) : null, video.duration > 0 && (_jsx("span", { className: "absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white", children: formatDuration(video.duration) }))] }), _jsxs("span", { className: "block px-2 py-2", children: [_jsx("span", { className: "line-clamp-2 text-sm leading-5", children: video.title }), _jsxs("span", { className: "mt-1 block truncate text-xs text-muted-foreground", children: [video.author || "未知", " \u00B7 ", formatCount(video.play), "\u64AD\u653E"] })] })] }, video.bvid))) }));
}
function Feed({ title, source, }) {
    const load = source === "home" ? getRecommend : getPopular;
    const navigate = useNavigate();
    const [videos, setVideos] = useState([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError("");
        void load(1)
            .then((list) => {
            if (!alive)
                return;
            setVideos(list);
            setPage(1);
        })
            .catch((err) => {
            if (!alive)
                return;
            setError(err instanceof Error ? err.message : "加载失败");
        })
            .finally(() => {
            if (alive)
                setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [source, load]);
    const more = async () => {
        const next = page + 1;
        setLoading(true);
        try {
            const list = await load(next);
            setVideos((prev) => [...prev, ...list]);
            setPage(next);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "加载失败");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("section", { className: "px-3 pb-4 pt-3", children: [_jsx("h1", { className: "mb-3 text-lg font-semibold", children: title }), error && _jsx("p", { className: "mb-3 text-sm text-red-400", children: error }), _jsx(VideoGrid, { videos: videos, onOpen: (bvid) => navigate(`/video/${bvid}`) }), _jsx("button", { type: "button", disabled: loading, onClick: () => void more(), className: "mt-4 w-full rounded-full bg-secondary py-2 text-sm text-secondary-foreground", children: loading ? "加载中..." : "加载更多" })] }));
}
function SearchPane() {
    const navigate = useNavigate();
    const [keyword, setKeyword] = useState("");
    const [videos, setVideos] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const run = async (nextPage) => {
        const term = keyword.trim();
        if (!term)
            return;
        setLoading(true);
        setError("");
        try {
            const result = await searchVideos(term, nextPage);
            setVideos((prev) => (nextPage === 1 ? result.videos : [...prev, ...result.videos]));
            setTotal(result.total);
            setPage(nextPage);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "搜索失败");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("section", { className: "px-3 pb-4 pt-3", children: [_jsxs("form", { className: "mb-3 flex gap-2", onSubmit: (event) => {
                    event.preventDefault();
                    void run(1);
                }, children: [_jsx("input", { value: keyword, onChange: (event) => setKeyword(event.target.value), placeholder: "\u641C\u7D22\u89C6\u9891", className: "h-10 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none" }), _jsx("button", { type: "submit", className: "h-10 rounded-full bg-primary px-4 text-sm text-primary-foreground", children: "\u641C\u7D22" })] }), total > 0 && (_jsxs("p", { className: "mb-2 text-xs text-muted-foreground", children: ["\u7EA6 ", total.toLocaleString(), " \u6761\u7ED3\u679C"] })), error && _jsx("p", { className: "mb-3 text-sm text-red-400", children: error }), _jsx(VideoGrid, { videos: videos, onOpen: (bvid) => navigate(`/video/${bvid}`) }), videos.length > 0 && (_jsx("button", { type: "button", disabled: loading, onClick: () => void run(page + 1), className: "mt-4 w-full rounded-full bg-secondary py-2 text-sm", children: loading ? "加载中..." : "下一页" }))] }));
}
function MePane() {
    const [qr, setQr] = useState("");
    const [status, setStatus] = useState("");
    const [logged, setLogged] = useState(isLoggedIn());
    const start = async () => {
        setStatus("正在获取二维码...");
        setQr("");
        try {
            const login = await createLoginQr();
            setQr(await QRCode.toDataURL(login.url, { margin: 1, width: 240 }));
            setStatus("请用 B 站 App 扫码");
            for (let i = 0; i < 40; i += 1) {
                await new Promise((resolve) => window.setTimeout(resolve, 2000));
                const state = await pollLogin(login.key);
                if (state === "scanned")
                    setStatus("已扫码，请在手机上确认");
                if (state === "ok") {
                    setLogged(true);
                    setQr("");
                    setStatus("登录成功");
                    return;
                }
                if (state === "expired") {
                    setStatus("二维码过期了，再试一次");
                    return;
                }
            }
            setStatus("等待超时，再试一次");
        }
        catch (err) {
            setStatus(err instanceof Error ? err.message : "登录失败");
        }
    };
    return (_jsxs("section", { className: "px-4 py-6", children: [_jsx("h1", { className: "text-lg font-semibold", children: "\u6211\u7684" }), logged ? (_jsxs("div", { className: "mt-4 rounded-2xl bg-card p-4", children: [_jsxs("p", { className: "text-sm", children: ["\u5DF2\u767B\u5F55 UID ", currentUserId()] }), _jsx("button", { type: "button", onClick: () => {
                            logout();
                            setLogged(false);
                            setStatus("已退出");
                        }, className: "mt-3 rounded-full bg-secondary px-4 py-2 text-sm", children: "\u9000\u51FA\u767B\u5F55" })] })) : (_jsxs("div", { className: "mt-4 rounded-2xl bg-card p-4", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u626B\u7801\u767B\u5F55\u540E\uFF0C\u63A8\u8350\u548C\u64AD\u653E\u4F1A\u5E26\u4E0A\u4F60\u7684\u8D26\u53F7\u3002" }), _jsx("button", { type: "button", onClick: () => void start(), className: "mt-3 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground", children: "\u626B\u7801\u767B\u5F55" }), qr && _jsx("img", { src: qr, alt: "\u767B\u5F55\u4E8C\u7EF4\u7801", className: "mx-auto mt-4 w-48 rounded-lg bg-white p-2" })] })), status && _jsx("p", { className: "mt-3 text-sm text-muted-foreground", children: status })] }));
}
export function PlayerPage() {
    const { bvid = "" } = useParams();
    const navigate = useNavigate();
    const [play, setPlay] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let alive = true;
        setPlay(null);
        setError("");
        void getPlay(bvid)
            .then((item) => {
            if (alive)
                setPlay(item);
        })
            .catch((err) => {
            if (alive)
                setError(err instanceof Error ? err.message : "播放失败");
        });
        return () => {
            alive = false;
        };
    }, [bvid]);
    return (_jsxs("section", { className: "min-h-full bg-black text-white", children: [_jsx("button", { type: "button", onClick: () => navigate(-1), className: "px-3 py-3 text-sm text-white/80", children: "\u8FD4\u56DE" }), error && _jsx("p", { className: "px-3 text-sm text-red-400", children: error }), play ? (_jsxs(_Fragment, { children: [_jsx("video", { src: play.url, poster: play.cover, controls: true, autoPlay: true, playsInline: true, className: "aspect-video w-full bg-black" }, play.url), _jsxs("div", { className: "px-3 py-3", children: [_jsx("h1", { className: "text-base font-medium", children: play.title }), _jsx("p", { className: "mt-1 text-sm text-white/60", children: play.author })] })] })) : (!error && _jsx("p", { className: "px-3 text-sm text-white/60", children: "\u6B63\u5728\u51C6\u5907\u64AD\u653E..." }))] }));
}
const TABS = [
    { id: "home", label: "首页" },
    { id: "hot", label: "热门" },
    { id: "search", label: "搜索" },
    { id: "me", label: "我的" },
];
export function MobileShell() {
    const [tab, setTab] = useState("home");
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("header", { className: "flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]", children: [_jsx("span", { className: "text-base font-semibold", children: "BiliLoft" }), _jsx("span", { className: "text-xs text-muted-foreground", children: "\u624B\u673A\u7248" })] }), _jsxs("main", { className: "min-h-0 flex-1 overflow-y-auto", children: [tab === "home" && _jsx(Feed, { title: "\u63A8\u8350", source: "home" }), tab === "hot" && _jsx(Feed, { title: "\u70ED\u95E8", source: "hot" }), tab === "search" && _jsx(SearchPane, {}), tab === "me" && _jsx(MePane, {})] }), _jsx("nav", { className: "grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]", children: TABS.map((item) => (_jsx("button", { type: "button", onClick: () => setTab(item.id), className: `py-3 text-sm ${tab === item.id ? "text-primary" : "text-muted-foreground"}`, children: item.label }, item.id))) })] }));
}
export function MobileApp() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/video/:bvid", element: _jsx(PlayerPage, {}) }), _jsx(Route, { path: "*", element: _jsx(MobileShell, {}) })] }));
}
