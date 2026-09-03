import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUTS_CHANGED_EVENT,
  SEEK_STEP_OPTIONS,
  SHORTCUT_LABELS,
  chordToAccelerator,
  eventToChord,
  findInternalConflict,
  formatChord,
  isReservedChord,
  needsGlobalProbe,
  readShortcutConfig,
  setShortcutCapturing,
  type ShortcutAction,
  type ShortcutConfig,
  writeShortcutConfig,
} from "@/lib/shortcuts";

const ACTIONS = Object.keys(DEFAULT_SHORTCUTS.keys) as ShortcutAction[];

export function ShortcutsPanel() {
  const [config, setConfig] = useState<ShortcutConfig>(() =>
    readShortcutConfig(),
  );
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
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

  const persist = (next: ShortcutConfig) => {
    writeShortcutConfig(next);
    setConfig(readShortcutConfig());
  };

  const assignChord = useCallback(
    async (action: ShortcutAction, chord: string) => {
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
          const result = await window.biliDesk.app.probeShortcut(
            chordToAccelerator(chord),
          );
          if (result.taken) {
            setError(result.reason || "已被系统或其他软件占用");
            return;
          }
        } catch {
          // 探测失败时仍允许绑定应用内快捷键
        }
      }
      persist({
        ...config,
        keys: { ...config.keys, [action]: chord },
      });
      setCapturing(null);
      setError("");
    },
    [config],
  );

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCapturing(null);
        setError("");
        return;
      }
      const chord = eventToChord(event);
      if (!chord) return;
      event.preventDefault();
      event.stopPropagation();
      void assignChord(capturing, chord);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [assignChord, capturing]);

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card/60 px-5 py-5">
      <div className="space-y-1">
        <p className="text-sm font-medium">一次快进 / 快退</p>
        <p className="text-xs text-muted-foreground">
          播放页按左右方向键时跳过的秒数，画面上会显示粉红色提示。
        </p>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {SEEK_STEP_OPTIONS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => persist({ ...config, seekStep: seconds })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                config.seekStep === seconds
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {seconds} 秒
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 border-t border-border/70 pt-5">
        <p className="text-sm font-medium">按键</p>
        <p className="text-xs text-muted-foreground">
          点「修改」后按下新按键。会检查系统保留键、本应用重复键；带 Ctrl / Alt
          / Shift
          的组合还会探测是否已被其他软件全局占用。左右方向等单键只在本应用内生效，不会注册成全局快捷键。
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {ACTIONS.map((action) => (
          <div
            key={action}
            className="flex items-center justify-between gap-3 py-3 first:pt-0"
          >
            <div>
              <p className="text-sm">{SHORTCUT_LABELS[action]}</p>
              {action === "seekBackward" || action === "seekForward" ? (
                <p className="text-xs text-muted-foreground">
                  每次 {config.seekStep} 秒
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <kbd
                className={cn(
                  "min-w-[5.5rem] rounded-md border border-border bg-background px-2 py-1 text-center text-xs",
                  capturing === action && "border-primary text-primary",
                )}
              >
                {capturing === action
                  ? "按下新按键…"
                  : formatChord(config.keys[action])}
              </kbd>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setError("");
                  setCapturing((current) =>
                    current === action ? null : action,
                  );
                }}
              >
                {capturing === action ? "取消" : "修改"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end border-t border-border/70 pt-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            persist({
              seekStep: DEFAULT_SHORTCUTS.seekStep,
              keys: { ...DEFAULT_SHORTCUTS.keys },
            });
            setCapturing(null);
            setError("");
          }}
        >
          恢复默认
        </Button>
      </div>
    </section>
  );
}
