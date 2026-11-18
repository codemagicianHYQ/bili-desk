import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { UpSpaceCollectionsPanel } from "@/features/up/UpSpaceCollectionsPanel";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { Zap } from "lucide-react";
function looksLikeCharge(item) {
    return /充电|专属|upower/i.test(`${item.title} ${item.description}`);
}
export function UpSpaceChargePanel({ mid, enabled, }) {
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void window.biliDesk.bili
            .getUserCollections(mid, 1)
            .then((result) => {
            if (cancelled)
                return;
            setItems([...result.seasons, ...result.series].filter(looksLikeCharge));
        })
            .catch((err) => {
            if (!cancelled)
                setError(formatUserSpaceError(err));
        })
            .finally(() => {
            if (!cancelled)
                setReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [mid]);
    const hasExclusive = useMemo(() => items.length > 0, [items.length]);
    if (!ready) {
        return _jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u5145\u7535\u5185\u5BB9..." });
    }
    if (error) {
        return _jsx("p", { className: "text-sm text-red-400", children: error });
    }
    if (!hasExclusive) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-2 rounded-xl border border-border bg-card/60 px-6 py-10 text-center", children: [_jsx(Zap, { className: "h-8 w-8 text-amber-400" }), _jsx("p", { className: "text-sm font-medium", children: enabled ? "该 UP 已开通充电" : "暂无公开充电专属" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u5145\u7535\u4E13\u5C5E\u5185\u5BB9\u53EF\u80FD\u9700\u8981\u5F00\u901A\u540E\u624D\u80FD\u67E5\u770B\uFF0C\u548C\u5B98\u7F51\u7A7A\u95F4\u4E00\u81F4\u3002" })] }));
    }
    return _jsx(UpSpaceCollectionsPanel, { mid: mid, onlyCharge: true });
}
