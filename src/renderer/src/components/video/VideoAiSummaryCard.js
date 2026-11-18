import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
export function VideoAiSummaryCard({ bvid, cid, upMid, onSeek, }) {
    const [data, setData] = useState(null);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setData(null);
        setExpanded(false);
        void window.biliDesk.bili
            .getVideoAiSummary(bvid, cid, upMid)
            .then((result) => {
            if (!cancelled)
                setData(result);
        })
            .catch(() => {
            if (!cancelled)
                setData(null);
        });
        return () => {
            cancelled = true;
        };
    }, [bvid, cid, upMid]);
    if (!data)
        return null;
    const hasOutline = data.outline.length > 0;
    return (_jsxs("div", { className: "space-y-2 rounded-xl border border-border bg-card/60 p-3", children: [_jsxs("button", { type: "button", className: "flex w-full items-center gap-1.5 text-left text-sm font-medium", onClick: () => setExpanded((prev) => !prev), "aria-expanded": expanded, children: [_jsx(Sparkles, { className: "h-4 w-4 text-sky-400" }), _jsx("span", { className: "flex-1", children: "AI \u89C6\u9891\u603B\u7ED3" }), hasOutline && (_jsx(ChevronDown, { className: cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180") }))] }), data.summary && (_jsx("p", { className: cn("text-sm leading-relaxed text-muted-foreground", !expanded && "line-clamp-3"), children: data.summary })), expanded && hasOutline && (_jsx("div", { className: "space-y-3 pt-1", children: data.outline.map((section) => (_jsxs("div", { className: "space-y-1", children: [_jsxs("button", { type: "button", className: "flex items-center gap-2 text-left text-sm font-medium hover:text-primary", onClick: () => onSeek(section.timestamp), children: [_jsx("span", { className: "rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-sky-400", children: formatDuration(section.timestamp) }), section.title] }), section.points.map((point) => (_jsxs("button", { type: "button", className: "flex w-full items-start gap-2 pl-2 text-left text-xs text-muted-foreground hover:text-foreground", onClick: () => onSeek(point.timestamp), children: [_jsx("span", { className: "shrink-0 font-mono text-sky-400/80", children: formatDuration(point.timestamp) }), _jsx("span", { children: point.content })] }, `${point.timestamp}-${point.content}`)))] }, `${section.timestamp}-${section.title}`))) }))] }));
}
