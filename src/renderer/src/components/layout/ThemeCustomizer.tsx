import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import {
  TEXT_COLOR_TONES,
  THEME_PRESETS,
  useAppStore,
  type TextColorTone,
  type ThemePreset,
} from "@/stores/app-store";
import { cn } from "@/lib/utils";

function SliderRow({
  label,
  hint,
  value,
  onChange,
  left,
  right,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  left: string;
  right: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="tabular-nums text-xs text-muted-foreground">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

export function ThemeCustomizer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const theme = useAppStore((state) => state.theme);
  const themePreset = useAppStore((state) => state.themePreset);
  const uiTransparency = useAppStore((state) => state.uiTransparency);
  const textContrast = useAppStore((state) => state.textContrast);
  const textColorTone = useAppStore((state) => state.textColorTone);
  const customTextColor = useAppStore((state) => state.customTextColor);
  const setTheme = useAppStore((state) => state.setTheme);
  const setThemePreset = useAppStore((state) => state.setThemePreset);
  const setUiTransparency = useAppStore((state) => state.setUiTransparency);
  const setTextContrast = useAppStore((state) => state.setTextContrast);
  const setTextColorTone = useAppStore((state) => state.setTextColorTone);
  const setCustomTextColor = useAppStore((state) => state.setCustomTextColor);

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    updatePos();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  const handlePresetSelect = (preset: ThemePreset) => {
    setThemePreset(preset);
  };

  const handleToneSelect = (tone: TextColorTone) => {
    setTextColorTone(tone);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="主题定制"
        title="主题定制"
        onClick={() => setOpen((value) => !value)}
      >
        <Palette className="h-4 w-4" />
      </Button>

      {open && (
        <OverlayPortal>
          <div
            ref={panelRef}
            className={cn(
              "fixed w-[22rem] overflow-hidden rounded-2xl border border-border shadow-2xl",
              APP_OVERLAY_ZCLASS,
              themePreset === "glass" ? "bili-glass bg-card/40" : "bg-card",
            )}
            {...(themePreset === "glass" ? { "data-glass-panel": true } : {})}
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="max-h-[min(78vh,640px)] space-y-3 overflow-y-auto p-3">
              <div>
                <p className="text-sm font-medium text-foreground">主题定制</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  配色、透明度、文字颜色与对比度都可调。液态玻璃透出壁纸。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  className="justify-start gap-2"
                  onClick={() => void setTheme("light")}
                >
                  <Sun className="h-4 w-4" />
                  浅色模式
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  className="justify-start gap-2"
                  onClick={() => void setTheme("dark")}
                >
                  <Moon className="h-4 w-4" />
                  深色模式
                </Button>
              </div>

              <div className="space-y-2">
                {THEME_PRESETS.map((preset) => {
                  const active = themePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                        active
                          ? "border-primary bg-primary/10"
                          : themePreset === "glass"
                            ? "border-white/10 bg-white/10 hover:bg-white/16"
                            : "border-transparent bg-secondary/50 hover:bg-secondary/80",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {preset.label}
                          </span>
                          {active && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {preset.description}
                        </p>
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-1.5">
                        {preset.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="h-5 w-5 rounded-full border border-white/15 shadow-inner"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  "space-y-3 rounded-xl border p-3",
                  themePreset === "glass"
                    ? "border-white/10 bg-white/5"
                    : "border-border bg-secondary/40",
                )}
              >
                <p className="text-xs font-medium text-foreground">
                  可读性与透明度
                </p>
                <SliderRow
                  label="界面透明度"
                  hint={
                    themePreset === "glass"
                      ? "越高越透出壁纸；文字靠对比度补"
                      : "主要作用于液态玻璃；其它主题保持实色"
                  }
                  value={uiTransparency}
                  onChange={setUiTransparency}
                  left="更实"
                  right="更透"
                />
                <SliderRow
                  label="文字对比度"
                  hint="越高主文字越亮、次要文字越清楚"
                  value={textContrast}
                  onChange={setTextContrast}
                  left="柔和"
                  right="锐利"
                />
              </div>

              <div
                className={cn(
                  "space-y-2 rounded-xl border p-3",
                  themePreset === "glass"
                    ? "border-white/10 bg-white/5"
                    : "border-border bg-secondary/40",
                )}
              >
                <div>
                  <p className="text-xs font-medium text-foreground">
                    文字颜色
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    透明磨砂下建议用纯白或自定义亮色
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {TEXT_COLOR_TONES.map((tone) => {
                    const active = textColorTone === tone.id;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => handleToneSelect(tone.id)}
                        className={cn(
                          "rounded-lg border px-2.5 py-2 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/15"
                            : themePreset === "glass"
                              ? "border-white/10 bg-white/5 hover:bg-white/10"
                              : "border-border bg-secondary/40 hover:bg-secondary/70",
                        )}
                      >
                        <p className="text-xs font-medium text-foreground">
                          {tone.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {tone.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {textColorTone === "custom" && (
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      自定义色
                    </span>
                    <input
                      type="color"
                      value={customTextColor}
                      onChange={(event) =>
                        setCustomTextColor(event.target.value)
                      }
                      className="h-8 w-12 cursor-pointer rounded border border-white/20 bg-transparent"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
