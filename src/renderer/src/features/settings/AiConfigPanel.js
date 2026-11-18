import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
import { AI_PROVIDER_PRESETS, getAiProviderPreset, inferAiProviderId, } from "@shared/ai-providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ExternalLink, Eye, EyeOff } from "lucide-react";
function emptyAi() {
    return {
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "",
        model: "deepseek-chat",
    };
}
export function AiConfigPanel() {
    const [ai, setAi] = useState(emptyAi);
    const [saved, setSaved] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [customModel, setCustomModel] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testMessage, setTestMessage] = useState("");
    useEffect(() => {
        void window.biliDesk.ai.getConfig().then((config) => {
            const provider = config.provider ?? inferAiProviderId(config.baseUrl);
            const preset = getAiProviderPreset(provider);
            setAi({ ...config, provider });
            setCustomModel(Boolean(config.model) && !preset.models.includes(config.model));
        });
    }, []);
    const providerId = (ai.provider ??
        inferAiProviderId(ai.baseUrl));
    const preset = useMemo(() => getAiProviderPreset(providerId), [providerId]);
    const selectProvider = (id) => {
        const next = getAiProviderPreset(id);
        setAi((prev) => ({
            ...prev,
            provider: id,
            baseUrl: next.baseUrl || prev.baseUrl,
            model: id === "custom"
                ? prev.model
                : next.models.includes(prev.model)
                    ? prev.model
                    : (next.models[0] ?? prev.model),
            apiKey: next.local && !prev.apiKey ? "" : prev.apiKey,
        }));
        setCustomModel(id === "custom" || id === "doubao");
        setTestMessage("");
    };
    const saveAi = async () => {
        const next = await window.biliDesk.ai.setConfig({
            ...ai,
            provider: providerId,
            baseUrl: ai.baseUrl.trim(),
            apiKey: ai.apiKey.trim(),
            model: ai.model.trim(),
        });
        setAi(next);
        setSaved(true);
        setTestMessage("");
        window.setTimeout(() => setSaved(false), 2000);
    };
    const testAi = async () => {
        setTesting(true);
        setTestMessage("");
        try {
            await window.biliDesk.ai.setConfig({
                ...ai,
                provider: providerId,
                baseUrl: ai.baseUrl.trim(),
                apiKey: ai.apiKey.trim(),
                model: ai.model.trim(),
            });
            const result = await window.biliDesk.ai.testConnection();
            if (result.ok) {
                setTestMessage(`连通成功：${result.reply}`);
                setSaved(true);
                window.setTimeout(() => setSaved(false), 2000);
            }
            else {
                setTestMessage(result.message);
            }
        }
        catch (err) {
            setTestMessage(formatDisplayedError(err, undefined, "测试失败"));
        }
        finally {
            setTesting(false);
        }
    };
    return (_jsxs("section", { className: "space-y-5", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u9009\u62E9\u5E73\u53F0\u540E\u81EA\u52A8\u586B\u5165\u5B98\u65B9\u517C\u5BB9\u5730\u5740\u4E0E\u63A8\u8350\u6A21\u578B\uFF0C\u7528\u4E8E\u5173\u6CE8 UP \u667A\u80FD\u5206\u7EC4\u3002\u672A\u586B Key\uFF08Ollama \u9664\u5916\uFF09\u65F6\u53EA\u8DD1\u672C\u5730\u89C4\u5219\u3002" }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: AI_PROVIDER_PRESETS.map((item) => {
                    const active = providerId === item.id;
                    return (_jsxs("button", { type: "button", onClick: () => selectProvider(item.id), className: cn("rounded-xl border px-3 py-3 text-left transition-colors", active
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card/60 hover:border-primary/40 hover:bg-secondary/40"), children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-sm font-medium", children: item.label }), active && _jsx(Check, { className: "h-4 w-4 shrink-0 text-primary" })] }), _jsx("p", { className: "mt-1 text-xs leading-relaxed text-muted-foreground", children: item.description })] }, item.id));
                }) }), _jsxs("div", { className: "space-y-4 rounded-xl border border-border bg-card/60 p-5", children: [_jsxs("label", { className: "block space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-medium", children: "API Base URL" }), preset.docsUrl && (_jsxs("a", { href: preset.docsUrl, target: "_blank", rel: "noreferrer", className: "inline-flex items-center gap-1 text-xs text-primary hover:underline", children: ["\u83B7\u53D6 Key", _jsx(ExternalLink, { className: "h-3 w-3" })] }))] }), _jsx("input", { className: "w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary/50", value: ai.baseUrl, onChange: (e) => setAi({
                                    ...ai,
                                    provider: providerId === "custom" ? "custom" : providerId,
                                    baseUrl: e.target.value,
                                }), placeholder: preset.baseUrl || "https://api.example.com/v1", disabled: providerId !== "custom" && Boolean(preset.baseUrl) }), providerId !== "custom" && preset.baseUrl && (_jsxs("p", { className: "text-[11px] text-muted-foreground", children: ["\u5F53\u524D\u4E3A ", preset.label, " \u5B98\u65B9\u5730\u5740\u3002\u82E5\u8981\u7528\u4E2D\u8F6C\uFF0C\u8BF7\u9009\u300C\u81EA\u5B9A\u4E49\u300D\u3002"] }))] }), _jsxs("label", { className: "block space-y-1.5 text-sm", children: [_jsxs("span", { className: "font-medium", children: ["API Key", preset.local ? "（可选）" : ""] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: showKey ? "text" : "password", className: "w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm outline-none focus:border-primary/50", value: ai.apiKey, onChange: (e) => setAi({ ...ai, apiKey: e.target.value }), placeholder: preset.placeholderKey ?? "sk-...", autoComplete: "off" }), _jsx("button", { type: "button", className: "absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground", onClick: () => setShowKey((v) => !v), "aria-label": showKey ? "隐藏 Key" : "显示 Key", children: showKey ? (_jsx(EyeOff, { className: "h-4 w-4" })) : (_jsx(Eye, { className: "h-4 w-4" })) })] })] }), _jsxs("div", { className: "space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-medium", children: "\u6A21\u578B" }), preset.models.length > 0 && (_jsx("button", { type: "button", className: "text-xs text-primary hover:underline", onClick: () => setCustomModel((v) => !v), children: customModel ? "选推荐模型" : "手动填写" }))] }), !customModel && preset.models.length > 0 ? (_jsx("div", { className: "flex flex-wrap gap-1.5", children: preset.models.map((model) => {
                                    const active = ai.model === model;
                                    return (_jsx("button", { type: "button", onClick: () => setAi({ ...ai, model }), className: cn("rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors", active
                                            ? "border-primary bg-primary/15 text-primary"
                                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"), children: model }, model));
                                }) })) : (_jsx("input", { className: "w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary/50", value: ai.model, onChange: (e) => setAi({ ...ai, model: e.target.value }), placeholder: providerId === "doubao"
                                    ? "ep-xxxxxxxx（火山方舟接入点 ID）"
                                    : "model-name" })), providerId === "doubao" && (_jsx("p", { className: "text-[11px] text-muted-foreground", children: "\u8C46\u5305\u9700\u5728\u706B\u5C71\u65B9\u821F\u63A7\u5236\u53F0\u521B\u5EFA\u63A5\u5165\u70B9\uFF0C\u628A\u63A5\u5165\u70B9 ID \u586B\u5230\u6A21\u578B\u540D\u3002" }))] }), _jsxs("div", { className: "flex flex-wrap items-center justify-end gap-2 pt-1", children: [testMessage && (_jsx("p", { className: "mr-auto max-w-md text-xs text-muted-foreground", children: testMessage })), _jsx(Button, { type: "button", variant: "outline", disabled: testing, onClick: () => void testAi(), children: testing ? "测试中..." : "测试连通" }), _jsx(Button, { type: "button", onClick: () => void saveAi(), children: saved ? "已保存" : "保存 AI 配置" })] })] })] }));
}
