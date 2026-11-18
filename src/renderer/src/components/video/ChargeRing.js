import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
/** 官网三连：投币 / 收藏图标外圈充电环 */
export function ChargeRing({ progress, className }) {
    if (progress <= 0)
        return null;
    const r = 13;
    const c = 2 * Math.PI * r;
    const p = Math.min(1, Math.max(0, progress));
    return (_jsxs("svg", { viewBox: "0 0 32 32", className: cn("pointer-events-none absolute inset-[-6px] h-[calc(100%+12px)] w-[calc(100%+12px)] -rotate-90", className), "aria-hidden": true, children: [_jsx("circle", { cx: "16", cy: "16", r: r, fill: "none", stroke: "#00AEEC", strokeWidth: "2", opacity: "0.22" }), _jsx("circle", { cx: "16", cy: "16", r: r, fill: "none", stroke: "#00AEEC", strokeWidth: "2.4", strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: c * (1 - p) })] }));
}
