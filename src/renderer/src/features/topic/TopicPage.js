import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { useParams, useSearchParams } from "react-router-dom";
import { DynamicFeedCard } from "@/components/dynamic/DynamicFeedCard";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { ErrorState } from "@/components/ui/content-unavailable";
import { Loader2 } from "lucide-react";
export function TopicPage() {
    const { id = "" } = useParams();
    const [searchParams] = useSearchParams();
    const topicId = Number(id);
    const name = searchParams.get("name") || "话题";
    const offsetRef = useRef("");
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [head, setHead] = useState(null);
    const [favBusy, setFavBusy] = useState(false);
    const load = useCallback(async (append) => {
        if (!Number.isFinite(topicId) || topicId <= 0) {
            setError("话题 ID 无效");
            setLoading(false);
            return;
        }
        setLoading(true);
        if (!append)
            setError("");
        try {
            const page = await window.biliDesk.bili.getTopicDynamics(topicId, append ? offsetRef.current : "");
            offsetRef.current = page.offset;
            setHasMore(page.hasMore);
            setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        }
        catch (err) {
            setError(formatDisplayedError(err, undefined, "话题加载失败"));
        }
        finally {
            setLoading(false);
        }
    }, [topicId]);
    useEffect(() => {
        offsetRef.current = "";
        void load(false);
        if (!Number.isFinite(topicId) || topicId <= 0)
            return;
        void window.biliDesk.bili
            .getTopicHead(topicId)
            .then(setHead)
            .catch(() => setHead(null));
    }, [load, topicId]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(PageBackHeader, { fallback: "/", label: "\u8FD4\u56DE" }), _jsx("div", { className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: _jsxs("div", { className: "mx-auto max-w-3xl space-y-4 px-6 py-5", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-semibold", children: ["#", head?.name || name] }), head?.desc ? (_jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: head.desc })) : null] }), _jsx("button", { type: "button", disabled: favBusy, className: "shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-sm text-primary", onClick: () => {
                                        if (!head)
                                            return;
                                        const next = !head.favorited;
                                        setFavBusy(true);
                                        void window.biliDesk.bili
                                            .favoriteTopic(topicId, next)
                                            .then(() => setHead({ ...head, favorited: next }))
                                            .finally(() => setFavBusy(false));
                                    }, children: head?.favorited ? "已关注" : "关注话题" })] }), loading && items.length === 0 ? (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u8BDD\u9898..."] })) : error && items.length === 0 ? (_jsx(ErrorState, { error: error, hint: "dynamic", fallback: "\u8BDD\u9898\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", className: "min-h-[40vh]" })) : items.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u8FD9\u4E2A\u8BDD\u9898\u8FD8\u6CA1\u6709\u52A8\u6001" })) : (items.map((item) => (_jsx(DynamicFeedCard, { item: item, onRemoved: (id) => setItems((prev) => prev.filter((entry) => entry.id !== id)) }, item.id)))), hasMore && (_jsx("button", { type: "button", className: "w-full py-3 text-sm text-primary", onClick: () => void load(true), children: loading ? "加载中..." : "加载更多" }))] }) })] }));
}
