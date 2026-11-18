import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ListVideo, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoverChargeBadge } from "@/components/video/charge-badge";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn, formatCount, formatDuration } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
function PlaylistSeasonRow({ episode, index, active, activeRef, onOpen, }) {
    const chargeBadge = useCoverChargeBadge(episode.bvid);
    return (_jsxs("button", { ref: active ? activeRef : undefined, type: "button", className: cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors", active
            ? "bg-primary/15 text-primary"
            : "text-foreground hover:bg-secondary/80"), onClick: () => {
            if (active)
                return;
            onOpen();
        }, children: [_jsx("span", { className: "flex w-5 shrink-0 justify-center", children: active ? (_jsx(Volume2, { className: "h-3.5 w-3.5 animate-pulse" })) : (_jsx("span", { className: "text-xs text-muted-foreground", children: index + 1 })) }), _jsxs("span", { className: "min-w-0 flex-1 truncate", children: ["(", index + 1, ")", episode.title] }), chargeBadge ? (_jsx("span", { className: "shrink-0 rounded bg-[#00aeec] px-1 py-px text-[10px] font-medium leading-none text-white", children: chargeBadge })) : null, episode.duration > 0 && (_jsx("span", { className: "shrink-0 text-xs text-muted-foreground tabular-nums", children: formatDuration(episode.duration) }))] }));
}
export function VideoPlaylistPanel({ bvid, selectedCid, pages, ugcSeason, onSelectPart, className, }) {
    const navigate = useNavigate();
    const selfMid = useAppStore((state) => state.user?.mid);
    const activeRef = useRef(null);
    const [subscribed, setSubscribed] = useState(false);
    const [subBusy, setSubBusy] = useState(false);
    const [subError, setSubError] = useState("");
    const [showIntro, setShowIntro] = useState(false);
    const [seasonOpen, setSeasonOpen] = useState(false);
    const [pagesOpen, setPagesOpen] = useState(false);
    const statusSeqRef = useRef(0);
    const hasSeason = Boolean(ugcSeason && ugcSeason.episodes.length > 0);
    const hasPages = pages.length > 1;
    const seasonIndex = ugcSeason?.episodes.findIndex((ep) => ep.bvid === bvid) ?? -1;
    const pageIndex = pages.findIndex((part) => part.cid === selectedCid);
    const isOwnSeason = Boolean(selfMid) &&
        Boolean(ugcSeason?.mid) &&
        Number(selfMid) === Number(ugcSeason?.mid);
    const canSubscribe = hasSeason && !isOwnSeason && Boolean(selfMid);
    useEffect(() => {
        if (!hasSeason && !hasPages)
            return;
        const el = activeRef.current;
        if (!el)
            return;
        // 只在合集/选集列表内部滚动，禁止带动页面把播放器顶走
        const list = el.closest("[data-playlist-scroll]");
        if (!list)
            return;
        const elRect = el.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        if (elRect.top < listRect.top) {
            list.scrollTop -= listRect.top - elRect.top;
        }
        else if (elRect.bottom > listRect.bottom) {
            list.scrollTop += elRect.bottom - listRect.bottom;
        }
    }, [bvid, selectedCid, hasSeason, hasPages, seasonOpen, pagesOpen]);
    useEffect(() => {
        setShowIntro(false);
        setSeasonOpen(false);
        setPagesOpen(false);
        setSubError("");
    }, [ugcSeason?.id]);
    useEffect(() => {
        if (!ugcSeason?.id || isOwnSeason || !selfMid) {
            setSubscribed(false);
            return;
        }
        const seq = ++statusSeqRef.current;
        // 后台查状态，不阻塞按钮可点
        void window.biliDesk.bili
            .getUgcSeasonSubscribed(ugcSeason.id)
            .then((value) => {
            if (seq !== statusSeqRef.current)
                return;
            setSubscribed(value);
        })
            .catch(() => {
            if (seq !== statusSeqRef.current)
                return;
            setSubscribed(false);
        });
    }, [ugcSeason?.id, isOwnSeason, selfMid]);
    if (!hasSeason && !hasPages)
        return null;
    const handleToggleSubscribe = async () => {
        if (!ugcSeason?.id || subBusy || isOwnSeason)
            return;
        if (!selfMid) {
            setSubError("请先登录后再订阅合集");
            return;
        }
        setSubBusy(true);
        setSubError("");
        const next = !subscribed;
        // 先乐观更新，失败再回滚
        setSubscribed(next);
        try {
            await window.biliDesk.bili.setUgcSeasonSubscribe(ugcSeason.id, next);
        }
        catch (err) {
            const message = extractIpcErrorMessage(err) || "操作失败";
            // 已订阅时再点订阅：同步成已订阅态
            if (next &&
                (message.includes("已订阅") ||
                    message.includes("已经收藏") ||
                    message.includes("重复"))) {
                setSubscribed(true);
            }
            else {
                setSubscribed(!next);
                setSubError(message);
            }
        }
        finally {
            setSubBusy(false);
        }
    };
    return (_jsxs("section", { className: cn("overflow-hidden rounded-xl border border-border bg-secondary/20", className), children: [hasSeason && ugcSeason && (_jsxs("div", { className: "border-b border-border last:border-b-0", children: [_jsxs("header", { className: cn("space-y-2 px-3 py-2.5", seasonOpen && "border-b border-border/60"), children: [_jsxs("button", { type: "button", className: "flex w-full items-center gap-2 text-left text-sm", "aria-expanded": seasonOpen, onClick: () => setSeasonOpen((open) => !open), children: [_jsx(ListVideo, { className: "h-4 w-4 shrink-0 text-muted-foreground" }), _jsxs("span", { className: "min-w-0 flex-1 truncate font-medium", children: [ugcSeason.title, _jsxs("span", { className: "ml-1 text-xs font-normal text-muted-foreground", children: ["(", seasonIndex >= 0 ? seasonIndex + 1 : "-", "/", ugcSeason.epCount || ugcSeason.episodes.length, ")"] })] }), _jsx(ChevronDown, { className: cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", seasonOpen && "rotate-180") })] }), _jsxs("div", { className: "flex items-center gap-2 pl-6", children: [_jsxs("div", { className: "min-w-0 flex-1 text-xs text-muted-foreground", children: [typeof ugcSeason.view === "number" && ugcSeason.view > 0 && (_jsxs("span", { children: [formatCount(ugcSeason.view), " \u64AD\u653E"] })), ugcSeason.intro && (_jsx("button", { type: "button", className: "ml-2 text-primary hover:underline", onClick: () => setShowIntro((v) => !v), children: "\u7B80\u4ECB" }))] }), canSubscribe && (_jsx(Button, { type: "button", size: "sm", variant: "outline", className: cn("h-8 shrink-0 px-3 text-sm", subscribed
                                            ? "border-border text-muted-foreground"
                                            : "border-primary/50 text-primary hover:bg-primary/10"), disabled: subBusy, onClick: () => void handleToggleSubscribe(), children: subBusy ? "处理中..." : subscribed ? "已订阅" : "订阅合集" }))] }), showIntro && ugcSeason.intro && (_jsx("p", { className: "pl-6 text-xs leading-relaxed text-muted-foreground", children: ugcSeason.intro })), subError && (_jsx("p", { className: "pl-6 text-xs text-red-400", children: subError }))] }), seasonOpen && (_jsx("div", { "data-playlist-scroll": true, className: "max-h-64 overflow-y-auto overscroll-contain px-1 pb-1 pt-1", children: ugcSeason.episodes.map((ep, index) => (_jsx(PlaylistSeasonRow, { episode: ep, index: index, active: ep.bvid === bvid, activeRef: activeRef, onOpen: () => navigate(`/video/${ep.bvid}`) }, ep.bvid))) }))] })), hasPages && (_jsxs("div", { children: [_jsx("header", { className: "px-3 py-2.5", children: _jsxs("button", { type: "button", className: "flex w-full items-center gap-2 text-left text-sm", "aria-expanded": pagesOpen, onClick: () => setPagesOpen((open) => !open), children: [_jsx(ListVideo, { className: "h-4 w-4 shrink-0 text-muted-foreground" }), _jsx("span", { className: "min-w-0 flex-1 truncate font-medium", children: "\u89C6\u9891\u9009\u96C6" }), _jsxs("span", { className: "shrink-0 text-xs text-muted-foreground", children: ["(", pageIndex >= 0 ? pageIndex + 1 : "-", "/", pages.length, ")"] }), _jsx(ChevronDown, { className: cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", pagesOpen && "rotate-180") })] }) }), pagesOpen && (_jsx("div", { "data-playlist-scroll": true, className: "max-h-64 overflow-y-auto overscroll-contain px-1 pb-1", children: pages.map((part) => {
                            const active = part.cid === selectedCid;
                            return (_jsxs("button", { ref: active && !hasSeason ? activeRef : undefined, type: "button", className: cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors", active
                                    ? "bg-primary/15 text-primary"
                                    : "text-foreground hover:bg-secondary/80"), onClick: () => onSelectPart(part.cid), children: [_jsx("span", { className: "flex w-5 shrink-0 justify-center", children: active ? (_jsx(Volume2, { className: "h-3.5 w-3.5 animate-pulse" })) : (_jsx("span", { className: "text-xs text-muted-foreground", children: part.page })) }), _jsxs("span", { className: "min-w-0 flex-1 truncate", children: ["(", part.page, ")", part.part] }), part.duration > 0 && (_jsx("span", { className: "shrink-0 text-xs text-muted-foreground tabular-nums", children: formatDuration(part.duration) }))] }, part.cid));
                        }) }))] }))] }));
}
