import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OverlayPortal, APP_OVERLAY_ZCLASS } from "@/components/ui/overlay-portal";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
export function RepostDialog({ open, dynId, preview, onClose, onDone, }) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    if (!open)
        return null;
    const submit = async () => {
        if (busy)
            return;
        setBusy(true);
        setError("");
        try {
            await window.biliDesk.bili.repostDynamic(dynId, text);
            setText("");
            onDone?.();
            onClose();
        }
        catch (err) {
            setError(extractIpcErrorMessage(err) || "转发失败");
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx(OverlayPortal, { children: _jsx("div", { className: cn("fixed inset-0 flex items-center justify-center bg-black/55 p-4", APP_OVERLAY_ZCLASS), onClick: () => {
                if (!busy)
                    onClose();
            }, children: _jsxs("div", { className: "w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border", onClick: (event) => event.stopPropagation(), children: [_jsx("h2", { className: "text-base font-semibold", children: "\u8F6C\u53D1\u52A8\u6001" }), preview && (_jsx("p", { className: "mt-2 line-clamp-3 rounded-lg bg-secondary/50 px-3 py-2 text-sm text-muted-foreground", children: preview })), _jsx("textarea", { value: text, onChange: (event) => setText(event.target.value.slice(0, 1000)), rows: 4, placeholder: "\u8BF4\u70B9\u4EC0\u4E48\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u8F6C\u53D1", className: "mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" }), error && _jsx("p", { className: "mt-2 text-sm text-red-400", children: error }), _jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", disabled: busy, onClick: onClose, children: "\u53D6\u6D88" }), _jsx(Button, { disabled: busy, onClick: () => void submit(), children: busy ? "转发中..." : "转发" })] })] }) }) }));
}
