import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_SHORTCUTS, SHORTCUTS_CHANGED_EVENT, SEEK_STEP_OPTIONS, SHORTCUT_LABELS, chordToAccelerator, eventToChord, findInternalConflict, formatChord, isReservedChord, needsGlobalProbe, readShortcutConfig, setShortcutCapturing, writeShortcutConfig, } from "@/lib/shortcuts";
const ACTIONS = Object.keys(DEFAULT_SHORTCUTS.keys);
export function ShortcutsPanel() {
    const [config, setConfig] = useState(() => readShortcutConfig());
    const [capturing, setCapturing] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const sync = () => setConfig(readShortcutConfig());
        window.addEventListener(SHORTCUTS_CHANGED_EVENT, sync);
        return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, sync);
    }, []);
    useEffect(() => {
        setShortcutCapturing(Boolean(capturing));
        return () => setShortcutCapturing(false);
    }, [capturing]);
    const persist = (next) => {
        writeShortcutConfig(next);
        setConfig(readShortcutConfig());
    };
    const assignChord = useCallback(async (action, chord) => {
        const reserved = isReservedChord(chord);
        if (reserved) {
            setError(reserved);
            return;
        }
        const clash = findInternalConflict(config, action, chord);
        if (clash) {
            setError(`已用于「${SHORTCUT_LABELS[clash]}」`);
            return;
        }
        if (needsGlobalProbe(chord)) {
            try {
                const result = await window.biliDesk.app.probeShortcut(chordToAccelerator(chord));
                if (result.taken) {
                    setError(result.reason || "已被系统或其他软件占用");
                    return;
                }
            }
            catch {
                // 探测失败时仍允许绑定应用内快捷键
            }
        }
        persist({
            ...config,
            keys: { ...config.keys, [action]: chord },
        });
        setCapturing(null);
        setError("");
    }, [config]);
    useEffect(() => {
        if (!capturing)
            return;
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setCapturing(null);
                setError("");
                return;
            }
            const chord = eventToChord(event);
            if (!chord)
                return;
            event.preventDefault();
            event.stopPropagation();
            void assignChord(capturing, chord);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [assignChord, capturing]);
    return (_jsxs("section", { className: "space-y-5 rounded-xl border border-border bg-card/60 px-5 py-5", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("p", { className: "text-sm font-medium", children: "\u4E00\u6B21\u5FEB\u8FDB / \u5FEB\u9000" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u64AD\u653E\u9875\u6309\u5DE6\u53F3\u65B9\u5411\u952E\u65F6\u8DF3\u8FC7\u7684\u79D2\u6570\uFF0C\u753B\u9762\u4E0A\u4F1A\u663E\u793A\u7C89\u7EA2\u8272\u63D0\u793A\u3002" }), _jsx("div", { className: "flex flex-wrap gap-1.5 pt-2", children: SEEK_STEP_OPTIONS.map((seconds) => (_jsxs("button", { type: "button", onClick: () => persist({ ...config, seekStep: seconds }), className: cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", config.seekStep === seconds
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground"), children: [seconds, " \u79D2"] }, seconds))) })] }), _jsxs("div", { className: "space-y-1 border-t border-border/70 pt-5", children: [_jsx("p", { className: "text-sm font-medium", children: "\u6309\u952E" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u70B9\u300C\u4FEE\u6539\u300D\u540E\u6309\u4E0B\u65B0\u6309\u952E\u3002\u4F1A\u68C0\u67E5\u7CFB\u7EDF\u4FDD\u7559\u952E\u3001\u672C\u5E94\u7528\u91CD\u590D\u952E\uFF1B\u5E26 Ctrl / Alt / Shift \u7684\u7EC4\u5408\u8FD8\u4F1A\u63A2\u6D4B\u662F\u5426\u5DF2\u88AB\u5176\u4ED6\u8F6F\u4EF6\u5168\u5C40\u5360\u7528\u3002\u5DE6\u53F3\u65B9\u5411\u7B49\u5355\u952E\u53EA\u5728\u672C\u5E94\u7528\u5185\u751F\u6548\uFF0C\u4E0D\u4F1A\u6CE8\u518C\u6210\u5168\u5C40\u5FEB\u6377\u952E\u3002" })] }), _jsx("div", { className: "divide-y divide-border/60", children: ACTIONS.map((action) => (_jsxs("div", { className: "flex items-center justify-between gap-3 py-3 first:pt-0", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm", children: SHORTCUT_LABELS[action] }), action === "seekBackward" || action === "seekForward" ? (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u6BCF\u6B21 ", config.seekStep, " \u79D2"] })) : action === "goBack" ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u4E0E\u6D4F\u89C8\u5668\u76F8\u540C\uFF0C\u8FD4\u56DE\u4E0A\u4E00\u9875" })) : action === "goForward" ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u4E0E\u6D4F\u89C8\u5668\u76F8\u540C\uFF0C\u524D\u8FDB\u5230\u4E0B\u4E00\u9875" })) : null] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("kbd", { className: cn("min-w-[5.5rem] rounded-md border border-border bg-background px-2 py-1 text-center text-xs", capturing === action && "border-primary text-primary"), children: capturing === action
                                        ? "按下新按键…"
                                        : formatChord(config.keys[action]) }), _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => {
                                        setError("");
                                        setCapturing((current) => current === action ? null : action);
                                    }, children: capturing === action ? "取消" : "修改" })] })] }, action))) }), error && _jsx("p", { className: "text-xs text-red-400", children: error }), _jsx("div", { className: "flex justify-end border-t border-border/70 pt-4", children: _jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: () => {
                        persist({
                            seekStep: DEFAULT_SHORTCUTS.seekStep,
                            keys: { ...DEFAULT_SHORTCUTS.keys },
                        });
                        setCapturing(null);
                        setError("");
                    }, children: "\u6062\u590D\u9ED8\u8BA4" }) })] }));
}
