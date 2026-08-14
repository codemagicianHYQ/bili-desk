import { useEffect, useState, type ReactNode } from "react";
import type { AiConfig } from "@shared/types";
import { Button } from "@/components/ui/button";
import { THEME_PRESETS, useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Github,
  Info,
  Palette,
  Sparkles,
  UserRound,
} from "lucide-react";

const GITHUB_REPO = {
  name: "bili-desk",
  fullName: "codemagicianHYQ/bili-desk",
  url: "https://github.com/codemagicianHYQ/bili-desk",
  description: "B 站 Windows 第三方桌面客户端，开源可共建。",
};

const GITHUB_AUTHOR = {
  name: "codemagicianHYQ",
  url: "https://github.com/codemagicianHYQ",
  description: "项目作者 · GitHub",
};

type SettingsSection = "appearance" | "privacy" | "ai" | "about";

const NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof Palette;
}> = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "privacy", label: "观看隐私", icon: EyeOff },
  { id: "ai", label: "AI 配置", icon: Sparkles },
  { id: "about", label: "关于", icon: Info },
];

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border/70 py-5 last:border-b-0">
      <div className="min-w-0 max-w-[28rem] space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const {
    theme,
    themePreset,
    setTheme,
    setThemePreset,
    incognitoMode,
    setIncognitoMode,
  } = useAppStore();
  const [section, setSection] = useState<SettingsSection>("appearance");
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

  const activeNav = NAV_ITEMS.find((item) => item.id === section);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-4">
        <p className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          设置
        </p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="scrollbar-overlay min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">
            {activeNav?.label}
          </h2>

          {section === "appearance" && (
            <section className="rounded-xl border border-border bg-card/60 px-5">
              <SettingRow
                title="显示模式"
                description="切换浅色或深色界面，立即生效。"
              >
                <div className="flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => void setTheme("light")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      theme === "light"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    浅色
                  </button>
                  <button
                    type="button"
                    onClick={() => void setTheme("dark")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      theme === "dark"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    深色
                  </button>
                </div>
              </SettingRow>

              <div className="py-5">
                <div className="mb-3 space-y-1">
                  <p className="text-sm font-medium">主题配色</p>
                  <p className="text-xs text-muted-foreground">
                    选择一套强调色，影响按钮、选中态和高亮。
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {THEME_PRESETS.map((preset) => {
                    const active = themePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setThemePreset(preset.id)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border/80 bg-secondary/20 hover:bg-secondary/60",
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
          )}

          {section === "privacy" && (
            <section className="rounded-xl border border-border bg-card/60 px-5">
              <SettingRow
                title="无痕模式"
                description="默认会把播放进度同步到 B 站历史记录。开启后，本机观看不再上报。"
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={incognitoMode}
                  onClick={() => setIncognitoMode(!incognitoMode)}
                  className={cn(
                    "relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
                    incognitoMode ? "bg-primary" : "bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] shadow transition-transform",
                      incognitoMode ? "translate-x-6" : "translate-x-1",
                    )}
                  >
                    {incognitoMode ? (
                      <EyeOff className="h-3 w-3 text-primary" />
                    ) : (
                      <Eye className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                </button>
              </SettingRow>
            </section>
          )}

          {section === "ai" && (
            <section className="space-y-5 rounded-xl border border-border bg-card/60 p-5">
              <p className="text-sm text-muted-foreground">
                支持 OpenAI 兼容 API（DeepSeek、OpenAI、Ollama 等），用于关注 UP
                智能分组。未填 Key 时只跑本地规则。
              </p>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">API Base URL</span>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  value={ai.baseUrl}
                  onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">API Key</span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  value={ai.apiKey}
                  onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">模型</span>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  value={ai.model}
                  onChange={(e) => setAi({ ...ai, model: e.target.value })}
                  placeholder="deepseek-chat"
                />
              </label>
              <div className="flex justify-end">
                <Button onClick={() => void saveAi()}>
                  {saved ? "已保存" : "保存 AI 配置"}
                </Button>
              </div>
            </section>
          )}

          {section === "about" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card/60 px-5 text-sm">
                <SettingRow
                  title="版本"
                  description="B 站 Windows 第三方客户端原型"
                >
                  <span className="text-sm text-muted-foreground">0.1.0</span>
                </SettingRow>
                <div className="py-4 text-muted-foreground">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    核心能力
                  </p>
                  <p className="text-xs leading-relaxed">
                    收藏夹二级分类 · 关注 UP AI/规则分组 · 简洁桌面 UI
                  </p>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-sm font-medium text-foreground">开源</p>
                <a
                  href={GITHUB_REPO.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                    <Github className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {GITHUB_REPO.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {GITHUB_REPO.fullName}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {GITHUB_REPO.description}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </a>

                <a
                  href={GITHUB_AUTHOR.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      @{GITHUB_AUTHOR.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {GITHUB_AUTHOR.description}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </a>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
