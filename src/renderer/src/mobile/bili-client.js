import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { extractWbiKey, signWbiParams } from "@shared/wbi-sign";
const COOKIE_KEY = "bililoft-mobile-cookies";
const UA = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
let wbiKeys = null;
function readCookies() {
    try {
        const raw = localStorage.getItem(COOKIE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
function writeCookies(next) {
    localStorage.setItem(COOKIE_KEY, JSON.stringify(next));
}
function cookieHeader() {
    return Object.entries(readCookies())
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
}
export function isLoggedIn() {
    return Boolean(readCookies().SESSDATA && readCookies().DedeUserID);
}
export function currentUserId() {
    return readCookies().DedeUserID ?? "";
}
export function logout() {
    const jar = readCookies();
    writeCookies({ buvid3: jar.buvid3 ?? "" });
    wbiKeys = null;
}
function absorbSetCookie(headers) {
    if (!headers)
        return;
    const raw = headers["set-cookie"] ??
        headers["Set-Cookie"] ??
        headers["set-cookie".toLowerCase()];
    const list = Array.isArray(raw) ? raw : raw ? String(raw).split(/,(?=\s*[A-Za-z0-9_]+=)/) : [];
    if (list.length === 0)
        return;
    const jar = readCookies();
    for (const item of list) {
        const pair = item.split(";")[0]?.trim();
        if (!pair || !pair.includes("="))
            continue;
        const eq = pair.indexOf("=");
        const key = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (!key || value === "EXPIRED" || value === "deleted") {
            delete jar[key];
            continue;
        }
        jar[key] = value;
    }
    writeCookies(jar);
}
function apiBase(kind) {
    if (Capacitor.isNativePlatform()) {
        return kind === "api"
            ? "https://api.bilibili.com"
            : "https://passport.bilibili.com";
    }
    return kind === "api" ? "/bili-api" : "/bili-passport";
}
async function request(kind, path, query, init) {
    const url = new URL(apiBase(kind) + path, window.location.origin);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, String(value));
        }
    }
    const headers = {
        "User-Agent": UA,
        Referer: "https://www.bilibili.com/",
        Origin: "https://www.bilibili.com",
        Accept: "application/json, text/plain, */*",
    };
    const cookie = cookieHeader();
    if (cookie)
        headers.Cookie = cookie;
    if (init?.body)
        headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.request({
            url: url.toString(),
            method: init?.method ?? "GET",
            headers,
            data: init?.body,
            responseType: "json",
        });
        absorbSetCookie(response.headers);
        const data = response.data;
        if (!data || typeof data !== "object") {
            throw new Error("接口没有返回数据");
        }
        return data;
    }
    const response = await fetch(url.toString(), {
        method: init?.method ?? "GET",
        headers,
        body: init?.body,
    });
    const data = (await response.json());
    return data;
}
async function ensureBuvid3() {
    if (readCookies().buvid3)
        return;
    const data = await request("api", "/x/frontend/finger/spi");
    const b3 = String(data.data?.b_3 ?? "");
    if (!b3)
        return;
    writeCookies({ ...readCookies(), buvid3: b3 });
}
async function wbiKeysNow() {
    if (wbiKeys && Date.now() < wbiKeys.expires) {
        return wbiKeys;
    }
    await ensureBuvid3();
    const data = await request("api", "/x/web-interface/nav");
    const img = data.data
        ?.wbi_img;
    const imgKey = extractWbiKey(String(img?.img_url ?? ""));
    const subKey = extractWbiKey(String(img?.sub_url ?? ""));
    if (!imgKey || !subKey)
        throw new Error("没拿到签名参数");
    wbiKeys = { imgKey, subKey, expires: Date.now() + 30 * 60 * 1000 };
    return wbiKeys;
}
async function signedGet(path, params) {
    const keys = await wbiKeysNow();
    const signed = signWbiParams(params, keys.imgKey, keys.subKey);
    return request("api", path, signed);
}
function stripHtml(text) {
    return text
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
}
function asRecord(value) {
    return value && typeof value === "object" ? value : null;
}
function readVideo(item) {
    const bvid = String(item.bvid ?? "");
    if (!bvid)
        return null;
    const owner = asRecord(item.owner) ?? {};
    const stat = asRecord(item.stat) ?? {};
    return {
        bvid,
        title: stripHtml(String(item.title ?? "")),
        cover: String(item.pic ?? item.cover ?? "").replace(/^http:/, "https:"),
        duration: Number(item.duration) || 0,
        play: Number(stat.view ?? item.play ?? 0) || 0,
        author: stripHtml(String(owner.name ?? item.author ?? "")),
        cid: Number(item.cid) || 0,
    };
}
function assertOk(data, fallback) {
    const code = Number(data.code);
    if (code === -412 || code === 412) {
        throw new Error("请求被 B 站安全策略拦截，请稍后重试");
    }
    if (Number.isFinite(code) && code !== 0) {
        throw new Error(String(data.message ?? fallback));
    }
}
export async function getRecommend(freshIdx = 1) {
    const data = await signedGet("/x/web-interface/wbi/index/top/feed/rcmd", {
        ps: 20,
        fresh_idx: freshIdx,
        fresh_idx_1h: freshIdx,
    });
    assertOk(data, "推荐加载失败");
    const items = (asRecord(data.data)?.item ?? []);
    return items.map((item) => readVideo(asRecord(item) ?? {})).filter((item) => item != null);
}
export async function getPopular(page = 1) {
    const data = await request("api", "/x/web-interface/popular", { pn: page, ps: 20 });
    assertOk(data, "热门加载失败");
    const list = (asRecord(data.data)?.list ?? []);
    return list.map((item) => readVideo(asRecord(item) ?? {})).filter((item) => item != null);
}
export async function searchVideos(keyword, page = 1) {
    const data = await signedGet("/x/web-interface/wbi/search/type", {
        search_type: "video",
        keyword: keyword.trim(),
        page,
        page_size: 20,
        order: "totalrank",
        platform: "pc",
    });
    assertOk(data, "搜索失败");
    const payload = asRecord(data.data) ?? {};
    const list = Array.isArray(payload.result) ? payload.result : [];
    return {
        videos: list
            .map((item) => readVideo(asRecord(item) ?? {}))
            .filter((item) => item != null),
        total: Number(payload.numResults) || 0,
    };
}
export async function getPlay(bvid) {
    const view = await request("api", "/x/web-interface/view", { bvid });
    assertOk(view, "视频加载失败");
    const data = asRecord(view.data) ?? {};
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const first = asRecord(pages[0]) ?? {};
    const cid = Number(data.cid ?? first.cid);
    if (!cid)
        throw new Error("没有可播放的分集");
    const owner = asRecord(data.owner) ?? {};
    const keys = await wbiKeysNow();
    const play = await request("api", "/x/player/wbi/playurl", signWbiParams({
        bvid,
        cid,
        qn: 80,
        fnval: 1,
        fnver: 0,
        fourk: 1,
        platform: "html5",
        high_quality: 1,
    }, keys.imgKey, keys.subKey));
    assertOk(play, "播放地址获取失败");
    const playData = asRecord(play.data) ?? {};
    const durl = Array.isArray(playData.durl) ? playData.durl : [];
    const url = String(asRecord(durl[0])?.url ?? "");
    if (!url)
        throw new Error("这个视频没有可用的 MP4 地址");
    return {
        bvid,
        cid,
        title: stripHtml(String(data.title ?? "")),
        author: stripHtml(String(owner.name ?? "")),
        cover: String(data.pic ?? "").replace(/^http:/, "https:"),
        url,
        quality: Number(playData.quality) || 0,
    };
}
export async function createLoginQr() {
    await ensureBuvid3();
    const data = await request("passport", "/x/passport-login/web/qrcode/generate", undefined, {
        method: "POST",
        body: "",
    });
    assertOk(data, "二维码获取失败");
    const payload = asRecord(data.data) ?? {};
    const url = String(payload.url ?? "");
    const key = String(payload.qrcode_key ?? "");
    if (!url || !key)
        throw new Error("二维码获取失败");
    return { url, key };
}
export async function pollLogin(key) {
    const data = await request("passport", "/x/passport-login/web/qrcode/poll", {
        qrcode_key: key,
    });
    assertOk(data, "登录状态获取失败");
    const payload = asRecord(data.data) ?? {};
    const code = Number(payload.code);
    if (code === 0) {
        const jump = String(payload.url ?? "");
        if (jump.startsWith("https://passport.bilibili.com")) {
            await request("passport", `${new URL(jump).pathname}${new URL(jump).search}`);
        }
        return "ok";
    }
    if (code === 86090)
        return "scanned";
    if (code === 86038)
        return "expired";
    return "wait";
}
