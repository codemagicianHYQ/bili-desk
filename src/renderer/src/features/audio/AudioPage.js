import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { BiliImage } from "@/components/ui/bili-image";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { ErrorState } from "@/components/ui/content-unavailable";
import { Loader2 } from "lucide-react";
export function AudioPage() {
    const { id = "" } = useParams();
    const sid = Number(id);
    const [song, setSong] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!Number.isFinite(sid) || sid <= 0) {
            setError("音频 ID 无效");
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError("");
        void window.biliDesk.bili
            .getAudioSong(sid)
            .then((next) => {
            if (!cancelled)
                setSong(next);
        })
            .catch((err) => {
            if (!cancelled)
                setError(extractIpcErrorMessage(err) || "音频加载失败");
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [sid]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(PageBackHeader, { fallback: "/", label: "\u8FD4\u56DE" }), _jsx("div", { className: "scrollbar-overlay min-h-0 flex-1 overflow-y-auto", children: _jsxs("div", { className: "mx-auto max-w-xl space-y-4 px-6 py-8", children: [loading && (_jsxs("p", { className: "flex items-center text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u52A0\u8F7D\u97F3\u9891..."] })), error && (_jsx(ErrorState, { error: error, hint: "audio", fallback: "\u97F3\u9891\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", className: "min-h-[40vh]" })), song && (_jsxs(_Fragment, { children: [song.cover ? (_jsx(BiliImage, { src: song.cover, alt: "", className: "mx-auto h-48 w-48 rounded-xl object-cover" })) : null, _jsx("h1", { className: "text-center text-xl font-semibold", children: song.title }), song.author && (_jsx("p", { className: "text-center text-sm text-muted-foreground", children: song.author })), song.intro && (_jsx("p", { className: "text-sm leading-relaxed text-muted-foreground", children: song.intro })), song.url ? (_jsx("audio", { className: "w-full", controls: true, src: song.url })) : (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u8FD9\u9996\u97F3\u9891\u6CA1\u6709\u53EF\u64AD\u653E\u7684\u5730\u5740\uFF0C\u53EF\u80FD\u9700\u8981\u4F1A\u5458\u6216\u5DF2\u4E0B\u67B6\u3002" }))] }))] }) })] }));
}
