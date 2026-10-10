import type { VideoSubtitleTrack } from "@shared/types";

const GLOBAL_KEY = "bilidesk:subtitle-pref";
const SCOPE_KEY = "bilidesk:subtitle-scope";
const videoKey = (bvid: string) => `bilidesk:subtitle-video:${bvid}`;

export type SubtitleScope = "all" | "current";

export interface SubtitleChoice {
  enabled: boolean;
  /** 空字符串表示自动选中文 */
  lan: string;
}

const DEFAULT_CHOICE: SubtitleChoice = { enabled: true, lan: "" };

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

function parseChoice(raw: unknown): SubtitleChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<SubtitleChoice>;
  return {
    enabled: item.enabled !== false,
    lan: typeof item.lan === "string" ? item.lan : "",
  };
}

export function readSubtitleScope(): SubtitleScope {
  try {
    return localStorage.getItem(SCOPE_KEY) === "current" ? "current" : "all";
  } catch {
    return "all";
  }
}

export function readGlobalSubtitleChoice(): SubtitleChoice {
  return parseChoice(readJson(GLOBAL_KEY)) ?? { ...DEFAULT_CHOICE };
}

function readVideoSubtitleChoice(bvid: string): SubtitleChoice | null {
  if (!bvid) return null;
  return parseChoice(readJson(videoKey(bvid)));
}

export function resolveSubtitleChoice(bvid: string): SubtitleChoice {
  if (readSubtitleScope() === "current") {
    return readVideoSubtitleChoice(bvid) ?? readGlobalSubtitleChoice();
  }
  return readGlobalSubtitleChoice();
}

export function rememberSubtitleChoice(
  bvid: string,
  choice: SubtitleChoice,
): void {
  if (readSubtitleScope() === "current" && bvid) {
    writeJson(videoKey(bvid), choice);
    return;
  }
  writeJson(GLOBAL_KEY, choice);
}

export function setSubtitleScope(
  scope: SubtitleScope,
  bvid: string,
  current: SubtitleChoice,
): void {
  try {
    localStorage.setItem(SCOPE_KEY, scope);
  } catch {
    // ignore
  }
  if (scope === "all") {
    writeJson(GLOBAL_KEY, current);
    return;
  }
  if (bvid) writeJson(videoKey(bvid), current);
}

export function trackLanKey(track: VideoSubtitleTrack): string {
  return (track.lan || track.lanDoc || String(track.id)).trim();
}

export function matchSubtitleTrack(
  tracks: VideoSubtitleTrack[],
  choice: SubtitleChoice,
  pickAuto: (tracks: VideoSubtitleTrack[]) => VideoSubtitleTrack | undefined,
): VideoSubtitleTrack | undefined {
  if (tracks.length === 0) return undefined;
  if (choice.lan) {
    const found = tracks.find(
      (track) =>
        trackLanKey(track) === choice.lan ||
        track.lan === choice.lan ||
        track.lanDoc === choice.lan,
    );
    if (found) return found;
  }
  return pickAuto(tracks);
}
