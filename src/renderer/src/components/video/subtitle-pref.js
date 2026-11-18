const GLOBAL_KEY = "bilidesk:subtitle-pref";
const SCOPE_KEY = "bilidesk:subtitle-scope";
const videoKey = (bvid) => `bilidesk:subtitle-video:${bvid}`;
const DEFAULT_CHOICE = { enabled: true, lan: "" };
function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch {
        // ignore quota / private mode
    }
}
function parseChoice(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const item = raw;
    return {
        enabled: item.enabled !== false,
        lan: typeof item.lan === "string" ? item.lan : "",
    };
}
export function readSubtitleScope() {
    try {
        return localStorage.getItem(SCOPE_KEY) === "current" ? "current" : "all";
    }
    catch {
        return "all";
    }
}
export function readGlobalSubtitleChoice() {
    return parseChoice(readJson(GLOBAL_KEY)) ?? { ...DEFAULT_CHOICE };
}
function readVideoSubtitleChoice(bvid) {
    if (!bvid)
        return null;
    return parseChoice(readJson(videoKey(bvid)));
}
export function resolveSubtitleChoice(bvid) {
    if (readSubtitleScope() === "current") {
        return readVideoSubtitleChoice(bvid) ?? readGlobalSubtitleChoice();
    }
    return readGlobalSubtitleChoice();
}
export function rememberSubtitleChoice(bvid, choice) {
    if (readSubtitleScope() === "current" && bvid) {
        writeJson(videoKey(bvid), choice);
        return;
    }
    writeJson(GLOBAL_KEY, choice);
}
export function setSubtitleScope(scope, bvid, current) {
    try {
        localStorage.setItem(SCOPE_KEY, scope);
    }
    catch {
        // ignore
    }
    if (scope === "all") {
        writeJson(GLOBAL_KEY, current);
        return;
    }
    if (bvid)
        writeJson(videoKey(bvid), current);
}
export function trackLanKey(track) {
    return (track.lan || track.lanDoc || String(track.id)).trim();
}
export function matchSubtitleTrack(tracks, choice, pickAuto) {
    if (tracks.length === 0)
        return undefined;
    if (choice.lan) {
        const found = tracks.find((track) => trackLanKey(track) === choice.lan ||
            track.lan === choice.lan ||
            track.lanDoc === choice.lan);
        if (found)
            return found;
    }
    return pickAuto(tracks);
}
