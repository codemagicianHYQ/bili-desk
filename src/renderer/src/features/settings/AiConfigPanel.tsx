import { useEffect, useMemo, useState } from "react";
import type { AiConfig, AiProviderId } from "@shared/types";
import {
  AI_PROVIDER_PRESETS,
  getAiProviderPreset,
  inferAiProviderId,
} from "@shared/ai-providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ExternalLink, Eye, EyeOff } from "lucide-react";

function emptyAi(): AiConfig {
  return {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
  };
}

export function AiConfigPanel() {
  const [ai, setAi] = useState<AiConfig>(emptyAi);
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
      setCustomModel(
        Boolean(config.model) && !preset.models.includes(config.model),
      );
    });
  }, []);

  const providerId = (ai.provider ??
    inferAiProviderId(ai.baseUrl)) as AiProviderId;
  const preset = useMemo(() => getAiProviderPreset(providerId), [providerId]);

  const selectProvider = (id: AiProviderId) => {
    const next = getAiProviderPreset(id);
    setAi((prev) => ({
      ...prev,
      provider: id,
      baseUrl: next.baseUrl || prev.baseUrl,
      model:
        id === "custom"
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
      } else {
        setTestMessage(result.message);
      }
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="space-y-5">
      <p className="text-sm text-muted-foreground">
        选择平台后自动填入官方兼容地址与推荐模型，用于关注 UP 智能分组。未填
        Key（Ollama 除外）时只跑本地规则。
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {AI_PROVIDER_PRESETS.map((item) => {
          const active = providerId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectProvider(item.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/60 hover:border-primary/40 hover:bg-secondary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{item.label}</span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-5">
        <label className="block space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">API Base URL</span>
            {preset.docsUrl && (
              <a
                href={preset.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                获取 Key
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary/50"
            value={ai.baseUrl}
            onChange={(e) =>
              setAi({
                ...ai,
                provider: providerId === "custom" ? "custom" : providerId,
                baseUrl: e.target.value,
              })
            }
            placeholder={preset.baseUrl || "https://api.example.com/v1"}
            disabled={providerId !== "custom" && Boolean(preset.baseUrl)}
          />
          {providerId !== "custom" && preset.baseUrl && (
            <p className="text-[11px] text-muted-foreground">
              当前为 {preset.label} 官方地址。若要用中转，请选「自定义」。
            </p>
          )}
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">
            API Key{preset.local ? "（可选）" : ""}
          </span>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm outline-none focus:border-primary/50"
              value={ai.apiKey}
              onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
              placeholder={preset.placeholderKey ?? "sk-..."}
              autoComplete="off"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "隐藏 Key" : "显示 Key"}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </label>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">模型</span>
            {preset.models.length > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setCustomModel((v) => !v)}
              >
                {customModel ? "选推荐模型" : "手动填写"}
              </button>
            )}
          </div>
          {!customModel && preset.models.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {preset.models.map((model) => {
                const active = ai.model === model;
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={() => setAi({ ...ai, model })}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {model}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary/50"
              value={ai.model}
              onChange={(e) => setAi({ ...ai, model: e.target.value })}
              placeholder={
                providerId === "doubao"
                  ? "ep-xxxxxxxx（火山方舟接入点 ID）"
                  : "model-name"
              }
            />
          )}
          {providerId === "doubao" && (
            <p className="text-[11px] text-muted-foreground">
              豆包需在火山方舟控制台创建接入点，把接入点 ID 填到模型名。
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {testMessage && (
            <p className="mr-auto max-w-md text-xs text-muted-foreground">
              {testMessage}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={testing}
            onClick={() => void testAi()}
          >
            {testing ? "测试中..." : "测试连通"}
          </Button>
          <Button type="button" onClick={() => void saveAi()}>
            {saved ? "已保存" : "保存 AI 配置"}
          </Button>
        </div>
      </div>
    </section>
  );
}
