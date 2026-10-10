const RATE_KEY = "bilidesk:playback-rate";
const VOLUME_KEY = "bilidesk:playback-volume";

export function readPlaybackRate(): number {
  try {
    const rate = Number(localStorage.getItem(RATE_KEY));
    if (!Number.isFinite(rate) || rate <= 0) return 1;
    return Math.min(3, Math.max(0.25, rate));
  } catch {
    return 1;
  }
}

export function writePlaybackRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) return;
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // ignore
  }
}

export function readPlaybackVolume(): number | null {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return null;
    const volume = Number(raw);
    if (!Number.isFinite(volume)) return null;
    return Math.min(1, Math.max(0, volume));
  } catch {
    return null;
  }
}

export function writePlaybackVolume(volume: number): void {
  if (!Number.isFinite(volume)) return;
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
  } catch {
    // ignore
  }
}
