import { useEffect, useRef, useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_OVERLAY_ZCLASS,
  OverlayPortal,
} from "@/components/ui/overlay-portal";
import { cn } from "@/lib/utils";
import {
  useAppStore,
  type FavGridColumns,
  type HomeGridColumns,
} from "@/stores/app-store";

const HOME_OPTIONS: HomeGridColumns[] = [2, 3, 4, 5];
const FAV_OPTIONS: FavGridColumns[] = [1, 2, 3, 4];

export function HomeGridLayoutPicker({
  target = "home",
}: {
  target?: "home" | "favorites";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const homeColumns = useAppStore((state) => state.homeGridColumns);
  const favColumns = useAppStore((state) => state.favGridColumns);
  const setHomeColumns = useAppStore((state) => state.setHomeGridColumns);
  const setFavColumns = useAppStore((state) => state.setFavGridColumns);
  const isFav = target === "favorites";
  const homeGridColumns: number = isFav ? favColumns : homeColumns;
  const options: number[] = isFav ? FAV_OPTIONS : HOME_OPTIONS;
  const setHomeGridColumns = (value: number) => {
    if (isFav) setFavColumns(value as FavGridColumns);
    else setHomeColumns(value as HomeGridColumns);
  };

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 6,
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

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="布局设置"
        title={`当前 ${homeGridColumns} 列布局`}
        onClick={() => setOpen((value) => !value)}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>

      {open && (
        <OverlayPortal>
          <div
            ref={panelRef}
            data-glass-panel
            className={cn(
              "bili-glass fixed w-36 overflow-hidden rounded-xl border border-border bg-card/40 py-1 shadow-2xl",
              APP_OVERLAY_ZCLASS,
            )}
            style={{ top: pos.top, right: pos.right }}
          >
            <p className="px-3 py-1.5 text-xs text-muted-foreground">
              每行显示
            </p>
            {options.map((value) => {
              const option = { value, label: `${value} 列` };
              const active = homeGridColumns === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                    active && "text-primary",
                  )}
                  onClick={() => {
                    setHomeGridColumns(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
