import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { formatWatchLaterError } from "@/lib/watch-later-error";
import { useAppStore } from "@/stores/app-store";
import { useWatchLaterStore } from "@/stores/watch-later-store";
import { Clock, ListVideo, Loader2 } from "lucide-react";
export function WatchLaterButton({ aid, bvid, video, variant = "overlay", className, }) {
    const navigate = useNavigate();
    const user = useAppStore((state) => state.user);
    const ensureLoaded = useWatchLaterStore((state) => state.ensureLoaded);
    const toggle = useWatchLaterStore((state) => state.toggle);
    const inOfficial = useWatchLaterStore((state) => state.bvids.has(bvid));
    const inLocal = useWatchLaterStore((state) => state.localBvids.has(bvid));
    const inList = inOfficial || inLocal;
    const [pending, setPending] = useState(false);
    const [tip, setTip] = useState("");
    const [tipIsError, setTipIsError] = useState(false);
    useEffect(() => {
        if (user?.isLogin)
            void ensureLoaded();
    }, [user?.isLogin, ensureLoaded]);
    const showTip = (message, isError = false) => {
        setTipIsError(isError);
        setTip(message);
        window.setTimeout(() => {
            setTip("");
            setTipIsError(false);
        }, isError ? 2800 : 1800);
    };
    const stopCardNavigation = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };
    const handleClick = async (event) => {
        stopCardNavigation(event);
        if (!user?.isLogin) {
            navigate("/login");
            return;
        }
        setPending(true);
        setTip("");
        setTipIsError(false);
        try {
            const result = await toggle(aid, bvid, video);
            if (result === "removed") {
                showTip("已从稍后再看移除");
            }
            else if (result === "local") {
                showTip("官方稍后再看已满，已加入本地");
            }
            else {
                showTip("已添加到稍后再看");
            }
        }
        catch (err) {
            showTip(formatWatchLaterError(err), true);
        }
        finally {
            setPending(false);
        }
    };
    // 主页卡片有 overflow/transform，本地 tip 会被裁切；错误与成功都走全局 toast
    const toast = tip &&
        typeof document !== "undefined" &&
        createPortal(_jsx("div", { className: cn("pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl px-5 py-3 text-sm font-semibold shadow-2xl", APP_OVERLAY_ZCLASS, tipIsError
                ? "border border-primary/40 bg-black/90 text-primary"
                : "border border-border/40 bg-black/85 text-white"), children: tip }), document.body);
    if (variant === "inline") {
        return (_jsxs(_Fragment, { children: [_jsxs(Button, { type: "button", size: "sm", variant: "outline", className: cn("gap-1.5", inList ? "bili-action-btn-active" : "bili-action-btn", className), disabled: pending, onClick: (event) => void handleClick(event), children: [pending ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : inList ? (_jsx(Clock, { className: "h-4 w-4 fill-current" })) : (_jsx(ListVideo, { className: "h-4 w-4" })), inList ? "已添加" : "稍后再看"] }), toast] }));
    }
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: cn("absolute right-2 top-2 z-20", className), children: _jsx("button", { type: "button", title: inList ? "已在稍后再看，点击移除" : "添加到稍后再看", disabled: pending, onMouseDown: stopCardNavigation, onClick: (event) => void handleClick(event), className: cn("flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all", "opacity-0 group-hover:opacity-100 focus-visible:opacity-100", inList && "opacity-100 text-primary", pending && "opacity-100"), children: pending ? (_jsx(Loader2, { className: "h-4 w-4 animate-spin" })) : inList ? (_jsx(Clock, { className: "h-4 w-4 fill-current" })) : (_jsx(ListVideo, { className: "h-4 w-4" })) }) }), toast] }));
}
