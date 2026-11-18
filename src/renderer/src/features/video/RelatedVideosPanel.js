import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { VideoCard } from "@/components/video/VideoCard";
import { cn } from "@/lib/utils";
export function RelatedVideosPanel({ bvid, className, hideTitle = false, }) {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        setVideos([]);
        void window.biliDesk.bili
            .getRelatedVideos(bvid)
            .then((list) => {
            if (cancelled)
                return;
            setVideos(list);
        })
            .catch((err) => {
            if (cancelled)
                return;
            setError(formatDisplayedError(err, undefined, "相关推荐加载失败"));
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [bvid]);
    if (!loading && !error && videos.length === 0)
        return null;
    return (_jsxs("section", { className: cn("space-y-3", className), children: [!hideTitle && _jsx("h2", { className: "text-sm font-semibold", children: "\u76F8\u5173\u63A8\u8350" }), loading && (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u52A0\u8F7D\u63A8\u8350\u4E2D..." })), error && _jsx("p", { className: "text-xs text-red-400", children: error }), videos.length > 0 && (_jsx("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", children: videos.slice(0, 12).map((video) => (_jsx(VideoCard, { video: video }, video.bvid))) }))] }));
}
