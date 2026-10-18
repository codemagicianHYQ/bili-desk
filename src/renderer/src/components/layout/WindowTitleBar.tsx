import { useEffect, useState } from "react";
import type { WindowState } from "@shared/types";
import { cn } from "@/lib/utils";

/** Windows 11 / 10 标题栏同款图标字体：最小化 E921、最大化 E922、还原 E923、关闭 E8BB */
const GLYPH = {
  minimize: "\uE921",
  maximize: "\uE922",
  restore: "\uE923",
  close: "\uE8BB",
} as const;

export const WINDOW_TITLEBAR_HEIGHT = 32;

function CaptionButton({
  glyph,
  label,
  danger,
  onClick,
}: {
  glyph: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "app-no-drag flex h-full w-[46px] items-center justify-center text-foreground/85 transition-colors",
        danger
          ? "hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/85"
          : "hover:bg-foreground/10 active:bg-foreground/5",
      )}
    >
      <span className="bili-caption-glyph">{glyph}</span>
    </button>
  );
}

export function WindowTitleBar() {
  const enabled = window.biliDesk.app.customTitleBar;
  const [state, setState] = useState<WindowState>({
    maximized: false,
    fullscreen: false,
  });

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.setAttribute("data-custom-titlebar", "");
    let alive = true;
    void window.biliDesk.app.getWindowState().then((next) => {
      if (alive) setState(next);
    });
    const off = window.biliDesk.app.onWindowStateChange(setState);
    return () => {
      alive = false;
      off();
      document.documentElement.removeAttribute("data-custom-titlebar");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      data-window-titlebar
      className="app-drag bili-glass flex shrink-0 select-none items-stretch justify-between"
      style={{ height: WINDOW_TITLEBAR_HEIGHT }}
    >
      <div className="flex min-w-0 items-center gap-2 pl-3 text-xs text-muted-foreground">
        <span className="truncate">BiliDesk</span>
      </div>
      <div className="flex items-stretch">
        <CaptionButton
          glyph={GLYPH.minimize}
          label="最小化"
          onClick={() => void window.biliDesk.app.minimizeWindow()}
        />
        <CaptionButton
          glyph={state.maximized ? GLYPH.restore : GLYPH.maximize}
          label={state.maximized ? "向下还原" : "最大化"}
          onClick={() =>
            void window.biliDesk.app.toggleMaximizeWindow().then(setState)
          }
        />
        <CaptionButton
          glyph={GLYPH.close}
          label="关闭"
          danger
          onClick={() => void window.biliDesk.app.closeWindow()}
        />
      </div>
    </div>
  );
}
