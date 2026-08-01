const STORAGE_KEY = "bilidesk-playback-progress";

interface ProgressEntry {
  time: number;
  duration: number;
  updatedAt: number;
}

type ProgressMap = Record<string, ProgressEntry>;

function loadMap(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProgressMap;
  } catch {
    return {};
  }
}

function saveMap(map: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function progressKey(bvid: string, cid: number): string {
  return `${bvid}:${cid}`;
}

export function getPlaybackProgress(
  bvid: string,
  cid: number,
): number | undefined {
  const entry = loadMap()[progressKey(bvid, cid)];
  if (!entry || entry.time < 5) return undefined;

  if (entry.duration > 0 && entry.time >= entry.duration - 15) {
    return undefined;
  }

  return entry.time;
}

export function savePlaybackProgress(
  bvid: string,
  cid: number,
  time: number,
  duration: number,
): void {
  if (!Number.isFinite(time) || time < 3) return;

  if (duration > 0 && time >= duration - 15) {
    const map = loadMap();
    delete map[progressKey(bvid, cid)];
    saveMap(map);
    return;
  }

  const map = loadMap();
  map[progressKey(bvid, cid)] = {
    time,
    duration,
    updatedAt: Date.now(),
  };
  saveMap(map);
}

export function clearPlaybackProgress(bvid: string, cid: number): void {
  const map = loadMap();
  delete map[progressKey(bvid, cid)];
  saveMap(map);
}
