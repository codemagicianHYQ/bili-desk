import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { VideoCard } from "@/components/video/VideoCard";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { ErrorState } from "@/components/ui/content-unavailable";
import { Loader2 } from "lucide-react";
export function ChannelPage() {
    const { id = "" } = useParams();
    const [searchParams] = useSearchParams();
    const channelId = Number(id);
    const fallbackName = searchParams.get("name") || "频道";
    const [name, setName] = useState(fallbackName);
    const [videos, setVideos] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async (nextPage, append) => {
        if (!Number.isFinite(channelId) || channelId <= 0) {
            setError("频道 ID 无效");
            setLoading(false);
            return;
        }
        setLoading(true);
        if (!append)
            setError("");
        try {
            const result = await window.biliDesk.bili.getChannelVideos(channelId, nextPage);
            setName(result.name && result.name !== "频道" ? result.name : fallbackName);
            setPage(result.page);
            setHasMore(result.hasMore);
            setVideos((prev) => append ? [...prev, ...result.videos] : result.videos);
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || "频道加载失败");
        }
        finally {
            setLoading(false);
        }
    }, [channelId, fallbackName]);
    useEffect(() => {
        void load(1, false);
    }, [load]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(PageBackHeader, { fallback: "/", label: "\u8FD4\u56DE" }), _jsx("div", { className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: _jsxs("div", { className: "mx-auto max-w-5xl space-y-4 px-6 py-5", children: [_jsx("h1", { className: "text-xl font-semibold", children: name }), error && videos.length === 0 && (_jsx(ErrorState, { error: error, fallback: "\u9891\u9053\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", className: "min-h-[40vh]" })), _jsx("div", { className: "grid grid-cols-2 gap-4 xl:grid-cols-3", children: videos.map((video) => (_jsx(VideoCard, { video: video, meta: "stats" }, video.bvid))) }), loading && (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u9891\u9053..."] })), hasMore && !loading && (_jsx("button", { type: "button", className: "text-sm text-primary", onClick: () => void load(page + 1, true), children: "\u52A0\u8F7D\u66F4\u591A" }))] }) })] }));
}
