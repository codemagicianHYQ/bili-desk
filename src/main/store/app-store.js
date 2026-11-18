import { app } from "electron";
import Store from "electron-store";
const defaults = {
    theme: "dark",
    windowGlass: false,
    themePreset: "rose",
    cookies: {
        SESSDATA: "",
        bili_jct: "",
        DedeUserID: "",
        DedeUserID__ckMd5: "",
        buvid3: "",
    },
    user: null,
    refreshToken: "",
    accessToken: "",
    tokenExpiresAt: 0,
    localDb: null,
    ai: {
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "",
        model: "deepseek-chat",
    },
    localToView: [],
    invalidVideos: [],
    abnormalFollowings: [],
    videoMetaCache: {},
    lastIntegrityScanAt: 0,
    upActivityCache: [],
    lastUpActivityScanAt: 0,
    collectionGroups: {},
    collectionSamples: {},
    upTitleCache: {},
    upVideoSpecials: {},
    chargeVideoBadges: {},
    upClassifyCache: {},
    upClassifyDeepRun: null,
    upPortraits: { updatedAt: 0, titledCount: 0, items: [] },
};
const diskStore = new Store({
    name: "bilidesk-config",
    defaults,
});
/**
 * electron-store 每次 get 都同步读 + 解析整个配置文件（几 MB），每次 set 还要整份重写，
 * 后台任务频繁读写时会卡住主进程。这里改成内存为准、合并延迟落盘。
 * get / set 都做深拷贝，保持和 electron-store 一样「拿到的是副本」的语义。
 */
const memory = diskStore.store;
const FLUSH_DELAY_MS = 3000;
let flushTimer = null;
let dirty = false;
function cloneValue(value) {
    return value === undefined || value === null || typeof value !== "object"
        ? value
        : structuredClone(value);
}
export function flushAppStore() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (!dirty)
        return;
    dirty = false;
    diskStore.store = memory;
}
function scheduleFlush() {
    dirty = true;
    if (flushTimer)
        return;
    flushTimer = setTimeout(flushAppStore, FLUSH_DELAY_MS);
}
export const appStore = {
    get(key) {
        return cloneValue(memory[key]);
    },
    set(key, value) {
        memory[key] = cloneValue(value);
        scheduleFlush();
    },
};
app.on("will-quit", flushAppStore);
process.on("exit", flushAppStore);
export function getCookieString() {
    const c = appStore.get("cookies");
    const parts = [];
    if (c.SESSDATA)
        parts.push(`SESSDATA=${c.SESSDATA}`);
    if (c.bili_jct)
        parts.push(`bili_jct=${c.bili_jct}`);
    if (c.DedeUserID)
        parts.push(`DedeUserID=${c.DedeUserID}`);
    if (c.DedeUserID__ckMd5)
        parts.push(`DedeUserID__ckMd5=${c.DedeUserID__ckMd5}`);
    if (c.buvid3)
        parts.push(`buvid3=${c.buvid3}`);
    return parts.join("; ");
}
export function setCookies(cookies) {
    appStore.set("cookies", { ...appStore.get("cookies"), ...cookies });
}
export function clearAuth() {
    appStore.set("cookies", defaults.cookies);
    appStore.set("user", null);
    appStore.set("refreshToken", "");
    appStore.set("accessToken", "");
    appStore.set("tokenExpiresAt", 0);
}
export function isLoggedIn() {
    return Boolean(appStore.get("cookies").SESSDATA);
}
