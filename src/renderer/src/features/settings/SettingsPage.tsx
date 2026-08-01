import { useEffect, useState } from "react";
import type { AiConfig } from "@shared/types";
import { Button } from "@/components/ui/button";
import { THEME_PRESETS, useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

export function SettingsPage() {
  const {
    theme,
    themePreset,
    setTheme,
    setThemePreset,
    incognitoMode,
    setIncognitoMode,
  } = useAppStore();
  const [ai, setAi] = useState<AiConfig>({
    baseUrl: "",
    apiKey: "",
    model: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void window.biliDesk.ai.getConfig().then(setAi);
  }, []);

  const saveAi = async () => {
    await window.biliDesk.ai.setConfig(ai);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 pb-10">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="font-medium">外观</h3>
        <div className="flex gap-2">
          <Button
            variant={theme === "light" ? "default" : "outline"}
            onClick={() => void setTheme("light")}
          >
            浅色
          </Button>
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            onClick={() => void setTheme("dark")}
          >
            深色
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">主题配色</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {THEME_PRESETS.map((preset) => {
              const active = themePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setThemePreset(preset.id)}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-transparent bg-secondary/20 hover:bg-secondary/60",
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{preset.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {preset.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {preset.swatches.map((swatch) => (
                      <span
                        key={swatch}
                        className="h-5 w-5 rounded-full border border-white/15"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="font-medium">观看隐私</h3>
        <p className="text-sm text-muted-foreground">
          登录后默认会把播放进度同步到 B
          站历史记录，官方客户端也能看到。开启无痕后，本机观看不再上报历史。
        </p>
        <Button
          type="button"
          variant={incognitoMode ? "default" : "outline"}
          className="gap-2"
          onClick={() => setIncognitoMode(!incognitoMode)}
        >
          {incognitoMode ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {incognitoMode ? "无痕模式已开启" : "开启无痕模式"}
        </Button>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="font-medium">AI 配置</h3>
        <p className="text-sm text-muted-foreground">
          支持 OpenAI 兼容 API（DeepSeek、OpenAI、Ollama 等），用于 UP
          主智能分组。
        </p>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">API Base URL</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={ai.baseUrl}
            onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">API Key</span>
          <input
            type="password"
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={ai.apiKey}
            onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">模型</span>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={ai.model}
            onChange={(e) => setAi({ ...ai, model: e.target.value })}
            placeholder="deepseek-chat"
          />
        </label>
        <Button onClick={() => void saveAi()}>
          {saved ? "已保存" : "保存 AI 配置"}
        </Button>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <h3 className="font-medium text-foreground">关于 BiliDesk</h3>
        <p>版本 0.1.0 — B 站 Windows 第三方客户端原型</p>
        <p>核心差异化：收藏夹二级分类 · 关注 UP AI/规则分组 · 简洁 UI</p>
      </section>
    </div>
  );
}
