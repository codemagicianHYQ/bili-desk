export const SHORTCUT_STORAGE_KEY = "bilidesk-shortcuts";
export const SHORTCUTS_CHANGED_EVENT = "bilidesk-shortcuts-changed";

export const SEEK_STEP_OPTIONS = [3, 5, 10, 15, 30] as const;

export type ShortcutAction =
  | "seekBackward"
  | "seekForward"
  | "playPause"
  | "volumeUp"
  | "volumeDown"
  | "mute"
  | "fullscreen"
  | "goBack"
  | "goForward";

export interface ShortcutConfig {
  seekStep: number;
  keys: Record<ShortcutAction, string>;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  seekStep: 5,
  keys: {
    seekBackward: "ArrowLeft",
    seekForward: "ArrowRight",
    playPause: "Space",
    volumeUp: "ArrowUp",
    volumeDown: "ArrowDown",
    mute: "KeyM",
    fullscreen: "KeyF",
    goBack: "Alt+ArrowLeft",
    goForward: "Alt+ArrowRight",
  },
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  seekBackward: "快退",
  seekForward: "快进",
  playPause: "播放 / 暂停",
  volumeUp: "音量加",
  volumeDown: "音量减",
  mute: "静音",
  fullscreen: "全屏",
  goBack: "返回",
  goForward: "前进",
};

const KEY_DISPLAY: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "空格",
  Escape: "Esc",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

const RESERVED_CHORDS = new Set([
  "Alt+F4",
  "Alt+Tab",
  "Alt+Escape",
  "F4",
  "F12",
  "Ctrl+W",
  "Ctrl+Shift+W",
  "Ctrl+Q",
  "Ctrl+R",
  "Ctrl+Shift+R",
  "Ctrl+Shift+I",
  "Ctrl+Shift+J",
  "Ctrl+Shift+C",
  "Ctrl+Shift+Escape",
  "Ctrl+Alt+Delete",
  "Ctrl+C",
  "Ctrl+V",
  "Ctrl+X",
  "Ctrl+A",
  "Ctrl+Z",
  "Ctrl+Y",
]);

let capturing = false;

export function setShortcutCapturing(on: boolean) {
  capturing = on;
}

export function isShortcutCapturing() {
  return capturing;
}

function clampSeekStep(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SHORTCUTS.seekStep;
  const rounded = Math.round(value);
  if ((SEEK_STEP_OPTIONS as readonly number[]).includes(rounded))
    return rounded;
  return Math.min(60, Math.max(1, rounded));
}

function normalizeKeyToken(key: string, code?: string): string {
  if (key === " " || key === "Spacebar") return "Space";
  if (key === "Meta" || key === "OS") return "Meta";
  if (key.length === 1 && /[a-zA-Z]/.test(key) && code?.startsWith("Key")) {
    return code;
  }
  if (key.length === 1 && /[0-9]/.test(key) && code?.startsWith("Digit")) {
    return code;
  }
  return key;
}

export function eventToChord(event: KeyboardEvent): string | null {
  const token = normalizeKeyToken(event.key, event.code);
  if (
    token === "Control" ||
    token === "Shift" ||
    token === "Alt" ||
    token === "Meta"
  ) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(token);
  return parts.join("+");
}

export function formatChord(chord: string): string {
  return chord
    .split("+")
    .map((part) => {
      if (part === "Ctrl") return "Ctrl";
      if (part === "Alt") return "Alt";
      if (part === "Shift") return "Shift";
      if (part === "Meta") return "Win";
      if (KEY_DISPLAY[part]) return KEY_DISPLAY[part];
      if (part.startsWith("Key") && part.length === 4) return part.slice(3);
      if (part.startsWith("Digit") && part.length === 6) return part.slice(5);
      if (part.startsWith("F") && /^F\d{1,2}$/.test(part)) return part;
      return part;
    })
    .join(" + ");
}

export function chordToAccelerator(chord: string): string {
  return chord
    .split("+")
    .map((part) => {
      if (part === "Ctrl") return "CommandOrControl";
      if (part === "ArrowLeft") return "Left";
      if (part === "ArrowRight") return "Right";
      if (part === "ArrowUp") return "Up";
      if (part === "ArrowDown") return "Down";
      if (part === "Space") return "Space";
      if (part.startsWith("Key") && part.length === 4) return part.slice(3);
      if (part.startsWith("Digit") && part.length === 6) return part.slice(5);
      return part;
    })
    .join("+");
}

export function needsGlobalProbe(chord: string): boolean {
  const parts = chord.split("+");
  return (
    parts.includes("Ctrl") || parts.includes("Alt") || parts.includes("Shift")
  );
}

export function isReservedChord(chord: string): string | null {
  if (chord.split("+").includes("Meta")) {
    return "Win 组合键由系统占用";
  }
  if (RESERVED_CHORDS.has(chord)) {
    return "该快捷键与系统或常见软件冲突";
  }
  return null;
}

export function findInternalConflict(
  config: ShortcutConfig,
  action: ShortcutAction,
  chord: string,
): ShortcutAction | null {
  for (const [key, value] of Object.entries(config.keys) as Array<
    [ShortcutAction, string]
  >) {
    if (key !== action && value === chord) return key;
  }
  return null;
}

export function readShortcutConfig(): ShortcutConfig {
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (!raw)
      return { ...DEFAULT_SHORTCUTS, keys: { ...DEFAULT_SHORTCUTS.keys } };
    const parsed = JSON.parse(raw) as Partial<ShortcutConfig>;
    return {
      seekStep: clampSeekStep(Number(parsed.seekStep)),
      keys: { ...DEFAULT_SHORTCUTS.keys, ...(parsed.keys ?? {}) },
    };
  } catch {
    return { ...DEFAULT_SHORTCUTS, keys: { ...DEFAULT_SHORTCUTS.keys } };
  }
}

export function writeShortcutConfig(config: ShortcutConfig) {
  const next: ShortcutConfig = {
    seekStep: clampSeekStep(config.seekStep),
    keys: { ...DEFAULT_SHORTCUTS.keys, ...config.keys },
  };
  localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT));
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/** 图片灯箱、确认框等弹层打开时，播放器快捷键应让路 */
export function isModalOpen(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"]'));
}
