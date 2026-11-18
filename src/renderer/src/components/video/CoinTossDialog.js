import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
/** 投币弹窗：双卡片选币 + 选中动效（参考官方交互，原创小电视形象） */
export function CoinTossDialog({ open, remainingCoins, liked, selectLike, loading = false, error = "", onSelectLikeChange, onConfirm, onClose, }) {
    const [multiply, setMultiply] = useState(1);
    const [tossing, setTossing] = useState(false);
    const wasLoadingRef = useRef(false);
    useEffect(() => {
        if (!open) {
            setTossing(false);
            wasLoadingRef.current = false;
            return;
        }
        setMultiply(remainingCoins >= 2 ? 2 : 1);
    }, [open, remainingCoins]);
    useEffect(() => {
        if (loading) {
            wasLoadingRef.current = true;
            return;
        }
        if (wasLoadingRef.current) {
            wasLoadingRef.current = false;
            setTossing(false);
        }
    }, [loading]);
    useEffect(() => {
        if (!open)
            return;
        const handleKeyDown = (event) => {
            if (event.key === "Escape" && !loading && !tossing)
                onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, loading, tossing, onClose]);
    if (!open)
        return null;
    const canOne = remainingCoins >= 1;
    const canTwo = remainingCoins >= 2;
    const titleCount = multiply;
    const handleConfirm = () => {
        if (loading || tossing)
            return;
        if (multiply === 1 && !canOne)
            return;
        if (multiply === 2 && !canTwo)
            return;
        setTossing(true);
        window.setTimeout(() => {
            onConfirm(multiply);
        }, 520);
    };
    return (_jsx("div", { className: `fixed inset-0 flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center ${APP_OVERLAY_ZCLASS}`, onClick: () => {
            if (!loading && !tossing)
                onClose();
        }, children: _jsxs("div", { className: "relative z-[10000] w-full max-w-[380px] overflow-hidden rounded-2xl border border-border bg-[#1b1b1f] text-white shadow-2xl", onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", disabled: loading || tossing, onClick: onClose, className: "absolute right-3 top-3 z-10 rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50", "aria-label": "\u5173\u95ED", children: _jsx(X, { className: "h-4 w-4" }) }), _jsxs("div", { className: "px-5 pb-5 pt-6", children: [_jsxs("h2", { className: "text-center text-[15px] font-medium tracking-wide", children: ["\u7ED9 UP \u4E3B\u6295\u4E0A ", _jsx("span", { className: "text-primary", children: titleCount }), " ", "\u679A\u786C\u5E01"] }), _jsxs("div", { className: "mt-5 grid grid-cols-2 gap-3", children: [_jsx(CoinOptionCard, { amount: 1, selected: multiply === 1, disabled: !canOne || loading || tossing, tossing: tossing && multiply === 1, onSelect: () => setMultiply(1) }), _jsx(CoinOptionCard, { amount: 2, selected: multiply === 2, disabled: !canTwo || loading || tossing, tossing: tossing && multiply === 2, onSelect: () => setMultiply(2) })] }), _jsxs("label", { className: "mt-4 flex cursor-pointer items-center gap-2 text-sm text-white/80", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 accent-primary", checked: selectLike, disabled: liked || loading || tossing, onChange: (event) => onSelectLikeChange(event.target.checked) }), _jsx("span", { className: cn(liked && "text-white/40"), children: liked ? "已点赞内容" : "同时点赞内容" })] }), error && _jsx("p", { className: "mt-2 text-xs text-red-400", children: error }), _jsx(Button, { type: "button", className: "mt-4 h-10 w-full text-sm font-semibold", disabled: loading || tossing || remainingCoins < 1, onClick: handleConfirm, children: loading || tossing ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), tossing ? "投币中..." : "提交中..."] })) : ("确定") }), _jsx("p", { className: "mt-2.5 text-center text-[11px] text-white/40", children: remainingCoins > 0
                                ? `本视频还可投 ${remainingCoins} 枚`
                                : "本视频已投满 2 枚硬币" })] })] }) }));
}
function CoinOptionCard({ amount, selected, disabled, tossing, onSelect, }) {
    return (_jsxs("button", { type: "button", disabled: disabled, onClick: onSelect, className: cn("relative flex aspect-[3/4] flex-col overflow-hidden rounded-xl px-2.5 pb-2.5 pt-2 text-left transition-all", "bg-[#2a2a30] disabled:cursor-not-allowed disabled:opacity-45", selected
            ? "border-2 border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
            : "border border-dashed border-white/25 hover:border-white/40", selected && "animate-[bili-coin-card-pulse_1.6s_ease-in-out_infinite]"), children: [_jsxs("span", { className: cn("text-xs font-medium", selected ? "text-primary" : "text-white/70"), children: [amount, "\u786C\u5E01"] }), _jsxs("div", { className: "relative mt-1 flex flex-1 items-end justify-center", children: [selected && (_jsxs(_Fragment, { children: [_jsx("span", { className: "absolute left-3 top-2 animate-[bili-star-twinkle_1s_ease-in-out_infinite] text-[10px] text-amber-300", children: "\u2726" }), _jsx("span", { className: "absolute right-4 top-4 animate-[bili-star-twinkle_1.15s_ease-in-out_0.2s_infinite] text-xs text-yellow-200", children: "\u2605" }), _jsx("span", { className: "absolute right-6 top-1 animate-[bili-star-twinkle_0.9s_ease-in-out_0.35s_infinite] text-[9px] text-amber-200", children: "\u2726" })] })), _jsx("div", { className: cn("relative", tossing &&
                            "animate-[bili-coin-toss_0.52s_cubic-bezier(0.22,1.2,0.36,1)_both]"), children: _jsx(CoinMascot, { amount: amount, active: selected }) })] })] }));
}
function CoinMascot({ amount, active }) {
    return (_jsxs("svg", { viewBox: "0 0 140 160", className: "h-[132px] w-[118px]", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [_jsx("path", { d: "M48 34 L58 48", stroke: active ? "hsl(var(--primary))" : "#9aa0a8", strokeWidth: "4", strokeLinecap: "round" }), _jsx("path", { d: "M92 34 L82 48", stroke: active ? "hsl(var(--primary))" : "#9aa0a8", strokeWidth: "4", strokeLinecap: "round" }), _jsx("circle", { cx: "46", cy: "30", r: "4.5", fill: active ? "hsl(var(--primary))" : "#9aa0a8" }), _jsx("circle", { cx: "94", cy: "30", r: "4.5", fill: active ? "hsl(var(--primary))" : "#9aa0a8" }), _jsx("rect", { x: "30", y: "48", width: "80", height: "72", rx: "18", fill: active ? "url(#coinTvGrad)" : "#4a4d55" }), _jsx("rect", { x: "42", y: "60", width: "56", height: "32", rx: "8", fill: "#fff8fb" }), _jsx("circle", { cx: "58", cy: "74", r: "3", fill: "#5b4a55" }), _jsx("circle", { cx: "82", cy: "74", r: "3", fill: "#5b4a55" }), _jsx("path", { d: "M58 84 Q70 92 82 84", stroke: "#5b4a55", strokeWidth: "2.2", strokeLinecap: "round" }), amount === 1 ? (_jsxs("g", { className: active
                    ? "origin-center animate-[bili-coin-float_1.8s_ease-in-out_infinite]"
                    : undefined, children: [_jsx("path", { d: "M92 96 C108 78 118 62 112 48", stroke: active ? "#ffb4c8" : "#8b9098", strokeWidth: "7", strokeLinecap: "round" }), _jsx(CoinBadge, { x: 100, y: 28 })] })) : (_jsxs("g", { className: active
                    ? "origin-center animate-[bili-coin-float_1.8s_ease-in-out_infinite]"
                    : undefined, children: [_jsx("path", { d: "M42 98 C28 80 24 60 34 46", stroke: active ? "#ffb4c8" : "#8b9098", strokeWidth: "7", strokeLinecap: "round" }), _jsx("path", { d: "M98 98 C112 80 116 60 106 46", stroke: active ? "#ffb4c8" : "#8b9098", strokeWidth: "7", strokeLinecap: "round" }), _jsx(CoinBadge, { x: 22, y: 26 }), _jsx(CoinBadge, { x: 94, y: 26 })] })), _jsx("defs", { children: _jsxs("linearGradient", { id: "coinTvGrad", x1: "30", y1: "48", x2: "110", y2: "120", children: [_jsx("stop", { stopColor: "hsl(var(--primary))", stopOpacity: "0.95" }), _jsx("stop", { offset: "1", stopColor: "hsl(var(--primary))", stopOpacity: "0.7" })] }) })] }));
}
function CoinBadge({ x, y }) {
    return (_jsxs("g", { transform: `translate(${x} ${y})`, children: [_jsx("circle", { cx: "18", cy: "18", r: "16", fill: "#FFE8A3" }), _jsx("circle", { cx: "18", cy: "18", r: "12.5", fill: "#FFC94A", stroke: "#E8A317", strokeWidth: "2" }), _jsx("text", { x: "18", y: "22.5", textAnchor: "middle", fontSize: "11", fontWeight: "700", fill: "#8A5A00", children: "\u5E01" })] }));
}
