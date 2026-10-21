import type { DanmakuCloudConfig } from "@shared/types";

const STORAGE_KEY = "bilidesk:danmaku-pref";

export interface DanmakuPref {
  visible: boolean;
  opacity: number;
  speed: number;
  fontSize: number;
  margin: [number | `${number}%`, number | `${number}%`];
  antiOverlap: boolean;
  synchronousPlayback: boolean;
  modes: Array<0 | 1 | 2>;
  color: string;
  mode: 0 | 1 | 2;
}

export const DEFAULT_DANMAKU_PREF: DanmakuPref = {
  visible: true,
  opacity: 1,
  speed: 5,
  fontSize: 22,
  margin: [10, "25%"],
  antiOverlap: true,
  synchronousPlayback: true,
  modes: [0, 1, 2],
  color: "#FFFFFF",
  mode: 0,
};

const MARGIN_PRESETS: DanmakuPref["margin"][] = [
  [10, "75%"],
  [10, "50%"],
  [10, "25%"],
  [10, 10],
];

let writeTimer = 0;
let pending: DanmakuPref | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isMarginValue(value: unknown): value is number | `${number}%` {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  return typeof value === "string" && /^\d+(?:\.\d+)?%$/.test(value);
}

function parseMargin(value: unknown): DanmakuPref["margin"] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const top = value[0];
  const bottom = value[1];
  if (!isMarginValue(top) || !isMarginValue(bottom)) return null;
  const matched = MARGIN_PRESETS.find(([a, b]) => a === top && b === bottom);
  return matched ?? [top, bottom];
}

function parseModes(value: unknown): Array<0 | 1 | 2> | null {
  if (!Array.isArray(value)) return null;
  const modes = [
    ...new Set(
      value
        .map((item) => Number(item))
        .filter(
          (item): item is 0 | 1 | 2 => item === 0 || item === 1 || item === 2,
        ),
    ),
  ];
  return modes;
}

function parseColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

export function sanitizeDanmakuPref(raw: unknown): DanmakuPref {
  const parsed =
    raw && typeof raw === "object" ? (raw as Partial<DanmakuPref>) : {};
  const modes = parseModes(parsed.modes) ?? DEFAULT_DANMAKU_PREF.modes;
  const mode = parsed.mode === 1 || parsed.mode === 2 ? parsed.mode : 0;

  return {
    visible: parsed.visible !== false,
    opacity:
      typeof parsed.opacity === "number" && Number.isFinite(parsed.opacity)
        ? clamp(parsed.opacity, 0, 1)
        : DEFAULT_DANMAKU_PREF.opacity,
    speed:
      typeof parsed.speed === "number" && Number.isFinite(parsed.speed)
        ? clamp(parsed.speed, 1, 10)
        : DEFAULT_DANMAKU_PREF.speed,
    fontSize:
      typeof parsed.fontSize === "number" && Number.isFinite(parsed.fontSize)
        ? clamp(Math.round(parsed.fontSize), 12, 120)
        : DEFAULT_DANMAKU_PREF.fontSize,
    margin: parseMargin(parsed.margin) ?? DEFAULT_DANMAKU_PREF.margin,
    antiOverlap: parsed.antiOverlap !== false,
    synchronousPlayback: parsed.synchronousPlayback !== false,
    modes,
    color: parseColor(parsed.color) ?? DEFAULT_DANMAKU_PREF.color,
    mode,
  };
}

export function readDanmakuPref(): DanmakuPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DANMAKU_PREF };
    return sanitizeDanmakuPref(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DANMAKU_PREF };
  }
}

const CLOUD_SYNCED_KEY = "bilidesk:danmaku-cloud-synced";
const CLOUD_SYNC_DELAY_MS = 3000;
let cloudTimer = 0;

/** margin 底部留白 → 官网「显示区域」百分比 */
function marginToArea(margin: DanmakuPref["margin"]): number {
  const bottom = margin[1];
  if (typeof bottom === "string") {
    const reserved = Number.parseFloat(bottom);
    const area = 100 - reserved;
    return [25, 50, 75, 100].reduce((best, value) =>
      Math.abs(value - area) < Math.abs(best - area) ? value : best,
    );
  }
  return 100;
}

export function toDanmakuCloudConfig(pref: DanmakuPref): DanmakuCloudConfig {
  return {
    visible: pref.visible,
    blockScroll: !pref.modes.includes(0),
    blockTop: !pref.modes.includes(1),
    blockBottom: !pref.modes.includes(2),
    opacity: pref.opacity,
    area: marginToArea(pref.margin),
    // speed 是弹幕停留秒数，越大越慢；默认 5 对应官网 1.0 倍
    speedPlus: DEFAULT_DANMAKU_PREF.speed / pref.speed,
    fontScale: pref.fontSize / DEFAULT_DANMAKU_PREF.fontSize,
    speedSync: pref.synchronousPlayback,
  };
}

function scheduleCloudSync(pref: DanmakuPref): void {
  window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(() => {
    const config = toDanmakuCloudConfig(pref);
    const serialized = JSON.stringify(config);
    try {
      if (localStorage.getItem(CLOUD_SYNCED_KEY) === serialized) return;
    } catch {
      // ignore
    }
    void window.biliDesk.bili
      .syncDanmakuConfig(config)
      .then(() => {
        try {
          localStorage.setItem(CLOUD_SYNCED_KEY, serialized);
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // 同步失败不影响本地设置，下次改动再试
      });
  }, CLOUD_SYNC_DELAY_MS);
}

export function flushDanmakuPref(): void {
  window.clearTimeout(writeTimer);
  writeTimer = 0;
  if (!pending) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // ignore quota / private mode
  }
  scheduleCloudSync(pending);
  pending = null;
}

export function writeDanmakuPref(raw: unknown): void {
  pending = sanitizeDanmakuPref(raw);
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(flushDanmakuPref, 160);
}
