const STORAGE_KEY = "bilidesk-playback-progress";
function loadMap() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function saveMap(map) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
    catch {
        // ignore quota errors
    }
}
export function progressKey(bvid, cid) {
    return `${bvid}:${cid}`;
}
export function getPlaybackProgress(bvid, cid) {
    const entry = loadMap()[progressKey(bvid, cid)];
    if (!entry || entry.time < 5)
        return undefined;
    if (entry.duration > 0 && entry.time >= entry.duration - 15) {
        return undefined;
    }
    return entry.time;
}
export function savePlaybackProgress(bvid, cid, time, duration) {
    if (!Number.isFinite(time) || time < 3)
        return;
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
export function clearPlaybackProgress(bvid, cid) {
    const map = loadMap();
    delete map[progressKey(bvid, cid)];
    saveMap(map);
}
