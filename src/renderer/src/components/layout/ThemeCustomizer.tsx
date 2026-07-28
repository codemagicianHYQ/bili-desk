import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  THEME_PRESETS,
  useAppStore,
  type ThemePreset,
} from "@/stores/app-store";
import { cn } from "@/lib/utils";

export function ThemeCustomizer() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const theme = useAppStore((state) => state.theme);
  const themePreset = useAppStore((state) => state.themePreset);
  const setTheme = useAppStore((state) => state.setTheme);
  const setThemePreset = useAppStore((state) => state.setThemePreset);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handlePresetSelect = (preset: ThemePreset) => {
    setThemePreset(preset);
  };

  return (
    <div ref={menuRef} className="relative">
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
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3">
            <p className="text-sm font-medium text-foreground">主题定制</p>
            <p className="mt-1 text-xs text-muted-foreground">
              参考主流应用的冷暖配色，保留 BiliDesk 的简洁风格。
            </p>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
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
                    "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background/80 hover:bg-secondary/70",
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
        </div>
      )}
    </div>
  );
}
