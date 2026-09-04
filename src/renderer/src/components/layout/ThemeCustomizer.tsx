import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import {
  THEME_PRESETS,
  useAppStore,
  type ThemePreset,
} from "@/stores/app-store";
import { cn } from "@/lib/utils";

export function ThemeCustomizer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const theme = useAppStore((state) => state.theme);
  const themePreset = useAppStore((state) => state.themePreset);
  const setTheme = useAppStore((state) => state.setTheme);
  const setThemePreset = useAppStore((state) => state.setThemePreset);

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
            data-glass-panel
            className={cn(
              "bili-glass fixed w-80 overflow-hidden rounded-2xl border border-border bg-card/40 p-3 shadow-2xl",
              APP_OVERLAY_ZCLASS,
            )}
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground">主题定制</p>
              <p className="mt-1 text-xs text-muted-foreground">
                配色与材质即时切换。液态玻璃会透出背后内容，带磨砂与边缘高光。
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
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-transparent bg-background/80 hover:bg-secondary/70",
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
        </OverlayPortal>
      )}
    </div>
  );
}
