import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { BiliImage } from "@/components/ui/bili-image";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { ErrorState } from "@/components/ui/content-unavailable";
import { cn, formatDuration } from "@/lib/utils";
import { Loader2 } from "lucide-react";
export function SeasonPage() {
    const { kind = "bangumi", id = "" } = useParams();
    const [searchParams] = useSearchParams();
    const seasonKind = kind === "cheese" ? "cheese" : "bangumi";
    const numericId = Number(id);
    const by = searchParams.get("by") === "ep" ? "ep" : "season";
    const [detail, setDetail] = useState(null);
    const [episode, setEpisode] = useState(null);
    const [playInfo, setPlayInfo] = useState(null);
    const [qn, setQn] = useState(undefined);
    const [loading, setLoading] = useState(true);
    const [playError, setPlayError] = useState("");
    const [error, setError] = useState("");
    const [followBusy, setFollowBusy] = useState(false);
    useEffect(() => {
        if (!Number.isFinite(numericId) || numericId <= 0) {
            setError("剧集 ID 无效");
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError("");
        setPlayInfo(null);
        void window.biliDesk.bili
            .getSeason(seasonKind, numericId, by)
            .then((next) => {
            if (cancelled)
                return;
            setDetail(next);
            const preferred = by === "ep"
                ? next.episodes.find((item) => item.epId === numericId)
                : next.episodes[0];
            setEpisode(preferred ?? next.episodes[0] ?? null);
        })
            .catch((err) => {
            if (!cancelled)
                setError(extractIpcErrorMessage(err) || "剧集加载失败");
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [seasonKind, numericId, by]);
    useEffect(() => {
        if (!episode)
            return;
        let cancelled = false;
        setPlayError("");
        setPlayInfo(null);
        void window.biliDesk.bili
            .getSeasonPlayUrl(seasonKind, episode.epId, episode.cid, qn)
            .then((info) => {
            if (!cancelled)
                setPlayInfo(info);
        })
            .catch((err) => {
            if (!cancelled) {
                setPlayError(extractIpcErrorMessage(err) || "该集暂不能播放");
            }
        });
        return () => {
            cancelled = true;
        };
    }, [seasonKind, episode, qn]);
    const toggleFollow = () => {
        if (!detail || followBusy)
            return;
        const next = !detail.followed;
        setFollowBusy(true);
        setError("");
        void window.biliDesk.bili
            .setSeasonFollow(seasonKind, detail.seasonId, next)
            .then(() => setDetail({ ...detail, followed: next }))
            .catch((err) => setError(extractIpcErrorMessage(err) || "更新追番状态失败"))
            .finally(() => setFollowBusy(false));
    };
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(PageBackHeader, { fallback: "/", label: "\u8FD4\u56DE" }), _jsx("div", { className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: _jsxs("div", { className: "mx-auto max-w-5xl space-y-4 px-6 py-5", children: [loading && (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u5267\u96C6..."] })), error && (_jsx(ErrorState, { error: error, hint: "season", fallback: "\u5267\u96C6\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", className: "min-h-[40vh]" })), detail && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-semibold", children: detail.title }), detail.score > 0 && (_jsxs("p", { className: "mt-1 text-sm text-primary", children: ["\u8BC4\u5206 ", detail.score.toFixed(1)] })), detail.evaluate && (_jsx("p", { className: "mt-2 text-sm leading-relaxed text-muted-foreground", children: detail.evaluate }))] }), _jsx("button", { type: "button", disabled: followBusy || detail.seasonId <= 0, className: "shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary disabled:opacity-50", onClick: toggleFollow, children: detail.followed
                                                ? seasonKind === "cheese"
                                                    ? "已收藏"
                                                    : "已追"
                                                : seasonKind === "cheese"
                                                    ? "收藏课程"
                                                    : "追番" })] }), _jsx("div", { className: "aspect-video w-full overflow-hidden rounded-xl bg-black", children: playInfo && episode ? (_jsx(VideoPlayer, { className: "h-full w-full", playInfo: playInfo, aid: episode.aid, bvid: episode.bvid, cid: episode.cid, poster: episode.cover || detail.cover, onQualityChange: setQn })) : (_jsx("div", { className: "flex h-full items-center justify-center px-6 text-center text-sm text-white/70", children: playError || "正在加载播放地址..." })) }), _jsx("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4", children: detail.episodes.map((item) => (_jsxs("button", { type: "button", className: cn("overflow-hidden rounded-lg border border-border text-left", episode?.epId === item.epId && "border-primary"), onClick: () => setEpisode(item), children: [item.cover ? (_jsx(BiliImage, { src: item.cover, alt: "", className: "aspect-video w-full object-cover" })) : null, _jsxs("span", { className: "block px-2 py-1.5 text-xs", children: [_jsx("span", { className: "line-clamp-2", children: item.title }), item.badge && (_jsx("span", { className: "mt-0.5 block text-primary", children: item.badge })), item.duration > 0 && (_jsx("span", { className: "mt-0.5 block text-muted-foreground", children: formatDuration(item.duration) }))] })] }, item.epId))) })] }))] }) })] }));
}
