import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
export function VideoSideTools({ bvid, aid, cid, qn, onSeek, }) {
    const [heat, setHeat] = useState([]);
    const [notes, setNotes] = useState([]);
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [tip, setTip] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        setHeat([]);
        void window.biliDesk.bili
            .getVideoHeatmap(bvid, cid)
            .then((points) => {
            if (!cancelled)
                setHeat(points);
        })
            .catch(() => {
            if (!cancelled)
                setHeat([]);
        });
        return () => {
            cancelled = true;
        };
    }, [bvid, cid]);
    useEffect(() => {
        if (!aid)
            return;
        let cancelled = false;
        void window.biliDesk.bili
            .getArchiveNotes(aid)
            .then((list) => {
            if (!cancelled)
                setNotes(list);
        })
            .catch(() => {
            if (!cancelled)
                setNotes([]);
        });
        return () => {
            cancelled = true;
        };
    }, [aid]);
    const saveNote = async () => {
        if (busy || !text.trim())
            return;
        setBusy(true);
        setError("");
        setTip("");
        try {
            await window.biliDesk.bili.addArchiveNote(aid, title, text);
            setTitle("");
            setText("");
            setTip("笔记已保存");
            setNotes(await window.biliDesk.bili.getArchiveNotes(aid));
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || "保存笔记失败");
        }
        finally {
            setBusy(false);
        }
    };
    const download = async () => {
        setError("");
        setTip("");
        try {
            const saved = await window.biliDesk.bili.downloadVideo(bvid, cid, qn);
            if (saved)
                setTip("已开始保存到你选择的位置");
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || "下载失败");
        }
    };
    return (_jsxs("div", { className: "space-y-3", children: [heat.length > 1 && (_jsx("button", { type: "button", className: "flex h-8 w-full items-end gap-px overflow-hidden rounded-md bg-secondary px-1", title: "\u9AD8\u80FD\u8FDB\u5EA6\u6761\uFF0C\u70B9\u51FB\u8DF3\u8F6C", onClick: (event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                    const video = document.querySelector("video");
                    const duration = video?.duration ?? 0;
                    if (duration > 0)
                        onSeek(ratio * duration);
                }, children: heat.map((value, index) => (_jsx("span", { className: "min-w-0 flex-1 rounded-sm bg-primary", style: { height: `${Math.max(8, Math.round(value * 100))}%` } }, index))) })), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u4E0B\u8F7D\u4F1A\u4FDD\u5B58\u5F53\u524D\u80FD\u76F4\u63A5\u64AD\u653E\u7684\u6587\u4EF6\u30021080P \u5206\u6BB5\u753B\u8D28\u9700\u8981\u5148\u8C03\u4F4E\u6E05\u6670\u5EA6\u3002" }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => void download(), children: "\u4E0B\u8F7D" })] }), _jsxs("div", { className: "space-y-2 rounded-xl border border-border p-3", children: [_jsx("p", { className: "text-sm font-medium", children: "\u64AD\u653E\u7B14\u8BB0" }), _jsx("input", { value: title, onChange: (event) => setTitle(event.target.value), placeholder: "\u6807\u9898", className: "h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm outline-none" }), _jsx("textarea", { value: text, onChange: (event) => setText(event.target.value), placeholder: "\u5199\u7ED9\u81EA\u5DF1\u7684\u7B14\u8BB0", className: "min-h-16 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none" }), _jsx(Button, { type: "button", size: "sm", disabled: busy || !text.trim(), onClick: () => void saveNote(), children: "\u4FDD\u5B58\u7B14\u8BB0" }), notes.length > 0 && (_jsx("ul", { className: "space-y-1 text-xs text-muted-foreground", children: notes.map((note) => (_jsxs("li", { children: [_jsx("span", { className: "text-foreground", children: note.title }), note.summary ? ` · ${note.summary}` : ""] }, note.id))) }))] }), tip && _jsx("p", { className: "text-xs text-muted-foreground", children: tip }), error && _jsx("p", { className: "text-xs text-red-400", children: error })] }));
}
