import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { DynamicFeedCard } from "@/components/dynamic/DynamicFeedCard";
import { Button } from "@/components/ui/button";
import { formatUserSpaceError } from "@/lib/ipc-error";
import { Loader2 } from "lucide-react";
export function UpSpaceDynamicsPanel({ mid, name, face, }) {
    const sentinelRef = useRef(null);
    const offsetRef = useRef("");
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (append) => {
        if (append)
            setLoadingMore(true);
        else {
            setLoading(true);
            setError("");
        }
        try {
            const result = await window.biliDesk.bili.getSpaceDynamics(mid, append ? offsetRef.current : "");
            offsetRef.current = result.offset;
            setHasMore(result.hasMore);
            setItems((prev) => append ? [...prev, ...result.items] : result.items);
        }
        catch (err) {
            setError(formatUserSpaceError(err));
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [mid]);
    useEffect(() => {
        offsetRef.current = "";
        setItems([]);
        void load(false);
    }, [load]);
    useEffect(() => {
        const target = sentinelRef.current;
        if (!target || !hasMore || loading)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && !loadingMore)
                void load(true);
        }, { rootMargin: "240px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore, load]);
    if (loading && items.length === 0) {
        return (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u52A8\u6001..."] }));
    }
    if (error && items.length === 0) {
        return (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-red-400", children: error }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => void load(false), children: "\u91CD\u65B0\u52A0\u8F7D" })] }));
    }
    if (items.length === 0) {
        return _jsx("p", { className: "text-sm text-muted-foreground", children: "\u8BE5 UP \u6682\u65E0\u516C\u5F00\u52A8\u6001" });
    }
    return (_jsxs("div", { className: "mx-auto max-w-2xl space-y-3", children: [items.map((item) => (_jsx(DynamicFeedCard, { item: item, fallbackName: name, fallbackFace: face, onRemoved: (id) => setItems((prev) => prev.filter((entry) => entry.id !== id)) }, item.id))), _jsx("div", { ref: sentinelRef, className: "py-3 text-center text-xs text-muted-foreground", children: loadingMore ? "加载更多..." : hasMore ? "继续下滑" : "已经到底啦" })] }));
}
