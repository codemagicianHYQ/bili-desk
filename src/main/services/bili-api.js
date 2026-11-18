import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import axios, { AxiosHeaders, } from "axios";
import { createHash } from "crypto";
import { session } from "electron";
import { defaultHeaders, getCsrf, invalidateWbiCache, signParams } from "./wbi";
import { decodeDmWebViewCommandDms } from "./dm-command-proto";
import { buildDashMpdXml } from "@shared/utils/bilibili-dash";
import { wrapMediaUrl, wrapMpd } from "./media-proxy";
import { BILI_DEFAULT_QN, canUseVipQuality, formatBiliQualityLabel, isVipQuality, mergePlayPrivilege, mergeQualityOptions, parsePlayPrivilegeFromPayload, parsePlayQualities, resolvePlayQn, vipQualityBlockedNotice, vipQualityTrialNotice, } from "@shared/utils/bilibili-quality";
import { appStore, getCookieString, isLoggedIn, setCookies, } from "../store/app-store";
import { BILI_SPECIAL_FOLLOW_TAG_ID } from "@shared/types";
import { addLiveEmote, parseHistoryItemEmotes, } from "@shared/utils/live-danmu-emotes";
const COOKIE_KEYS = [
    "SESSDATA",
    "bili_jct",
    "DedeUserID",
    "DedeUserID__ckMd5",
    "buvid3",
];
const TV_APPKEY = "4409e2ce8ffd12b8";
const TV_PLAYURL_HOST = "https://api.snm0516.aisee.tv";
const BV_XOR = 23442827791579n;
const BV_MASK = 2251799813685247n;
const BV_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
function bvToAid(bvid) {
    const chars = Array.from(bvid);
    if (chars.length < 12)
        return 0;
    [chars[3], chars[9]] = [chars[9], chars[3]];
    [chars[4], chars[7]] = [chars[7], chars[4]];
    const body = chars.slice(3);
    let tmp = 0n;
    for (const ch of body) {
        tmp = tmp * 58n + BigInt(BV_TABLE.indexOf(ch));
    }
    return Number((tmp & BV_MASK) ^ BV_XOR);
}
const TV_APPSEC = "59b43e04ad6965f34319062b478f83dd";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isFavMediaCountLimitMessage(message) {
    const text = String(message ?? "");
    return text.includes("收藏数量已达上限") || text.includes("内容收藏数量");
}
function applyRequestHeaders(cfg, extra) {
    const headers = AxiosHeaders.from(defaultHeaders());
    if (extra)
        headers.set(extra);
    headers.set(cfg.headers);
    headers.set("Cookie", getCookieString());
    cfg.headers = headers;
    return cfg;
}
function colorIntToHex(color) {
    const value = Math.max(0, Math.min(0xffffff, color >>> 0));
    return `#${value.toString(16).padStart(6, "0")}`;
}
/** mcdn 在桌面端经常一直缓冲，优先 upos / akamai */
function rankMediaUrl(url) {
    const value = url.toLowerCase();
    if (value.includes("mcdn.bilivideo") || value.includes(".mcdn."))
        return 0;
    if (value.includes("upos-sz-mirror"))
        return 4;
    if (value.includes("upos-sz"))
        return 3;
    if (value.includes("akamaized"))
        return 3;
    if (value.includes("upos"))
        return 2;
    return 1;
}
function orderMediaUrls(primary, backups) {
    const unique = [
        ...new Set([primary, ...(backups ?? [])].filter((item) => typeof item === "string" && item.length > 0)),
    ];
    if (unique.length === 0)
        return null;
    unique.sort((a, b) => rankMediaUrl(b) - rankMediaUrl(a));
    const playable = unique.filter((item) => rankMediaUrl(item) > 0);
    const list = playable.length > 0 ? playable : unique;
    return { url: list[0], backupUrls: list.slice(1) };
}
const BILI_CODE_TEXT = {
    [-101]: "账号未登录",
    [-111]: "csrf 校验失败，请重新登录",
    [-352]: "请求被风控拦截，请稍后重试或重新登录",
    [-400]: "请求参数错误",
    [-403]: "没有权限",
    [-404]: "内容不存在",
    [-412]: "请求被安全策略拦截，请稍后重试",
    [-509]: "请求过于频繁，请稍后再试",
    [-799]: "请求过于频繁，请稍后再试",
    62002: "视频不可见",
    62004: "视频审核中",
    62012: "视频已删除",
    4101129: "动态已删除",
    4101140: "动态已删除",
};
function looksGarbled(text) {
    return /[閱圑嚈�]/.test(text) || text.includes("\uFFFD");
}
function formatBiliApiError(data, fallback) {
    const code = Number(data?.code);
    const mapped = Number.isFinite(code) ? BILI_CODE_TEXT[code] : undefined;
    const raw = typeof data?.message === "string" ? data.message.trim() : "";
    const numericOnly = /^-?\d+$/.test(raw);
    const usable = Boolean(raw) && raw !== "0" && !numericOnly && !looksGarbled(raw);
    if (mapped && (!usable || raw === mapped))
        return mapped;
    if (usable)
        return raw;
    if (mapped)
        return mapped;
    if (Number.isFinite(code) && code !== 0)
        return `${fallback}（错误码 ${code}）`;
    return fallback;
}
function decodeXmlEntities(text) {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
        .replace(/&amp;/g, "&");
}
function commandKindOf(command) {
    if (command === "#GRADE#")
        return "grade";
    if (command === "#VOTE#")
        return "vote";
    if (command === "#ATTENTION#")
        return "attention";
    return "other";
}
function normalizeCommandDanmaku(raw) {
    let extra = {};
    try {
        extra = raw.extra ? JSON.parse(raw.extra) : {};
    }
    catch {
        extra = {};
    }
    const kind = commandKindOf(raw.command);
    const optionsRaw = Array.isArray(extra.options) ? extra.options : [];
    const options = optionsRaw
        .map((item) => {
        const row = (item ?? {});
        return {
            idx: Number(row.idx) || 0,
            desc: String(row.desc ?? ""),
            count: Number(row.cnt ?? row.count) || 0,
            hasSelfDef: Boolean(Number(row.has_self_def) || row.has_self_def === true),
        };
    })
        .filter((item) => item.idx > 0);
    const title = String(extra.msg ?? "") ||
        String(extra.question ?? "") ||
        raw.content ||
        "";
    return {
        id: raw.id || `${raw.command}:${raw.progress}`,
        command: raw.command,
        kind,
        progress: Math.max(0, Number(raw.progress) || 0),
        duration: Math.max(3000, Number(extra.duration) || (kind === "vote" ? 7000 : 5000)),
        content: raw.content || title,
        title,
        count: Number(extra.count ?? extra.cnt) || 0,
        gradeId: Number(extra.grade_id) || undefined,
        midScore: Number(extra.mid_score) || 0,
        avgScore: extra.avg_score == null || extra.avg_score === ""
            ? undefined
            : Number(extra.avg_score),
        voteId: Number(extra.vote_id) || undefined,
        voteType: Number(extra.vote_type) || 0,
        myVote: Number(extra.my_vote) || 0,
        options: options.length > 0 ? options : undefined,
        skinFontColor: String(extra.skin_font_color ?? "") || undefined,
    };
}
/** 解析经典弹幕 XML（`<d p="time,mode,size,color,...">text</d>`） */
const MAX_DANMAKU_ITEMS = 4000;
function parseDanmakuXml(xml) {
    const items = [];
    // 超大弹幕 XML 直接截断，避免 IPC/主进程内存暴涨
    const source = xml.length > 2_000_000 ? xml.slice(0, 2_000_000) : xml;
    const regex = /<d p="([^"]+)">([^<]*)<\/d>/g;
    let match;
    while ((match = regex.exec(source)) != null) {
        if (items.length >= MAX_DANMAKU_ITEMS)
            break;
        const attrs = match[1]?.split(",") ?? [];
        const time = Number.parseFloat(attrs[0] ?? "0");
        const modeNum = Number.parseInt(attrs[1] ?? "1", 10);
        const color = Number.parseInt(attrs[3] ?? "16777215", 10);
        const text = decodeXmlEntities(match[2] ?? "").trim();
        if (!text || !Number.isFinite(time))
            continue;
        const id = (attrs[7] ?? "").trim();
        const midHash = (attrs[6] ?? "").trim();
        const item = {
            text,
            time,
            color: colorIntToHex(Number.isFinite(color) ? color : 16777215),
            mode: modeNum === 5 ? 1 : modeNum === 4 ? 2 : 0,
        };
        if (id)
            item.id = id;
        if (midHash)
            item.midHash = midHash;
        items.push(item);
    }
    return items;
}
function explainVideoViewError(code, message) {
    const text = message.trim();
    if (code === 62012 || /已删除/.test(text))
        return "视频已删除";
    if (code === 62002 || /不可见/.test(text))
        return "视频不可见";
    if (code === 62004 || /审核/.test(text))
        return "视频审核中";
    if (code === -404 || code === 404 || /啥都木有|不存在/.test(text)) {
        return "视频不存在";
    }
    if (code === -403 || /权限不足|访问权限/.test(text))
        return "没有权限观看该视频";
    if (text && !/^-?\d+$/.test(text))
        return text;
    return "视频信息获取失败";
}
function explainDynamicDetailError(code, message) {
    const text = message.trim();
    if (/删除/.test(text))
        return "动态已删除";
    if (/不可见|仅自己可见|权限/.test(text))
        return "动态不可见";
    if (/不存在|失效|下架/.test(text))
        return "动态不存在或已失效";
    if (code === 4101140 || code === 4101129)
        return "动态已删除";
    if (text && !/^-?\d+$/.test(text))
        return text;
    return "动态不存在或已失效";
}
export const BILI_RISK_CONTROL_MESSAGE = "请求被 B 站安全策略拦截，请稍后重试";
class BiliApiService {
    client;
    passportClient;
    memberClient;
    liveClient;
    playQualityCache = new Map();
    static MAIN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    pruneBoundedMap(map, maxSize, getAt) {
        const now = Date.now();
        for (const [key, value] of map) {
            if (now - getAt(value) > BiliApiService.MAIN_CACHE_TTL_MS) {
                map.delete(key);
            }
        }
        while (map.size > maxSize) {
            const first = map.keys().next().value;
            if (first == null)
                break;
            map.delete(first);
        }
    }
    constructor() {
        this.client = axios.create({
            baseURL: "https://api.bilibili.com",
            timeout: 15000,
        });
        this.passportClient = axios.create({
            baseURL: "https://passport.bilibili.com",
            timeout: 15000,
        });
        this.memberClient = axios.create({
            baseURL: "https://member.bilibili.com",
            timeout: 15000,
        });
        this.liveClient = axios.create({
            baseURL: "https://api.live.bilibili.com",
            timeout: 15000,
        });
        this.client.interceptors.request.use(async (cfg) => {
            await this.ensureBuvid3();
            return applyRequestHeaders(cfg);
        });
        this.passportClient.interceptors.request.use(async (cfg) => {
            await this.ensureBuvid3();
            return applyRequestHeaders(cfg);
        });
        this.memberClient.interceptors.request.use(async (cfg) => {
            await this.ensureBuvid3();
            return applyRequestHeaders(cfg);
        });
        this.liveClient.interceptors.request.use(async (cfg) => {
            await this.ensureBuvid3();
            return applyRequestHeaders(cfg, {
                Referer: "https://live.bilibili.com/",
                Origin: "https://live.bilibili.com",
            });
        });
    }
    buildTvSignedParams(extra) {
        const ts = Math.floor(Date.now() / 1000);
        const params = {
            appkey: TV_APPKEY,
            ts: String(ts),
            ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, String(value)])),
        };
        const query = Object.keys(params)
            .sort()
            .map((key) => `${key}=${params[key]}`)
            .join("&");
        params.sign = createHash("md5")
            .update(query + TV_APPSEC)
            .digest("hex");
        return params;
    }
    toFormBody(params) {
        return new URLSearchParams(Object.entries(params));
    }
    async getQrCode() {
        await this.ensureBuvid3();
        const res = await this.passportClient.post("/x/passport-tv-login/qrcode/auth_code", this.toFormBody(this.buildTvSignedParams({ local_id: 0 })), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            validateStatus: () => true,
        });
        const data = res.data?.data;
        if (res.data?.code !== 0 || !data?.url || !data?.auth_code) {
            throw new Error(this.formatPassportError(res.data?.message, res.status));
        }
        return { url: data.url, qrcodeKey: data.auth_code };
    }
    async pollLogin(qrcodeKey) {
        const res = await this.passportClient.post("/x/passport-tv-login/qrcode/poll", this.toFormBody(this.buildTvSignedParams({ auth_code: qrcodeKey, local_id: 0 })), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            return {
                status: "failed",
                message: "请求被 B 站安全策略拦截，请稍后重试或更换网络",
            };
        }
        const code = res.data?.code;
        if (code === 86038)
            return { status: "expired" };
        if (code === 86039)
            return { status: "waiting" };
        if (code === 86090)
            return { status: "scanned" };
        if (code === 0 && res.data?.data) {
            await this.applyCookiesFromTvLogin(res.data.data);
            this.saveTvTokens(res.data.data);
            const user = await this.fetchCurrentUser();
            if (!user?.isLogin) {
                return {
                    status: "failed",
                    message: "登录成功但未能读取用户信息，请重试",
                };
            }
            return { status: "confirmed", user };
        }
        if (code !== undefined && code !== 0) {
            return {
                status: "failed",
                message: this.formatPassportError(res.data?.message, res.status),
            };
        }
        return { status: "waiting" };
    }
    saveTvTokens(payload) {
        const tokenInfo = payload.token_info;
        const accessToken = String(tokenInfo?.access_token ?? payload.access_token ?? "");
        const refreshToken = String(tokenInfo?.refresh_token ?? payload.refresh_token ?? "");
        const expiresIn = Number(tokenInfo?.expires_in ?? payload.expires_in) || 0;
        if (accessToken)
            appStore.set("accessToken", accessToken);
        if (refreshToken)
            appStore.set("refreshToken", refreshToken);
        if (expiresIn > 0) {
            appStore.set("tokenExpiresAt", Date.now() + expiresIn * 1000);
        }
    }
    loginRefreshTask = null;
    lastLoginCheckAt = 0;
    static LOGIN_CHECK_GAP_MS = 10 * 60 * 1000;
    static TOKEN_RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
    /**
     * 登录续期：Cookie 被服务端标记需要刷新、已失效，或令牌 7 天内到期时，
     * 用 TV 扫码拿到的 refresh_token 换新令牌和 Cookie。返回是否刷新过。
     */
    keepLoginFresh() {
        if (this.loginRefreshTask)
            return this.loginRefreshTask;
        if (Date.now() - this.lastLoginCheckAt <
            BiliApiService.LOGIN_CHECK_GAP_MS) {
            return Promise.resolve(false);
        }
        this.lastLoginCheckAt = Date.now();
        this.loginRefreshTask = this.runLoginRefresh()
            .catch((err) => {
            console.warn("[BiliDesk][login-refresh]", err);
            return false;
        })
            .finally(() => {
            this.loginRefreshTask = null;
        });
        return this.loginRefreshTask;
    }
    async runLoginRefresh() {
        const accessToken = appStore.get("accessToken");
        const refreshToken = appStore.get("refreshToken");
        if (!accessToken || !refreshToken)
            return false;
        const expiresAt = appStore.get("tokenExpiresAt");
        let needRefresh = expiresAt > 0 &&
            expiresAt - Date.now() < BiliApiService.TOKEN_RENEW_BEFORE_MS;
        if (!needRefresh) {
            if (!isLoggedIn()) {
                needRefresh = true;
            }
            else {
                const res = await this.passportClient.get("/x/passport-login/web/cookie/info", { params: { csrf: getCsrf() }, validateStatus: () => true });
                const code = Number(res.data?.code);
                needRefresh =
                    code === -101 || (code === 0 && Boolean(res.data?.data?.refresh));
            }
        }
        if (!needRefresh)
            return false;
        const res = await this.passportClient.post("/x/passport-login/oauth2/refresh_token", this.toFormBody(this.buildTvSignedParams({
            access_key: accessToken,
            refresh_token: refreshToken,
        })), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0 || !res.data?.data) {
            console.warn(`[BiliDesk][login-refresh] ${formatBiliApiError(res.data, "令牌刷新失败")}`);
            return false;
        }
        const data = res.data.data;
        await this.applyCookiesFromTvLogin(data);
        this.saveTvTokens(data);
        invalidateWbiCache();
        await this.fetchCurrentUser();
        return true;
    }
    formatPassportError(message, status) {
        const text = typeof message === "string" && message.trim() ? message : "";
        if (status === 412 || text.includes("banned")) {
            return "请求被 B 站安全策略拦截，请稍后重试或更换网络";
        }
        return text || "登录请求失败，请重试";
    }
    async applyCookiesFromTvLogin(data) {
        const cookies = data.cookie_info?.cookies ?? [];
        const map = {};
        for (const cookie of cookies) {
            if (COOKIE_KEYS.includes(cookie.name)) {
                map[cookie.name] = cookie.value;
            }
        }
        if (map.SESSDATA) {
            appStore.set("cookies", { ...appStore.get("cookies"), ...map });
            await this.applyCookiesToSession();
        }
    }
    async finalizeLogin(crossUrl, pollRes) {
        this.parseCookiesFromHeaders(pollRes);
        if (crossUrl) {
            const decoded = crossUrl.replace(/\\u0026/g, "&");
            this.parseCookiesFromCrossDomainUrl(decoded);
            try {
                const crossRes = await axios.get(decoded, {
                    headers: defaultHeaders(),
                    maxRedirects: 5,
                    validateStatus: () => true,
                });
                this.parseCookiesFromHeaders(crossRes);
            }
            catch {
                // crossDomain request is best-effort
            }
        }
        await this.syncCookiesFromSession();
        await this.applyCookiesToSession();
    }
    parseCookiesFromCrossDomainUrl(crossUrl) {
        try {
            const query = crossUrl.includes("?") ? crossUrl.split("?")[1] : crossUrl;
            const params = new URLSearchParams(query);
            let SESSDATA = params.get("SESSDATA");
            if (!SESSDATA) {
                const match = query.match(/SESSDATA=([^&]+)/);
                SESSDATA = match ? decodeURIComponent(match[1]) : null;
            }
            if (!SESSDATA)
                return;
            const readParam = (key) => {
                const value = params.get(key);
                if (value)
                    return value;
                const match = query.match(new RegExp(`${key}=([^&]+)`));
                return match ? decodeURIComponent(match[1]) : null;
            };
            appStore.set("cookies", {
                ...appStore.get("cookies"),
                SESSDATA,
                bili_jct: readParam("bili_jct") ?? appStore.get("cookies").bili_jct,
                DedeUserID: readParam("DedeUserID") ?? appStore.get("cookies").DedeUserID,
                DedeUserID__ckMd5: readParam("DedeUserID__ckMd5") ??
                    appStore.get("cookies").DedeUserID__ckMd5,
            });
        }
        catch {
            // ignore malformed url
        }
    }
    async applyCookiesToSession() {
        const c = appStore.get("cookies");
        const pairs = [
            ["SESSDATA", c.SESSDATA],
            ["bili_jct", c.bili_jct],
            ["DedeUserID", c.DedeUserID],
            ["DedeUserID__ckMd5", c.DedeUserID__ckMd5],
            ["buvid3", c.buvid3],
        ];
        for (const [name, value] of pairs) {
            if (!value)
                continue;
            await session.defaultSession.cookies.set({
                url: "https://www.bilibili.com",
                name,
                value,
                domain: ".bilibili.com",
                path: "/",
                secure: true,
            });
        }
    }
    async syncCookiesFromSession() {
        const urls = ["https://www.bilibili.com", "https://passport.bilibili.com"];
        const map = {};
        for (const url of urls) {
            const cookies = await session.defaultSession.cookies.get({ url });
            for (const name of COOKIE_KEYS) {
                if (map[name])
                    continue;
                const found = cookies.find((c) => c.name === name);
                if (found?.value)
                    map[name] = found.value;
            }
        }
        if (map.SESSDATA) {
            appStore.set("cookies", { ...appStore.get("cookies"), ...map });
        }
    }
    parseCookiesFromHeaders(res) {
        const setCookies = res.headers["set-cookie"] ?? [];
        const map = {};
        for (const raw of setCookies) {
            const part = raw.split(";")[0];
            const eq = part.indexOf("=");
            if (eq === -1)
                continue;
            const key = part.slice(0, eq).trim();
            const value = part.slice(eq + 1);
            map[key] = decodeURIComponent(value);
        }
        if (map.SESSDATA) {
            appStore.set("cookies", {
                ...appStore.get("cookies"),
                SESSDATA: map.SESSDATA,
                bili_jct: map.bili_jct ?? appStore.get("cookies").bili_jct,
                DedeUserID: map.DedeUserID ?? appStore.get("cookies").DedeUserID,
                DedeUserID__ckMd5: map.DedeUserID__ckMd5 ?? appStore.get("cookies").DedeUserID__ckMd5,
                buvid3: map.buvid3 ?? appStore.get("cookies").buvid3,
            });
        }
    }
    async fetchCurrentUser() {
        await this.ensureBuvid3();
        if (!isLoggedIn()) {
            return { mid: 0, name: "未登录", face: "", isLogin: false, isVip: false };
        }
        try {
            const res = await this.client.get("/x/web-interface/nav");
            const data = res.data?.data;
            if (data?.isLogin) {
                const user = {
                    mid: data.mid,
                    name: data.uname,
                    face: data.face,
                    isLogin: true,
                    isVip: Number(data.vip?.status) === 1 || Number(data.vipStatus) === 1,
                };
                appStore.set("user", user);
                return user;
            }
        }
        catch {
            // fall through to cookie-based fallback
        }
        const dedeId = Number(appStore.get("cookies").DedeUserID);
        if (dedeId > 0) {
            const user = {
                mid: dedeId,
                name: `UID ${dedeId}`,
                face: "",
                isLogin: true,
                isVip: false,
            };
            appStore.set("user", user);
            return user;
        }
        return { mid: 0, name: "未登录", face: "", isLogin: false, isVip: false };
    }
    async ensureBuvid3() {
        if (appStore.get("cookies").buvid3)
            return;
        try {
            const spiRes = await axios.get("https://api.bilibili.com/x/frontend/finger/spi", {
                headers: defaultHeaders(),
                timeout: 10000,
                validateStatus: () => true,
            });
            const b3 = spiRes.data?.data?.b_3;
            if (b3) {
                setCookies({ buvid3: b3 });
                return;
            }
        }
        catch {
            // fallback below
        }
        try {
            const res = await axios.get("https://www.bilibili.com/", {
                headers: defaultHeaders(),
                maxRedirects: 0,
                validateStatus: (s) => s < 400,
            });
            this.parseCookiesFromHeaders(res);
            await this.syncCookiesFromSession();
        }
        catch {
            // ignore
        }
    }
    async getRecommend(options) {
        await this.ensureBuvid3();
        const freshIdx = options?.freshIdx ?? 1;
        const freshIdx1h = options?.freshIdx1h ?? freshIdx;
        const ps = options?.ps ?? 20;
        let items = [];
        try {
            const params = await signParams({
                ps,
                fresh_idx: freshIdx,
                fresh_idx_1h: freshIdx1h,
            });
            const res = await this.client.get("/x/web-interface/wbi/index/top/feed/rcmd", { params });
            items = res.data?.data?.item ?? [];
        }
        catch {
            const res = await this.client.get("/x/web-interface/index/top/feed/rcmd", {
                params: { ps, fresh_idx: freshIdx, fresh_idx_1h: freshIdx1h },
            });
            items = res.data?.data?.item ?? [];
        }
        const videos = this.normalizeRecommendItems(items);
        return {
            videos,
            freshIdx: freshIdx + 1,
            hasMore: videos.length > 0,
        };
    }
    async getPopularVideos(page = 1) {
        await this.ensureBuvid3();
        const pn = Math.max(1, page);
        const ps = 20;
        const res = await this.client.get("/x/web-interface/popular", {
            params: { pn, ps },
            headers: { Referer: "https://www.bilibili.com/v/popular/all" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "热门列表获取失败"));
        }
        const list = (res.data?.data?.list ?? []);
        const videos = this.normalizePopularItems(list);
        return {
            videos,
            page: pn,
            hasMore: !res.data?.data?.no_more && videos.length > 0,
        };
    }
    /** 官方综合热门固定约 500 条，ps 最大 50，一次拉完前端再分区 / 分页 */
    async getAllPopularVideos() {
        await this.ensureBuvid3();
        const all = [];
        const seen = new Set();
        for (let pn = 1; pn <= 15; pn++) {
            const res = await this.client.get("/x/web-interface/popular", {
                params: { pn, ps: 50 },
                headers: { Referer: "https://www.bilibili.com/v/popular/all" },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                if (all.length > 0)
                    break;
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (res.data?.code !== 0) {
                if (all.length > 0)
                    break;
                throw new Error(formatBiliApiError(res.data, "热门列表获取失败"));
            }
            const list = (res.data?.data?.list ?? []);
            for (const video of this.normalizePopularItems(list)) {
                if (seen.has(video.bvid))
                    continue;
                seen.add(video.bvid);
                all.push({ ...video, rank: all.length + 1 });
            }
            if (res.data?.data?.no_more || list.length === 0)
                break;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return all;
    }
    async getWeeklySeriesList() {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/web-interface/popular/series/list", {
            headers: { Referer: "https://www.bilibili.com/v/popular/weekly" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "每周必看期数获取失败"));
        }
        const list = (res.data?.data?.list ?? []);
        return list
            .filter((item) => Boolean(item && typeof item === "object"))
            .map((item) => ({
            number: Number(item.number) || 0,
            name: String(item.name ?? ""),
            subject: String(item.subject ?? ""),
            status: Number(item.status) || 0,
        }))
            .filter((item) => item.number > 0);
    }
    async getWeeklySeries(number) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/web-interface/popular/series/one", {
            params: { number },
            headers: { Referer: "https://www.bilibili.com/v/popular/weekly" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "每周必看获取失败"));
        }
        const data = (res.data?.data ?? {});
        const config = (data.config ?? {});
        const videos = this.normalizePopularItems((data.list ?? []));
        return {
            number: Number(config.number) || number,
            name: String(config.name ?? ""),
            subject: String(config.subject ?? ""),
            reminder: String(data.reminder ?? config.reminder ?? ""),
            videos,
        };
    }
    async getPreciousVideos() {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/web-interface/popular/precious", {
            params: { page_size: 100, page: 1 },
            headers: { Referer: "https://www.bilibili.com/v/popular/history" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "入站必刷获取失败"));
        }
        const data = (res.data?.data ?? {});
        return {
            title: String(data.title ?? "入站必刷"),
            explain: String(data.explain ?? ""),
            videos: this.normalizePopularItems((data.list ?? [])),
        };
    }
    async getRankingVideos(rid = 0) {
        await this.ensureBuvid3();
        const baseParams = {
            rid,
            type: "all",
            web_location: "333.934",
        };
        const fetchRanking = async (params) => this.client.get("/x/web-interface/ranking/v2", {
            params,
            headers: { Referer: "https://www.bilibili.com/v/popular/rank/all" },
            validateStatus: () => true,
        });
        let res = await fetchRanking(await signParams(baseParams));
        if (res.data?.code !== 0) {
            res = await fetchRanking(baseParams);
        }
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "排行榜获取失败"));
        }
        const list = (res.data?.data?.list ?? []);
        return this.normalizePopularItems(list, true);
    }
    async getMusicRankPeriods() {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/copyright-music-publicity/toplist/all_period", {
            params: { list_type: 1 },
            headers: { Referer: "https://www.bilibili.com/v/popular/music" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "音乐榜期数获取失败"));
        }
        const years = (res.data?.data?.list ?? {});
        const periods = [];
        for (const yearItems of Object.values(years)) {
            if (!Array.isArray(yearItems))
                continue;
            for (const raw of yearItems) {
                if (!raw || typeof raw !== "object")
                    continue;
                const item = raw;
                const listId = Number(item.ID ?? item.id) || 0;
                if (!listId)
                    continue;
                periods.push({
                    listId,
                    period: Number(item.priod ?? item.period) || 0,
                    publishTime: Number(item.publish_time) || 0,
                });
            }
        }
        periods.sort((a, b) => b.listId - a.listId);
        return periods;
    }
    async getMusicRankList(listId) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/copyright-music-publicity/toplist/music_list", {
            params: { list_id: listId },
            headers: { Referer: "https://www.bilibili.com/v/popular/music" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "音乐榜获取失败"));
        }
        const list = (res.data?.data?.list ?? []);
        return list
            .filter((item) => Boolean(item && typeof item === "object"))
            .map((item) => {
            const bvid = String(item.creation_bvid || item.mv_bvid || "");
            const cover = String(item.creation_cover || item.mv_cover || item.cover || "");
            return {
                rank: Number(item.rank) || 0,
                musicId: String(item.music_id ?? ""),
                title: String(item.music_title ?? item.title ?? ""),
                singer: String(item.singer ?? ""),
                cover: this.normalizeVideoCoverUrl(cover),
                heat: Number(item.heat) || 0,
                bvid,
                aid: Number(item.creation_aid || item.mv_aid) || 0,
                upName: String(item.creation_nickname ?? ""),
                play: Number(item.creation_play) || 0,
                duration: Number(item.creation_duration) || 0,
                reason: String(item.creation_reason ?? item.recommendation ?? ""),
            };
        });
    }
    normalizeRecommendItems(items) {
        return items
            .filter((item) => Boolean(item && typeof item === "object"))
            .filter((item) => item.bvid)
            .map((item) => {
            const video = this.normalizeVideo(item);
            const trackId = String(item.track_id ?? "").trim();
            return trackId ? { ...video, trackId } : video;
        });
    }
    pickRcmdReason(item) {
        const reason = item.rcmd_reason;
        if (typeof reason === "string")
            return reason.trim();
        if (reason && typeof reason === "object") {
            const content = reason.content;
            if (typeof content === "string")
                return content.trim();
        }
        return "";
    }
    normalizePopularItems(items, withRank = false) {
        return items
            .filter((item) => Boolean(item && typeof item === "object"))
            .filter((item) => item.bvid)
            .map((item, index) => {
            const owner = (item.owner ?? {});
            const stat = (item.stat ?? {});
            const partitionId = Number(item.pid_v2) || 0;
            const partition = String(item.pid_name_v2 ?? "").trim();
            const subPartition = String(item.tnamev2 || item.tname || "").trim();
            return this.withChargeBadge({
                ...(partitionId ? { partitionId } : {}),
                ...(partition ? { partition } : {}),
                ...(subPartition ? { subPartition } : {}),
                bvid: String(item.bvid ?? ""),
                aid: Number(item.aid) || Number(item.id) || 0,
                title: String(item.title ?? ""),
                cover: this.normalizeVideoCoverUrl(String(item.pic ?? item.cover ?? "")),
                duration: Number(item.duration) || 0,
                play: Number(stat.view) || Number(item.play) || 0,
                danmaku: Number(stat.danmaku) || 0,
                reply: Number(stat.reply) || 0,
                like: Number(stat.like) || 0,
                share: Number(stat.share) || 0,
                rcmdReason: this.pickRcmdReason(item),
                rank: withRank ? index + 1 : undefined,
                owner: {
                    mid: Number(owner.mid) || 0,
                    name: String(owner.name ?? ""),
                    face: String(owner.face ?? ""),
                },
                pubdate: Number(item.pubdate) || Number(item.ctime) || 0,
            }, item);
        });
    }
    async getLiveRecommend(page = 1) {
        await this.ensureBuvid3();
        const pageSize = 30;
        // 分区人气列表：比 getMoreRecList 更偏「发现」，登录态也不会几乎全是已关注
        const parentAreas = [9, 2, 3, 1, 10, 5, 11, 6, 14, 15];
        const parseHasMore = (data, roomsLen) => {
            const flag = data?.has_more ?? data?.hasMore;
            if (typeof flag === "boolean")
                return flag;
            if (typeof flag === "number")
                return flag > 0;
            return roomsLen >= Math.min(10, pageSize);
        };
        const tryUserRecommend = async () => {
            const res = await this.liveClient.get("/xlive/web-interface/v1/second/getUserRecommend", {
                params: {
                    platform: "web",
                    page,
                    page_size: pageSize,
                },
            });
            if (res.data?.code !== 0)
                return null;
            const data = (res.data?.data ?? {});
            const list = (data.list ?? data.recommend_room_list ?? []);
            const rooms = this.normalizeLiveRoomItems(list);
            if (rooms.length === 0)
                return null;
            return {
                rooms,
                page,
                hasMore: parseHasMore(data, rooms.length),
            };
        };
        const tryAreaOnlineList = async () => {
            const parent = parentAreas[(Math.max(page, 1) - 1) % parentAreas.length] ?? 9;
            const areaPage = Math.floor((Math.max(page, 1) - 1) / parentAreas.length) + 1;
            const res = await this.liveClient.get("/xlive/web-interface/v1/second/getList", {
                params: {
                    platform: "web",
                    parent_area_id: parent,
                    area_id: 0,
                    sort_type: "online",
                    page: areaPage,
                },
            });
            if (res.data?.code !== 0)
                return null;
            const data = (res.data?.data ?? {});
            const list = (data.list ?? []);
            const rooms = this.normalizeLiveRoomItems(list);
            if (rooms.length === 0)
                return null;
            return {
                rooms,
                page,
                hasMore: parseHasMore(data, rooms.length),
            };
        };
        const tryHomepageRec = async () => {
            if (page > 1)
                return null;
            const endpoints = [
                "/xlive/web-interface/v1/webMain/getList",
                "/xlive/web-interface/v1/index/getList",
            ];
            for (const path of endpoints) {
                try {
                    const res = await this.liveClient.get(path, {
                        params: { platform: "web" },
                    });
                    if (res.data?.code !== 0)
                        continue;
                    const data = (res.data?.data ?? {});
                    const rooms = this.normalizeLiveRoomItems((data.recommend_room_list ?? data.list ?? []));
                    if (rooms.length === 0)
                        continue;
                    // 首页接口不可分页，交给分区/推荐接口继续翻
                    return { rooms, page, hasMore: true };
                }
                catch {
                    // try next
                }
            }
            return null;
        };
        let lastError = "获取直播推荐失败";
        // 优先分区人气（真正发现流），再个性化推荐；避免先打 getMoreRecList 几乎全是已关注且无法翻页
        for (const fetchPage of [
            tryAreaOnlineList,
            tryUserRecommend,
            tryHomepageRec,
        ]) {
            try {
                const result = await fetchPage();
                if (result && result.rooms.length > 0)
                    return result;
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : lastError;
            }
        }
        if (page > 1) {
            return { rooms: [], page, hasMore: false };
        }
        throw new Error(lastError);
    }
    async getFollowingLives() {
        if (!isLoggedIn()) {
            return { rooms: [], count: 0 };
        }
        await this.ensureBuvid3();
        // hit_ab=false：前 10 条字段更全；hit_ab=true：可拉全量（roomid 常为 0，需用 room_id）
        const [briefRes, fullRes] = await Promise.all([
            this.liveClient
                .get("/xlive/web-ucenter/v1/xfetter/GetWebList", {
                params: { hit_ab: "false" },
            })
                .catch(() => null),
            this.liveClient
                .get("/xlive/web-ucenter/v1/xfetter/GetWebList", {
                params: { hit_ab: "true" },
            })
                .catch(() => null),
        ]);
        const briefCode = briefRes?.data?.code;
        const fullCode = fullRes?.data?.code;
        if (briefCode !== 0 && fullCode !== 0) {
            const message = briefRes?.data?.message ||
                fullRes?.data?.message ||
                "获取关注直播失败";
            throw new Error(message);
        }
        const briefList = (briefRes?.data?.data?.rooms ??
            briefRes?.data?.data?.list ??
            []);
        const fullList = (fullRes?.data?.data?.rooms ??
            fullRes?.data?.data?.list ??
            []);
        const briefRooms = this.normalizeLiveRoomItems(briefList);
        const fullRooms = this.normalizeLiveRoomItems(fullList);
        const byId = new Map();
        for (const room of [...briefRooms, ...fullRooms]) {
            const prev = byId.get(room.roomId);
            if (!prev) {
                byId.set(room.roomId, room);
                continue;
            }
            byId.set(room.roomId, {
                ...prev,
                ...room,
                title: room.title || prev.title,
                uname: room.uname || prev.uname,
                face: room.face || prev.face,
                cover: room.cover || prev.cover,
            });
        }
        let rooms = [...byId.values()].filter((room) => room.liveStatus === 1 || room.liveStatus === 2);
        const count = Number(briefRes?.data?.data?.count) ||
            Number(fullRes?.data?.data?.count) ||
            rooms.length;
        // GetWebList 全量偶发丢字段时，用分页 following 接口补齐
        if (count > 0 && rooms.length < count) {
            const fallback = await this.fetchFollowingLivesByPages().catch(() => null);
            if (fallback && fallback.rooms.length > rooms.length) {
                for (const room of fallback.rooms) {
                    const prev = byId.get(room.roomId);
                    if (!prev) {
                        byId.set(room.roomId, room);
                        continue;
                    }
                    byId.set(room.roomId, {
                        ...prev,
                        ...room,
                        title: room.title || prev.title,
                        uname: room.uname || prev.uname,
                        face: room.face || prev.face,
                        cover: room.cover || prev.cover,
                    });
                }
                rooms = [...byId.values()].filter((room) => room.liveStatus === 1 || room.liveStatus === 2);
            }
            return {
                rooms,
                count: Math.max(count, fallback?.count ?? 0, rooms.length),
            };
        }
        return { rooms, count: count || rooms.length };
    }
    /** 分页拉取关注直播（含未开播），用于 GetWebList 全量不足时兜底 */
    async fetchFollowingLivesByPages() {
        const pageSize = 10;
        const maxPages = 30;
        const rooms = [];
        let liveCount = 0;
        let totalPage = 1;
        for (let page = 1; page <= maxPages; page++) {
            const res = await this.liveClient.get("/xlive/web-ucenter/user/following", {
                params: {
                    page,
                    page_size: pageSize,
                    ignoreRecord: 1,
                    hit_ab: "true",
                },
            });
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "获取关注直播分页失败");
            }
            const data = (res.data?.data ?? {});
            liveCount = Number(data.live_count ?? liveCount) || liveCount;
            totalPage = Number(data.totalPage ?? totalPage) || totalPage;
            const list = (data.list ?? []);
            const pageRooms = this.normalizeLiveRoomItems(list).filter((room) => room.liveStatus === 1 || room.liveStatus === 2);
            rooms.push(...pageRooms);
            // 正在直播通常排在前面；本页已无直播且已凑够数量则可提前结束
            if ((liveCount > 0 && rooms.length >= liveCount) ||
                (pageRooms.length === 0 && rooms.length > 0) ||
                page >= totalPage) {
                break;
            }
        }
        const byId = new Map();
        for (const room of rooms) {
            if (!byId.has(room.roomId))
                byId.set(room.roomId, room);
        }
        const deduped = [...byId.values()];
        return {
            rooms: deduped,
            count: liveCount || deduped.length,
        };
    }
    async getLiveRoom(roomId) {
        await this.ensureBuvid3();
        const res = await this.liveClient.get("/xlive/web-room/v1/index/getInfoByRoom", { params: { room_id: roomId } });
        if (res.data?.code === 0 && res.data?.data) {
            const data = res.data.data;
            const roomInfo = (data.room_info ?? {});
            const anchor = (data.anchor_info ?? {});
            const baseInfo = (anchor.base_info ?? {});
            return {
                roomId: Number(roomInfo.room_id ?? roomId),
                shortId: Number(roomInfo.short_id) || undefined,
                title: String(roomInfo.title ?? "直播间"),
                cover: this.normalizeHttps(String(roomInfo.cover ?? roomInfo.keyframe ?? "")),
                online: Number(roomInfo.online ?? 0),
                ...this.parseLiveWatched(data, roomInfo),
                viewers: this.parseLiveViewers(data),
                areaName: String(roomInfo.area_name ?? ""),
                parentAreaName: String(roomInfo.parent_area_name ?? "") || undefined,
                liveStatus: Number(roomInfo.live_status ?? 0),
                liveStartTime: Number(roomInfo.live_start_time) || undefined,
                description: String(roomInfo.description ?? "") || undefined,
                uid: Number(roomInfo.uid ?? baseInfo.uid ?? 0),
                uname: String(baseInfo.uname ?? ""),
                face: this.normalizeHttps(String(baseInfo.face ?? "")),
            };
        }
        // 降级：基础房间信息
        const basic = await this.liveClient.get("/room/v1/Room/get_info", {
            params: { room_id: roomId },
        });
        if (basic.data?.code !== 0 || !basic.data?.data) {
            throw new Error(res.data?.message ||
                basic.data?.message ||
                "直播间信息获取失败");
        }
        const info = basic.data.data;
        return {
            roomId: Number(info.room_id ?? roomId),
            shortId: Number(info.short_id) || undefined,
            title: String(info.title ?? "直播间"),
            cover: this.normalizeHttps(String(info.user_cover ?? info.keyframe ?? "")),
            online: Number(info.online ?? 0),
            ...this.parseLiveWatched(info, info),
            areaName: String(info.area_name ?? ""),
            parentAreaName: String(info.parent_area_name ?? "") || undefined,
            liveStatus: Number(info.live_status ?? 0),
            liveStartTime: Number(info.live_time) || undefined,
            description: String(info.description ?? "") || undefined,
            uid: Number(info.uid ?? 0),
            uname: "",
            face: "",
        };
    }
    async getLivePlayUrl(roomId, qn = 400) {
        await this.ensureBuvid3();
        const requestPlayInfo = async (quality) => {
            // 同时要 AVC/HEVC/AV1：仅 codec=0 时部分房间会返回空流
            const res = await this.liveClient.get("/xlive/web-room/v2/index/getRoomPlayInfo", {
                params: {
                    room_id: roomId,
                    no_playurl: 0,
                    mask: 1,
                    protocol: "0,1",
                    format: "0,1,2",
                    codec: "0,1,2",
                    qn: quality,
                    platform: "web",
                    ptype: 8,
                    dolby: 5,
                    panorama: 1,
                },
            });
            return res;
        };
        let res = await requestPlayInfo(qn);
        if (res.data?.code !== 0) {
            const code = Number(res.data?.code);
            const message = String(res.data?.message ?? "").trim();
            if (code === -352) {
                throw new Error("直播流风控校验失败，请稍后重试或重新登录");
            }
            throw new Error(message || "获取直播流失败");
        }
        let data = res.data?.data;
        const liveStatus = Number(data?.live_status ?? 0);
        if (liveStatus !== 1) {
            throw new Error(liveStatus === 2 ? "主播轮播中" : "主播未开播");
        }
        let playurl = (data?.playurl_info
            ?.playurl ?? {});
        let gQnDesc = (playurl.g_qn_desc ?? []);
        let streams = (playurl.stream ?? []);
        let picked = this.pickLiveStreamUrl(streams, qn);
        // 指定清晰度可能无对应编码，回退自动清晰度再试一次
        if (!picked && qn !== 0) {
            res = await requestPlayInfo(0);
            if (res.data?.code === 0) {
                data = res.data?.data;
                playurl = (data?.playurl_info
                    ?.playurl ?? {});
                gQnDesc = (playurl.g_qn_desc ?? []);
                streams = (playurl.stream ?? []);
                picked = this.pickLiveStreamUrl(streams, qn);
            }
        }
        // v2 仍失败时降级旧版 playUrl（多数房间至少能给出 flv）
        if (!picked) {
            const legacy = await this.getLegacyLivePlayUrl(roomId);
            if (legacy)
                return legacy;
            throw new Error("未找到可用的直播流地址");
        }
        const labelMap = new Map();
        for (const item of gQnDesc) {
            const id = Number(item.qn);
            const desc = String(item.desc ?? "");
            if (Number.isFinite(id) && desc)
                labelMap.set(id, desc);
        }
        const qualities = (picked.acceptQn.length > 0 ? picked.acceptQn : [picked.qn]).map((id) => ({
            qn: id,
            label: labelMap.get(id) ?? this.liveQualityLabel(id),
        }));
        return {
            url: picked.url,
            format: picked.format,
            quality: picked.qn,
            qualityLabel: labelMap.get(picked.qn) ?? this.liveQualityLabel(picked.qn),
            qualities,
        };
    }
    async getLegacyLivePlayUrl(roomId) {
        try {
            const res = await this.liveClient.get("/room/v1/Room/playUrl", {
                params: {
                    cid: roomId,
                    platform: "web",
                    quality: 4,
                    qn: 400,
                },
            });
            if (res.data?.code !== 0)
                return null;
            const data = res.data?.data;
            const durl = (data?.durl ?? []);
            const url = String(durl[0]?.url ?? "");
            if (!url.startsWith("http"))
                return null;
            const currentQn = Number(data?.current_quality ?? 400);
            const accept = (Array.isArray(data?.accept_quality) ? data.accept_quality : [currentQn])
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value));
            return {
                url,
                format: "flv",
                quality: Number.isFinite(currentQn) ? currentQn : 400,
                qualityLabel: this.liveQualityLabel(Number.isFinite(currentQn) ? currentQn : 400),
                qualities: accept.map((id) => ({
                    qn: id,
                    label: this.liveQualityLabel(id),
                })),
            };
        }
        catch {
            return null;
        }
    }
    liveQualityLabel(qn) {
        const map = {
            10000: "原画",
            400: "蓝光",
            250: "超清",
            150: "高清",
            80: "流畅",
        };
        return map[qn] ?? `${qn}P`;
    }
    pickLiveStreamUrl(streams, preferredQn) {
        const protocolPrefer = ["http_stream", "http_hls"];
        // Electron 优先 AVC；没有 AVC 时再退 HEVC/AV1，避免整页拉流失败
        const codecPrefer = ["avc", "hevc", "hev", "av1", "h264", "h265"];
        const formatPrefer = ["flv", "fmp4", "ts"];
        const candidates = [];
        const codecRank = (name) => {
            const lower = name.toLowerCase();
            // codec_name 可能是 "avc" / "hevc"，少数响应也可能是 "0"/"1"/"2"
            if (!lower || lower === "0")
                return 0;
            if (lower === "1")
                return 1;
            if (lower === "2")
                return 3;
            const idx = codecPrefer.findIndex((key) => lower === key || lower.includes(key));
            return idx < 0 ? 50 : idx;
        };
        for (const stream of streams) {
            const protocolName = String(stream.protocol_name ?? "");
            const protocolScore = protocolPrefer.indexOf(protocolName);
            const formats = (stream.format ?? []);
            for (const format of formats) {
                const formatName = String(format.format_name ?? "");
                const formatScore = formatPrefer.indexOf(formatName);
                const codecs = (format.codec ?? []);
                for (const codec of codecs) {
                    const codecName = String(codec.codec_name ?? "");
                    const baseUrl = String(codec.base_url ?? "");
                    const urlInfos = (codec.url_info ?? []);
                    if (!baseUrl || urlInfos.length === 0)
                        continue;
                    for (const info of urlInfos) {
                        const host = String(info.host ?? "").trim();
                        const extra = String(info.extra ?? "");
                        let url = `${host}${baseUrl}${extra}`;
                        if (url.startsWith("//"))
                            url = `https:${url}`;
                        if (!/^https?:\/\//i.test(url))
                            continue;
                        const acceptQn = (Array.isArray(codec.accept_qn) ? codec.accept_qn : [])
                            .map((value) => Number(value))
                            .filter((value) => Number.isFinite(value));
                        const currentQn = Number(codec.current_qn ?? preferredQn);
                        const qn = Number.isFinite(currentQn) ? currentQn : preferredQn;
                        const qnScore = preferredQn > 0 && qn === preferredQn
                            ? 0
                            : preferredQn > 0 && acceptQn.includes(preferredQn)
                                ? 1
                                : 2;
                        candidates.push({
                            url,
                            format: formatName === "flv" ? "flv" : "hls",
                            qn,
                            acceptQn,
                            score: codecRank(codecName) * 1000 +
                                (formatScore < 0 ? 99 : formatScore) * 100 +
                                (protocolScore < 0 ? 99 : protocolScore) * 10 +
                                qnScore,
                        });
                    }
                }
            }
        }
        if (candidates.length === 0)
            return null;
        candidates.sort((a, b) => a.score - b.score);
        const best = candidates[0];
        return {
            url: best.url,
            format: best.format,
            qn: best.qn,
            acceptQn: best.acceptQn,
        };
    }
    normalizeHttps(url) {
        return url.replace(/^http:/, "https:");
    }
    parseLiveViewers(data) {
        const rank = (data.online_gold_rank_info_v2 ??
            data.online_gold_rank_info ??
            {});
        const num = Number(rank.online_num ?? rank.count ?? data.online_count ?? 0);
        return Number.isFinite(num) && num > 0 ? num : undefined;
    }
    async getLiveRoomViewers(roomId, uid) {
        await this.ensureBuvid3();
        const res = await this.liveClient.get("/xlive/general-interface/v1/rank/getOnlineGoldRank", {
            params: {
                roomId,
                ruid: uid ?? 0,
                page: 1,
                pageSize: 1,
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return 0;
        const data = (res.data?.data ?? {});
        const num = Number(data.onlineNum ?? data.online_num ?? 0);
        return Number.isFinite(num) && num > 0 ? num : 0;
    }
    parseLiveWatched(data, roomInfo) {
        const watched = (data.watched_show ??
            roomInfo.watched_show ??
            {});
        const num = Number(watched.num ?? 0);
        const text = String(watched.text_large ?? watched.text_small ?? "").trim();
        return {
            watched: Number.isFinite(num) && num > 0 ? num : undefined,
            watchedText: text || undefined,
        };
    }
    normalizeLiveDanmuInfo(data) {
        const lists = [data.host_list, data.host_server_list].filter(Array.isArray);
        const hosts = lists
            .flat()
            .map((item) => {
            const host = String(item.host ?? item.host_server ?? "").trim();
            const wssPort = Number(item.wss_port ?? 0);
            const port = Number(item.port ?? 0);
            const resolved = wssPort > 0 ? wssPort : port === 443 || port === 2245 ? port : 0;
            return { host, wssPort: resolved || 443 };
        })
            .filter((item) => item.host && (item.wssPort === 443 || item.wssPort === 2245));
        const fallbackHost = String(data.host ?? "").trim();
        if (fallbackHost && hosts.length === 0) {
            hosts.push({
                host: fallbackHost,
                wssPort: Number(data.wss_port ?? 443) || 443,
            });
        }
        if (hosts.length === 0) {
            hosts.push({ host: "broadcastlv.chat.bilibili.com", wssPort: 443 });
        }
        return {
            token: String(data.token ?? ""),
            uid: Number(appStore.get("user")?.mid ?? 0) || 0,
            buvid: appStore.get("cookies").buvid3 || "",
            hosts,
        };
    }
    async getLiveDanmuInfo(roomId) {
        await this.ensureBuvid3();
        const attempts = [
            async () => {
                const params = await signParams({
                    id: roomId,
                    type: 0,
                    web_location: "444.8",
                    dm_img_list: "[]",
                    dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
                    dm_cover_img_str: "QU5HTEUgKEludGVsLCBJbnRlbChSKSBVSEQgR3JhcGhpY3MgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoSW50ZWw",
                    dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":["","",""]}',
                });
                const res = await this.liveClient.get("/xlive/web-room/v1/index/getDanmuInfo", {
                    params,
                    headers: { Referer: `https://live.bilibili.com/${roomId}` },
                    validateStatus: () => true,
                });
                return res.data?.code === 0 && res.data?.data
                    ? res.data.data
                    : null;
            },
            async () => {
                const res = await this.liveClient.get("/room/v1/Danmu/getConf", {
                    params: { room_id: roomId, platform: "pc", player: "web" },
                    headers: { Referer: `https://live.bilibili.com/${roomId}` },
                    validateStatus: () => true,
                });
                return res.data?.code === 0 && res.data?.data
                    ? res.data.data
                    : null;
            },
        ];
        for (const attempt of attempts) {
            try {
                const data = await attempt();
                const parsed = data ? this.normalizeLiveDanmuInfo(data) : null;
                if (parsed)
                    return parsed;
            }
            catch {
                // 试下一个通道
            }
        }
        throw new Error("弹幕通道被风控拦截，已改用历史弹幕轮询");
    }
    async getLiveDanmuHistory(roomId) {
        await this.ensureBuvid3();
        const res = await this.liveClient.get("/xlive/web-room/v1/dM/gethistory", {
            params: { roomid: roomId },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "获取历史弹幕失败");
        }
        const data = (res.data?.data ?? {});
        const room = [
            ...this.asRecordArray(data.admin),
            ...this.asRecordArray(data.room),
            ...this.asRecordArray(data.list),
        ];
        const messages = [];
        room.forEach((item, index) => {
            const text = String(item.text ?? item.msg ?? item.content ?? "").trim();
            if (!text)
                return;
            const uid = Number(item.uid ?? 0) || 0;
            const timeline = Date.parse(String(item.timeline ?? item.ts ?? item.time ?? ""));
            let emotes = {};
            try {
                emotes = parseHistoryItemEmotes(item);
            }
            catch {
                emotes = {};
            }
            messages.push({
                id: `hist-${roomId}-${uid}-${text}-${item.timeline ?? index}`,
                kind: "danmu",
                uid,
                uname: String(item.nickname ?? item.uname ?? item.username ?? "用户"),
                text,
                emotes: Object.keys(emotes).length > 0 ? emotes : undefined,
                time: Number.isFinite(timeline)
                    ? timeline
                    : Date.now() - (room.length - index) * 10,
            });
        });
        return messages;
    }
    async getLiveEmotes(roomId) {
        await this.ensureBuvid3();
        const map = {};
        const endpoints = [
            {
                url: "/xlive/web-ucenter/v2/emoticon/GetEmoticons",
                params: { platform: "pc", room_id: roomId },
            },
            {
                url: "/xlive/web-emoticons/index/GetEmoticon",
                params: { room_id: roomId, platform: "pc" },
            },
        ];
        for (const endpoint of endpoints) {
            try {
                const res = await this.liveClient.get(endpoint.url, {
                    params: endpoint.params,
                    headers: { Referer: `https://live.bilibili.com/${roomId}` },
                    validateStatus: () => true,
                });
                if (res.data?.code !== 0)
                    continue;
                const root = (res.data?.data ?? {});
                const packs = (Array.isArray(root.data)
                    ? root.data
                    : Array.isArray(root)
                        ? root
                        : Object.values(root).filter((item) => item && typeof item === "object"));
                for (const pack of packs) {
                    const list = (pack.emoticons ??
                        pack.list ??
                        pack.emote ??
                        []);
                    for (const item of list) {
                        addLiveEmote(map, item.emoji ?? item.text ?? item.emoticon_unique ?? item.name, item.url ?? item.icon_url ?? item.gif_url);
                    }
                }
                if (Object.keys(map).length > 0)
                    return map;
            }
            catch {
                // 试下一个表情接口
            }
        }
        return map;
    }
    async sendLiveDanmu(roomId, message) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再发送弹幕");
        const msg = message.trim();
        if (!msg)
            throw new Error("弹幕内容不能为空");
        if (msg.length > 80)
            throw new Error("直播弹幕最多 80 个字");
        const body = new URLSearchParams({
            bubble: "0",
            msg,
            color: "16777215",
            mode: "1",
            room_type: "0",
            jumpfrom: "0",
            fontsize: "25",
            rnd: String(Math.floor(Date.now() / 1000)),
            roomid: String(roomId),
            csrf,
            csrf_token: csrf,
        });
        const res = await this.liveClient.post("/msg/send", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://live.bilibili.com/${roomId}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "发送弹幕失败");
        }
    }
    normalizeLiveRoomItems(items) {
        return items
            .filter((item) => Boolean(item && typeof item === "object"))
            .map((item) => this.normalizeLiveRoomItem(item))
            .filter((item) => item.roomId > 0);
    }
    asRecordArray(value) {
        if (typeof value === "string") {
            try {
                return this.asRecordArray(JSON.parse(value));
            }
            catch {
                return [];
            }
        }
        if (!Array.isArray(value))
            return [];
        return value.filter((item) => Boolean(item && typeof item === "object"));
    }
    /** 取第一个有效正数（跳过 hit_ab=true 时 roomid=0 这类占位） */
    pickPositiveId(...values) {
        for (const value of values) {
            const n = Number(value ?? 0);
            if (Number.isFinite(n) && n > 0)
                return n;
        }
        return 0;
    }
    pickHttpUrl(...values) {
        for (const value of values) {
            if (value == null || value === 0 || value === "0")
                continue;
            const text = String(value).trim();
            if (!text || text === "undefined" || text === "null")
                continue;
            return this.normalizeHttps(text);
        }
        return "";
    }
    normalizeLiveRoomItem(item) {
        const watched = (item.watched_show ?? {});
        // hit_ab=true 时 roomid 常为 0，真实 id 在 room_id；不可用 ?? 直接吃 0
        let roomId = this.pickPositiveId(item.room_id, item.roomId, item.roomid);
        if (!roomId && typeof item.link === "string") {
            const match = item.link.match(/live\.bilibili\.com\/(\d+)/i);
            roomId = match ? Number(match[1]) : 0;
        }
        const cover = this.pickHttpUrl(item.cover, item.keyframe, item.cover_from_user, item.user_cover, item.room_cover);
        const online = Number(item.online ?? watched.num ?? item.watched_num ?? 0);
        const onlineText = watched.text_small ||
            watched.text_large ||
            undefined;
        return {
            roomId,
            title: String(item.title ?? item.roomname ?? item.room_name ?? "直播间"),
            cover,
            online,
            onlineText,
            areaName: String(item.area_v2_name ?? item.area_name ?? item.areaName ?? ""),
            parentAreaName: String(item.area_v2_parent_name ??
                item.parent_area_name ??
                item.parentAreaName ??
                "") || undefined,
            uid: Number(item.uid ?? item.mid ?? 0),
            uname: String(item.uname ?? item.nickname ?? item.name ?? ""),
            face: this.pickHttpUrl(item.face, item.user_cover, item.avatar),
            liveStatus: (() => {
                if (item.live_status != null)
                    return Number(item.live_status);
                if (item.liveStatus != null)
                    return Number(item.liveStatus);
                if (item.status === true)
                    return 1;
                if (item.status === false)
                    return 0;
                // 推荐流里的房间默认视为直播中
                return 1;
            })(),
            keyframe: this.normalizeHttps(String(item.keyframe ?? "")) || undefined,
        };
    }
    async getVideoBriefs(bvids) {
        await this.ensureBuvid3();
        const unique = [...new Set(bvids.filter(Boolean))];
        const results = [];
        for (let index = 0; index < unique.length; index++) {
            const bvid = unique[index];
            try {
                const params = await signParams({ bvid });
                const res = await this.client.get("/x/web-interface/wbi/view", {
                    params,
                });
                const view = res.data?.data;
                if (res.data?.code !== 0 || !view?.bvid)
                    continue;
                results.push({
                    bvid: view.bvid,
                    cover: view.pic ?? "",
                    upperName: (view.owner?.name ?? ""),
                    duration: view.duration ?? 0,
                });
            }
            catch {
                try {
                    const res = await this.client.get("/x/web-interface/view", {
                        params: { bvid },
                    });
                    const view = res.data?.data;
                    if (res.data?.code !== 0 || !view?.bvid)
                        continue;
                    results.push({
                        bvid: view.bvid,
                        cover: view.pic ?? "",
                        upperName: (view.owner?.name ??
                            ""),
                        duration: view.duration ?? 0,
                    });
                }
                catch {
                    // skip failed item
                }
            }
            if (index % 5 === 4) {
                await new Promise((resolve) => setTimeout(resolve, 120));
            }
        }
        return results;
    }
    /** 稿件分区名（如 计算机技术 / 单机游戏），取不到返回空串 */
    async getVideoTagNames(bvid) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/tag/archive/tags", {
            params: { bvid },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "视频标签获取失败");
        }
        const list = res.data?.data ?? [];
        return list.map((tag) => String(tag.tag_name ?? "").trim()).filter(Boolean);
    }
    async getVideo(bvid) {
        await this.ensureBuvid3();
        const params = await signParams({ bvid });
        const viewRes = await this.client.get("/x/web-interface/wbi/view", {
            params,
            validateStatus: () => true,
        });
        if (viewRes.status === 412 || viewRes.data?.code === -412) {
            throw new Error("[412] 请求被 B 站安全策略拦截，请稍后重试");
        }
        if (viewRes.data?.code !== 0) {
            throw new Error(explainVideoViewError(Number(viewRes.data?.code) || 0, String(viewRes.data?.message || "")));
        }
        const view = viewRes.data?.data;
        if (!view?.bvid)
            throw new Error("视频不存在");
        const firstCid = Number(view.pages?.[0]?.cid) || undefined;
        const tags = await this.getVideoTags(view.bvid, view.aid, firstCid);
        const exclusive = view.is_upower_exclusive === true ||
            Number(view.is_upower_exclusive) === 1;
        const charge = exclusive
            ? await this.readVideoCharge(view)
            : undefined;
        if (view.bvid &&
            (exclusive ||
                view.is_upower_exclusive === false ||
                Number(view.is_upower_exclusive) === 0)) {
            this.rememberChargeBadge(String(view.bvid), exclusive ? "充电专属" : "");
        }
        return {
            bvid: view.bvid,
            aid: view.aid,
            title: view.title,
            cover: view.pic,
            duration: view.duration,
            play: view.stat?.view ?? 0,
            danmaku: view.stat?.danmaku ?? 0,
            owner: {
                mid: view.owner.mid,
                name: view.owner.name,
                face: view.owner.face,
            },
            pubdate: view.pubdate,
            desc: view.desc ?? "",
            pages: (view.pages ?? []).map((part) => ({
                cid: part.cid,
                page: part.page,
                part: part.part || `P${part.page}`,
                duration: part.duration ?? 0,
            })),
            tags,
            ugcSeason: this.parseVideoUgcSeason(view.ugc_season),
            copyright: Number(view.copyright) === 2
                ? 2
                : Number(view.copyright) === 1
                    ? 1
                    : undefined,
            honors: this.parseVideoHonors(view.honor_reply),
            staff: this.parseVideoStaff(view.staff),
            stat: {
                view: view.stat?.view ?? 0,
                danmaku: view.stat?.danmaku ?? 0,
                reply: view.stat?.reply ?? 0,
                favorite: view.stat?.favorite ?? 0,
                coin: view.stat?.coin ?? 0,
                share: view.stat?.share ?? 0,
                like: view.stat?.like ?? 0,
            },
            chargeChecked: true,
            ...(charge ? { charge, chargeBadge: "充电专属" } : {}),
        };
    }
    /** 充电视频文案和当前账号能不能看完整版。未开通时播放地址只有试看 */
    async readVideoCharge(view) {
        const bvid = String(view.bvid ?? "");
        const pages = Array.isArray(view.pages) ? view.pages : [];
        const firstPage = pages[0];
        const cid = Number(view.cid) || Number(firstPage?.cid) || 0;
        let unlocked = view.is_upower_play === true;
        let title = "该视频为充电专属视频";
        let subtitle = unlocked
            ? "你已是充电会员，该视频可完整观看"
            : "试看中，开通充电后可观看完整视频";
        let buttonText = unlocked ? undefined : "去开通";
        let payUrl;
        if (bvid && cid > 0) {
            try {
                const params = await signParams({ bvid, cid });
                const res = await this.client.get("/x/player/wbi/v2", {
                    params,
                    headers: { Referer: `https://www.bilibili.com/video/${bvid}` },
                    validateStatus: () => true,
                });
                const data = res.data?.data;
                if (res.data?.code === 0 && data) {
                    if (typeof data.is_upower_play === "boolean") {
                        unlocked = data.is_upower_play;
                    }
                    const elec = data.elec_high_level;
                    if (elec) {
                        const nextTitle = String(elec.title ?? "").trim();
                        const nextSubtitle = String(elec.sub_title ?? "").trim();
                        if (nextTitle)
                            title = nextTitle;
                        if (!unlocked && nextSubtitle)
                            subtitle = nextSubtitle;
                        if (!unlocked && elec.show_button !== false) {
                            const nextButton = String(elec.button_text ?? "").trim();
                            if (nextButton)
                                buttonText = nextButton;
                            payUrl = this.safeBiliHttpUrl(String(elec.jump_url ?? ""));
                        }
                    }
                }
            }
            catch {
                // 播放器文案失败时保留默认提示
            }
        }
        if (unlocked) {
            subtitle = "你已是充电会员，该视频可完整观看";
            buttonText = undefined;
            payUrl = undefined;
        }
        return { exclusive: true, unlocked, title, subtitle, buttonText, payUrl };
    }
    safeBiliHttpUrl(raw) {
        const text = raw.trim();
        if (!text)
            return undefined;
        try {
            const url = new URL(text.startsWith("//") ? `https:${text}` : text);
            if (url.protocol !== "https:" && url.protocol !== "http:")
                return undefined;
            const host = url.hostname.toLowerCase();
            if (host !== "bilibili.com" && !host.endsWith(".bilibili.com")) {
                return undefined;
            }
            return url.toString();
        }
        catch {
            return undefined;
        }
    }
    parseVideoHonors(raw) {
        if (!raw || typeof raw !== "object")
            return undefined;
        const list = raw.honor;
        if (!Array.isArray(list) || list.length === 0)
            return undefined;
        const honors = [];
        for (const item of list) {
            if (!item || typeof item !== "object")
                continue;
            const row = item;
            const desc = String(row.desc ?? "").trim();
            if (!desc)
                continue;
            honors.push({
                type: Number(row.type) || 0,
                desc,
            });
        }
        return honors.length > 0 ? honors : undefined;
    }
    parseVideoStaff(raw) {
        if (!Array.isArray(raw) || raw.length === 0)
            return undefined;
        const staff = [];
        for (const item of raw) {
            if (!item || typeof item !== "object")
                continue;
            const row = item;
            const mid = Number(row.mid) || 0;
            const name = String(row.name ?? "").trim();
            if (!mid || !name)
                continue;
            staff.push({
                mid,
                name,
                face: this.normalizeVideoCoverUrl(String(row.face ?? "")),
                title: String(row.title ?? "联合创作").trim() || "联合创作",
            });
        }
        return staff.length > 0 ? staff : undefined;
    }
    async getRelatedVideos(bvid) {
        await this.ensureBuvid3();
        const trimmed = bvid.trim();
        if (!trimmed)
            return [];
        const res = await this.client.get("/x/web-interface/archive/related", {
            params: { bvid: trimmed },
            headers: { Referer: `https://www.bilibili.com/video/${trimmed}` },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "相关推荐获取失败");
        }
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        return list
            .map((item) => this.normalizeRelatedVideo(item))
            .filter((item) => Boolean(item.bvid));
    }
    normalizeRelatedVideo(item) {
        const owner = item.owner;
        const stat = item.stat;
        return this.withChargeBadge({
            bvid: String(item.bvid ?? ""),
            aid: Number(item.aid ?? item.id) || 0,
            title: String(item.title ?? ""),
            cover: this.normalizeVideoCoverUrl(String(item.pic ?? "")),
            duration: Number(item.duration) || 0,
            play: Number(stat?.view ?? item.play) || 0,
            danmaku: Number(stat?.danmaku ?? item.video_review) || 0,
            owner: {
                mid: Number(owner?.mid) || 0,
                name: String(owner?.name ?? ""),
                face: this.normalizeVideoCoverUrl(String(owner?.face ?? "")),
            },
            pubdate: Number(item.pubdate ?? item.ctime) || 0,
        }, item);
    }
    async getVideoOnlineTotal(aid, cid, bvid) {
        await this.ensureBuvid3();
        const params = {
            aid,
            cid,
        };
        if (bvid)
            params.bvid = bvid;
        const res = await this.client.get("/x/player/online/total", {
            params,
            headers: {
                Referer: bvid
                    ? `https://www.bilibili.com/video/${bvid}`
                    : "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "在线人数获取失败");
        }
        const data = res.data?.data ?? {};
        const totalRaw = String(data.total ?? data.count ?? "").trim();
        const countNum = Number(data.count);
        return {
            total: totalRaw || (Number.isFinite(countNum) ? String(countNum) : "0"),
            count: Number.isFinite(countNum) ? countNum : 0,
        };
    }
    async getVideoSubtitles(bvid, cid) {
        await this.ensureBuvid3();
        const referer = `https://www.bilibili.com/video/${bvid}`;
        const aid = bvToAid(bvid);
        const tryFetch = async (path) => {
            const params = await signParams({
                ...(aid > 0 ? { aid } : {}),
                bvid,
                cid,
            });
            return this.client.get(path, {
                params,
                headers: { Referer: referer },
                validateStatus: () => true,
            });
        };
        let res = await tryFetch("/x/player/wbi/v2");
        if (res.data?.code !== 0) {
            res = await tryFetch("/x/player/v2");
        }
        if (res.data?.code !== 0) {
            return [];
        }
        const subtitleRoot = res.data?.data
            ?.subtitle;
        const list = Array.isArray(subtitleRoot?.subtitles)
            ? subtitleRoot.subtitles
            : [];
        const tracks = [];
        for (const item of list) {
            let url = String(item.subtitle_url ?? "").trim();
            if (!url)
                continue;
            if (url.startsWith("//"))
                url = `https:${url}`;
            try {
                const bodyRes = await this.client.get(url, {
                    headers: { Referer: referer },
                    validateStatus: () => true,
                    timeout: 12000,
                });
                const body = bodyRes.data?.body ??
                    (typeof bodyRes.data === "object"
                        ? bodyRes.data.body
                        : undefined);
                if (!Array.isArray(body) || body.length === 0)
                    continue;
                const vtt = this.biliSubtitleBodyToVtt(body);
                if (!vtt)
                    continue;
                tracks.push({
                    id: Number(item.id ?? item.id_str) || tracks.length + 1,
                    lan: String(item.lan ?? ""),
                    lanDoc: String(item.lan_doc ?? item.lan ?? "字幕"),
                    vtt,
                });
            }
            catch {
                // 单轨失败不阻断其它字幕
            }
        }
        return tracks;
    }
    biliSubtitleBodyToVtt(body) {
        const lines = ["WEBVTT", ""];
        let index = 0;
        for (const raw of body) {
            if (!raw || typeof raw !== "object")
                continue;
            const row = raw;
            const from = Number(row.from);
            const to = Number(row.to);
            const content = String(row.content ?? "")
                .replace(/\r\n/g, "\n")
                .trim();
            if (!Number.isFinite(from) || !Number.isFinite(to) || !content)
                continue;
            index += 1;
            lines.push(String(index));
            lines.push(`${this.formatVttTimestamp(from)} --> ${this.formatVttTimestamp(to)}`);
            lines.push(content);
            lines.push("");
        }
        return index > 0 ? lines.join("\n") : "";
    }
    formatVttTimestamp(seconds) {
        const totalMs = Math.max(0, Math.round(seconds * 1000));
        const h = Math.floor(totalMs / 3_600_000);
        const m = Math.floor((totalMs % 3_600_000) / 60_000);
        const s = Math.floor((totalMs % 60_000) / 1000);
        const ms = totalMs % 1000;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
    }
    /** 官网播放页右侧「合集」：view.ugc_season */
    parseVideoUgcSeason(raw) {
        if (!raw || typeof raw !== "object")
            return undefined;
        const season = raw;
        const id = Number(season.id) || 0;
        if (!id)
            return undefined;
        const sections = Array.isArray(season.sections) ? season.sections : [];
        const episodes = [];
        const seen = new Set();
        for (const sectionRaw of sections) {
            if (!sectionRaw || typeof sectionRaw !== "object")
                continue;
            const section = sectionRaw;
            const list = Array.isArray(section.episodes) ? section.episodes : [];
            for (const epRaw of list) {
                if (!epRaw || typeof epRaw !== "object")
                    continue;
                const ep = epRaw;
                const bvid = String(ep.bvid ?? "").trim();
                if (!bvid || seen.has(bvid))
                    continue;
                seen.add(bvid);
                const page = ep.page && typeof ep.page === "object"
                    ? ep.page
                    : undefined;
                const cid = Number(ep.cid ?? page?.cid) || 0;
                const duration = Number(ep.duration ?? page?.duration) || 0;
                const title = String(ep.title ?? page?.part ?? ep.long_title ?? bvid).trim();
                const arc = ep.arc && typeof ep.arc === "object"
                    ? ep.arc
                    : undefined;
                episodes.push({
                    aid: Number(ep.aid ?? ep.id) || 0,
                    bvid,
                    cid,
                    title: title || bvid,
                    cover: String(ep.cover ?? arc?.cover ?? "").replace(/^http:/, "https:"),
                    duration,
                });
            }
        }
        if (episodes.length === 0)
            return undefined;
        return {
            id,
            title: String(season.title ?? "合集").trim() || "合集",
            cover: String(season.cover ?? "").replace(/^http:/, "https:"),
            epCount: Number(season.ep_count) || episodes.length,
            episodes,
            mid: Number(season.mid) || undefined,
            view: Number(season.stat?.view ??
                season.stat?.vt ??
                season.view) || undefined,
            intro: String(season.intro ?? season.desc ?? "").trim() || undefined,
        };
    }
    /** 官网简介下方标签：先新接口，失败再走旧 archive/tags */
    async getVideoTags(bvid, aid, cid) {
        const fromDetail = await this.fetchVideoTagList("/x/web-interface/view/detail/tag", { bvid, aid, ...(cid ? { cid } : {}) });
        if (fromDetail.length > 0)
            return fromDetail;
        return this.fetchVideoTagList("/x/tag/archive/tags", { bvid, aid });
    }
    async fetchVideoTagList(path, params) {
        try {
            const res = await this.client.get(path, {
                params,
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412)
                return [];
            if (res.data?.code !== 0)
                return [];
            const list = res.data?.data;
            return Array.isArray(list) ? this.normalizeVideoTags(list) : [];
        }
        catch {
            return [];
        }
    }
    normalizeVideoTags(list) {
        const tags = [];
        const seen = new Set();
        for (const raw of list) {
            if (!raw || typeof raw !== "object")
                continue;
            const item = raw;
            const name = String(item.tag_name ?? item.name ?? "").trim();
            if (!name)
                continue;
            const id = Number(item.tag_id ?? item.id) || 0;
            const key = id > 0 ? `id:${id}` : `name:${name}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const typeName = String(item.tag_type ?? "").toLowerCase();
            let kind = "normal";
            if (typeName === "topic")
                kind = "topic";
            else if (typeName === "bgm")
                kind = "bgm";
            else if (typeName === "old_channel" || typeName === "new_channel") {
                kind = "channel";
            }
            const jump = String(item.jump_url ?? "").trim();
            const cover = String(item.cover ?? "").trim();
            tags.push({
                id,
                name,
                kind,
                jumpUrl: jump || undefined,
                cover: cover || undefined,
            });
        }
        return tags;
    }
    async getVideoRelation(bvid, aid) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/web-interface/archive/relation", {
            params: { bvid, aid },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "互动状态获取失败");
        }
        const data = res.data?.data ?? {};
        const coin = Number(data.coin) || 0;
        return {
            liked: Number(data.like) === 1,
            coined: coin > 0,
            coin,
            favorited: Number(data.favorite) === 1,
            disliked: Number(data.dislike) === 1 || data.dislike === true,
        };
    }
    /** 官网长按点赞：一次请求完成点赞 + 投 2 币 + 收藏到默认收藏夹 */
    async tripleVideo(aid, bvid) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再三连");
        const body = new URLSearchParams({
            aid: String(aid),
            eab_x: "2",
            ramval: "0",
            source: "web_normal",
            ga: "1",
            csrf,
            spmid: "333.788.0.0",
            statistics: '{"appId":100,"platform":5}',
        });
        const res = await this.client.post("/x/web-interface/archive/like/triple", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/video/${bvid}`,
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "三连失败"));
        }
        const data = (res.data?.data ?? {});
        return {
            like: Boolean(data.like),
            coin: Boolean(data.coin),
            fav: Boolean(data.fav),
            multiply: Number(data.multiply) || 0,
        };
    }
    /** 官网播放页「AI 视频总结」；没有总结时返回 null */
    async getVideoAiSummary(bvid, cid, upMid) {
        await this.ensureBuvid3();
        const params = await signParams({
            bvid,
            cid,
            ...(upMid > 0 ? { up_mid: upMid } : {}),
        });
        const res = await this.client.get("/x/web-interface/view/conclusion/get", {
            params,
            headers: { Referer: `https://www.bilibili.com/video/${bvid}` },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "AI 总结获取失败"));
        }
        const data = (res.data?.data ?? {});
        if (Number(data.code) !== 0)
            return null;
        const model = (data.model_result ?? {});
        const summary = String(model.summary ?? "").trim();
        const outlineRaw = Array.isArray(model.outline) ? model.outline : [];
        const outline = [];
        for (const raw of outlineRaw) {
            if (!raw || typeof raw !== "object")
                continue;
            const section = raw;
            const title = String(section.title ?? "").trim();
            const pointsRaw = Array.isArray(section.part_outline)
                ? section.part_outline
                : [];
            const points = [];
            for (const p of pointsRaw) {
                if (!p || typeof p !== "object")
                    continue;
                const point = p;
                const content = String(point.content ?? "").trim();
                if (!content)
                    continue;
                points.push({ timestamp: Number(point.timestamp) || 0, content });
            }
            if (!title && points.length === 0)
                continue;
            outline.push({
                title,
                timestamp: Number(section.timestamp) || 0,
                points,
            });
        }
        if (!summary && outline.length === 0)
            return null;
        return { summary, outline };
    }
    /** 首页推荐「不感兴趣」：走 APP 反馈接口，用 TV 扫码登录拿到的 access_key 签名 */
    async dislikeRecommend(payload) {
        const accessKey = appStore.get("accessToken");
        if (!accessKey)
            throw new Error("请退出后重新扫码登录，再使用不感兴趣");
        const params = this.buildTvSignedParams({
            access_key: accessKey,
            goto: "av",
            id: payload.aid,
            ...(payload.upMid > 0 ? { mid: payload.upMid } : {}),
            reason_id: payload.reasonId,
            ...(payload.trackId ? { track_id: payload.trackId } : {}),
            build: 1,
            mobi_app: "android",
        });
        const res = await axios.get("https://app.bilibili.com/x/feed/dislike", {
            params,
            headers: defaultHeaders(),
            timeout: 15000,
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "反馈失败"));
        }
    }
    requireLogin(action) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error(`请先登录后再${action}`);
        return csrf;
    }
    assertOk(res, fallback) {
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, fallback));
        }
        return (res.data?.data ?? {});
    }
    async getVipCenter() {
        this.requireLogin("查看大会员");
        const res = await this.client.get("/x/vip/web/user/info", {
            validateStatus: () => true,
        });
        const data = this.assertOk(res, "大会员信息获取失败");
        return {
            vipType: Number(data.vip_type) || 0,
            active: Number(data.vip_status) === 1,
            dueDate: Number(data.vip_due_date) || 0,
        };
    }
    /** 大会员每日 +10 经验，已领过时 B 站返回错误文案 */
    async claimVipExperience() {
        const csrf = this.requireLogin("领取经验");
        const res = await this.client.post("/x/vip/experience/add", new URLSearchParams({ csrf }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://account.bilibili.com/",
            },
            validateStatus: () => true,
        });
        this.assertOk(res, "领取大会员经验失败");
        return "已领取今日大会员经验";
    }
    static VIP_PRIVILEGE_NAMES = {
        1: "B 币券",
        2: "会员购优惠券",
        3: "漫画福利券",
        4: "会员购包邮券",
        5: "漫画商城优惠券",
        6: "装扮体验卡",
        7: "课堂优惠券",
    };
    async getVipPrivileges() {
        this.requireLogin("查看大会员权益");
        const res = await this.client.get("/x/vip/privilege/my", {
            validateStatus: () => true,
        });
        const data = this.assertOk(res, "大会员权益获取失败");
        const list = Array.isArray(data.list)
            ? data.list
            : [];
        return list.flatMap((item) => {
            const type = Number(item.type) || 0;
            const name = BiliApiService.VIP_PRIVILEGE_NAMES[type];
            if (!name)
                return [];
            return [
                {
                    type,
                    name,
                    received: Number(item.state) === 1,
                    expireTime: Number(item.expire_time ?? item.period_end_unix) || 0,
                },
            ];
        });
    }
    async receiveVipPrivilege(type) {
        const csrf = this.requireLogin("领取权益");
        const res = await this.client.post("/x/vip/privilege/receive", new URLSearchParams({ type: String(type), csrf }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://account.bilibili.com/",
            },
            validateStatus: () => true,
        });
        this.assertOk(res, "领取权益失败");
    }
    async getExpReward() {
        this.requireLogin("查看经验任务");
        const res = await this.client.get("/x/member/web/exp/reward", {
            headers: { Referer: "https://account.bilibili.com/" },
            validateStatus: () => true,
        });
        const data = this.assertOk(res, "经验任务获取失败");
        return {
            login: Boolean(data.login),
            watch: Boolean(data.watch),
            share: Boolean(data.share),
            coinExp: Number(data.coins) || 0,
        };
    }
    async getMemberLog(path, fallback) {
        this.requireLogin("查看记录");
        const res = await this.client.get(path, {
            params: { jsonp: "jsonp" },
            headers: { Referer: "https://account.bilibili.com/" },
            validateStatus: () => true,
        });
        const data = this.assertOk(res, fallback);
        const list = Array.isArray(data.list)
            ? data.list
            : [];
        return list.map((item) => ({
            time: String(item.time ?? ""),
            delta: Number(item.delta) || 0,
            reason: String(item.reason ?? "").trim(),
        }));
    }
    getCoinLog() {
        return this.getMemberLog("/x/member/web/coin/log", "硬币记录获取失败");
    }
    getExpLog() {
        return this.getMemberLog("/x/member/web/exp/log", "经验记录获取失败");
    }
    async getFansMedals(page = 1) {
        this.requireLogin("查看粉丝勋章");
        const pn = Math.max(1, page);
        const res = await this.liveClient.get("/xlive/app-ucenter/v1/fansMedal/panel", { params: { page: pn, page_size: 50 }, validateStatus: () => true });
        const data = this.assertOk(res, "粉丝勋章获取失败");
        const rows = [
            ...(pn === 1 && Array.isArray(data.special_list)
                ? data.special_list
                : []),
            ...(Array.isArray(data.list)
                ? data.list
                : []),
        ];
        const seen = new Set();
        const list = [];
        for (const row of rows) {
            const medal = (row.medal ?? {});
            const anchor = (row.anchor_info ?? {});
            const room = (row.room_info ?? {});
            const medalId = Number(medal.medal_id) || 0;
            if (!medalId || seen.has(medalId))
                continue;
            seen.add(medalId);
            list.push({
                medalId,
                name: String(medal.medal_name ?? "").trim(),
                level: Number(medal.level) || 0,
                intimacy: Number(medal.intimacy) || 0,
                nextIntimacy: Number(medal.next_intimacy) || 0,
                todayFeed: Number(medal.today_feed) || 0,
                dayLimit: Number(medal.day_limit) || 0,
                wearing: Number(medal.wearing_status) === 1,
                upMid: Number(medal.target_id) || 0,
                upName: String(anchor.nick_name ?? "").trim(),
                upFace: this.normalizeVideoCoverUrl(String(anchor.avatar ?? "")),
                roomId: Number(room.room_id) || 0,
                living: Number(room.living_status) === 1,
            });
        }
        const pageInfo = (data.page_info ?? {});
        const totalPage = Number(pageInfo.total_page) || 0;
        return {
            list,
            page: pn,
            hasMore: totalPage > 0 ? pn < totalPage : Boolean(pageInfo.has_more),
        };
    }
    /** 传 null 表示摘下当前勋章 */
    async wearFansMedal(medalId) {
        const csrf = this.requireLogin("佩戴勋章");
        const body = new URLSearchParams({ csrf_token: csrf, csrf });
        if (medalId)
            body.set("medal_id", String(medalId));
        const res = await this.liveClient.post(medalId
            ? "/xlive/web-room/v1/fansMedal/wear"
            : "/xlive/web-room/v1/fansMedal/take_off", body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            validateStatus: () => true,
        });
        this.assertOk(res, medalId ? "佩戴勋章失败" : "摘下勋章失败");
    }
    /** 发动态 @ 联想：官网同款，关注的人排前面 */
    async getMentionSuggest(keyword) {
        const term = keyword.trim();
        const res = await this.client.get("/x/polymer/web-dynamic/v1/mention/search", {
            params: { keyword: term },
            headers: { Referer: "https://t.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            if (!term)
                return [];
            const page = await this.searchUsers(term, 1);
            return page.users.slice(0, 10).map((user) => ({
                mid: user.mid,
                name: user.name,
                face: user.face,
                fans: user.fans,
                followed: user.isFollowing,
            }));
        }
        const groups = Array.isArray(res.data?.data?.groups)
            ? res.data.data.groups
            : [];
        const seen = new Set();
        const list = [];
        for (const group of groups) {
            const followed = Number(group.group_type) === 2;
            const items = Array.isArray(group.items)
                ? group.items
                : [];
            for (const item of items) {
                const mid = Number(item.uid ?? item.mid) || 0;
                const name = String(item.name ?? item.uname ?? "").trim();
                if (!mid || !name || seen.has(mid))
                    continue;
                seen.add(mid);
                list.push({
                    mid,
                    name,
                    face: this.normalizeVideoCoverUrl(String(item.face ?? "")),
                    fans: Number(item.fans) || 0,
                    followed,
                });
            }
        }
        return list.slice(0, 12);
    }
    /** 某月里有历史弹幕的日期（YYYY-MM-DD），需要登录 */
    async getDanmakuHistoryDates(cid, month) {
        if (!isLoggedIn())
            throw new Error("历史弹幕需要登录后查看");
        const res = await this.client.get("/x/v2/dm/history/index", {
            params: { type: 1, oid: cid, month },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "历史弹幕日期获取失败"));
        }
        const list = res.data?.data;
        return Array.isArray(list)
            ? list.map((item) => String(item)).filter(Boolean)
            : [];
    }
    /** 指定日期的历史弹幕快照，需要登录 */
    async getDanmakuHistory(cid, date) {
        if (!isLoggedIn())
            throw new Error("历史弹幕需要登录后查看");
        const res = await this.client.get("/x/v2/dm/history", {
            params: { type: 1, oid: cid, date },
            responseType: "text",
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
        if (text.trimStart().startsWith("{")) {
            try {
                throw new Error(formatBiliApiError(JSON.parse(text), "历史弹幕获取失败"));
            }
            catch (err) {
                if (err instanceof SyntaxError)
                    return [];
                throw err;
            }
        }
        return parseDanmakuXml(text);
    }
    /** 把播放器弹幕设置同步到账号（网页播放器配置），未登录静默跳过 */
    async syncDanmakuConfig(config) {
        const csrf = getCsrf();
        if (!csrf)
            return;
        const clampScale = (value) => Math.min(1.6, Math.max(0.4, Number(value) || 1)).toFixed(2);
        const body = new URLSearchParams({
            dm_switch: String(config.visible),
            blockscroll: String(config.blockScroll),
            blocktop: String(config.blockTop),
            blockbottom: String(config.blockBottom),
            opacity: Math.min(1, Math.max(0, config.opacity)).toFixed(2),
            dmarea: String(config.area),
            speedplus: clampScale(config.speedPlus),
            fontsize: clampScale(config.fontScale),
            speedsync: String(config.speedSync),
            csrf,
        });
        const res = await this.client.post("/x/v2/dm/web/config", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "弹幕设置同步失败"));
        }
    }
    /** 进度条悬停预览图；图片转成 data URL，渲染层才能拼接到同一张画布 */
    async getVideoSnapshot(bvid, cid) {
        await this.ensureBuvid3();
        const referer = `https://www.bilibili.com/video/${bvid}`;
        const res = await this.client.get("/x/player/videoshot", {
            params: { bvid, cid, index: 1 },
            headers: { Referer: referer },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return null;
        const data = (res.data?.data ?? {});
        const urls = (Array.isArray(data.image) ? data.image : [])
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .slice(0, 30)
            .map((url) => (url.startsWith("//") ? `https:${url}` : url));
        if (urls.length === 0)
            return null;
        const column = Number(data.img_x_len) || 10;
        const row = Number(data.img_y_len) || 10;
        const images = [];
        for (const url of urls) {
            try {
                const img = await axios.get(url, {
                    responseType: "arraybuffer",
                    headers: { ...defaultHeaders(), Referer: referer },
                    timeout: 12000,
                });
                const type = String(img.headers["content-type"] || "image/jpeg");
                images.push(`data:${type};base64,${Buffer.from(img.data).toString("base64")}`);
            }
            catch {
                break;
            }
        }
        if (images.length === 0)
            return null;
        const indexList = Array.isArray(data.index) ? data.index : [];
        const capacity = images.length * column * row;
        const frameCount = indexList.length > 1
            ? Math.min(indexList.length - 1, capacity)
            : capacity;
        return {
            images,
            column,
            row,
            frameWidth: Number(data.img_x_size) || 160,
            frameHeight: Number(data.img_y_size) || 90,
            frameCount,
        };
    }
    async dislikeVideo(aid, dislike) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点踩");
        const body = new URLSearchParams({
            aid: String(aid),
            dislike: dislike ? "1" : "0",
            csrf,
        });
        const res = await this.client.post("/x/web-interface/archive/dislike", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "点踩失败"));
        }
    }
    async likeVideo(aid, like) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点赞");
        const body = new URLSearchParams({
            aid: String(aid),
            like: like ? "1" : "2",
            csrf,
        });
        const res = await this.client.post("/x/web-interface/archive/like", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "点赞失败"));
        }
    }
    async addCoin(payload) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再投币");
        const multiply = payload.multiply === 2 ? 2 : 1;
        const body = new URLSearchParams({
            aid: String(payload.aid),
            multiply: String(multiply),
            select_like: payload.selectLike ? "1" : "0",
            csrf,
        });
        const res = await this.client.post("/x/web-interface/coin/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/video/${payload.bvid}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "投币失败"));
        }
    }
    /** 给稿件加一次分享计数。复制链接本身不依赖此接口，失败只记日志不抛错。 */
    async shareVideo(aid, bvid) {
        const csrf = getCsrf();
        if (!csrf)
            return false;
        const body = new URLSearchParams({
            aid: String(aid),
            bvid,
            csrf,
            source: "web_normal",
        });
        const res = await this.client.post("/x/web-interface/share/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/video/${bvid}`,
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            console.warn("[BiliDesk][share] 请求被安全策略拦截");
            return false;
        }
        if (res.data?.code !== 0) {
            console.warn(`[BiliDesk][share] ${formatBiliApiError(res.data, "分享计数失败")}`);
            return false;
        }
        return true;
    }
    /**
     * 上报观看心跳 + 历史进度，同步到账号历史记录（官方客户端可见）
     */
    async reportWatchHeartbeat(payload) {
        if (!isLoggedIn())
            return;
        const csrf = getCsrf();
        if (!csrf)
            return;
        const playedTime = Math.floor(payload.playedTime);
        const realtime = Math.max(0, Math.floor(payload.realtime ?? Math.max(0, playedTime)));
        const referer = `https://www.bilibili.com/video/${payload.bvid}`;
        const mid = this.getAuthStatus().mid;
        const heartbeatBody = new URLSearchParams({
            aid: String(payload.aid),
            bvid: payload.bvid,
            cid: String(payload.cid),
            mid: String(mid || 0),
            played_time: String(playedTime),
            realtime: String(realtime),
            real_played_time: String(realtime),
            start_ts: String(payload.startTs),
            type: "3",
            dt: "2",
            play_type: String(payload.playType),
            csrf,
        });
        if (payload.quality != null) {
            heartbeatBody.set("quality", String(payload.quality));
        }
        const heartbeatRes = await this.client.post("/x/click-interface/web/heartbeat", heartbeatBody, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: referer,
            },
            validateStatus: () => true,
        });
        // 历史写入不阻塞播放；失败时尽量走专用 report 兜底
        const historyProgress = playedTime < 0 ? 0 : Math.max(0, playedTime);
        const historyBody = new URLSearchParams({
            aid: String(payload.aid),
            cid: String(payload.cid),
            progress: String(historyProgress),
            csrf,
        });
        const historyRes = await this.client.post("/x/v2/history/report", historyBody, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: referer,
            },
            validateStatus: () => true,
        });
        const heartbeatOk = heartbeatRes.status !== 412 &&
            heartbeatRes.data?.code !== -412 &&
            heartbeatRes.data?.code === 0;
        const historyOk = historyRes.status !== 412 &&
            historyRes.data?.code !== -412 &&
            historyRes.data?.code === 0;
        if (!heartbeatOk && !historyOk) {
            // 静默失败，避免打断播放或刷 IPC 错误日志
            return;
        }
    }
    navPlayPrivilege() {
        return { isVip: Boolean(appStore.get("user")?.isVip) };
    }
    async fetchPlayPrivilege(bvid, cid, aid) {
        const fromNav = this.navPlayPrivilege();
        try {
            const params = await signParams({
                ...(aid > 0 ? { aid } : {}),
                bvid,
                cid,
                isGaiaAvoided: "false",
                web_location: 1315873,
            });
            const res = await this.client.get("/x/player/wbi/v2", {
                params,
                headers: { Referer: `https://www.bilibili.com/video/${bvid}` },
                validateStatus: () => true,
            });
            if (res.data?.code !== 0) {
                return mergePlayPrivilege(fromNav);
            }
            return mergePlayPrivilege(fromNav, parsePlayPrivilegeFromPayload(res.data?.data));
        }
        catch {
            return mergePlayPrivilege(fromNav);
        }
    }
    attachPlayMeta(info, privilege, requestedQn) {
        const denied = isVipQuality(requestedQn) &&
            info.quality !== requestedQn &&
            !privilege.isVip;
        let qualityNotice;
        if (denied) {
            qualityNotice = vipQualityBlockedNotice(requestedQn);
        }
        else if (isVipQuality(info.quality) &&
            !privilege.isVip &&
            privilege.trialRemaining != null) {
            qualityNotice = vipQualityTrialNotice(info.quality, Math.max(0, privilege.trialRemaining - 1));
        }
        return {
            ...info,
            isVip: privilege.isVip,
            trialAble: privilege.trialAble,
            trialRemaining: privilege.isVip
                ? null
                : isVipQuality(info.quality) &&
                    !privilege.isVip &&
                    privilege.trialRemaining != null
                    ? Math.max(0, privilege.trialRemaining - 1)
                    : privilege.trialRemaining,
            qualityDenied: denied,
            qualityNotice,
        };
    }
    async getPlayUrl(bvid, cid, qn, options) {
        await this.ensureBuvid3();
        const requestedQn = resolvePlayQn(qn);
        const referer = `https://www.bilibili.com/video/${bvid}`;
        const preferMp4 = options?.preferMp4 !== false;
        const fourk = requestedQn >= 80 ? 1 : 0;
        const aid = bvToAid(bvid);
        const loggedIn = isLoggedIn();
        const privilegeP = this.fetchPlayPrivilege(bvid, cid, aid);
        const reasons = [];
        const requestPlayurl = async (fnval, extra = {}) => {
            const params = await signParams({
                ...(aid > 0 ? { avid: aid } : {}),
                bvid,
                cid,
                qn: requestedQn,
                fnval,
                fnver: 0,
                fourk,
                otype: "json",
                ...extra,
            });
            return this.client.get("/x/player/wbi/playurl", {
                params,
                headers: { Referer: referer },
                validateStatus: () => true,
            });
        };
        const dashQuery = (fnval) => ({
            fnval,
            // BBDown / yt-dlp WEB 取流参数：不要用 html5 / platform=pc
            from_client: "BROWSER",
            support_multi_audio: "true",
            ...(loggedIn ? {} : { try_look: 1 }),
        });
        const fetchDashData = async (fnval = 16) => {
            const dashRes = await requestPlayurl(fnval, dashQuery(fnval));
            if (dashRes.data?.code !== 0) {
                const reason = `DASH 接口 fnval=${fnval} code=${dashRes.data?.code ?? dashRes.status} ${dashRes.data?.message ?? ""}`.trim();
                reasons.push(reason);
                console.warn("[BiliDesk][playurl]", reason, {
                    bvid,
                    cid,
                    qn: requestedQn,
                });
                return null;
            }
            const data = dashRes.data?.data;
            if (!data)
                return null;
            this.rememberPlayQualities(bvid, cid, parsePlayQualities(data));
            return data;
        };
        const tryDash = async (fnval = 16) => {
            const dashData = await fetchDashData(fnval);
            if (!dashData)
                return null;
            const privilege = mergePlayPrivilege(await privilegeP, parsePlayPrivilegeFromPayload(dashData));
            const built = this.buildPlayInfoFromDash(dashData, requestedQn, referer, privilege, "web");
            if (!built) {
                const reason = `DASH fnval=${fnval} 无可用视频轨或缺少 SegmentBase`;
                reasons.push(reason);
                console.warn("[BiliDesk][playurl]", reason, {
                    bvid,
                    cid,
                    qn: requestedQn,
                });
                return null;
            }
            console.warn("[BiliDesk][playurl] dash", {
                bvid,
                fnval,
                qn: requestedQn,
                quality: built.quality,
                format: built.format,
                url: built.url.slice(0, 48),
            });
            return this.withFullQualities(bvid, cid, this.attachPlayMeta(built, privilege, requestedQn));
        };
        const tryTvDash = async () => {
            const accessKey = appStore.get("accessToken");
            if (!accessKey || !aid)
                return null;
            const params = this.buildTvSignedParams({
                access_key: accessKey,
                build: 106500,
                cid,
                device: "android",
                fnval: 4048,
                fnver: 0,
                fourk: 1,
                mid: 0,
                mobi_app: "android_tv_yst",
                object_id: aid,
                platform: "android",
                playurl_type: 1,
                qn: requestedQn,
            });
            try {
                const tvRes = await axios.get(`${TV_PLAYURL_HOST}/x/tv/playurl`, {
                    params,
                    headers: {
                        ...defaultHeaders(),
                        Cookie: getCookieString(),
                    },
                    validateStatus: () => true,
                    timeout: 15000,
                });
                const code = tvRes.data?.code;
                if (code !== undefined && code !== 0) {
                    const reason = `TV playurl code=${code} ${tvRes.data?.message ?? ""}`.trim();
                    reasons.push(reason);
                    console.warn("[BiliDesk][playurl]", reason, { bvid, cid });
                    return null;
                }
                const payload = (tvRes.data?.data ?? tvRes.data);
                if (!payload)
                    return null;
                this.rememberPlayQualities(bvid, cid, parsePlayQualities(payload));
                const privilege = mergePlayPrivilege(await privilegeP, parsePlayPrivilegeFromPayload(payload));
                const built = this.buildPlayInfoFromDash(payload, requestedQn, referer, privilege, "tv");
                if (!built) {
                    reasons.push("TV playurl 无可用 DASH 轨");
                    return null;
                }
                console.warn("[BiliDesk][playurl] tv-dash", {
                    bvid,
                    qn: requestedQn,
                    quality: built.quality,
                });
                return this.withFullQualities(bvid, cid, this.attachPlayMeta(built, privilege, requestedQn));
            }
            catch (error) {
                reasons.push(`TV playurl 请求失败：${error instanceof Error ? error.message : "unknown"}`);
                return null;
            }
        };
        const tryMp4 = async (platform = "pc") => {
            const mp4Res = await requestPlayurl(1, {
                platform,
                ...(platform === "html5"
                    ? { high_quality: 1, ...(loggedIn ? {} : { try_look: 1 }) }
                    : {}),
            });
            if (mp4Res.data?.code !== 0) {
                const reason = `MP4 接口 code=${mp4Res.data?.code ?? mp4Res.status} ${mp4Res.data?.message ?? ""}`.trim();
                reasons.push(reason);
                console.warn("[BiliDesk][playurl]", reason, {
                    bvid,
                    cid,
                    qn: requestedQn,
                });
                return null;
            }
            const mp4Data = mp4Res.data?.data;
            const codecId = Number(mp4Data?.video_codecid ?? 0);
            if (codecId === 12 || codecId === 13) {
                reasons.push(`${platform} MP4 为 HEVC/AV1，Electron 可能无法解码`);
                return null;
            }
            const durl = mp4Data?.durl;
            const mp4Stream = durl?.[0];
            if (!mp4Stream?.url) {
                const reason = "MP4 无 durl 播放地址";
                reasons.push(reason);
                console.warn("[BiliDesk][playurl]", reason, {
                    bvid,
                    cid,
                    qn: requestedQn,
                });
                return null;
            }
            const ordered = orderMediaUrls(mp4Stream.url, mp4Stream.backup_url);
            if (!ordered) {
                reasons.push("MP4 地址无效");
                return null;
            }
            if (rankMediaUrl(ordered.url) === 0) {
                reasons.push(`${platform} MP4 仅有 mcdn`);
                return null;
            }
            if (mp4Data) {
                this.rememberPlayQualities(bvid, cid, parsePlayQualities(mp4Data));
            }
            const actualQn = Number(mp4Data?.quality ?? 0);
            const proxied = platform === "html5" || actualQn >= 80
                ? wrapMediaUrl(ordered.url, referer)
                : ordered.url;
            console.warn("[BiliDesk][playurl] mp4", {
                bvid,
                platform,
                qn: requestedQn,
                quality: mp4Data?.quality,
                host: (() => {
                    try {
                        return new URL(ordered.url).hostname;
                    }
                    catch {
                        return "";
                    }
                })(),
            });
            const privilege = mergePlayPrivilege(await privilegeP, parsePlayPrivilegeFromPayload(mp4Data));
            return this.withFullQualities(bvid, cid, this.attachPlayMeta(this.buildPlayInfoFromDurl(mp4Data ?? {}, { ...mp4Stream, url: proxied }, requestedQn), privilege, requestedQn));
        };
        const attachQualities = async (info) => {
            const cached = this.playQualityCache.get(`${bvid}:${cid}`);
            const has1080 = (cached ?? info.qualities).some((item) => item.qn >= 80);
            if (!has1080) {
                await Promise.race([fetchDashData(16), sleep(1500)]);
            }
            const privilege = mergePlayPrivilege(await privilegeP, {
                isVip: info.isVip,
                trialAble: info.trialAble,
                trialRemaining: info.trialRemaining ?? null,
            });
            return this.withFullQualities(bvid, cid, this.attachPlayMeta(info, privilege, requestedQn));
        };
        // 1080P+：跟 BBDown / yt-dlp 一样走 WEB DASH（fnval=4048），html5 MP4 最高经常只有 720P
        if (requestedQn >= 80) {
            const dashAll = await tryDash(4048);
            if (dashAll && dashAll.quality >= 80)
                return dashAll;
            const dashBasic = await tryDash(16);
            if (dashBasic && dashBasic.quality >= 80)
                return dashBasic;
            const tv = await tryTvDash();
            if (tv && tv.quality >= 80)
                return tv;
            const pc = await tryMp4("pc");
            if (pc)
                return attachQualities(pc);
            const html5 = await tryMp4("html5");
            if (html5)
                return attachQualities(html5);
            if (dashAll)
                return dashAll;
            if (dashBasic)
                return dashBasic;
            if (tv)
                return tv;
        }
        else if (preferMp4) {
            const mp4 = await tryMp4("pc");
            if (mp4)
                return attachQualities(mp4);
            const dash = await tryDash(16);
            if (dash)
                return dash;
        }
        else {
            const dash = await tryDash(16);
            if (dash)
                return dash;
            const mp4 = await tryMp4("pc");
            if (mp4)
                return attachQualities(mp4);
        }
        throw new Error(reasons.length > 0
            ? `取流失败：${reasons.join("；")}`
            : "该视频暂不支持在线播放，可能为付费或受限内容");
    }
    async getVideoHeatmap(bvid, cid) {
        const res = await this.client.get("/x/player/pbp", {
            params: { bvid, cid },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return [];
        const data = (res.data?.data ?? {});
        const events = data.events;
        let raw = [];
        if (Array.isArray(events))
            raw = events;
        else if (events && typeof events === "object") {
            const bucket = events.default;
            if (Array.isArray(bucket))
                raw = bucket;
        }
        const values = raw
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item) && item >= 0);
        const max = values.reduce((peak, item) => Math.max(peak, item), 0);
        if (max <= 0)
            return [];
        return values.map((item) => (max <= 1 ? item : item / max));
    }
    async getArchiveNotes(aid) {
        const res = await this.client.get("/x/note/list/archive", {
            params: { oid: aid, oid_type: 0, pn: 1, ps: 20 },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return [];
        const data = res.data?.data;
        const list = data?.list ?? data?.notes ?? [];
        if (!Array.isArray(list))
            return [];
        return list
            .map((entry) => {
            const item = entry;
            const id = Number(item.note_id ?? item.cvid ?? item.id) || 0;
            const title = String(item.title ?? "").trim();
            const summary = String(item.summary ?? item.desc ?? "").trim();
            if (!id)
                return null;
            return { id, title: title || "未命名笔记", summary };
        })
            .filter((item) => item != null);
    }
    async addArchiveNote(aid, title, text) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再写笔记");
        const bodyText = text.trim();
        const noteTitle = title.trim() || bodyText.slice(0, 20) || "笔记";
        if (!bodyText)
            throw new Error("笔记内容不能为空");
        const body = new URLSearchParams({
            csrf,
            oid: String(aid),
            oid_type: "0",
            title: noteTitle,
            summary: bodyText.slice(0, 200),
            content: JSON.stringify([{ insert: `${bodyText}\n` }]),
            publish: "0",
        });
        const res = await this.client.post("/x/note/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "保存笔记失败");
        }
    }
    async downloadVideoFile(bvid, cid, dest, qn) {
        const info = await this.getPlayUrl(bvid, cid, qn, { preferMp4: true });
        if (info.format === "dash" || !info.url) {
            throw new Error("当前是分段画质，请先把清晰度调到 720P 或更低再下载");
        }
        const res = await axios.get(info.url, {
            responseType: "stream",
            headers: {
                ...defaultHeaders(),
                Cookie: getCookieString(),
                Referer: `https://www.bilibili.com/video/${bvid}`,
            },
            validateStatus: () => true,
            timeout: 0,
        });
        if (res.status >= 400) {
            throw new Error(`下载失败（${res.status}）`);
        }
        await pipeline(res.data, createWriteStream(dest));
    }
    async getSeason(kind, id, by = "season") {
        const path = kind === "cheese" ? "/pugv/view/web/season" : "/pgc/view/web/season";
        const res = await this.client.get(path, {
            params: by === "ep" ? { ep_id: id } : { season_id: id },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        const result = (res.data?.result ?? res.data?.data);
        const seasonCode = res.data?.code;
        if ((seasonCode !== undefined && seasonCode !== 0 && seasonCode !== "0") ||
            !result) {
            throw new Error(formatBiliApiError(res.data, "剧集加载失败"));
        }
        const status = (result.user_status ?? {});
        const rating = (result.rating ?? {});
        const rawEps = (result.episodes ?? result.ep_list ?? []);
        const episodes = [];
        if (Array.isArray(rawEps)) {
            for (const entry of rawEps) {
                if (!entry || typeof entry !== "object")
                    continue;
                const ep = entry;
                const epId = Number(ep.id ?? ep.ep_id) || 0;
                const cid = Number(ep.cid) || 0;
                if (!epId || !cid)
                    continue;
                const title = String(ep.long_title ?? ep.title ?? ep.index_title ?? "").trim() ||
                    `第 ${episodes.length + 1} 集`;
                episodes.push({
                    epId,
                    aid: Number(ep.aid) || 0,
                    cid,
                    bvid: String(ep.bvid ?? ""),
                    title,
                    cover: String(ep.cover ?? "").replace(/^http:/, "https:"),
                    duration: Number(ep.duration) || 0,
                    badge: String(ep.badge ?? "").trim(),
                });
            }
        }
        return {
            kind,
            seasonId: Number(result.season_id) || (by === "season" ? id : 0),
            title: String(result.title ?? result.season_title ?? "剧集"),
            cover: String(result.cover ?? "").replace(/^http:/, "https:"),
            evaluate: String(result.evaluate ?? result.subtitle ?? "").trim(),
            score: Number(rating.score) || 0,
            followed: Number(status.follow) === 1 ||
                status.follow === true ||
                Number(status.favored) === 1 ||
                status.favored === true,
            episodes,
        };
    }
    async getSeasonPlayUrl(kind, epId, cid, qn) {
        const requestedQn = resolvePlayQn(qn);
        const path = kind === "cheese"
            ? "/pugv/player/web/playurl"
            : "/pgc/player/web/playurl";
        const referer = kind === "cheese"
            ? `https://www.bilibili.com/cheese/play/ep${epId}`
            : `https://www.bilibili.com/bangumi/play/ep${epId}`;
        const params = await signParams({
            ep_id: epId,
            cid,
            qn: requestedQn,
            fnver: 0,
            fnval: 16,
            fourk: requestedQn >= 80 ? 1 : 0,
        });
        const res = await this.client.get(path, {
            params,
            headers: { Referer: referer },
            validateStatus: () => true,
        });
        const payload = (res.data?.result ?? res.data?.data);
        const playCode = res.data?.code;
        if ((playCode !== undefined && playCode !== 0 && playCode !== "0") ||
            !payload) {
            throw new Error(res.data?.message || "该剧集暂不支持在线播放");
        }
        const privilege = mergePlayPrivilege(parsePlayPrivilegeFromPayload(payload));
        const dash = this.buildPlayInfoFromDash(payload, requestedQn, referer, privilege, "web");
        if (dash)
            return this.attachPlayMeta(dash, privilege, requestedQn);
        const durl = payload.durl?.[0];
        if (durl?.url) {
            return this.attachPlayMeta(this.buildPlayInfoFromDurl(payload, { url: wrapMediaUrl(durl.url, referer), format: "mp4" }, requestedQn), privilege, requestedQn);
        }
        throw new Error(res.data?.message || "该剧集暂不支持在线播放");
    }
    async setSeasonFollow(kind, seasonId, follow) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再追番");
        const path = kind === "cheese"
            ? follow
                ? "/pugv/pay/web/favorite/add"
                : "/pugv/pay/web/favorite/del"
            : follow
                ? "/pgc/web/follow/add"
                : "/pgc/web/follow/del";
        const body = new URLSearchParams({
            season_id: String(seasonId),
            csrf,
        });
        const res = await this.client.post(path, body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "更新追番状态失败");
        }
    }
    async getChannelVideos(channelId, page = 1) {
        const res = await this.client.get("/x/web-interface/web/channel/category/channel_arc/list", {
            params: { channel_id: channelId, pn: page, ps: 20 },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "频道加载失败");
        }
        const data = (res.data?.data ?? {});
        const archives = (data.archives ?? data.list ?? []);
        const videos = Array.isArray(archives)
            ? archives
                .filter((item) => Boolean(item &&
                typeof item === "object" &&
                item.bvid))
                .map((item) => this.normalizeVideo(item))
            : [];
        const pageInfo = (data.page ?? {});
        const total = Number(pageInfo.count ?? data.total) || 0;
        const name = String(data.name ??
            data.channel?.name ??
            "").trim();
        return {
            id: channelId,
            name: name || "频道",
            videos,
            page,
            hasMore: total > 0 ? page * 20 < total : videos.length >= 20,
        };
    }
    async getAudioSong(sid) {
        const infoRes = await axios.get("https://www.bilibili.com/audio/music-service-c/web/song/info", {
            params: { sid },
            headers: { ...defaultHeaders(), Cookie: getCookieString() },
            validateStatus: () => true,
        });
        if (infoRes.data?.code !== 0) {
            throw new Error(infoRes.data?.msg || "音频信息加载失败");
        }
        const info = (infoRes.data?.data ?? {});
        const urlRes = await axios.get("https://www.bilibili.com/audio/music-service-c/web/url", {
            params: { sid, privilege: 2, quality: 2 },
            headers: {
                ...defaultHeaders(),
                Cookie: getCookieString(),
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        const urlData = (urlRes.data?.data ?? {});
        const cdns = urlData.cdns;
        const url = Array.isArray(cdns) ? String(cdns[0] ?? "") : "";
        return {
            sid,
            title: String(info.title ?? "音频"),
            cover: String(info.cover ?? "").replace(/^http:/, "https:"),
            author: String(info.author ?? info.uname ?? ""),
            intro: String(info.intro ?? "").trim(),
            url,
        };
    }
    async updateMyProfile(input) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再修改资料");
        const fields = { csrf };
        const name = input.name?.trim();
        if (name)
            fields.uname = name;
        if (input.sign != null)
            fields.usersign = input.sign.trim();
        if (!fields.uname && input.sign == null) {
            throw new Error("没有要保存的内容");
        }
        const res = await this.client.post("/x/member/web/update", new URLSearchParams(fields), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://account.bilibili.com/account/setting",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "保存资料失败");
        }
    }
    async updateMyFace(file) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再更换头像");
        const bytes = Buffer.from(file.data);
        if (bytes.length === 0)
            throw new Error("头像文件是空的");
        if (bytes.length > 2 * 1024 * 1024)
            throw new Error("头像不能超过 2MB");
        const form = new FormData();
        form.append("face", new Blob([Uint8Array.from(bytes)], { type: file.mime || "image/jpeg" }), file.name || "face.jpg");
        form.append("csrf", csrf);
        const res = await this.client.post("/x/member/web/face/update", form, {
            headers: { Referer: "https://account.bilibili.com/account/setting" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "更换头像失败");
        }
        const data = (res.data?.data ?? {});
        return String(data.face ?? data.url ?? "").replace(/^http:/, "https:");
    }
    async getWallet() {
        const res = await this.client.get("/x/web-interface/nav", {
            validateStatus: () => true,
        });
        const wallet = (res.data?.data?.wallet ?? {});
        const bcoin = wallet.bcoin_balance;
        return { bcoin: bcoin == null || bcoin === "" ? "0" : String(bcoin) };
    }
    async getDanmakuList(cid) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v1/dm/list.so", {
            params: { oid: cid },
            responseType: "text",
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        const xml = typeof res.data === "string" ? res.data : String(res.data ?? "");
        return parseDanmakuXml(xml);
    }
    async sendDanmaku(payload) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再发送弹幕");
        const message = payload.message.trim();
        if (!message)
            throw new Error("弹幕内容不能为空");
        if (message.length > 100)
            throw new Error("弹幕最多 100 个字");
        const body = new URLSearchParams({
            type: "1",
            oid: String(payload.cid),
            msg: message,
            mode: String(payload.mode ?? 1),
            fontsize: String(payload.fontsize ?? 25),
            color: String(payload.color ?? 16777215),
            progress: String(Math.max(0, Math.floor(payload.progress))),
            bvid: payload.bvid,
            rnd: String(Date.now() * 1000),
            csrf,
        });
        const res = await this.client.post("/x/v2/dm/post", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/video/${payload.bvid}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "发送弹幕失败");
        }
        try {
            const { captureLocalDanmaku } = await import("./footprint-capture");
            captureLocalDanmaku({
                message,
                bvid: payload.bvid,
                progress: payload.progress,
            });
        }
        catch {
            // 足迹写入失败不影响发弹幕
        }
    }
    /** 互动弹幕（评分 / 投票等），来自 dm/web/view protobuf */
    async getCommandDanmakuList(aid, cid) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v2/dm/web/view", {
            params: { type: 1, oid: cid, pid: aid },
            responseType: "arraybuffer",
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.status !== 200) {
            throw new Error(`获取互动弹幕失败：HTTP ${res.status}`);
        }
        const buf = new Uint8Array(res.data);
        return decodeDmWebViewCommandDms(buf)
            .map((raw) => normalizeCommandDanmaku(raw))
            .filter((item) => item.kind === "grade" || item.kind === "vote")
            .sort((a, b) => a.progress - b.progress);
    }
    async postCommandGrade(payload) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再评分");
        const hearts = Math.min(5, Math.max(1, Math.round(payload.hearts)));
        const gradeScore = hearts * 2;
        const body = new URLSearchParams({
            aid: String(payload.aid),
            cid: String(payload.cid),
            progress: String(Math.max(0, Math.floor(payload.progress))),
            grade_id: String(payload.gradeId),
            grade_score: String(gradeScore),
            csrf,
        });
        const res = await this.client.post("/x/v2/dm/command/grade/post", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "评分失败");
        }
        return { midScore: gradeScore };
    }
    async postCommandVote(payload) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再投票");
        // 字段对齐官网播放器 dmCmdStore.vote：option_id 才是选项，vote 会被当成非法参数
        const body = new URLSearchParams({
            aid: String(payload.aid),
            cid: String(payload.cid),
            progress: String(Math.max(0, Math.floor(payload.progress))),
            vote_id: String(payload.voteId),
            vote_type: String(payload.voteType ?? 0),
            cmd_id_str: payload.cmdId || "",
            option_id: String(payload.idx),
            has_self_def: payload.hasSelfDef ? "1" : "0",
            polaris_app_id: "100",
            polaris_platform: "5",
            csrf,
        });
        const res = await this.client.post("/x/v2/dm/command/vote/post", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "投票失败"));
        }
        return { myVote: payload.idx };
    }
    /**
     * 官方 Web 评论列表：/x/v2/reply/main（mode 3 热度 / 2 时间）
     * /x/v2/reply 会被 CDN 缓存，刚发的评论不在第一页；
     * /x/v2/reply/wbi/main 在 Electron 里会 -403，不能用。
     */
    async fetchReplyMainPage(oid, type, sort, page, offset = "", seekRpid = 0) {
        await this.ensureBuvid3();
        const pageSize = 20;
        const isFirst = page <= 1 && !offset;
        const params = {
            oid: String(oid),
            type,
            mode: sort === 2 ? 2 : 3,
            plat: 1,
            web_location: 1315875,
            pagination_str: JSON.stringify({ offset: offset || "" }),
        };
        if (isFirst)
            params.next = 0;
        if (isFirst && seekRpid > 0)
            params.seek_rpid = String(seekRpid);
        const headers = { Referer: "https://www.bilibili.com/" };
        let res = await this.client.get("/x/v2/reply/wbi/main", {
            params: await signParams(params),
            headers,
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            res = await this.client.get("/x/v2/reply/main", {
                params,
                headers,
                validateStatus: () => true,
            });
        }
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "评论加载失败");
        }
        const commentPage = this.normalizeCommentPage(res.data?.data, page, pageSize, {
            includeTop: isFirst,
        });
        this.rememberOwnComments(commentPage.comments, type);
        return commentPage;
    }
    async getComments(aid, page = 1, sort = 0, offset = "", seekRpid = 0) {
        return this.fetchReplyMainPage(aid, 1, sort, page, offset, seekRpid);
    }
    /** 拉少量热评原文，给收藏整理/推荐夹用 */
    async getHotCommentTexts(aid, limit = 8) {
        if (!Number.isFinite(aid) || aid <= 0)
            return [];
        await this.ensureBuvid3();
        const take = Math.min(20, Math.max(limit, 6));
        const res = await this.client.get("/x/v2/reply", {
            params: {
                type: 1,
                oid: aid,
                pn: 1,
                ps: take,
                sort: 2,
            },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("[412] 请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0)
            return [];
        const page = this.normalizeCommentPage(res.data?.data, 1, take);
        return page.comments
            .slice(0, limit)
            .map((item) => item.content)
            .filter(Boolean);
    }
    async getCommentReplies(aid, root, page = 1) {
        await this.ensureBuvid3();
        const pageSize = 10;
        const res = await this.client.get("/x/v2/reply/reply", {
            params: {
                type: 1,
                oid: aid,
                root,
                pn: page,
                ps: pageSize,
            },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "楼中楼加载失败");
        }
        const commentPage = this.normalizeCommentPage(res.data?.data, page, pageSize);
        this.rememberOwnComments(commentPage.comments, 1);
        return commentPage;
    }
    async addComment(aid, message, root = 0, parent = 0, images = []) {
        return this.postReply(String(aid), 1, message, root, parent, images, "https://www.bilibili.com/");
    }
    async likeComment(aid, rpid, like) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点赞");
        const body = new URLSearchParams({
            type: "1",
            oid: String(aid),
            rpid: String(rpid),
            action: like ? "1" : "0",
            csrf,
        });
        const res = await this.client.post("/x/v2/reply/action", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "点赞失败");
        }
    }
    async postReplyForm(path, fields, fallback) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再操作评论");
        const body = new URLSearchParams({ ...fields, csrf });
        const res = await this.client.post(path, body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || fallback);
        }
    }
    async hateComment(oid, type, rpid, hate) {
        await this.postReplyForm("/x/v2/reply/hate", {
            type: String(type),
            oid: String(oid),
            rpid: String(rpid),
            action: hate ? "1" : "0",
        }, "点踩失败");
    }
    async pinComment(oid, type, rpid, pin) {
        await this.postReplyForm("/x/v2/reply/top", {
            type: String(type),
            oid: String(oid),
            rpid: String(rpid),
            action: pin ? "1" : "0",
        }, pin ? "置顶评论失败" : "取消置顶失败");
    }
    /**
     * B 站没有「我发出的全部评论」接口。
     * 从观看记录往回翻到已有索引的时间，把这段缺口里的评论和楼中楼补上。
     */
    async listOwnCommentsFromRecentHistory(uid, onProgress, shouldStop, sinceTs = 0) {
        if (uid <= 0)
            return { items: [], note: "" };
        const fallback = Math.floor(Date.now() / 1000) - 120 * 24 * 3600;
        const cutoff = sinceTs > 0 ? Math.max(fallback, sinceTs - 2 * 24 * 3600) : fallback;
        const targets = [];
        const seenTarget = new Set();
        let cursor;
        let note = "";
        for (let page = 0; page < 40 && targets.length < 400; page += 1) {
            if (shouldStop?.())
                break;
            let history;
            try {
                history = await this.fetchHistoryCursorPage("all", cursor);
            }
            catch (error) {
                note = error instanceof Error ? error.message : String(error);
                break;
            }
            let reachedCutoff = false;
            for (const item of history.items) {
                if (item.viewAt > 0 && item.viewAt < cutoff) {
                    reachedCutoff = true;
                    break;
                }
                const type = item.business === "article"
                    ? 12
                    : item.business === "archive" || item.bvid
                        ? 1
                        : 0;
                if (!type || item.oid <= 0)
                    continue;
                const key = `${type}:${item.oid}`;
                if (seenTarget.has(key))
                    continue;
                seenTarget.add(key);
                targets.push({ oid: item.oid, type, bvid: item.bvid });
                if (targets.length >= 400)
                    break;
            }
            if (reachedCutoff || !history.hasMore)
                break;
            cursor = history.cursor;
        }
        const found = [];
        const seenRpid = new Set();
        for (let index = 0; index < targets.length; index += 1) {
            if (shouldStop?.())
                break;
            const target = targets[index];
            const batch = [];
            const threadRoots = [];
            let offset = "";
            let cursorNext = 0;
            for (let round = 0; round < 8; round += 1) {
                if (shouldStop?.())
                    break;
                const page = await this.fetchTimeSortedReplies(target.oid, target.type, offset, cursorNext);
                if (page.blocked) {
                    note = "查找最近评论时被 B 站限流，已保留已经找到的部分";
                    onProgress?.(index + 1, targets.length, batch);
                    found.push(...batch);
                    return { items: found, note };
                }
                for (const raw of page.replies) {
                    this.pushOwnReply(raw, uid, target, batch, seenRpid);
                    const rootId = String(raw.rpid_str ?? raw.rpid ?? "").trim();
                    const childCount = Number(raw.rcount) ||
                        (Array.isArray(raw.replies) ? raw.replies.length : 0);
                    if (childCount > 0 &&
                        rootId &&
                        threadRoots.length < 8 &&
                        !threadRoots.includes(rootId)) {
                        threadRoots.push(rootId);
                    }
                }
                const olderThanWindow = page.oldest > 0 && page.oldest < cutoff;
                if (page.isEnd || olderThanWindow)
                    break;
                offset = page.nextOffset;
                cursorNext = page.nextOffset ? 0 : page.next;
                if (!offset && cursorNext <= 0)
                    break;
                await new Promise((resolve) => setTimeout(resolve, 120));
            }
            for (const root of threadRoots) {
                if (shouldStop?.())
                    break;
                const thread = await this.fetchReplyChildren(target.oid, target.type, root);
                for (const raw of thread.replies) {
                    this.pushOwnReply(raw, uid, target, batch, seenRpid);
                }
                if (thread.blocked) {
                    note = "查找最近评论时被 B 站限流，已保留已经找到的部分";
                    found.push(...batch);
                    onProgress?.(index + 1, targets.length, batch);
                    return { items: found, note };
                }
                await new Promise((resolve) => setTimeout(resolve, 120));
            }
            found.push(...batch);
            onProgress?.(index + 1, targets.length, batch);
            if (index < targets.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 160));
            }
        }
        return { items: found, note };
    }
    async fetchTimeSortedReplies(oid, type, offset, cursorNext) {
        const params = {
            oid: String(oid),
            type,
            mode: 2,
            plat: 1,
        };
        if (offset)
            params.pagination_str = JSON.stringify({ offset });
        else
            params.next = cursorNext;
        const res = await this.client.get("/x/v2/reply/main", {
            params,
            headers: { Referer: "https://www.bilibili.com/" },
            timeout: 8000,
            validateStatus: () => true,
        });
        const code = Number(res.data?.code);
        if (res.status === 412 ||
            code === -352 ||
            code === -412 ||
            code === -509 ||
            code === -799) {
            return {
                replies: [],
                nextOffset: "",
                next: 0,
                oldest: 0,
                isEnd: true,
                blocked: true,
            };
        }
        if (code !== 0) {
            return {
                replies: [],
                nextOffset: "",
                next: 0,
                oldest: 0,
                isEnd: true,
                blocked: false,
            };
        }
        const data = (res.data?.data ?? {});
        const replies = Array.isArray(data.replies)
            ? data.replies
            : [];
        const cursor = (data.cursor ?? {});
        const nextOffset = String(cursor.pagination_reply?.next_offset ?? "").trim();
        const next = Number(cursor.next) || 0;
        let oldest = 0;
        for (const raw of replies) {
            const ctime = Number(raw.ctime) || 0;
            if (ctime > 0 && (oldest === 0 || ctime < oldest))
                oldest = ctime;
        }
        return {
            replies,
            nextOffset,
            next,
            oldest,
            isEnd: cursor.is_end === true ||
                replies.length === 0 ||
                (!nextOffset && next <= 0),
            blocked: false,
        };
    }
    async fetchReplyChildren(oid, type, root) {
        const res = await this.client.get("/x/v2/reply/reply", {
            params: { oid: String(oid), type, root, pn: 1, ps: 20 },
            headers: { Referer: "https://www.bilibili.com/" },
            timeout: 8000,
            validateStatus: () => true,
        });
        const code = Number(res.data?.code);
        if (res.status === 412 ||
            code === -352 ||
            code === -412 ||
            code === -509 ||
            code === -799) {
            return { replies: [], blocked: true };
        }
        if (code !== 0)
            return { replies: [], blocked: false };
        const data = (res.data?.data ?? {});
        const replies = Array.isArray(data.replies)
            ? data.replies
            : [];
        return { replies, blocked: false };
    }
    pushOwnReply(raw, uid, target, found, seen) {
        const member = (raw.member ?? {});
        const mid = Number(raw.mid) || Number(member.mid) || 0;
        const rpid = String(raw.rpid_str ?? raw.rpid ?? "").trim();
        if (mid === uid && rpid && !seen.has(rpid)) {
            seen.add(rpid);
            const content = (raw.content ?? {});
            found.push({
                id: `comment:${rpid}`,
                kind: "comment",
                text: String(content.message ?? ""),
                time: Number(raw.ctime) || 0,
                oid: Number(raw.oid) || target.oid,
                type: Number(raw.type) || target.type,
                rpid,
                bvid: target.type === 1 ? target.bvid : undefined,
                source: "bili",
            });
        }
        const nested = raw.replies;
        if (!Array.isArray(nested))
            return;
        for (const child of nested) {
            if (child && typeof child === "object") {
                this.pushOwnReply(child, uid, target, found, seen);
            }
        }
    }
    /**
     * 这条评论在 B 站还在不在。
     * /x/v2/reply/reply 用 root=rpid：还在则 code=0；已删除是 12006「没有该评论」。
     * 楼中楼的 rpid 不是根评论，12006 时再用 seek_rpid 确认，避免误删。
     */
    async probeReplyPresence(oid, type, rpid) {
        const id = String(rpid).trim();
        if (!oid || !id)
            return "unknown";
        const headers = { Referer: "https://www.bilibili.com/" };
        const res = await this.client.get("/x/v2/reply/reply", {
            params: { oid: String(oid), type, root: id, pn: 1, ps: 1 },
            headers,
            timeout: 8000,
            validateStatus: () => true,
        });
        this.assertReplyProbeAllowed(res.status, res.data);
        const code = Number(res.data?.code);
        const message = String(res.data?.message ?? "");
        const root = res.data?.data?.root;
        if (code === 0 && this.sameReplyId(this.replyIdOf(root), id))
            return "alive";
        if (code === 0)
            return "unknown";
        if (!this.replyLooksMissing(code, message))
            return "unknown";
        const seek = await this.client.get("/x/v2/reply/main", {
            params: {
                oid: String(oid),
                type,
                mode: 2,
                plat: 1,
                seek_rpid: id,
                next: 0,
            },
            headers,
            timeout: 8000,
            validateStatus: () => true,
        });
        this.assertReplyProbeAllowed(seek.status, seek.data);
        if (Number(seek.data?.code) !== 0)
            return "unknown";
        return this.payloadHasReplyId(seek.data?.data, id) ? "alive" : "gone";
    }
    replyIdOf(reply) {
        if (!reply)
            return "";
        const text = reply.rpid_str ?? reply.rpid;
        return text == null ? "" : String(text);
    }
    sameReplyId(a, b) {
        if (!a || !b)
            return false;
        if (a === b)
            return true;
        const left = Number(a);
        const right = Number(b);
        return Number.isSafeInteger(left) && left > 0 && left === right;
    }
    replyLooksMissing(code, message) {
        if (code === 12006 || code === 12022)
            return true;
        return /没有该评论|评论已删除|已被删除/.test(message);
    }
    assertReplyProbeAllowed(status, data) {
        const code = Number(data?.code);
        if (status === 412 ||
            code === -101 ||
            code === -111 ||
            code === -352 ||
            code === -412 ||
            code === -509 ||
            code === -799) {
            throw new Error("核对被 B 站限流或登录失效，已保留其余评论");
        }
    }
    payloadHasReplyId(data, rpid) {
        const target = String(rpid);
        const stack = [data];
        let steps = 0;
        while (stack.length > 0 && steps < 4000) {
            steps += 1;
            const current = stack.pop();
            if (!current || typeof current !== "object")
                continue;
            if (Array.isArray(current)) {
                for (const item of current)
                    stack.push(item);
                continue;
            }
            const row = current;
            if (this.sameReplyId(this.replyIdOf(row), target) &&
                (row.rpid != null || row.rpid_str != null)) {
                return true;
            }
            for (const key of ["replies", "top", "top_replies", "root", "reply"]) {
                if (key in row)
                    stack.push(row[key]);
            }
        }
        return false;
    }
    async deleteReply(oid, type, rpid) {
        await this.postReplyForm("/x/v2/reply/del", {
            type: String(type),
            oid: String(oid),
            rpid: String(rpid),
        }, "删除评论失败");
    }
    async reportComment(oid, type, rpid, reason) {
        await this.postReplyForm("/x/v2/reply/report", {
            type: String(type),
            oid: String(oid),
            rpid: String(rpid),
            reason: String(reason),
        }, "举报失败");
    }
    /** 网页评论翻译。未登录是 -101；评论不存在是 12006。译文在 translated_content.message */
    async translateComment(oid, type, rpid) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再翻译");
        const res = await this.client.get("/x/v2/reply/translate", {
            params: {
                type,
                oid: String(oid),
                rpid: String(rpid),
                csrf,
            },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "翻译失败"));
        }
        const content = res.data?.data?.translated_content;
        const message = String(content?.message ?? "").trim();
        if (!message)
            throw new Error("这条评论没有译文");
        return message;
    }
    normalizeCommentPage(data, page, pageSize, options) {
        const replies = this.asReplyRecords(data?.replies);
        const tops = options?.includeTop ? this.collectPinnedReplies(data) : [];
        const seen = new Set();
        const comments = [];
        for (const entry of [
            ...tops,
            ...replies.map((item) => ({ item, pinKind: undefined })),
        ]) {
            const normalized = this.normalizeCommentItem(entry.item, entry.pinKind);
            if (!normalized || seen.has(normalized.rpid))
                continue;
            seen.add(normalized.rpid);
            comments.push(normalized);
        }
        const cursor = data?.cursor;
        const pageInfo = data?.page;
        const count = pageInfo?.count ?? comments.length;
        const acount = Number(cursor?.all_count ?? pageInfo?.acount ?? count) || count;
        const nextOffset = String(cursor?.pagination_reply?.next_offset ?? "").trim();
        const hasMore = cursor
            ? cursor.is_end === false && Boolean(nextOffset)
            : comments.length >= pageSize && page * pageSize < Math.max(count, 1);
        return {
            comments,
            page,
            pageSize,
            count,
            acount,
            hasMore,
            nextOffset: nextOffset || undefined,
        };
    }
    asReplyRecords(raw) {
        if (Array.isArray(raw)) {
            return raw.filter((item) => Boolean(item) && typeof item === "object");
        }
        if (raw && typeof raw === "object") {
            return [raw];
        }
        return [];
    }
    collectPinnedReplies(data) {
        if (!data)
            return [];
        const top = (data.top ?? {});
        const upper = (data.upper ?? {});
        const slots = [
            [top.upper, "upper"],
            [top.admin, "admin"],
            [top.vote, "vote"],
            [upper.top, "upper"],
        ];
        const collected = [];
        const seen = new Set();
        const push = (raw, pinKind) => {
            for (const item of this.asReplyRecords(raw)) {
                const rpid = Number(item.rpid_str ?? item.rpid);
                if (!Number.isFinite(rpid) || rpid <= 0 || seen.has(rpid))
                    continue;
                seen.add(rpid);
                collected.push({ item, pinKind });
            }
        };
        for (const [raw, kind] of slots)
            push(raw, kind);
        push(data.top_replies, "upper");
        return collected;
    }
    rememberOwnComments(comments, type) {
        const uid = Number(appStore.get("cookies").DedeUserID) ||
            Number(appStore.get("user")?.mid) ||
            0;
        if (uid <= 0 || comments.length === 0)
            return;
        const mine = [];
        const walk = (list) => {
            for (const item of list) {
                if (item.mid === uid || item.member?.mid === uid)
                    mine.push(item);
                if (item.replies?.length)
                    walk(item.replies);
            }
        };
        walk(comments);
        if (mine.length === 0)
            return;
        void import("./footprint-capture").then(({ captureLocalComment }) => {
            for (const item of mine)
                captureLocalComment(item, type, "bili");
        });
    }
    normalizeCommentItem(item, pinKind) {
        const rpid = Number(item.rpid_str ?? item.rpid);
        if (!Number.isFinite(rpid) || rpid <= 0)
            return null;
        const member = (item.member ?? {});
        const content = (item.content ?? {});
        const replyControl = (item.reply_control ?? {});
        const nested = (item.replies ?? []);
        const locationRaw = String(replyControl.location ?? item.location ?? content.ip_label ?? "").trim();
        const location = locationRaw.replace(/^IP属地[:：]?\s*/i, "").trim();
        const pictures = this.extractCommentPictures(content.pictures);
        const detectedPin = pinKind ?? this.detectCommentPinKind(item);
        return {
            rpid,
            rpidStr: String(item.rpid_str ?? item.rpid ?? ""),
            oid: Number(item.oid) || 0,
            mid: Number(item.mid) || Number(member.mid) || 0,
            root: Number(item.root) || 0,
            parent: Number(item.parent) || 0,
            content: String(content.message ?? ""),
            mentions: this.extractCommentMentions(content),
            emotes: this.mergeEmoteMaps(this.extractCommentEmotes(content.emote), this.extractRichNodeEmotes(content)),
            pictures,
            location: location || undefined,
            like: Number(item.like) || 0,
            action: Number(item.action) || 0,
            ctime: Number(item.ctime) || 0,
            rcount: Number(item.rcount) || 0,
            member: {
                mid: Number(member.mid) || 0,
                name: String(member.uname || member.name || "用户"),
                face: this.normalizeBfsUrl(String(member.avatar || member.face || "")),
                level: Number(member.level_info
                    ?.current_level),
                isSeniorMember: Number(member.is_senior_member) === 1,
                sex: String(member.sex || ""),
            },
            replies: nested
                .map((reply) => this.normalizeCommentItem(reply))
                .filter((reply) => reply != null),
            pinned: Boolean(detectedPin),
            pinKind: detectedPin,
        };
    }
    detectCommentPinKind(item) {
        const labels = item.card_label;
        if (Array.isArray(labels)) {
            const text = labels
                .map((entry) => String(entry
                ?.text_content ??
                entry?.text ??
                ""))
                .join(" ");
            if (text.includes("置顶"))
                return "upper";
        }
        return undefined;
    }
    extractCommentPictures(raw) {
        if (!Array.isArray(raw) || raw.length === 0)
            return undefined;
        const pictures = [];
        for (const entry of raw) {
            if (!entry || typeof entry !== "object")
                continue;
            const pic = entry;
            const src = this.normalizeHttps(String(pic.img_src ?? pic.src ?? pic.url ?? ""));
            if (!src)
                continue;
            pictures.push({
                src,
                width: Number(pic.img_width ?? pic.width) || 0,
                height: Number(pic.img_height ?? pic.height) || 0,
            });
        }
        return pictures.length > 0 ? pictures : undefined;
    }
    extractCommentEmotes(raw) {
        if (!raw || typeof raw !== "object")
            return undefined;
        const result = {};
        for (const [key, value] of Object.entries(raw)) {
            if (!key.startsWith("["))
                continue;
            if (typeof value === "string" && value) {
                result[key] = this.normalizeHttps(value);
                continue;
            }
            if (value && typeof value === "object") {
                const rec = value;
                const url = this.normalizeHttps(String(rec.url ?? rec.icon_url ?? rec.gif_url ?? ""));
                if (url)
                    result[key] = url;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }
    stripAtDisplayName(nameRaw) {
        return String(nameRaw ?? "")
            .replace(/^[@＠]+/, "")
            .trim();
    }
    isAtRichNodeType(typeRaw) {
        const type = String(typeRaw ?? "").toUpperCase();
        return (type === "AT" ||
            type === "USER" ||
            type === "RICH_TEXT_NODE_TYPE_AT" ||
            type === "RICH_TEXT_NODE_TYPE_USER" ||
            type.endsWith("_TYPE_AT") ||
            type.endsWith("_TYPE_USER"));
    }
    collectAtRichNodes(value, add, depth = 0, visited = new WeakSet()) {
        if (depth > 8 || value == null)
            return;
        if (Array.isArray(value)) {
            for (const entry of value) {
                this.collectAtRichNodes(entry, add, depth + 1, visited);
            }
            return;
        }
        if (typeof value !== "object")
            return;
        if (visited.has(value))
            return;
        visited.add(value);
        const obj = value;
        if (this.isAtRichNodeType(obj.type ?? obj.node_type)) {
            add(obj.rid ?? obj.biz_id ?? obj.uid ?? obj.mid ?? obj.oid, obj.orig_text ?? obj.text ?? obj.name ?? obj.uname, obj.face ?? obj.avatar);
        }
        this.collectAtRichNodes(obj.rich_text_nodes, add, depth + 1, visited);
        this.collectAtRichNodes(obj.rich_text, add, depth + 1, visited);
        this.collectAtRichNodes(obj.nodes, add, depth + 1, visited);
        this.collectAtRichNodes(obj.paragraphs, add, depth + 1, visited);
        this.collectAtRichNodes(obj.desc, add, depth + 1, visited);
        if (obj.text && typeof obj.text === "object") {
            this.collectAtRichNodes(obj.text, add, depth + 1, visited);
        }
        if (obj.summary && typeof obj.summary === "object") {
            this.collectAtRichNodes(obj.summary, add, depth + 1, visited);
        }
    }
    collectCtrlMentions(ctrlRaw, message, add) {
        let list = [];
        if (typeof ctrlRaw === "string" && ctrlRaw.trim()) {
            try {
                const parsed = JSON.parse(ctrlRaw);
                if (Array.isArray(parsed))
                    list = parsed;
            }
            catch {
                return;
            }
        }
        else if (Array.isArray(ctrlRaw)) {
            list = ctrlRaw;
        }
        for (const entry of list) {
            if (!entry || typeof entry !== "object")
                continue;
            const item = entry;
            const type = item.type;
            const isAt = type === 1 || type === "1" || String(type ?? "").toUpperCase() === "AT";
            if (!isAt)
                continue;
            let name = this.stripAtDisplayName(item.uname ?? item.name ?? item.text ?? item.orig_text);
            if (!name && message) {
                const location = Number(item.location);
                const length = Number(item.length);
                if (Number.isFinite(location) &&
                    Number.isFinite(length) &&
                    location >= 0 &&
                    length > 0) {
                    name = this.stripAtDisplayName(message.slice(location, location + length));
                }
            }
            add(item.data ?? item.mid ?? item.rid ?? item.uid, name);
        }
    }
    extractCommentMentions(content) {
        const mentions = [];
        const seen = new Set();
        const add = (midRaw, nameRaw, faceRaw) => {
            const mid = Number(midRaw);
            const name = this.stripAtDisplayName(nameRaw);
            if (!Number.isFinite(mid) || mid <= 0 || !name)
                return;
            const key = `${mid}\0${name}`;
            if (seen.has(key))
                return;
            seen.add(key);
            mentions.push({
                mid,
                name,
                face: this.normalizeBfsUrl(String(faceRaw ?? "")),
            });
        };
        this.collectAtRichNodes(content, add);
        this.collectCtrlMentions(content.ctrl ?? content.at_control, String(content.message ?? content.text ?? ""), add);
        const members = content.members;
        const memberList = Array.isArray(members)
            ? members
            : members && typeof members === "object"
                ? Object.values(members)
                : [];
        for (const entry of memberList) {
            if (!entry || typeof entry !== "object")
                continue;
            const member = entry;
            add(member.mid, member.uname ?? member.name, member.avatar ?? member.face);
        }
        const atMap = content.at_name_to_mid;
        if (atMap && typeof atMap === "object") {
            for (const [name, mid] of Object.entries(atMap)) {
                add(mid, name);
            }
        }
        const jumpUrl = content.jump_url;
        if (jumpUrl && typeof jumpUrl === "object") {
            for (const [key, value] of Object.entries(jumpUrl)) {
                if (!value || typeof value !== "object")
                    continue;
                const entry = value;
                const url = String(entry.pc_url ?? entry.url ?? key);
                const match = url.match(/space\.bilibili\.com\/(\d+)/);
                if (!match)
                    continue;
                add(match[1], entry.title ?? entry.name ?? key);
            }
        }
        return mentions.length > 0 ? mentions : undefined;
    }
    asPlainRecord(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
        }
        return value;
    }
    mergeMentionLists(...lists) {
        const mentions = [];
        const seen = new Set();
        for (const list of lists) {
            if (!list?.length)
                continue;
            for (const item of list) {
                const key = `${item.mid}\0${item.name}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                mentions.push(item);
            }
        }
        return mentions.length > 0 ? mentions : undefined;
    }
    extractDynamicMentions(moduleDynamic, major) {
        const from = (value) => {
            const rec = this.asPlainRecord(value);
            return rec ? this.extractCommentMentions(rec) : undefined;
        };
        const opus = this.asPlainRecord(major?.opus);
        return this.mergeMentionLists(from(moduleDynamic?.desc), from(opus), from(opus?.summary), from(major?.draw));
    }
    isEmojiRichNodeType(typeRaw) {
        const type = String(typeRaw ?? "").toUpperCase();
        return (type === "EMOJI" ||
            type === "EMOTE" ||
            type === "RICH_TEXT_NODE_TYPE_EMOJI" ||
            type === "RICH_TEXT_NODE_TYPE_EMOTE" ||
            type.endsWith("_TYPE_EMOJI") ||
            type.endsWith("_TYPE_EMOTE"));
    }
    normalizeEmoteToken(raw) {
        const text = String(raw ?? "").trim();
        if (!text)
            return "";
        if (text.startsWith("[") && text.endsWith("]"))
            return text;
        return `[${text}]`;
    }
    addEmoteUrl(out, tokenRaw, urlRaw) {
        const token = this.normalizeEmoteToken(tokenRaw);
        const url = this.normalizeHttps(String(urlRaw ?? ""));
        if (!token.startsWith("[") || !url.startsWith("http"))
            return;
        out[token] = url;
    }
    collectEmojiUrls(value, out, depth = 0, visited = new WeakSet()) {
        if (depth > 8 || value == null)
            return;
        if (Array.isArray(value)) {
            for (const entry of value) {
                this.collectEmojiUrls(entry, out, depth + 1, visited);
            }
            return;
        }
        if (typeof value !== "object")
            return;
        if (visited.has(value))
            return;
        visited.add(value);
        const obj = value;
        if (this.isEmojiRichNodeType(obj.type ?? obj.node_type)) {
            const emoji = this.asPlainRecord(obj.emoji) ?? obj;
            this.addEmoteUrl(out, obj.orig_text ?? obj.text ?? emoji.text, emoji.url ?? emoji.icon_url ?? emoji.gif_url ?? obj.url ?? obj.icon_url);
        }
        const fromField = this.extractCommentEmotes(obj.emote ?? obj.emotes);
        if (fromField)
            Object.assign(out, fromField);
        this.collectEmojiUrls(obj.rich_text_nodes, out, depth + 1, visited);
        this.collectEmojiUrls(obj.rich_text, out, depth + 1, visited);
        this.collectEmojiUrls(obj.nodes, out, depth + 1, visited);
        this.collectEmojiUrls(obj.paragraphs, out, depth + 1, visited);
        this.collectEmojiUrls(obj.desc, out, depth + 1, visited);
        if (obj.text && typeof obj.text === "object") {
            this.collectEmojiUrls(obj.text, out, depth + 1, visited);
        }
        if (obj.summary && typeof obj.summary === "object") {
            this.collectEmojiUrls(obj.summary, out, depth + 1, visited);
        }
    }
    extractRichNodeEmotes(value) {
        const out = {};
        this.collectEmojiUrls(value, out);
        return Object.keys(out).length > 0 ? out : undefined;
    }
    mergeEmoteMaps(...maps) {
        const result = {};
        for (const map of maps) {
            if (!map)
                continue;
            for (const [key, url] of Object.entries(map)) {
                if (key.startsWith("[") && url)
                    result[key] = url;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }
    extractDynamicEmotes(moduleDynamic, major) {
        const opus = this.asPlainRecord(major?.opus);
        return this.mergeEmoteMaps(this.extractRichNodeEmotes(moduleDynamic?.desc), this.extractRichNodeEmotes(opus), this.extractRichNodeEmotes(opus?.summary), this.extractRichNodeEmotes(major?.draw));
    }
    async getReplyEmotes() {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/emote/user/panel/web", {
            params: { business: "reply" },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            return { packages: [], map: {} };
        }
        const packagesRaw = res.data?.data?.packages ?? [];
        const map = {};
        const packages = [];
        for (const pkg of packagesRaw) {
            const id = Number(pkg.id) || 0;
            const name = String(pkg.text ?? "").trim();
            const icon = String(pkg.url ?? "").replace(/^http:/, "https:");
            const type = Number(pkg.type) || 1;
            const pkgSize = Number(pkg.meta?.size);
            const emotesRaw = pkg.emote ?? [];
            const emotes = [];
            for (const emote of emotesRaw) {
                const text = String(emote.text ?? "").trim();
                if (!text)
                    continue;
                const emoteType = Number(emote.type) || type;
                const size = Number(emote.meta?.size) === 2 ||
                    pkgSize === 2
                    ? 2
                    : 1;
                const rawUrl = String(emote.url ?? "").trim();
                const url = rawUrl.replace(/^http:/, "https:");
                emotes.push({ text, url, type: emoteType, size });
                if (text.startsWith("[") && url.startsWith("http")) {
                    map[text] = url;
                }
            }
            if (emotes.length === 0)
                continue;
            packages.push({ id, name: name || `表情包 ${id}`, icon, type, emotes });
        }
        return { packages, map };
    }
    buildPlayInfoFromDurl(data, stream, requestedQn) {
        const url = stream.url;
        const streamFormat = stream.format?.toLowerCase() ?? "";
        const format = streamFormat.includes("flv") || url.includes(".flv") ? "flv" : "mp4";
        const qualities = parsePlayQualities(data);
        const quality = data.quality ?? requestedQn;
        return {
            url,
            format,
            quality,
            qualityLabel: formatBiliQualityLabel(quality, qualities.find((item) => item.qn === quality)?.label),
            qualities: qualities.length > 0
                ? qualities
                : [
                    {
                        qn: quality,
                        label: formatBiliQualityLabel(quality),
                    },
                ],
        };
    }
    buildPlayInfoFromDash(data, requestedQn, referer, privilege, source = "web") {
        const dash = data.dash;
        if (!dash)
            return null;
        const allVideos = dash.video ?? [];
        const avcVideos = allVideos.filter((item) => item.codecid === 7 || item.codecs?.startsWith("avc1"));
        const hevcVideos = allVideos.filter((item) => item.codecid === 12 ||
            item.codecs?.startsWith("hev1") ||
            item.codecs?.startsWith("hvc1"));
        // 只取 AVC：HEVC/AV1 在 Electron 里常走软解。没有 AVC 时再退 HEVC，避免整段播不了
        const videos = avcVideos.length > 0
            ? avcVideos
            : hevcVideos.length > 0
                ? hevcVideos
                : allVideos;
        if (videos.length === 0)
            return null;
        const grantedQn = Number(data.quality) || 0;
        let targetQn = requestedQn;
        if (isVipQuality(requestedQn) && grantedQn !== requestedQn) {
            targetQn =
                grantedQn > 0 && !isVipQuality(grantedQn) ? grantedQn : BILI_DEFAULT_QN;
        }
        else if (source === "tv" &&
            isVipQuality(grantedQn) &&
            !canUseVipQuality(privilege)) {
            targetQn = BILI_DEFAULT_QN;
        }
        const pickByQn = (items, qn) => {
            const exact = items.find((item) => item.id === qn);
            if (exact)
                return exact;
            return [...items].sort((a, b) => Math.abs(a.id - qn) - Math.abs(b.id - qn))[0];
        };
        const collectBackupUrls = (item) => {
            const raw = item.backupUrl ?? item.backup_url ?? [];
            return raw.filter((url) => typeof url === "string" && !!url);
        };
        const allowedVideos = isVipQuality(targetQn)
            ? videos
            : videos.filter((item) => !isVipQuality(item.id));
        const allowedAvc = isVipQuality(targetQn)
            ? avcVideos
            : avcVideos.filter((item) => !isVipQuality(item.id));
        const allowedHevc = isVipQuality(targetQn)
            ? hevcVideos
            : hevcVideos.filter((item) => !isVipQuality(item.id));
        const pool = allowedVideos.length > 0 ? allowedVideos : videos;
        const avcPool = allowedAvc.length > 0 ? allowedAvc : avcVideos;
        const hevcPool = allowedHevc.length > 0 ? allowedHevc : hevcVideos;
        const exactAvc = avcPool.find((item) => item.id === targetQn);
        const exactHevc = hevcPool.find((item) => item.id === targetQn);
        const video = exactAvc ??
            (targetQn >= 80 ? exactHevc : undefined) ??
            pickByQn(pool, targetQn);
        if (!video)
            return null;
        const audios = (dash.audio ?? []).filter((item) => !item.codecs?.includes("ec-3") && !item.codecs?.includes("ac-3"));
        const audioPool = audios.length > 0
            ? audios
            : (dash.audio ?? []);
        const audio = audioPool.find((item) => item.id === 30280) ??
            audioPool.find((item) => item.id === 30232) ??
            audioPool.find((item) => item.id === 30216) ??
            audioPool[0];
        if (!audio)
            return null;
        const videoOrdered = orderMediaUrls(video.baseUrl ?? video.base_url, collectBackupUrls(video));
        const audioOrdered = orderMediaUrls(audio.baseUrl ?? audio.base_url, collectBackupUrls(audio));
        const videoSeg = (video.SegmentBase ?? video.segment_base);
        const audioSeg = (audio.SegmentBase ?? audio.segment_base);
        if (!videoOrdered || !audioOrdered || !videoSeg || !audioSeg)
            return null;
        const videoInit = videoSeg.Initialization ?? videoSeg.initialization;
        const videoIndex = videoSeg.indexRange ?? videoSeg.index_range;
        const audioInit = audioSeg.Initialization ?? audioSeg.initialization;
        const audioIndex = audioSeg.indexRange ?? audioSeg.index_range;
        if (!videoInit || !videoIndex || !audioInit || !audioIndex)
            return null;
        const qualities = parsePlayQualities(data);
        if (qualities.length === 0) {
            qualities.push({
                qn: video.id,
                label: formatBiliQualityLabel(video.id),
            });
        }
        const quality = video.id;
        console.warn("[BiliDesk][playurl] dash-track", {
            requestedQn,
            quality,
            codecs: video.codecs,
            height: video.height,
            ids: [...new Set(allVideos.map((item) => item.id))].sort((a, b) => b - a),
        });
        const timeLengthSec = Number(data.timelength)
            ? Number(data.timelength) / 1000
            : 0;
        const dashDuration = Number(dash.duration) || 0;
        // 不要 ceil：整数秒会比真实媒体长约 1s，MSE 片尾会一直 waiting
        const duration = Math.max(1, dashDuration || timeLengthSec || 1);
        const dashPayload = {
            duration,
            video: {
                id: video.id,
                baseUrl: videoOrdered.url,
                backupUrls: [],
                bandwidth: video.bandwidth,
                mimeType: video.mimeType ?? video.mime_type ?? "video/mp4",
                codecs: video.codecs,
                width: video.width,
                height: video.height,
                frameRate: video.frameRate ?? video.frame_rate,
                segmentBase: {
                    initialization: videoInit,
                    indexRange: videoIndex,
                },
            },
            audio: {
                id: audio.id,
                baseUrl: audioOrdered.url,
                backupUrls: [],
                bandwidth: audio.bandwidth,
                mimeType: audio.mimeType ?? audio.mime_type ?? "audio/mp4",
                codecs: audio.codecs,
                segmentBase: {
                    initialization: audioInit,
                    indexRange: audioIndex,
                },
            },
        };
        return {
            url: wrapMpd(buildDashMpdXml({
                ...dashPayload,
                video: {
                    ...dashPayload.video,
                    baseUrl: wrapMediaUrl(videoOrdered.url, referer),
                },
                audio: {
                    ...dashPayload.audio,
                    baseUrl: wrapMediaUrl(audioOrdered.url, referer),
                },
            })),
            format: "dash",
            quality,
            qualityLabel: formatBiliQualityLabel(quality, qualities.find((item) => item.qn === quality)?.label),
            qualities,
            dash: {
                duration,
                video: {
                    url: videoOrdered.url,
                    backupUrls: videoOrdered.backupUrls,
                    referer,
                    mimeType: dashPayload.video.mimeType,
                    codecs: video.codecs,
                    initRange: videoInit,
                    indexRange: videoIndex,
                },
                audio: {
                    url: audioOrdered.url,
                    backupUrls: audioOrdered.backupUrls,
                    referer,
                    mimeType: dashPayload.audio.mimeType,
                    codecs: audio.codecs,
                    initRange: audioInit,
                    indexRange: audioIndex,
                },
            },
        };
    }
    rememberPlayQualities(bvid, cid, qualities) {
        if (qualities.length === 0)
            return;
        const key = `${bvid}:${cid}`;
        const merged = mergeQualityOptions(this.playQualityCache.get(key), qualities);
        this.playQualityCache.set(key, merged);
        if (this.playQualityCache.size > 80) {
            const first = this.playQualityCache.keys().next().value;
            if (first)
                this.playQualityCache.delete(first);
        }
    }
    withFullQualities(bvid, cid, info) {
        const key = `${bvid}:${cid}`;
        const merged = mergeQualityOptions(this.playQualityCache.get(key), info.qualities);
        if (merged.length > 0) {
            this.playQualityCache.set(key, merged);
        }
        return merged.length > 0 ? { ...info, qualities: merged } : info;
    }
    subscribedSeasonsCache = null;
    getDefaultFavFolderId(folders) {
        if (folders.length === 0)
            return null;
        const preferred = folders.find((folder) => folder.isDefault ||
            folder.title === "默认收藏夹" ||
            folder.title.toLowerCase() === "default");
        return preferred?.id ?? folders[0].id;
    }
    async fetchCollectedSeasonFolders(mid, page, pageSize) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v3/fav/folder/collected/list", {
            params: {
                up_mid: mid,
                pn: page,
                ps: pageSize,
                platform: "web",
            },
            headers: { Referer: `https://space.bilibili.com/${mid}/favlist` },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            return { items: [], hasMore: false };
        }
        const list = res.data?.data?.list ?? [];
        const items = list
            .map((item) => this.normalizeCollectedFolderAsSeason(item))
            .filter((item) => item != null);
        return {
            items,
            hasMore: list.length >= pageSize,
        };
    }
    async loadSubscribedSeasonsFromFolders() {
        if (this.subscribedSeasonsCache)
            return this.subscribedSeasonsCache;
        const folders = await this.getFavFolders();
        const defaultId = this.getDefaultFavFolderId(folders);
        const folderOrder = defaultId
            ? [
                ...folders.filter((folder) => folder.id === defaultId),
                ...folders.filter((folder) => folder.id !== defaultId),
            ]
            : folders;
        const seen = new Set();
        const result = [];
        for (const folder of folderOrder) {
            let page = 1;
            while (true) {
                const { medias, hasMore } = await this.fetchFavResourcePage(folder.id, page, 40);
                for (const media of medias) {
                    const item = this.normalizeSubscribedSeason(media);
                    if (!item || seen.has(item.id))
                        continue;
                    seen.add(item.id);
                    result.push(item);
                }
                if (!hasMore)
                    break;
                page++;
            }
        }
        this.subscribedSeasonsCache = result;
        return result;
    }
    normalizeCollectedFolderAsSeason(item) {
        const type = Number(item.type);
        const seasonId = Number(item.season_id ?? item.id);
        if (!seasonId)
            return null;
        // 普通收藏夹 type=11，视频合集在 collected/list 中会有不同标识
        if (type === 11 && !item.season_id)
            return null;
        const upper = item.upper;
        const cntInfo = item.cnt_info;
        return {
            id: seasonId,
            kind: "season",
            title: item.title ?? "未命名合集",
            cover: this.normalizeBfsUrl(item.cover ?? ""),
            description: item.intro ?? "",
            total: item.media_count ?? cntInfo?.collect ?? 0,
            ownerMid: Number(upper?.mid) || undefined,
            source: "subscribed",
        };
    }
    mapFavMedias(medias) {
        return medias.map((m) => {
            const media = m;
            return {
                id: media.id,
                bvid: media.bvid ?? "",
                title: media.title,
                cover: media.cover ?? "",
                intro: String(media.intro ?? media.desc ?? ""),
                upper: {
                    mid: media.upper?.mid ?? 0,
                    name: media.upper?.name ?? "",
                },
                duration: media.duration ?? 0,
            };
        });
    }
    async fetchFavResourcePage(mediaId, page, pageSize, riskRetry = "short", expectedCount = 0) {
        await this.ensureBuvid3();
        const waits = riskRetry === "long" ? [2500, 6000, 12000] : [1200, 2500];
        const maxAttempts = waits.length + 1;
        const mid = appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const res = await this.client.get("/x/v3/fav/resource/list", {
                params: {
                    media_id: mediaId,
                    pn: page,
                    ps: pageSize,
                    platform: "web",
                    mobi_app: "web",
                    type: 0,
                    tid: 0,
                    keyword: "",
                    order: "mtime",
                },
                headers: {
                    Referer: mid
                        ? `https://www.bilibili.com/medialist/detail/ml${mediaId}`
                        : "https://www.bilibili.com/",
                },
                validateStatus: () => true,
            });
            const code = res.data?.code;
            if (res.status === 412 || code === -412) {
                if (attempt < maxAttempts) {
                    await sleep(waits[attempt - 1] ?? 2000);
                    continue;
                }
                throw new Error("[412] 请求被 B 站安全策略拦截，请稍后重试");
            }
            if (code !== 0) {
                throw new Error(res.data?.message || "收藏列表获取失败");
            }
            const data = res.data?.data;
            const mediasRaw = data?.medias;
            const medias = Array.isArray(mediasRaw) ? mediasRaw : null;
            const info = data?.info;
            const rawCount = info?.media_count ?? data?.media_count;
            const infoCount = Number(rawCount);
            const countKnown = Number.isFinite(infoCount);
            const expect = (countKnown && infoCount > 0 ? infoCount : 0) ||
                (expectedCount > 0 ? expectedCount : 0);
            // 空夹：medias 常为 null，且 media_count 明确为 0
            if (medias == null) {
                if (code === 0 && ((countKnown && infoCount === 0) || expect === 0)) {
                    return { medias: [], hasMore: false };
                }
                if (attempt < maxAttempts) {
                    await sleep(waits[attempt - 1] ?? 2000);
                    continue;
                }
                throw new Error(expect > 0
                    ? `[412] 收藏夹有 ${expect} 条但列表未返回，请稍后重试`
                    : "[412] 请求被 B 站安全策略拦截，请稍后重试");
            }
            const hasMore = Boolean(data?.has_more) || medias.length >= pageSize;
            // 夹里明明有稿，列表却给空数组：风控软失败
            if (medias.length === 0 && expect > 0) {
                if (attempt < maxAttempts) {
                    await sleep(waits[attempt - 1] ?? 2000);
                    continue;
                }
                throw new Error(`[412] 收藏夹有 ${expect} 条但列表未返回，请稍后重试`);
            }
            return { medias, hasMore };
        }
        throw new Error("收藏列表获取失败，请稍后重试");
    }
    mapFavFolder(f, extras) {
        const title = String(f.title ?? extras?.title ?? "");
        const attr = Number(f.attr) || 0;
        return {
            id: Number(f.id) || extras?.id || 0,
            fid: Number(f.fid) || extras?.fid || 0,
            title,
            mediaCount: Number(f.media_count ?? extras?.mediaCount) || 0,
            cover: String(f.cover ?? extras?.cover ?? ""),
            intro: String(f.intro ?? extras?.intro ?? ""),
            privacy: (attr & 2) === 2 ? 1 : extras?.privacy === 1 ? 1 : 0,
            isDefault: (attr & 1) === 1 ||
                extras?.isDefault === true ||
                title === "默认收藏夹" ||
                title.toLowerCase() === "default",
        };
    }
    async getFavFolders() {
        const mid = appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
        if (!mid)
            return [];
        await this.ensureBuvid3();
        for (let attempt = 1; attempt <= 3; attempt++) {
            const res = await this.client.get("/x/v3/fav/folder/created/list-all", {
                params: { up_mid: mid },
                headers: { Referer: "https://www.bilibili.com/" },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                if (attempt < 3) {
                    await sleep(600 * attempt);
                    continue;
                }
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "收藏夹列表获取失败");
            }
            const list = res.data?.data?.list ?? [];
            return list.map((f) => this.mapFavFolder(f));
        }
        return [];
    }
    async getVideoFavFolders(aid) {
        const mid = appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
        if (!mid)
            return [];
        await this.ensureBuvid3();
        for (let attempt = 1; attempt <= 3; attempt++) {
            const res = await this.client.get("/x/v3/fav/folder/created/list-all", {
                params: { up_mid: mid, type: 2, rid: aid },
                headers: { Referer: "https://www.bilibili.com/" },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                if (attempt < 3) {
                    await sleep(600 * attempt);
                    continue;
                }
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "收藏夹列表获取失败");
            }
            const list = res.data?.data?.list ?? [];
            return list.map((f) => ({
                ...this.mapFavFolder(f),
                collected: Number(f.fav_state) === 1 || f.fav_state === true,
            }));
        }
        return [];
    }
    async setVideoFavFolders(aid, addMediaIds, delMediaIds) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再收藏");
        if (addMediaIds.length === 0 && delMediaIds.length === 0)
            return;
        const body = {
            rid: String(aid),
            type: "2",
            csrf,
        };
        if (addMediaIds.length > 0)
            body.add_media_ids = addMediaIds.join(",");
        if (delMediaIds.length > 0)
            body.del_media_ids = delMediaIds.join(",");
        const res = await this.client.post("/x/v3/fav/resource/deal", new URLSearchParams(body), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "收藏操作失败");
        }
    }
    /** 新建 B 站收藏夹，对应官网 /x/v3/fav/folder/add */
    async createFavFolder(payload) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再创建收藏夹");
        const title = payload.title.trim();
        if (!title)
            throw new Error("请输入收藏夹名称");
        if (title.length > 20)
            throw new Error("收藏夹名称最多 20 个字");
        const body = {
            title,
            intro: payload.intro?.trim() ?? "",
            privacy: String(payload.privacy === 1 ? 1 : 0),
            csrf,
        };
        const res = await this.client.post("/x/v3/fav/folder/add", new URLSearchParams(body), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        const code = Number(res.data?.code);
        if (code === 11007 ||
            String(res.data?.message ?? "").includes("收藏夹数量")) {
            throw new Error("收藏夹数量已达上限");
        }
        if (code !== 0) {
            throw new Error(res.data?.message || "创建收藏夹失败");
        }
        const data = (res.data?.data ?? {});
        const id = Number(data.id);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error("创建收藏夹成功，但未返回收藏夹信息");
        }
        return this.mapFavFolder(data, {
            id,
            title,
            privacy: payload.privacy === 1 ? 1 : 0,
            isDefault: false,
        });
    }
    async getFavFolderInfo(mediaId) {
        if (!mediaId)
            throw new Error("收藏夹无效");
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v3/fav/folder/info", {
            params: { media_id: mediaId },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "收藏夹信息获取失败");
        }
        const data = (res.data?.data ?? {});
        const folder = this.mapFavFolder(data, { id: mediaId });
        if (!folder.id)
            throw new Error("收藏夹信息获取失败");
        return folder;
    }
    /** 编辑收藏夹名称 / 简介 / 公开性，对应官网 /x/v3/fav/folder/edit */
    async editFavFolder(payload) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再编辑收藏夹");
        const mediaId = Number(payload.mediaId);
        if (!Number.isFinite(mediaId) || mediaId <= 0) {
            throw new Error("收藏夹无效");
        }
        const title = payload.title.trim();
        if (!title)
            throw new Error("请输入收藏夹名称");
        if (title.length > 20)
            throw new Error("收藏夹名称最多 20 个字");
        let intro = payload.intro;
        let privacy = payload.privacy;
        if (intro == null || privacy == null) {
            const current = await this.getFavFolderInfo(mediaId);
            intro = intro ?? current.intro ?? "";
            privacy = privacy ?? current.privacy ?? 0;
        }
        const res = await this.client.post("/x/v3/fav/folder/edit", new URLSearchParams({
            media_id: String(mediaId),
            title,
            intro: intro.trim(),
            privacy: String(privacy === 1 ? 1 : 0),
            csrf,
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("[412] 请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "编辑收藏夹失败");
        }
        return this.getFavFolderInfo(mediaId);
    }
    /** 删除空收藏夹，对应官网 /x/v3/fav/folder/del */
    async deleteFavFolder(mediaId) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再删除收藏夹");
        const id = Number(mediaId);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error("收藏夹无效");
        }
        const res = await this.client.post("/x/v3/fav/folder/del", new URLSearchParams({
            media_ids: String(id),
            csrf,
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "删除收藏夹失败");
        }
    }
    /** 一键清除收藏夹里已失效/下架的稿件，对应官网 /x/v3/fav/resource/clean */
    async cleanFavResources(mediaId) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再清除失效内容");
        if (!Number.isFinite(mediaId) || mediaId <= 0) {
            throw new Error("收藏夹无效");
        }
        const res = await this.client.post("/x/v3/fav/resource/clean", new URLSearchParams({
            media_id: String(mediaId),
            csrf,
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("[412] 请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "清除失效内容失败");
        }
        const raw = res.data?.data;
        const cleaned = typeof raw === "number"
            ? raw
            : typeof raw === "object" && raw && "count" in raw
                ? Number(raw.count)
                : null;
        return {
            cleaned: Number.isFinite(cleaned) ? Number(cleaned) : null,
        };
    }
    /** 调整收藏夹顺序，对应官网 /x/v3/fav/folder/sort */
    async sortFavFolders(mediaIds) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再排序收藏夹");
        const ids = [...new Set(mediaIds.filter((id) => id > 0))];
        if (ids.length < 2)
            return;
        const res = await this.client.post("/x/v3/fav/folder/sort", new URLSearchParams({
            sort: ids.join(","),
            csrf,
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("[412] 请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "收藏夹排序失败");
        }
    }
    /** 从指定收藏夹批量移除视频（resources 格式 aid:2） */
    async removeFavResources(mediaId, aids) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再操作收藏夹");
        const uniqueAids = [...new Set(aids.filter((aid) => aid > 0))];
        if (uniqueAids.length === 0)
            return;
        const chunkSize = 40;
        for (let i = 0; i < uniqueAids.length; i += chunkSize) {
            const chunk = uniqueAids.slice(i, i + chunkSize);
            const res = await this.client.post("/x/v3/fav/resource/batch-del", new URLSearchParams({
                media_id: String(mediaId),
                resources: chunk.map((aid) => `${aid}:2`).join(","),
                csrf,
            }), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Referer: "https://www.bilibili.com/",
                    Origin: "https://www.bilibili.com",
                },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "移除收藏失败");
            }
        }
    }
    /** 批量移动收藏：从源收藏夹移到目标收藏夹 */
    async moveFavResources(srcMediaId, tarMediaId, aids) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再操作收藏夹");
        if (srcMediaId === tarMediaId) {
            throw new Error("目标收藏夹不能与当前收藏夹相同");
        }
        const uniqueAids = [...new Set(aids.filter((aid) => aid > 0))];
        if (uniqueAids.length === 0)
            return;
        const chunkSize = 40;
        for (let i = 0; i < uniqueAids.length; i += chunkSize) {
            const chunk = uniqueAids.slice(i, i + chunkSize);
            const res = await this.client.post("/x/v3/fav/resource/move", new URLSearchParams({
                src_media_id: String(srcMediaId),
                tar_media_id: String(tarMediaId),
                resources: chunk.map((aid) => `${aid}:2`).join(","),
                platform: "web",
                csrf,
            }), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Referer: "https://www.bilibili.com/",
                    Origin: "https://www.bilibili.com",
                },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (isFavMediaCountLimitMessage(res.data?.message)) {
                throw new Error("FAV_FOLDER_FULL");
            }
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "移动收藏失败");
            }
            if (i + chunkSize < uniqueAids.length) {
                await sleep(1000);
            }
        }
    }
    async getFavResources(mediaId, page = 1, pageSize = 20, riskRetry = "short", expectedCount = 0) {
        const { medias, hasMore } = await this.fetchFavResourcePage(mediaId, page, pageSize, riskRetry, expectedCount);
        return {
            resources: this.mapFavMedias(medias),
            page,
            hasMore,
        };
    }
    async getAllFavResourcesInFolder(mediaId, onPage) {
        const pageSize = 40;
        const all = [];
        let page = 1;
        while (true) {
            const { medias, hasMore } = await this.fetchFavResourcePage(mediaId, page, pageSize, "long");
            if (medias.length === 0)
                break;
            all.push(...this.mapFavMedias(medias));
            await onPage?.(all.length);
            if (!hasMore)
                break;
            page++;
            await sleep(page < 8 ? 700 : page < 20 ? 1100 : 1600);
        }
        return all;
    }
    /** 扫描用：保留 medias 原始字段（含 attr）
     * soft=true 时遇 412 / 列表空返回已拉到的内容，不抛错，避免整次扫描中断
     */
    async getAllFavMediaRawInFolder(mediaId, options) {
        const pageSize = 40;
        const all = [];
        let page = 1;
        const soft = Boolean(options?.soft);
        while (true) {
            try {
                const { medias, hasMore } = await this.fetchFavResourcePage(mediaId, page, pageSize, soft ? "short" : "long");
                if (medias.length === 0)
                    break;
                for (const media of medias) {
                    all.push(media);
                }
                if (!hasMore)
                    break;
                page++;
                await sleep(page < 8 ? 700 : page < 20 ? 1100 : 1600);
            }
            catch (err) {
                if (soft) {
                    console.warn("[BiliDesk][integrity] fav folder soft-skip", mediaId, err instanceof Error ? err.message : err);
                    break;
                }
                throw err;
            }
        }
        return all;
    }
    async getAllFavResources() {
        const folders = await this.getFavFolders();
        const seen = new Set();
        const all = [];
        for (const folder of folders) {
            const items = await this.getAllFavResourcesInFolder(folder.id);
            for (const item of items) {
                if (seen.has(item.id))
                    continue;
                seen.add(item.id);
                all.push(item);
            }
        }
        return all;
    }
    async getFollowings(page = 1, order = "recent") {
        const mid = appStore.get("user")?.mid;
        if (!mid)
            return [];
        const params = {
            vmid: mid,
            pn: page,
            ps: 50,
            order: "desc",
            ...(order === "attention" ? { order_type: "attention" } : {}),
        };
        // 被限流时 B 站返回非 0 code 而不是空列表；当成空页会把全量关注截断
        let lastMessage = "";
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0)
                await sleep(3000 * attempt);
            const res = await this.client.get("/x/relation/followings", {
                params,
                validateStatus: () => true,
            });
            if (res.status === 200 && res.data?.code === 0) {
                const list = res.data?.data?.list ?? [];
                return list.map((u) => this.mapFollowingUser(u));
            }
            lastMessage =
                res.status === 412 || res.data?.code === -412
                    ? BILI_RISK_CONTROL_MESSAGE
                    : res.data?.message || `HTTP ${res.status}`;
        }
        throw new Error(`关注列表第 ${page} 页获取失败：${lastMessage}`);
    }
    /** 分页拉全量关注，供失效/封禁扫描 */
    async getAllFollowings() {
        const all = [];
        const seen = new Set();
        let page = 1;
        while (page <= 200) {
            const batch = await this.getFollowings(page);
            if (batch.length === 0)
                break;
            let fresh = 0;
            for (const up of batch) {
                if (seen.has(up.mid))
                    continue;
                seen.add(up.mid);
                all.push(up);
                fresh += 1;
            }
            if (fresh === 0 || batch.length < 50)
                break;
            page += 1;
            await sleep(400);
        }
        return all;
    }
    /**
     * 账号状态：/x/space/wbi/acc/info 的 silence / is_deleted
     * silence=1 被封；is_deleted=1 注销；接口失败时标 unavailable
     */
    async getUserAccountStatus(mid) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/web-interface/card", {
            params: { mid },
            headers: { Referer: `https://space.bilibili.com/${mid}` },
            validateStatus: () => true,
        });
        const base = { mid, name: "", face: "", silence: false, deleted: false };
        const code = res.data?.code;
        if (code === -404)
            return { ...base, deleted: true, blocked: false };
        if (res.status !== 200 || code !== 0) {
            return { ...base, blocked: true };
        }
        const card = (res.data?.data?.card ?? {});
        const name = String(card.name ?? "");
        return {
            mid,
            name,
            face: String(card.face ?? "").replace(/^http:/, "https:"),
            silence: Number(card.spacesta) < 0,
            deleted: name === "账号已注销",
            blocked: false,
        };
    }
    /** 取 UP 最新一稿 + 最新一条动态的时间（活跃度页用） */
    async getUpLatestActivity(mid) {
        const empty = {
            latestVideoAt: 0,
            latestVideoTitle: "",
            latestVideoBvid: "",
            latestDynamicAt: 0,
            latestDynamicText: "",
            latestDynamicId: "",
        };
        const [videoSettled, dynamicSettled] = await Promise.allSettled([
            this.getUpVideos(mid, 1, "pubdate"),
            this.getSpaceDynamics(mid, ""),
        ]);
        const result = { ...empty };
        if (videoSettled.status === "fulfilled") {
            const first = videoSettled.value.videos[0];
            if (first) {
                result.latestVideoAt = Number(first.pubdate) || 0;
                result.latestVideoTitle = first.title || "";
                result.latestVideoBvid = first.bvid || "";
            }
        }
        if (dynamicSettled.status === "fulfilled") {
            const first = dynamicSettled.value.items[0];
            if (first) {
                result.latestDynamicAt = Number(first.pubTime) || 0;
                result.latestDynamicText = (first.title || first.text || "")
                    .trim()
                    .slice(0, 80);
                result.latestDynamicId = first.id || "";
            }
        }
        return result;
    }
    /** 查看指定用户的关注 / 粉丝列表（含隐私校验） */
    async getUserRelationList(mid, type, page = 1) {
        await this.ensureBuvid3();
        const pageSize = 24;
        const path = type === "followers" ? "/x/relation/followers" : "/x/relation/followings";
        const res = await this.client.get(path, {
            params: {
                vmid: String(mid),
                pn: Math.max(1, page),
                ps: pageSize,
                order: "desc",
                order_type: "",
            },
            headers: {
                Referer: `https://space.bilibili.com/${mid}/fans/${type === "followers" ? "fans" : "follow"}`,
            },
            validateStatus: () => true,
        });
        const code = res.data?.code;
        const message = String(res.data?.message ?? "");
        if (code === 22115 ||
            code === 22116 ||
            message.includes("隐私") ||
            message.includes("不可见") ||
            message.includes("隐藏")) {
            // 隐私是正常业务结果，不要 throw，避免 IPC 刷红错日志
            return {
                users: [],
                page: Math.max(1, page),
                total: 0,
                hasMore: false,
                privacyBlocked: true,
                message: type === "followers"
                    ? "由于该用户隐私设置，粉丝列表不可见"
                    : "由于该用户隐私设置，关注列表不可见",
            };
        }
        if (code === -101 || message.includes("未登录")) {
            throw new Error("请先登录后再查看");
        }
        if (code !== 0) {
            throw new Error(message ||
                (type === "followers" ? "粉丝列表获取失败" : "关注列表获取失败"));
        }
        const data = res.data?.data;
        const list = (data?.list ?? []);
        const users = list.map((u) => this.mapFollowingUser(u));
        const total = Number(data?.total ?? users.length) || 0;
        return {
            users,
            page: Math.max(1, page),
            total,
            hasMore: users.length >= pageSize && page * pageSize < total,
        };
    }
    async getFollowTags() {
        if (!isLoggedIn())
            return [];
        await this.ensureBuvid3();
        const res = await this.client.get("/x/relation/tags", {
            headers: { Referer: "https://space.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "关注分组列表获取失败");
        }
        const list = res.data?.data ?? [];
        return list.map((tag) => ({
            tagId: tag.tagid,
            name: tag.name,
            count: tag.count ?? 0,
        }));
    }
    /** 新建 B 站关注分组，对应官网 /x/relation/tag/create */
    async createFollowTag(name) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再创建分组");
        const tag = name.trim();
        if (!tag)
            throw new Error("请输入分组名称");
        if (tag.length > 16)
            throw new Error("分组名称最多 16 个字");
        const res = await this.client.post("/x/relation/tag/create", new URLSearchParams({ tag, csrf }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://space.bilibili.com/",
                Origin: "https://space.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        const code = Number(res.data?.code);
        if (code === 22106)
            throw new Error("该分组已经存在");
        if (code === 22103)
            throw new Error("分组名称最多 16 个字");
        if (code === 22101 || String(res.data?.message ?? "").includes("上限")) {
            throw new Error("关注分组数量已达上限");
        }
        if (code !== 0) {
            throw new Error(res.data?.message || "创建分组失败");
        }
        const tagId = Number(res.data?.data?.tagid);
        if (!Number.isFinite(tagId) || tagId <= 0) {
            throw new Error("创建分组成功，但未返回分组信息");
        }
        return { tagId, name: tag, count: 0 };
    }
    async getFollowingsInTag(tagId, page = 1, pageSize = 50, order = "recent") {
        if (!isLoggedIn()) {
            return { followings: [], page: 1, hasMore: false };
        }
        await this.ensureBuvid3();
        const res = await this.client.get("/x/relation/tag", {
            params: {
                tagid: tagId,
                pn: page,
                ps: pageSize,
                ...(order === "attention" ? { order_type: "attention" } : {}),
            },
            headers: { Referer: "https://space.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "关注分组成员获取失败");
        }
        const list = res.data?.data ?? [];
        const followings = list.map((u) => this.mapFollowingUser(u));
        return {
            followings,
            page,
            hasMore: followings.length >= pageSize,
        };
    }
    mapFollowingUser(u) {
        const official = u.official;
        const officialVerify = u.official_verify;
        const attribute = u.attribute ?? 0;
        return {
            mid: u.mid,
            uname: u.uname,
            face: u.face,
            sign: u.sign ?? "",
            official: {
                role: official?.role ?? officialVerify?.type ?? 0,
                title: official?.title ?? officialVerify?.desc ?? "",
            },
            special: u.special === 1,
            mutual: attribute === 6,
            isFollowing: attribute === 1 || attribute === 2 || attribute === 6,
            ...(Number(u.mtime) > 0 ? { followTime: Number(u.mtime) } : {}),
        };
    }
    /** 重命名 B 站关注分组，对应官网 /x/relation/tag/update */
    async renameFollowTag(tagId, name) {
        const tag = name.trim();
        if (!tag)
            throw new Error("请输入分组名称");
        if (tag.length > 16)
            throw new Error("分组名称最多 16 个字");
        if (tagId <= 0)
            throw new Error("系统分组不能重命名");
        await this.postRelationForm("/x/relation/tag/update", {
            tagid: String(tagId),
            name: tag,
        });
    }
    /** 删除 B 站关注分组，组内 UP 会回到默认分组 */
    async deleteFollowTag(tagId) {
        if (tagId <= 0)
            throw new Error("系统分组不能删除");
        await this.postRelationForm("/x/relation/tag/del", {
            tagid: String(tagId),
        });
    }
    async postRelationForm(path, fields) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再操作");
        const res = await this.client.post(path, new URLSearchParams({ ...fields, csrf }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://space.bilibili.com/",
                Origin: "https://space.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 404) {
            throw new Error("B站接口不存在，请更新客户端");
        }
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error(BILI_RISK_CONTROL_MESSAGE);
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "操作失败");
        }
    }
    /** 批量加入分组，保留 UP 原有的其它分组 */
    async copyUsersToTag(tagId, mids) {
        if (tagId <= 0 || mids.length === 0)
            return;
        await this.postRelationForm("/x/relation/tags/copyUsers", {
            fids: mids.join(","),
            tagids: String(tagId),
        });
    }
    /** 批量移出分组，只动这一个分组；不在其它分组的 UP 回到默认分组 */
    async removeUsersFromTag(tagId, mids) {
        if (tagId <= 0 || mids.length === 0)
            return;
        await this.postRelationForm("/x/relation/tags/moveUsers", {
            beforeTagids: String(tagId),
            afterTagids: "0",
            fids: mids.join(","),
        });
    }
    async getUserFollowTags(mid) {
        if (!isLoggedIn())
            return [];
        await this.ensureBuvid3();
        const res = await this.client.get("/x/relation/tag/user", {
            params: { fid: mid },
            headers: { Referer: "https://space.bilibili.com/" },
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "获取分组失败");
        }
        const data = res.data?.data ?? {};
        return Object.keys(data).map((key) => Number(key));
    }
    async setUserFollowTags(mid, tagIds) {
        if (!isLoggedIn())
            throw new Error("请先登录后再操作");
        const current = await this.getUserFollowTags(mid);
        const nextSet = new Set(tagIds);
        const toAdd = tagIds.filter((id) => id !== 0 && !current.includes(id));
        const toRemove = current.filter((id) => !nextSet.has(id) && id !== 0);
        for (const tagId of toRemove) {
            await this.postRelationForm("/x/relation/tags/moveUsers", {
                beforeTagids: String(tagId),
                afterTagids: "0",
                fids: String(mid),
            });
        }
        if (toAdd.length > 0) {
            await this.postRelationForm("/x/relation/tags/addUsers", {
                fids: String(mid),
                tagids: toAdd.join(","),
            });
        }
    }
    /** 0 个人认证，1 机构认证。无认证说明时不标。 */
    resolveOfficialType(types, role, desc) {
        const known = types
            .map((value) => Number(value))
            .filter((value) => value === 0 || value === 1);
        if (known.includes(1))
            return 1;
        if (known.includes(0))
            return 0;
        if (!desc)
            return undefined;
        return [3, 4, 5, 6].includes(role) ? 1 : 0;
    }
    async getUpProfile(mid) {
        await this.ensureBuvid3();
        const accParams = await signParams({ mid: String(mid) });
        const [cardRes, statRes, upstatRes, navnumRes, accRes, settingsRes, liveRes,] = await Promise.all([
            this.client.get("/x/web-interface/card", {
                params: { mid: String(mid), photo: true },
                validateStatus: () => true,
            }),
            this.client.get("/x/relation/stat", {
                params: { vmid: String(mid) },
                validateStatus: () => true,
            }),
            this.client
                .get("/x/space/upstat", {
                params: { mid: String(mid) },
                headers: { Referer: `https://space.bilibili.com/${mid}` },
                validateStatus: () => true,
            })
                .catch(() => null),
            this.client
                .get("/x/space/navnum", {
                params: { mid: String(mid) },
                headers: { Referer: `https://space.bilibili.com/${mid}` },
                validateStatus: () => true,
            })
                .catch(() => null),
            this.client
                .get("/x/space/wbi/acc/info", {
                params: accParams,
                headers: { Referer: `https://space.bilibili.com/${mid}` },
                validateStatus: () => true,
            })
                .catch(() => null),
            axios
                .get("https://space.bilibili.com/ajax/settings/getSettings", {
                params: { mid: String(mid) },
                headers: {
                    ...defaultHeaders(),
                    Cookie: getCookieString(),
                    Referer: `https://space.bilibili.com/${mid}`,
                },
                validateStatus: () => true,
                timeout: 8000,
            })
                .catch(() => null),
            this.liveClient
                .get("/room/v1/Room/getRoomInfoOld", {
                params: { mid: String(mid) },
                validateStatus: () => true,
            })
                .catch(() => null),
        ]);
        if (cardRes.data?.code !== 0) {
            throw new Error(this.formatUserSpaceApiError(cardRes.data?.code, cardRes.data?.message, "UP 主信息获取失败"));
        }
        const payload = cardRes.data?.data;
        const card = payload?.card;
        const levelInfo = card?.level_info;
        const official = (card?.Official ?? card?.official);
        const officialVerify = card?.official_verify;
        const stat = statRes.data?.data;
        const upstat = upstatRes && upstatRes.data?.code === 0
            ? upstatRes.data?.data
            : undefined;
        const archiveStat = upstat?.archive;
        const navnum = navnumRes && navnumRes.data?.code === 0
            ? navnumRes.data?.data
            : undefined;
        const accData = accRes && accRes.data?.code === 0
            ? accRes.data?.data
            : undefined;
        const settingsPayload = settingsRes && settingsRes.data
            ? settingsRes.data
            : undefined;
        const settingsData = settingsPayload &&
            (settingsPayload.status === true || settingsPayload.code === 0)
            ? settingsPayload.data
            : undefined;
        const toutu = settingsData?.toutu;
        const accOfficial = accData?.official;
        const textOf = (value) => typeof value === "string" ? value.trim() : "";
        const officialDesc = textOf(official?.title) ||
            textOf(official?.desc) ||
            textOf(officialVerify?.desc) ||
            textOf(accOfficial?.title) ||
            textOf(accOfficial?.desc);
        const officialType = this.resolveOfficialType([official?.type, officialVerify?.type, accOfficial?.type], Number(official?.role ?? accOfficial?.role), officialDesc);
        const videos = Number(payload?.archive_count ?? navnum?.video ?? 0) || 0;
        const articleCount = Number(navnum?.article ?? 0) || 0;
        const opusCount = Number(navnum?.opus ?? navnum?.album ?? articleCount) || 0;
        const seasonCount = Number(navnum?.season_num ?? navnum?.season ?? navnum?.channel ?? 0) || 0;
        const pugvCount = Number(navnum?.pugv ?? 0) || 0;
        const ipLocation = String(accData?.ip_location ?? accData?.location ?? "").trim();
        const upowerRaw = accData?.is_upower ?? accData?.upower;
        const upowerObj = typeof upowerRaw === "object" && upowerRaw != null
            ? upowerRaw
            : undefined;
        const upowerEnabled = upowerRaw === true ||
            upowerRaw === 1 ||
            Number(accData?.upower_flag) > 0 ||
            Number(upowerObj?.state) > 0 ||
            upowerObj?.is_upower === true;
        // navnum.favourite 是 { master, guest }，不是数字
        const favRaw = navnum?.favourite;
        const favourites = typeof favRaw === "number"
            ? favRaw
            : Number(favRaw?.guest ?? favRaw?.master ?? 0) || 0;
        const livePayload = liveRes && liveRes.data?.code === 0
            ? liveRes.data?.data
            : undefined;
        const live = this.readLivingRoom(livePayload, payload?.live_room, accData?.live_room);
        return {
            mid,
            name: card?.name ?? "",
            face: card?.face ?? "",
            sign: card?.sign ?? accData?.sign ?? "",
            fans: stat?.follower ??
                payload?.follower ??
                card?.fans ??
                0,
            following: stat?.following ?? card?.friend ?? 0,
            videos,
            level: Number(levelInfo?.current_level ?? accData?.level ?? 0) || 0,
            officialDesc: officialDesc || undefined,
            officialType,
            likes: Number(payload?.like_num ?? upstat?.likes ?? 0) || 0,
            archiveViews: Number(archiveStat?.view ?? 0) || 0,
            favourites,
            topPhoto: this.pickSpaceTopPhoto(accData, payload?.space ??
                card?.space, toutu),
            ipLocation: ipLocation || undefined,
            articleCount,
            opusCount,
            seasonCount,
            pugvCount,
            upowerEnabled,
            isLive: live.isLive,
            liveRoomId: live.roomId,
        };
    }
    /** card / acc.info 的 live_room。liveStatus 为 1 才算正在播 */
    readLivingRoom(...sources) {
        for (const source of sources) {
            const room = this.asPlainRecord(source);
            if (!room)
                continue;
            const liveStatus = Number(room.liveStatus ?? room.live_status ?? 0);
            if (liveStatus !== 1)
                continue;
            let roomId = this.pickPositiveId(room.roomid, room.room_id, room.roomId);
            if (!roomId) {
                const matched = String(room.url ?? "").match(/live\.bilibili\.com\/(\d+)/);
                roomId = matched ? Number(matched[1]) : 0;
            }
            if (roomId > 0)
                return { isLive: true, roomId };
        }
        return { isLive: false };
    }
    pickSpaceTopPhoto(accData, cardSpace, toutu) {
        const v2 = accData?.top_photo_v2;
        const accSpace = accData?.space;
        const candidates = [
            accData?.top_photo,
            v2?.l_img,
            v2?.thumbnail_img,
            accSpace?.l_img,
            cardSpace?.l_img,
            toutu?.l_img,
            accSpace?.s_img,
            cardSpace?.s_img,
            toutu?.s_img,
        ];
        for (const raw of candidates) {
            const url = this.normalizeBfsUrl(String(raw ?? ""));
            if (url)
                return url;
        }
        return "";
    }
    async getUpRelation(mid) {
        if (!isLoggedIn()) {
            return { isFollowing: false, attribute: 0 };
        }
        const res = await this.client.get("/x/relation", { params: { fid: mid } });
        if (res.data?.code !== 0) {
            return { isFollowing: false, attribute: 0 };
        }
        const data = res.data?.data ?? {};
        const attribute = Number(data.attribute) || 0;
        const tags = data.tag;
        const specialFromTag = Array.isArray(tags) &&
            tags.some((id) => Number(id) === BILI_SPECIAL_FOLLOW_TAG_ID);
        return {
            isFollowing: attribute === 1 || attribute === 2 || attribute === 6,
            attribute,
            special: Number(data.special) === 1 || specialFromTag,
        };
    }
    async modifyFollow(mid, follow) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再关注");
        const fid = Number(mid);
        if (!Number.isFinite(fid) || fid <= 0)
            throw new Error("用户 ID 无效");
        const res = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(follow ? "关注超时" : "取消关注超时")), 8000);
            void axios
                .post("https://api.bilibili.com/x/relation/modify", new URLSearchParams({
                fid: String(fid),
                act: follow ? "1" : "2",
                re_src: "11",
                csrf,
            }), {
                timeout: 8000,
                params: { csrf },
                headers: {
                    ...defaultHeaders(),
                    Cookie: getCookieString(),
                    "Content-Type": "application/x-www-form-urlencoded",
                    Referer: `https://space.bilibili.com/${fid}`,
                    Origin: "https://space.bilibili.com",
                },
                validateStatus: () => true,
            })
                .then((value) => {
                clearTimeout(timer);
                resolve(value);
            }, (error) => {
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error("关注操作失败"));
            });
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || (follow ? "关注失败" : "取消关注失败"));
        }
    }
    async modifySpecialFollow(mid, special) {
        // 特别关注是系统分组 tagid=-10，不是 /x/relation/modify 的 act。
        // act=5/6 实际是拉黑/取消拉黑，会误取关。
        if (special) {
            await this.postRelationForm("/x/relation/tags/copyUsers", {
                fids: String(mid),
                tagids: String(BILI_SPECIAL_FOLLOW_TAG_ID),
            });
            return;
        }
        // 只从特别关注移出，其它分组 / 默认分组保持不变
        await this.postRelationForm("/x/relation/tags/moveUsers", {
            beforeTagids: String(BILI_SPECIAL_FOLLOW_TAG_ID),
            afterTagids: "0",
            fids: String(mid),
        });
    }
    async getBlacklist(page = 1, pageSize = 50) {
        if (!isLoggedIn()) {
            return { users: [], page: 1, total: 0, hasMore: false };
        }
        await this.ensureBuvid3();
        const res = await this.client.get("/x/relation/blacks", {
            params: { pn: page, ps: pageSize },
            headers: { Referer: "https://space.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "黑名单获取失败");
        }
        const data = res.data?.data ?? {};
        const list = data.list ?? [];
        const total = data.total ?? 0;
        const users = list.map((u) => ({
            ...this.mapFollowingUser(u),
            blockedAt: u.mtime || undefined,
        }));
        return {
            users,
            page,
            total,
            hasMore: page * pageSize < total,
        };
    }
    async modifyBlock(mid, block) {
        await this.postRelationForm("/x/relation/modify", {
            fid: String(mid),
            act: block ? "5" : "6",
            re_src: "11",
        });
    }
    /** 分类任务批量调用：只打一枪空间接口；失败（多为限流）直接抛给调用方退避 */
    /**
     * UP 近期投稿标题，给关注分类用。
     * 空间投稿列表（wbi/arc/search）风控极严，批量抓几百位就被限流；
     * recArchivesByKeywords 不走 WBI、限流宽松，优先用它，再退到空间动态和投稿列表。
     */
    async getRecentVideoTitles(mid, limit = 5) {
        const sources = [
            () => this.fetchRecArchiveTitles(mid, limit),
            () => this.fetchDynamicVideoTitles(mid, limit),
            async () => (await this.fetchSpaceArcList(mid, 1, "pubdate")).videos
                .slice(0, limit)
                .map((video) => video.title),
        ];
        let lastError = null;
        for (const source of sources) {
            try {
                return await source();
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError instanceof Error
            ? lastError
            : new Error("获取投稿标题失败");
    }
    async fetchRecArchiveTitles(mid, limit) {
        const res = await this.client.get("/x/series/recArchivesByKeywords", {
            params: { mid, keywords: "", ps: Math.max(limit, 10), pn: 1 },
            headers: { Referer: `https://space.bilibili.com/${mid}/video` },
        });
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "获取投稿标题失败"));
        }
        const archives = (res.data?.data?.archives ?? []);
        return archives
            .map((item) => String(item.title ?? "").trim())
            .filter(Boolean)
            .slice(0, limit);
    }
    async fetchDynamicVideoTitles(mid, limit) {
        const res = await this.client.get("/x/polymer/web-dynamic/v1/feed/space", {
            params: { host_mid: mid, offset: "", features: "itemOpusStyle" },
            headers: { Referer: `https://space.bilibili.com/${mid}/dynamic` },
        });
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "获取动态失败"));
        }
        const items = (res.data?.data?.items ?? []);
        return items
            .map((item) => String(item.modules?.module_dynamic?.major?.archive?.title ?? "").trim())
            .filter(Boolean)
            .slice(0, limit);
    }
    async getUpVideos(mid, page = 1, order = "pubdate", keyword = "", specialType = "") {
        const kw = keyword.trim();
        const special = specialType.trim();
        const key = `${mid}:${Math.max(1, page)}:${order}:${kw}:${special}`;
        const pending = this.upVideosInflight.get(key);
        if (pending)
            return pending;
        const task = this.loadUpVideos(mid, page, order, kw, special)
            .then((result) => {
            if (Math.max(1, page) !== 1 || kw || special)
                return result;
            const remembered = this.attachRememberedSpecials(mid, result);
            if (remembered.specialsKnown)
                return remembered;
            return this.withChargingSpecial(mid, order, remembered);
        })
            .then((result) => {
            if (Math.max(1, page) !== 1 || kw || special)
                return result;
            return this.rememberArcSpecials(mid, result);
        })
            .finally(() => {
            if (this.upVideosInflight.get(key) === task) {
                this.upVideosInflight.delete(key);
            }
        });
        this.upVideosInflight.set(key, task);
        return task;
    }
    async withChargingSpecial(mid, order, page) {
        if (page.specialsKnown || (page.specials?.length ?? 0) > 0)
            return page;
        try {
            const filtered = await this.fetchSpaceArcList(mid, 1, order, "", "charging");
            const count = filtered.total;
            const sameHead = page.total > 0 &&
                count >= page.total &&
                Boolean(filtered.videos[0]?.bvid) &&
                filtered.videos[0]?.bvid === page.videos[0]?.bvid;
            if (count <= 0 || sameHead)
                return page;
            return {
                ...page,
                specials: [{ type: "charging", name: "充电专属", count }],
                specialsKnown: true,
            };
        }
        catch {
            return page;
        }
    }
    /** 备用列表没有 slist 时，用这个 UP 上次确认过的筛选，避免按钮时有时无 */
    attachRememberedSpecials(mid, page) {
        if (page.specialsKnown)
            return page;
        const known = this.upArcSpecials.get(mid) ?? this.readStoredArcSpecials(mid);
        if (!known)
            return page;
        return { ...page, specials: known, specialsKnown: true };
    }
    readStoredArcSpecials(mid) {
        const all = appStore.get("upVideoSpecials");
        const list = all?.[String(mid)];
        if (!Array.isArray(list))
            return null;
        return list.filter((item) => Boolean(item?.type) && Boolean(item?.name) && Number(item?.count) > 0);
    }
    /** 确认过的筛选记到本地。下次 arc/search 被限流，备用列表也能把按钮带上 */
    rememberArcSpecials(mid, page) {
        const attached = this.attachRememberedSpecials(mid, page);
        if (!attached.specialsKnown)
            return attached;
        const specials = attached.specials ?? [];
        this.upArcSpecials.set(mid, specials);
        const all = appStore.get("upVideoSpecials") ?? {};
        const prev = all[String(mid)];
        const same = Array.isArray(prev) &&
            prev.length === specials.length &&
            prev.every((item, index) => item.type === specials[index]?.type &&
                item.name === specials[index]?.name &&
                item.count === specials[index]?.count);
        if (!same) {
            appStore.set("upVideoSpecials", { ...all, [String(mid)]: specials });
        }
        return attached;
    }
    async loadUpVideos(mid, page = 1, order = "pubdate", keyword = "", specialType = "") {
        await this.ensureBuvid3();
        const sort = order === "click" ? "click" : "pubdate";
        const kw = keyword.trim();
        const special = specialType.trim();
        // 充电专属等筛选不能退回全量投稿，否则筛完还是全部视频
        if (special) {
            return this.fetchSpaceArcList(mid, page, sort, kw, special);
        }
        // 空间内关键词搜索：先走 arc/search，翻页被拒时改走系列投稿接口
        if (kw) {
            try {
                return await this.fetchSpaceArcList(mid, page, sort, kw);
            }
            catch {
                return this.fetchRecArchivePage(mid, page, sort, kw);
            }
        }
        const currentUser = this.getAuthStatus();
        if (sort === "pubdate" && currentUser.isLogin && currentUser.mid === mid) {
            try {
                return await this.fetchMyArchives(page);
            }
            catch {
                // fall back
            }
        }
        let lastError = null;
        try {
            const space = await this.fetchSpaceArcList(mid, page, sort);
            if (space.videos.length > 0 || space.total === 0) {
                if (page === 1 && space.videos.length > 0) {
                    this.seedUpVideoCursor(mid, sort, space.videos, space.total);
                }
                return space;
            }
        }
        catch (error) {
            lastError =
                error instanceof Error ? error : new Error("投稿列表获取失败");
        }
        try {
            const rec = await this.fetchRecArchivePage(mid, page, sort);
            if (rec.videos.length > 0 || (page === 1 && rec.total === 0)) {
                return rec;
            }
        }
        catch (error) {
            lastError =
                error instanceof Error
                    ? error
                    : (lastError ?? new Error("投稿列表获取失败"));
        }
        try {
            const upName = await this.fetchUpName(mid);
            if (upName) {
                const fallback = await this.fetchUpVideosBySearchPaged(mid, upName, page, sort, 0);
                if (fallback.videos.length > 0) {
                    if (page === 1) {
                        this.seedUpVideoCursor(mid, sort, fallback.videos, fallback.total);
                    }
                    return fallback;
                }
            }
        }
        catch (error) {
            lastError =
                error instanceof Error
                    ? error
                    : (lastError ?? new Error("投稿列表获取失败"));
        }
        try {
            const cursorPage = await this.fetchSpaceArchiveCursor(mid, page, sort);
            if (cursorPage.videos.length > 0)
                return cursorPage;
        }
        catch (error) {
            lastError =
                error instanceof Error
                    ? error
                    : (lastError ?? new Error("翻页失败，请稍后重试"));
        }
        throw (lastError ??
            new Error(page > 1 ? "翻页失败，请稍后重试" : "投稿列表获取失败，请稍后重试"));
    }
    async fetchUpName(mid) {
        const res = await this.client.get("/x/web-interface/card", {
            params: { mid: String(mid), photo: 0 },
            headers: { Referer: `https://space.bilibili.com/${mid}` },
            validateStatus: () => true,
            timeout: 8000,
        });
        if (res.data?.code !== 0)
            return "";
        const card = res.data?.data?.card;
        return String(card?.name ?? "").trim();
    }
    upNameCache = new Map();
    /**
     * 空间 wbi 投稿从第 2 页起常返回 -403。
     * 这个接口不走 wbi，页码和总数与投稿页一致。
     */
    async fetchRecArchivePage(mid, page, order, keyword = "") {
        const orderby = order === "click" ? "click" : "pubdate";
        const params = {
            mid,
            keywords: keyword,
            pn: page,
            ps: 30,
            orderby,
        };
        let res = await this.client.get("/x/series/recArchivesByKeywords", {
            params,
            headers: { Referer: `https://space.bilibili.com/${mid}/upload/video` },
            validateStatus: () => true,
            timeout: 10000,
        });
        if (res.data?.code !== 0) {
            res = await this.client.get("/x/series/recArchivesByKeywords", {
                params: { mid, keywords: keyword, pn: page, ps: 30 },
                headers: { Referer: `https://space.bilibili.com/${mid}/upload/video` },
                validateStatus: () => true,
                timeout: 10000,
            });
        }
        if (res.data?.code !== 0) {
            throw new Error(this.formatUserSpaceApiError(res.data?.code, res.data?.message, page > 1 ? "翻页失败，请稍后重试" : "投稿列表获取失败，请稍后重试"));
        }
        const data = res.data?.data;
        const pageInfo = data?.page;
        const total = Number(pageInfo?.total ?? 0) || 0;
        const pageSize = Number(pageInfo?.size ?? 30) || 30;
        let name = this.upNameCache.get(mid) ?? "";
        if (!name) {
            try {
                name = await this.fetchUpName(mid);
            }
            catch {
                name = "";
            }
            if (name)
                this.upNameCache.set(mid, name);
        }
        const archives = (data?.archives ?? []);
        const videos = archives
            .filter((item) => item.bvid)
            .map((item) => {
            const video = this.normalizeArchiveVideo(item, mid);
            if (name)
                video.owner.name = name;
            return video;
        });
        if (page > 1 && videos.length === 0 && total > (page - 1) * pageSize) {
            throw new Error("投稿翻页返回空数据，正在尝试其它通道");
        }
        return {
            videos,
            page,
            total,
            hasMore: page * pageSize < total,
        };
    }
    /** APP 空间投稿分页；需要 TV 登录的 access_key，否则会直接「请求错误」 */
    async fetchAppSpaceArchive(mid, page, order = "pubdate") {
        const accessKey = appStore.get("accessToken");
        if (!accessKey) {
            throw new Error("APP 投稿通道需要登录凭证");
        }
        await this.waitSpaceArcGate();
        const pageSize = 30;
        const params = this.buildTvSignedParams({
            access_key: accessKey,
            vmid: mid,
            pn: Math.max(1, page),
            ps: pageSize,
            order: order === "click" ? "click" : "pubdate",
        });
        const urls = [
            "https://app.bilibili.com/x/v2/space/archive",
            "https://app.biliapi.com/x/v2/space/archive",
        ];
        let lastError = null;
        for (const url of urls) {
            const res = await axios.get(url, {
                params,
                headers: {
                    ...defaultHeaders(),
                    Cookie: getCookieString(),
                    Referer: `https://space.bilibili.com/${mid}/video`,
                },
                validateStatus: () => true,
                timeout: 12000,
            });
            if (res.data?.code === 0 && res.data?.data) {
                const payload = res.data.data;
                const rawItems = (payload.item ?? payload.list ?? []);
                const videos = rawItems
                    .map((item) => this.normalizeCursorSpaceVideo(item, mid))
                    .filter((item) => item != null);
                const total = Number(payload.count ?? videos.length) || 0;
                return {
                    videos,
                    page: Math.max(1, page),
                    total,
                    hasMore: videos.length >= pageSize || page * pageSize < total,
                };
            }
            lastError = new Error(this.formatUserSpaceApiError(res.data?.code, res.data?.message, "投稿列表获取失败，请稍后重试"));
        }
        throw lastError ?? new Error("投稿列表获取失败，请稍后重试");
    }
    async searchVideos(keyword, page = 1, order = "totalrank", apiStartPage = 1, pageSize = 30) {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { videos: [], page: 1, hasMore: false, total: 0, nextApiPage: 1 };
        }
        await this.ensureBuvid3();
        const targetSize = Math.min(42, Math.max(1, pageSize));
        const apiPage = Math.max(1, apiStartPage);
        const batch = await this.fetchSearchApiPage(trimmed, apiPage, order, targetSize);
        const seen = new Set();
        const videos = [];
        for (const video of batch.videos) {
            if (seen.has(video.bvid))
                continue;
            seen.add(video.bvid);
            videos.push(video);
        }
        return {
            videos,
            page,
            hasMore: batch.hasMore,
            total: batch.total,
            nextApiPage: apiPage + 1,
        };
    }
    async searchArticles(keyword, page = 1, order = "totalrank") {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { articles: [], page: 1, hasMore: false, total: 0 };
        }
        await this.ensureBuvid3();
        const apiPageSize = 20;
        // 部分排序在专栏接口会直接空结果（如 pubdate）；失败时回退综合排序
        const orderCandidates = order === "totalrank" ? ["totalrank"] : [order, "totalrank"];
        let lastError = "搜索专栏失败";
        for (const tryOrder of orderCandidates) {
            const baseParams = {
                search_type: "article",
                keyword: trimmed,
                page,
                page_size: apiPageSize,
                order: tryOrder,
                platform: "pc",
            };
            // 先走 wbi，再降级普通 type 接口（登录态下偶发 wbi 空包）
            const attempts = ["wbi", "plain"];
            for (const mode of attempts) {
                try {
                    const params = mode === "wbi" ? await signParams(baseParams) : baseParams;
                    const url = mode === "wbi"
                        ? "/x/web-interface/wbi/search/type"
                        : "/x/web-interface/search/type";
                    const res = await this.client.get(url, {
                        params,
                        headers: { Referer: "https://search.bilibili.com/" },
                        validateStatus: () => true,
                    });
                    if (res.status === 412 || res.data?.code === -412) {
                        lastError = "请求被 B 站安全策略拦截，请稍后重试";
                        continue;
                    }
                    if (res.data?.code !== 0) {
                        lastError = String(res.data?.message ?? lastError);
                        continue;
                    }
                    const data = res.data?.data;
                    const rawResults = Array.isArray(data?.result)
                        ? data.result
                        : [];
                    const total = Number(data?.numResults ?? rawResults.length) || 0;
                    const articles = rawResults
                        .map((item) => this.normalizeSearchArticle(item))
                        .filter((item) => item != null);
                    // 有统计但本页解析为空时，继续尝试降级；都失败再返回空
                    if (articles.length === 0 && total > 0 && rawResults.length > 0) {
                        lastError = "专栏结果解析失败";
                        continue;
                    }
                    if (articles.length === 0 &&
                        total === 0 &&
                        tryOrder !== "totalrank") {
                        // 当前排序无结果，试下一个 order
                        break;
                    }
                    return {
                        articles,
                        page,
                        hasMore: rawResults.length > 0 && page * apiPageSize < total,
                        total: Math.max(total, articles.length),
                    };
                }
                catch (err) {
                    lastError = err instanceof Error ? err.message : lastError;
                }
            }
        }
        throw new Error(lastError);
    }
    async searchMedia(keyword, kind, page = 1) {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { items: [], page: 1, hasMore: false, total: 0 };
        }
        await this.ensureBuvid3();
        const searchType = kind === "bangumi" ? "media_bangumi" : "media_ft";
        const apiPageSize = 20;
        const baseParams = {
            search_type: searchType,
            keyword: trimmed,
            page,
            page_size: apiPageSize,
            platform: "pc",
        };
        let lastError = kind === "bangumi" ? "搜索番剧失败" : "搜索影视失败";
        const attempts = ["wbi", "plain"];
        for (const mode of attempts) {
            try {
                const params = mode === "wbi" ? await signParams(baseParams) : baseParams;
                const url = mode === "wbi"
                    ? "/x/web-interface/wbi/search/type"
                    : "/x/web-interface/search/type";
                const res = await this.client.get(url, {
                    params,
                    headers: { Referer: "https://search.bilibili.com/" },
                    validateStatus: () => true,
                });
                if (res.status === 412 || res.data?.code === -412) {
                    lastError = "请求被 B 站安全策略拦截，请稍后重试";
                    continue;
                }
                if (res.data?.code !== 0) {
                    lastError = String(res.data?.message ?? lastError);
                    continue;
                }
                const data = res.data?.data;
                const rawResults = Array.isArray(data?.result)
                    ? data.result
                    : [];
                const total = Number(data?.numResults ?? rawResults.length) || 0;
                const items = rawResults
                    .map((item) => this.normalizeSearchMedia(item, kind))
                    .filter((item) => item != null);
                return {
                    items,
                    page,
                    hasMore: rawResults.length > 0 && page * apiPageSize < total,
                    total: Math.max(total, items.length),
                };
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : lastError;
            }
        }
        throw new Error(lastError);
    }
    async searchLiveRooms(keyword, page = 1, order = "online") {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { rooms: [], page: 1, hasMore: false, total: 0 };
        }
        await this.ensureBuvid3();
        const apiPageSize = 30;
        const baseParams = {
            search_type: "live_room",
            keyword: trimmed,
            page,
            page_size: apiPageSize,
            order,
            platform: "pc",
        };
        let lastError = "搜索直播失败";
        const attempts = ["wbi", "plain"];
        for (const mode of attempts) {
            try {
                const params = mode === "wbi" ? await signParams(baseParams) : baseParams;
                const url = mode === "wbi"
                    ? "/x/web-interface/wbi/search/type"
                    : "/x/web-interface/search/type";
                const res = await this.client.get(url, {
                    params,
                    headers: { Referer: "https://search.bilibili.com/" },
                    validateStatus: () => true,
                });
                if (res.status === 412 || res.data?.code === -412) {
                    lastError = "请求被 B 站安全策略拦截，请稍后重试";
                    continue;
                }
                if (res.data?.code !== 0) {
                    lastError = String(res.data?.message ?? lastError);
                    continue;
                }
                const data = res.data?.data;
                let rawResults = [];
                if (Array.isArray(data?.result)) {
                    rawResults = data.result;
                }
                else if (data?.result && typeof data.result === "object") {
                    const nested = data.result;
                    if (Array.isArray(nested.live_room)) {
                        rawResults = nested.live_room;
                    }
                }
                const total = Number(data?.numResults ?? rawResults.length) || 0;
                const rooms = rawResults
                    .map((item) => this.normalizeSearchLiveRoom(item))
                    .filter((item) => item != null);
                return {
                    rooms,
                    page,
                    hasMore: rawResults.length > 0 && page * apiPageSize < total,
                    total: Math.max(total, rooms.length),
                };
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : lastError;
            }
        }
        throw new Error(lastError);
    }
    /** 搜索联想：https://s.search.bilibili.com/main/suggest */
    async getSearchSuggest(term) {
        const trimmed = term.trim();
        if (!trimmed)
            return [];
        await this.ensureBuvid3();
        try {
            const res = await this.client.get("https://s.search.bilibili.com/main/suggest", {
                params: {
                    term: trimmed,
                    main_ver: "v1",
                    highlight: "",
                    func: "suggest",
                    suggest_type: "accurate",
                    sub_type: "tag",
                    tag_num: 10,
                    rnd: Math.random(),
                },
                headers: {
                    Referer: "https://search.bilibili.com/",
                    Origin: "https://search.bilibili.com",
                },
                validateStatus: () => true,
            });
            if (res.status === 412)
                return [];
            // 该接口有时不返回 code，直接给 result
            const payload = res.data;
            if (!payload)
                return [];
            if (payload.code != null &&
                Number(payload.code) !== 0 &&
                Number(payload.code) !== 200) {
                return [];
            }
            const result = payload.result;
            const tags = Array.isArray(result?.tag)
                ? result.tag
                : Array.isArray(payload.result)
                    ? payload.result
                    : [];
            const seen = new Set();
            const items = [];
            for (const tag of tags) {
                const value = this.stripHtml(String(tag.value ?? tag.term ?? tag.name ?? ""));
                if (!value || seen.has(value))
                    continue;
                seen.add(value);
                items.push({
                    value,
                    name: String(tag.name ?? "") || undefined,
                });
                if (items.length >= 10)
                    break;
            }
            return items;
        }
        catch {
            return [];
        }
    }
    async searchUsers(keyword, page = 1, order = "default", userType = 0) {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { users: [], page: 1, hasMore: false, total: 0 };
        }
        await this.ensureBuvid3();
        const targetPage = Math.max(1, page);
        // 粉丝 / 等级是用户指定的顺序，只去掉「开播」这类词，不再打乱
        if (order !== "default") {
            const { cleaned } = this.extractUserSearchKeywords(trimmed);
            return this.searchUsersOnce(cleaned, targetPage, order, userType);
        }
        const { cleaned, tokens } = this.extractUserSearchKeywords(trimmed);
        const extras = tokens
            .filter((token) => token.toLowerCase() !== cleaned.toLowerCase())
            .sort((a, b) => b.length - a.length)
            .slice(0, 2);
        const queries = [
            ...new Set([
                cleaned,
                ...(cleaned.toLowerCase() !== trimmed.toLowerCase() ? [trimmed] : []),
                ...extras,
            ]),
        ];
        const pages = await Promise.all(queries.map((query) => this.searchUsersOnce(query, targetPage, "default", userType).catch((error) => {
            if (queries.length === 1)
                throw error;
            return null;
        })));
        const usable = pages.filter((item) => item != null);
        if (usable.length === 0) {
            throw new Error("搜索用户失败");
        }
        const merged = new Map();
        for (const item of usable) {
            for (const user of item.users) {
                if (!merged.has(user.mid))
                    merged.set(user.mid, user);
            }
        }
        const users = [...merged.values()]
            .map((user) => ({
            user,
            score: this.scoreSearchUser(user, tokens.length > 0 ? tokens : [cleaned], cleaned),
        }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score ||
            b.user.fans - a.user.fans ||
            a.user.mid - b.user.mid)
            .slice(0, 20)
            .map((item) => item.user);
        const total = Math.max(...usable.map((item) => item.total), users.length);
        const hasMore = usable.some((item) => item.hasMore) || total > targetPage * 20;
        return {
            users,
            page: targetPage,
            hasMore: users.length > 0 && hasMore,
            total,
        };
    }
    /** 用户搜索接口本身按整句去对名字。热搜常带「开播」之类的词，拆开再查。 */
    extractUserSearchKeywords(keyword) {
        const noise = new Set([
            "开播",
            "开播了",
            "直播",
            "直播了",
            "首播",
            "复播",
            "更新",
            "更新了",
            "投稿",
            "视频",
            "来了",
            "来啦",
            "来咯",
            "的",
            "了",
            "啊",
            "吗",
            "呢",
            "吧",
        ]);
        const suffixes = [
            "纪录片",
            "开播了",
            "直播了",
            "更新了",
            "课程",
            "课堂",
            "专栏",
            "合集",
            "视频",
            "动态",
            "开播",
            "直播",
            "更新",
        ];
        const parts = keyword
            .trim()
            .split(/[\s\u3000,，。！？!?:：、|/+#]+/)
            .map((part) => part.trim())
            .filter(Boolean);
        const tokens = [];
        const seen = new Set();
        for (const part of parts) {
            let token = part;
            for (const suffix of suffixes) {
                if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
                    token = token.slice(0, -suffix.length);
                    break;
                }
            }
            if (!token || noise.has(token) || noise.has(token.toLowerCase()))
                continue;
            if (token.length < 2 && !/[a-z0-9]/i.test(token))
                continue;
            const key = token.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            tokens.push(token);
        }
        return {
            cleaned: tokens.join(" ") || keyword.trim(),
            tokens,
        };
    }
    /** 名字命中越多越靠前；粉丝数只在吻合程度接近时拉开差距。 */
    scoreSearchUser(user, tokens, cleaned) {
        const name = user.name.toLowerCase();
        const extra = `${user.sign} ${user.officialDesc ?? ""}`.toLowerCase();
        const phrase = cleaned.toLowerCase();
        let score = 0;
        if (phrase && name === phrase)
            score += 1000;
        else if (phrase && name.includes(phrase))
            score += 500;
        else if (name.length >= 2 &&
            (phrase.startsWith(name) || phrase.endsWith(name))) {
            // 「食贫道纪录片」这种整句，名字只占开头或结尾，也算命中
            score += 460;
        }
        let nameHits = 0;
        for (const token of tokens) {
            const text = token.toLowerCase();
            if (!text)
                continue;
            if (name.includes(text)) {
                nameHits += 1;
                score += 140 + Math.min(token.length, 8) * 4;
            }
            else if (extra.includes(text)) {
                score += 36;
            }
        }
        if (tokens.length > 1 && nameHits === tokens.length)
            score += 260;
        if (nameHits === 0 && score < 36)
            return 0;
        score += Math.min(48, Math.log10((user.fans || 0) + 1) * 8);
        if (user.isUp)
            score += 8;
        if (user.officialDesc)
            score += 6;
        return score;
    }
    async searchUsersOnce(keyword, page = 1, order = "default", userType = 0) {
        const trimmed = keyword.trim();
        if (!trimmed) {
            return { users: [], page: 1, hasMore: false, total: 0 };
        }
        let apiOrder = 0;
        let orderSort = 0;
        if (order === "fans_desc") {
            apiOrder = "fans";
            orderSort = 0;
        }
        else if (order === "fans_asc") {
            apiOrder = "fans";
            orderSort = 1;
        }
        else if (order === "level_desc") {
            apiOrder = "level";
            orderSort = 0;
        }
        else if (order === "level_asc") {
            apiOrder = "level";
            orderSort = 1;
        }
        const apiPageSize = 20;
        const params = await signParams({
            search_type: "bili_user",
            keyword: trimmed,
            page,
            page_size: apiPageSize,
            order: apiOrder,
            order_sort: orderSort,
            user_type: userType,
            platform: "pc",
            single_column: 0,
            source: "",
        });
        const res = await this.client.get("/x/web-interface/wbi/search/type", {
            params,
            headers: { Referer: "https://search.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "搜索用户失败");
        }
        const data = res.data?.data;
        const rawResults = data?.result ?? [];
        const total = Number(data?.numResults ?? rawResults.length) || 0;
        const users = rawResults
            .map((item) => this.normalizeSearchUser(item))
            .filter((item) => item != null);
        return {
            users,
            page,
            hasMore: rawResults.length > 0 && page * apiPageSize < total,
            total,
        };
    }
    async getSearchTypeCounts(keyword) {
        const empty = {
            video: 0,
            bangumi: 0,
            media: 0,
            live: 0,
            article: 0,
            user: 0,
        };
        const trimmed = keyword.trim();
        if (!trimmed)
            return empty;
        await this.ensureBuvid3();
        const params = await signParams({
            keyword: trimmed,
            page: 1,
            page_size: 20,
            platform: "pc",
            single_column: 0,
            source: "",
        });
        const res = await this.client.get("/x/web-interface/wbi/search/all/v2", {
            params,
            headers: { Referer: "https://search.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412 || res.data?.code !== 0) {
            return empty;
        }
        const pageinfo = res.data?.data
            ?.pageinfo;
        if (!pageinfo)
            return empty;
        const countOf = (...keys) => {
            for (const key of keys) {
                const block = pageinfo[key];
                if (!block)
                    continue;
                const n = Number(block.numResults ?? block.total ?? 0);
                if (Number.isFinite(n) && n > 0)
                    return n;
            }
            return 0;
        };
        return {
            video: countOf("video"),
            bangumi: countOf("media_bangumi", "pgc"),
            media: countOf("media_ft"),
            live: countOf("live_room", "live"),
            article: countOf("article"),
            user: countOf("bili_user", "user"),
        };
    }
    normalizeSearchUser(item) {
        const mid = Number(item.mid);
        if (!Number.isFinite(mid) || mid <= 0)
            return null;
        const official = (item.official_verify ?? {});
        const roomId = Number(item.room_id);
        return {
            mid,
            name: this.stripHtml(String(item.uname ?? "")),
            face: this.normalizeHttps(String(item.upic ?? "")),
            sign: this.stripHtml(String(item.usign ?? "")),
            fans: Number(item.fans ?? 0) || 0,
            videos: Number(item.videos ?? 0) || 0,
            level: Number(item.level ?? 0) || 0,
            isUp: Number(item.is_upuser ?? 0) === 1,
            isLive: Number(item.is_live ?? 0) === 1,
            roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : undefined,
            officialDesc: String(official.desc ?? "") || undefined,
            isFollowing: false,
        };
    }
    normalizeSearchMedia(item, kind) {
        const seasonId = Number(item.season_id ?? item.seasonId ?? 0);
        const mediaId = Number(item.media_id ?? item.mediaId ?? 0);
        if ((!Number.isFinite(seasonId) || seasonId <= 0) &&
            (!Number.isFinite(mediaId) || mediaId <= 0)) {
            return null;
        }
        const scoreObj = (item.media_score ?? {});
        const score = Number(scoreObj.score ?? item.score ?? 0) || 0;
        const title = this.stripHtml(String(item.title ?? item.org_title ?? ""));
        if (!title)
            return null;
        const sid = seasonId > 0 ? seasonId : mediaId;
        const rawUrl = String(item.url ?? item.goto_url ?? "").trim();
        const url = rawUrl
            ? this.normalizeHttps(rawUrl)
            : `https://www.bilibili.com/bangumi/play/ss${sid}`;
        return {
            seasonId: sid,
            mediaId: mediaId > 0 ? mediaId : sid,
            title,
            cover: this.normalizeHttps(String(item.cover ?? item.pic ?? "")),
            styles: this.stripHtml(String(item.styles ?? "")),
            areas: this.stripHtml(String(item.areas ?? "")),
            desc: this.stripHtml(String(item.desc ?? item.evaluate ?? "")),
            indexShow: this.stripHtml(String(item.index_show ?? item.indexShow ?? "")),
            score,
            pubtime: Number(item.pubtime ?? item.pub_time ?? 0) || 0,
            url,
            kind,
        };
    }
    normalizeSearchLiveRoom(item) {
        const roomId = Number(item.roomid ?? item.room_id ?? item.roomId ?? 0);
        if (!Number.isFinite(roomId) || roomId <= 0)
            return null;
        const title = this.stripHtml(String(item.title ?? ""));
        if (!title)
            return null;
        const watched = (item.watched_show ?? {});
        const online = Number(item.online ?? watched.num ?? watched.text_large ?? 0) || 0;
        return {
            roomId,
            title,
            cover: this.normalizeHttps(String(item.cover ?? item.user_cover ?? item.keyframe ?? "")),
            online,
            uname: this.stripHtml(String(item.uname ?? item.nickname ?? "")),
            face: this.normalizeHttps(String(item.uface ?? item.face ?? "")),
            areaName: this.stripHtml(String(item.cate_name ?? item.area_v2_name ?? item.area_name ?? "")),
            liveTime: Number(item.live_time ?? 0) || undefined,
        };
    }
    normalizeSearchArticle(item) {
        const id = Number(item.id);
        if (!Number.isFinite(id) || id <= 0)
            return null;
        const images = Array.isArray(item.image_urls)
            ? item.image_urls
                .map((url) => this.normalizeHttps(String(url ?? "")))
                .filter(Boolean)
            : [];
        return {
            id,
            title: this.stripHtml(String(item.title ?? "未命名专栏")),
            desc: this.stripHtml(String(item.desc ?? "")),
            cover: images[0] || "",
            covers: images,
            mid: Number(item.mid ?? 0) || 0,
            author: this.stripHtml(String(item.author ?? item.uname ?? item.name ?? "")),
            view: Number(item.view ?? 0) || 0,
            like: Number(item.like ?? 0) || 0,
            reply: Number(item.reply ?? 0) || 0,
            pubTime: Number(item.pub_time ?? 0) || 0,
            categoryName: String(item.category_name ?? "") || undefined,
            url: `https://www.bilibili.com/read/cv${id}`,
        };
    }
    async getArticle(id) {
        await this.ensureBuvid3();
        const cvid = Number(id);
        if (!Number.isFinite(cvid) || cvid <= 0)
            throw new Error("专栏 ID 无效");
        const referer = `https://www.bilibili.com/read/cv${cvid}`;
        const baseParams = {
            id: cvid,
            gaia_source: "main_web",
            web_location: "333.976",
        };
        let lastError = "专栏加载失败";
        for (const mode of ["wbi", "plain"]) {
            const params = mode === "wbi" ? await signParams(baseParams) : baseParams;
            const res = await this.client.get("/x/article/view", {
                params,
                headers: { Referer: referer },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (res.data?.code === 0 && res.data?.data) {
                return this.normalizeArticleDetail(res.data.data, cvid);
            }
            lastError = formatBiliApiError(res.data, "专栏加载失败");
        }
        throw new Error(lastError);
    }
    async likeArticle(id, like) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点赞");
        const cvid = Number(id);
        if (!Number.isFinite(cvid) || cvid <= 0)
            throw new Error("专栏 ID 无效");
        const body = new URLSearchParams({
            id: String(cvid),
            type: like ? "1" : "2",
            csrf,
        });
        const res = await this.client.post("/x/article/like", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/read/cv${cvid}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "点赞失败"));
        }
    }
    async coinArticle(id, upMid, multiply = 1) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再投币");
        const cvid = Number(id);
        if (!Number.isFinite(cvid) || cvid <= 0)
            throw new Error("专栏 ID 无效");
        const body = new URLSearchParams({
            aid: String(cvid),
            multiply: String(multiply),
            avtype: "2",
            upid: String(upMid || 0),
            select_like: "0",
            csrf,
        });
        const res = await this.client.post("/x/web-interface/coin/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/read/cv${cvid}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "投币失败"));
        }
    }
    async favoriteArticle(id, favorite) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再收藏");
        const cvid = Number(id);
        if (!Number.isFinite(cvid) || cvid <= 0)
            throw new Error("专栏 ID 无效");
        const body = new URLSearchParams({
            id: String(cvid),
            csrf,
        });
        const res = await this.client.post(favorite ? "/x/article/favorite/add" : "/x/article/favorite/del", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: `https://www.bilibili.com/read/cv${cvid}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, favorite ? "收藏失败" : "取消收藏失败"));
        }
    }
    normalizeArticleDetail(data, fallbackId) {
        const id = Number(data.id) || fallbackId;
        const author = data.author ?? {};
        const stats = data.stats ?? {};
        const category = data.category ?? {};
        const rawContent = data.content;
        const content = typeof rawContent === "string" ? rawContent : "";
        const dynId = String(data.dyn_id_str ?? data.dyn_id ?? "").trim();
        const images = Array.isArray(data.origin_image_urls)
            ? data.origin_image_urls
                .map((url) => this.normalizeBfsUrl(String(url ?? "")))
                .filter(Boolean)
            : [];
        const likedRaw = data.is_like ?? data.like;
        return {
            id,
            title: String(data.title ?? "未命名专栏").trim() || "未命名专栏",
            summary: String(data.summary ?? "").trim(),
            content,
            banner: this.normalizeBfsUrl(String(data.banner_url ?? "")),
            images,
            mid: Number(author.mid) || 0,
            author: String(author.name ?? "").trim(),
            authorFace: this.normalizeBfsUrl(String(author.face ?? "")),
            view: Number(stats.view) || 0,
            like: Number(stats.like) || 0,
            reply: Number(stats.reply) || 0,
            coin: Number(stats.coin) || 0,
            favorite: Number(stats.favorite) || 0,
            share: Number(stats.share) || 0,
            words: Number(data.words) || 0,
            pubTime: Number(data.publish_time ?? data.ctime) || 0,
            liked: likedRaw === true || Number(likedRaw) === 1,
            coined: Boolean(data.is_coin),
            favorited: Boolean(data.in_list),
            dynId: dynId || undefined,
            categoryName: String(category.name ?? "") || undefined,
        };
    }
    stripHtml(text) {
        return text
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .trim();
    }
    async fetchSearchApiPage(keyword, page, order, pageSize = 30) {
        const apiPageSize = Math.min(42, Math.max(1, pageSize));
        const params = await signParams({
            search_type: "video",
            keyword,
            page,
            page_size: apiPageSize,
            order,
            platform: "pc",
            single_column: 0,
            source: "",
        });
        const res = await this.client.get("/x/web-interface/wbi/search/type", {
            params,
            headers: { Referer: "https://search.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "搜索失败");
        }
        const data = res.data?.data;
        const rawResults = data?.result ?? [];
        const results = rawResults.filter((item) => this.isSearchVideoResult(item));
        const total = data?.numResults ?? rawResults.length;
        const videos = results.map((item) => this.normalizeSearchVideo(item));
        const fetchedCount = rawResults.length;
        return {
            videos,
            page,
            hasMore: fetchedCount > 0 && page * apiPageSize < total,
            total,
        };
    }
    readArcSpecials(payload) {
        const slist = payload?.data?.list?.slist;
        if (!Array.isArray(slist))
            return { known: false, specials: [] };
        const specials = [];
        for (const raw of slist) {
            if (!raw || typeof raw !== "object")
                continue;
            const item = raw;
            const type = String(item.special_type ?? "").trim();
            const name = String(item.name ?? "").trim();
            const count = Number(item.count);
            if (!type || !name || !Number.isFinite(count) || count <= 0)
                continue;
            specials.push({ type, name, count });
        }
        return { known: true, specials };
    }
    async fetchSpaceArcList(mid, page, order = "pubdate", keyword = "", specialType = "") {
        const kw = keyword.trim();
        const special = specialType.trim();
        const referer = `https://space.bilibili.com/${mid}/video?tid=0&pn=${page}&keyword=${encodeURIComponent(kw)}&order=${order}`;
        const pageSize = 30;
        const locations = page > 1 || kw || special ? ["1550101", "333.1387"] : ["1550101"];
        let lastError = null;
        for (const webLocation of locations) {
            const result = await this.requestSpaceArcList(mid, page, order, pageSize, referer, webLocation, kw, special);
            if (result.ok)
                return result.page;
            lastError = result.error;
            // 已经 -799 再换地址，会把排序和翻页打得更频繁
            if (result.rateLimited || !result.tryNextLocation)
                break;
        }
        throw lastError ?? new Error("投稿列表获取失败，请稍后重试");
    }
    async requestSpaceArcList(mid, page, order, pageSize, referer, webLocation, keyword = "", specialType = "") {
        const baseParams = {
            mid: String(mid),
            pn: page,
            ps: pageSize,
            tid: 0,
            keyword,
            order,
            platform: "web",
            web_location: webLocation,
            order_avoided: "true",
            dm_img_list: "[]",
            dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
            dm_cover_img_str: "QU5HTEUgKEludGVsLCBJbnRlbChSKSBVSEQgR3JhcGhpY3MgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoSW50ZWw",
            dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
        };
        if (specialType)
            baseParams.special_type = specialType;
        // 官方投稿页只打签名接口。明文 /x/space/arc/search 已废弃，会固定返回 -799
        const modes = ["wbi", "plain"];
        let lastError = null;
        for (const mode of modes) {
            for (let attempt = 1; attempt <= 2; attempt++) {
                await this.waitSpaceArcGate();
                let params = baseParams;
                if (mode === "wbi") {
                    try {
                        params = await signParams(baseParams);
                    }
                    catch (err) {
                        lastError =
                            err instanceof Error
                                ? err
                                : new Error("投稿接口签名失败，请稍后重试");
                        break;
                    }
                }
                const url = mode === "wbi" ? "/x/space/wbi/arc/search" : "/x/space/arc/search";
                const res = await this.client.get(url, {
                    params,
                    headers: { Referer: referer },
                    validateStatus: () => true,
                    timeout: 10000,
                });
                const payload = res.data;
                const code = payload?.code;
                if (code === -799) {
                    lastError = lastError ?? new Error("请求过于频繁，请稍后再试");
                    break;
                }
                if (code === -403) {
                    lastError = new Error(this.formatUserSpaceApiError(code, payload?.message, "投稿列表获取失败，请稍后重试"));
                    break;
                }
                if (code === 0) {
                    const vlist = (payload?.data?.list?.vlist ?? []);
                    const pageInfo = payload?.data?.page;
                    const total = Number(pageInfo?.count ?? vlist.length) || 0;
                    const ps = Number(pageInfo?.ps ?? pageSize) || pageSize;
                    const parsed = this.readArcSpecials(payload);
                    if (page > 1 && vlist.length === 0 && total > (page - 1) * ps) {
                        return {
                            ok: false,
                            tryNextLocation: true,
                            error: new Error("投稿翻页返回空数据，正在尝试其它通道"),
                        };
                    }
                    return {
                        ok: true,
                        page: {
                            videos: vlist.map((item) => this.normalizeSpaceVideo(item, mid)),
                            page,
                            total,
                            hasMore: vlist.length >= ps || page * ps < total,
                            specials: parsed.specials,
                            specialsKnown: parsed.known,
                        },
                    };
                }
                const retryable = code === -412 ||
                    res.status === 412 ||
                    (mode === "wbi" &&
                        (code === -400 ||
                            String(payload?.message ?? "").includes("请求错误")));
                if (retryable && attempt < 2) {
                    if (mode === "wbi")
                        invalidateWbiCache();
                    await sleep(mode === "wbi" ? 700 : 500);
                    continue;
                }
                if (code === -352) {
                    lastError = new Error("投稿接口触发风控，请稍后重试或重新登录");
                    break;
                }
                if (code === -412 || res.status === 412) {
                    lastError = new Error("请求被 B 站安全策略拦截，请稍后重试");
                    break;
                }
                lastError = new Error(this.formatUserSpaceApiError(code, payload?.message, "投稿列表获取失败，请稍后重试"));
                break;
            }
        }
        return {
            ok: false,
            error: lastError ?? new Error("投稿列表获取失败，请稍后重试"),
        };
    }
    /** UP 投稿游标缓存：cursor 接口每段最多 20 条，按 30 条一页切片 */
    upVideoCursorCache = new Map();
    resolveVideoAid(video) {
        if (!video)
            return 0;
        if (video.aid && video.aid > 0)
            return video.aid;
        if (video.bvid)
            return bvToAid(video.bvid);
        return 0;
    }
    seedUpVideoCursor(mid, order, videos, total) {
        if (videos.length === 0)
            return;
        const cacheKey = `${mid}:${order}`;
        this.pruneBoundedMap(this.upVideoCursorCache, 8, (entry) => entry.at);
        const existing = this.upVideoCursorCache.get(cacheKey);
        if (existing && existing.videos.length >= videos.length) {
            existing.at = Date.now();
            if (existing.total < total)
                existing.total = total;
            return;
        }
        const lastAid = this.resolveVideoAid(videos[videos.length - 1]);
        this.upVideoCursorCache.set(cacheKey, {
            videos: [...videos],
            lastAid,
            hasNext: total <= 0 || videos.length < total,
            total: Math.max(total, videos.length),
            at: Date.now(),
        });
    }
    async fetchSpaceArchiveCursor(mid, page, order = "pubdate") {
        const pageSize = 30;
        const fetchSize = 20;
        const targetPage = Math.max(1, page);
        const cacheKey = `${mid}:${order}`;
        this.pruneBoundedMap(this.upVideoCursorCache, 8, (entry) => entry.at);
        let cache = this.upVideoCursorCache.get(cacheKey);
        if (!cache) {
            cache = {
                videos: [],
                lastAid: 0,
                hasNext: true,
                total: 0,
                at: Date.now(),
            };
            this.upVideoCursorCache.set(cacheKey, cache);
        }
        else {
            cache.at = Date.now();
        }
        const needed = targetPage * pageSize;
        const seen = new Set(cache.videos.map((video) => video.bvid));
        const maxFetches = Math.max(1, Math.ceil((needed - cache.videos.length) / fetchSize) + 3);
        let fetches = 0;
        let lastError = null;
        while (cache.videos.length < needed &&
            cache.hasNext &&
            fetches < maxFetches) {
            await this.waitSpaceArcGate(80);
            fetches += 1;
            const prevAid = cache.lastAid;
            // 这个接口用 Cookie 即可。带上 TV 签名和 platform 会被判成参数错误（-400）。
            const params = {
                vmid: mid,
                ps: fetchSize,
                order: order === "click" ? "click" : "pubdate",
            };
            if (cache.lastAid > 0)
                params.aid = cache.lastAid;
            const hosts = [
                "https://app.biliapi.com/x/v2/space/archive/cursor",
                "https://app.bilibili.com/x/v2/space/archive/cursor",
            ];
            let payload = null;
            for (const url of hosts) {
                const res = await axios.get(url, {
                    params,
                    headers: {
                        ...defaultHeaders(),
                        Cookie: getCookieString(),
                        Referer: `https://space.bilibili.com/${mid}/video`,
                        Origin: "https://space.bilibili.com",
                    },
                    validateStatus: () => true,
                    timeout: 12000,
                });
                if (res.data?.code === 0 && res.data?.data) {
                    payload = res.data.data;
                    break;
                }
                lastError = new Error(this.formatUserSpaceApiError(res.data?.code, res.data?.message, "翻页失败，请稍后重试"));
            }
            if (!payload) {
                cache.hasNext = false;
                break;
            }
            const rawItems = (payload.item ?? []);
            const batch = rawItems
                .map((item) => this.normalizeCursorSpaceVideo(item, mid))
                .filter((item) => item != null);
            let added = 0;
            for (const video of batch) {
                if (!video.bvid || seen.has(video.bvid))
                    continue;
                seen.add(video.bvid);
                cache.videos.push(video);
                added += 1;
            }
            const total = Number(payload.count ?? cache.total) || cache.total || 0;
            if (total > 0)
                cache.total = Math.max(cache.total, total);
            const last = cache.videos[cache.videos.length - 1];
            const nextAid = this.resolveVideoAid(last);
            const batchAid = this.resolveVideoAid(batch[batch.length - 1]);
            if (batchAid > 0)
                cache.lastAid = batchAid;
            else if (nextAid > 0)
                cache.lastAid = nextAid;
            const flaggedHasNext = payload.has_next;
            if (flaggedHasNext == null) {
                cache.hasNext =
                    batch.length >= fetchSize &&
                        (cache.total <= 0 || cache.videos.length < cache.total);
            }
            else {
                cache.hasNext = Boolean(flaggedHasNext);
            }
            // 与第 1 页空间列表重叠时本段可能全是重复，用本段末 aid 继续往后走
            if (added === 0 &&
                (batchAid <= 0 || batch.length === 0 || batchAid === prevAid)) {
                cache.hasNext = false;
            }
        }
        const start = (targetPage - 1) * pageSize;
        const videos = cache.videos.slice(start, start + pageSize);
        if (videos.length === 0) {
            throw lastError ?? new Error("翻页失败，请稍后重试");
        }
        const total = Math.max(cache.total, cache.videos.length);
        return {
            videos,
            page: targetPage,
            total,
            hasMore: start + videos.length < total ||
                (cache.hasNext && cache.videos.length > start + videos.length),
        };
    }
    normalizeCursorSpaceVideo(item, mid) {
        const bvid = String(item.bvid ?? "");
        if (!bvid)
            return null;
        // 课堂等非普通投稿没有可靠 bvid 播放链路，跳过
        if (item.goto && String(item.goto) !== "av")
            return null;
        const aid = Number(item.param ?? item.aid ?? 0) || 0;
        const durationRaw = item.duration ?? item.length;
        const duration = typeof durationRaw === "string"
            ? this.parseSpaceDuration(durationRaw)
            : Number(durationRaw ?? 0) || 0;
        return this.withChargeBadge({
            bvid,
            aid,
            title: String(item.title ?? ""),
            cover: this.normalizeVideoCoverUrl(String(item.cover ?? item.pic ?? "")),
            duration,
            play: Number(item.play ?? 0) || 0,
            danmaku: Number(item.danmaku ?? item.video_review ?? 0) || 0,
            owner: {
                mid,
                name: String(item.author ?? ""),
                face: "",
            },
            pubdate: Number(item.ctime ?? item.created ?? item.pubdate ?? 0) || 0,
        }, item);
    }
    formatUserSpaceApiError(code, message, fallback) {
        const text = typeof message === "string" && message.trim() ? message.trim() : "";
        const numericCode = typeof code === "number" ? code : Number(code);
        if (numericCode === -404 ||
            text.includes("啥都木有") ||
            text.includes("用户不存在") ||
            text.includes("账号已注销") ||
            text.includes("用户已注销")) {
            return "该用户不存在或账号已注销";
        }
        if (text.includes("隐私") ||
            text.includes("不可见") ||
            (numericCode === -403 &&
                (text.includes("隐私") ||
                    text.includes("不可见") ||
                    text.includes("隐藏")))) {
            return "该用户已设置隐私，无法查看主页内容";
        }
        if (numericCode === -400 || text.includes("请求错误")) {
            return "翻页失败，请稍后重试";
        }
        if (text) {
            return fallback.includes("获取失败") && !text.includes("获取失败")
                ? `${fallback.replace(/，请稍后重试$/, "")}：${text}`
                : text;
        }
        if (Number.isFinite(numericCode) && numericCode !== 0) {
            return `${fallback}（错误码 ${numericCode}）`;
        }
        return fallback;
    }
    spaceArcGate = Promise.resolve();
    lastSpaceArcAt = 0;
    /** 签名投稿接口返回 -403 后不再打，避免每次排序、翻页多一次请求 */
    upArcSpecials = new Map();
    upVideosInflight = new Map();
    /** 串行化空间投稿请求，避免短时间并发触发 -799 */
    waitSpaceArcGate(minIntervalMs = 650) {
        const run = this.spaceArcGate.then(async () => {
            const wait = Math.max(0, minIntervalMs - (Date.now() - this.lastSpaceArcAt));
            if (wait > 0)
                await sleep(wait);
            this.lastSpaceArcAt = Date.now();
        });
        this.spaceArcGate = run.catch(() => undefined);
        return run;
    }
    async fetchMyArchives(page) {
        const pageSize = 30;
        const res = await this.memberClient.get("/x/web/archives", {
            params: {
                status: "is_pubing,pubed,not_pubed",
                pn: page,
                ps: pageSize,
                coop: 1,
                interactive: 1,
            },
            headers: {
                Referer: "https://member.bilibili.com/platform/upload-manager/article",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "我的投稿列表获取失败");
        }
        const data = res.data?.data;
        const arcAudits = (data?.arc_audits ?? []);
        const pageInfo = data?.page;
        const total = pageInfo?.count ?? arcAudits.length;
        const user = this.getAuthStatus();
        const videos = arcAudits
            .map((item) => {
            const archive = item.Archive;
            if (!archive?.bvid)
                return null;
            return this.normalizeArchiveAudit(item, user.mid, user.name);
        })
            .filter((item) => item != null);
        return {
            videos,
            page,
            total,
            hasMore: page * pageSize < total,
        };
    }
    normalizeBfsUrl(path) {
        if (!path)
            return "";
        if (path.startsWith("//"))
            return `https:${path}`;
        if (path.startsWith("http://"))
            return path.replace(/^http:/, "https:");
        if (path.startsWith("https://"))
            return path;
        if (path.startsWith("/"))
            return `https://i0.hdslb.com${path}`;
        return path;
    }
    normalizeVideoCoverUrl(url) {
        const base = this.normalizeBfsUrl(url);
        if (!base)
            return "";
        if (base.includes("@"))
            return base;
        return `${base}@672w_378h_1c.webp`;
    }
    normalizeArchiveAudit(item, mid, name) {
        const archive = item.Archive;
        const stat = item.stat;
        const parts = item.Videos;
        let duration = archive.duration ?? 0;
        if (!duration && parts?.length) {
            duration = parts.reduce((sum, part) => sum + (part.duration ?? 0), 0);
        }
        return {
            bvid: archive.bvid,
            aid: archive.aid ?? 0,
            title: archive.title,
            cover: this.normalizeVideoCoverUrl(archive.cover ?? ""),
            duration,
            play: stat?.view ?? 0,
            danmaku: stat?.danmaku ?? 0,
            owner: { mid, name, face: "" },
            pubdate: archive.ptime ?? archive.ctime ?? 0,
        };
    }
    async fetchUpVideosBySearch(mid, upName, page, order = "pubdate") {
        return this.fetchUpVideosBySearchPaged(mid, upName, page, order, 0);
    }
    /** 搜索结果按 mid 过滤后的投稿缓存（空间接口翻页失败时使用） */
    upSearchVideoCache = new Map();
    async fetchUpVideosBySearchPaged(mid, upName, page, order = "pubdate", knownTotal = 0) {
        if (!upName.trim()) {
            return { videos: [], page, hasMore: false, total: 0 };
        }
        // B 站搜索单页通常最多约 20 条，不能用 30 判断是否到底
        const apiPageSize = 20;
        const pageSize = 30;
        const targetPage = Math.max(1, page);
        const cacheKey = `${mid}:${order}:${upName}`;
        this.pruneBoundedMap(this.upSearchVideoCache, 8, (entry) => entry.at);
        if (targetPage === 1) {
            this.upSearchVideoCache.delete(cacheKey);
        }
        let cache = this.upSearchVideoCache.get(cacheKey);
        if (!cache) {
            cache = {
                videos: [],
                searchPage: 1,
                searchTotal: 0,
                exhausted: false,
                at: Date.now(),
            };
            this.upSearchVideoCache.set(cacheKey, cache);
        }
        const needed = targetPage * pageSize;
        let emptyStreak = 0;
        // 只给首页兜底用：最多扫几页搜索，禁止为了第 N 页从 1 连打
        const maxScans = Math.min(4, Math.max(2, targetPage));
        while (cache.videos.length < needed &&
            !cache.exhausted &&
            cache.searchPage <= maxScans) {
            const params = await signParams({
                search_type: "video",
                keyword: upName,
                page: cache.searchPage,
                page_size: apiPageSize,
                order,
                platform: "pc",
                single_column: 0,
                source: "",
            });
            const res = await this.client.get("/x/web-interface/wbi/search/type", {
                params,
                headers: { Referer: "https://search.bilibili.com/" },
                validateStatus: () => true,
                timeout: 10000,
            });
            if (res.data?.code !== 0) {
                // 搜索也被拦时抛错，让上层展示真实原因，而不是落到「请求错误」
                throw new Error(String(res.data?.message ?? "") || "搜索投稿失败，请稍后重试");
            }
            const data = res.data?.data;
            const results = (data?.result ?? []);
            if (!cache.searchTotal) {
                cache.searchTotal = Number(data?.numResults ?? 0) || 0;
            }
            const seen = new Set(cache.videos.map((v) => v.bvid));
            let added = 0;
            for (const item of results) {
                const itemMid = Number(item.mid ?? item.userid ?? 0);
                if (!itemMid || itemMid !== Number(mid))
                    continue;
                const video = this.normalizeSearchVideo(item);
                if (!video.bvid || seen.has(video.bvid))
                    continue;
                seen.add(video.bvid);
                cache.videos.push(video);
                added += 1;
            }
            if (results.length === 0) {
                cache.exhausted = true;
            }
            else if (cache.searchTotal > 0 &&
                cache.searchPage * apiPageSize >= cache.searchTotal) {
                cache.exhausted = true;
            }
            else if (results.length < apiPageSize) {
                cache.exhausted = true;
            }
            else if (added === 0) {
                emptyStreak += 1;
                if (emptyStreak >= 4)
                    cache.exhausted = true;
            }
            else {
                emptyStreak = 0;
            }
            cache.searchPage += 1;
        }
        const start = (targetPage - 1) * pageSize;
        const videos = cache.videos.slice(start, start + pageSize);
        const total = Math.max(knownTotal, cache.videos.length);
        const hasMore = cache.videos.length > start + videos.length ||
            (!cache.exhausted && videos.length >= pageSize) ||
            (total > 0 && start + videos.length < total && videos.length > 0);
        return {
            videos,
            page: targetPage,
            total,
            hasMore: Boolean(hasMore),
        };
    }
    logout() {
        appStore.set("cookies", {
            SESSDATA: "",
            bili_jct: "",
            DedeUserID: "",
            DedeUserID__ckMd5: "",
            buvid3: appStore.get("cookies").buvid3 ?? "",
        });
        appStore.set("user", null);
        appStore.set("refreshToken", "");
        appStore.set("accessToken", "");
        appStore.set("tokenExpiresAt", 0);
    }
    getAuthStatus() {
        const user = appStore.get("user");
        if (user?.isLogin)
            return user;
        return { mid: 0, name: "未登录", face: "", isLogin: false, isVip: false };
    }
    normalizeVideo(item) {
        const owner = item.owner;
        return this.withChargeBadge({
            bvid: item.bvid,
            aid: item.id ?? 0,
            title: item.title,
            cover: this.normalizeVideoCoverUrl(item.pic ?? ""),
            duration: item.duration ?? 0,
            play: item.stat?.view ?? 0,
            danmaku: item.stat?.danmaku ?? 0,
            owner: {
                mid: owner?.mid ?? 0,
                name: owner?.name ?? "",
                face: owner?.face ?? "",
            },
            pubdate: item.pubdate ??
                item.pub_time ??
                item.ctime ??
                item.created ??
                0,
        }, item);
    }
    normalizeSpaceVideo(item, mid) {
        return this.withChargeBadge({
            bvid: item.bvid,
            aid: item.aid ?? 0,
            title: item.title,
            cover: this.normalizeVideoCoverUrl(item.pic ?? ""),
            duration: this.parseSpaceDuration(item.length),
            play: item.play ?? 0,
            danmaku: item.video_review ?? 0,
            owner: {
                mid,
                name: item.author ?? "",
                face: "",
            },
            pubdate: item.created ?? 0,
        }, item);
    }
    readChargeBadge(item) {
        const badge = String(item.elec_arc_badge ?? "").trim();
        if (badge)
            return badge;
        if (item.is_charging_arc === true || Number(item.is_charging_arc) === 1) {
            return "充电专属";
        }
        if (item.is_upower_exclusive === true ||
            Number(item.is_upower_exclusive) === 1) {
            return "充电专属";
        }
        if (item.is_charge_video === true || Number(item.is_charge_video) === 1) {
            return "充电专属";
        }
        const corner = String(item.corner ?? "").trim();
        if (/充电|专属/.test(corner))
            return corner;
        return undefined;
    }
    /** 列表里明确写了「不是充电」才记负缓存。搜索的 is_charge_video=0 不可信 */
    chargeKnownOff(item) {
        if ("is_charging_arc" in item &&
            item.is_charging_arc != null &&
            item.is_charging_arc !== true &&
            Number(item.is_charging_arc) !== 1) {
            return true;
        }
        return item.is_upower_exclusive === false;
    }
    withChargeBadge(video, item) {
        const chargeBadge = this.readChargeBadge(item);
        const bvid = video.bvid?.trim();
        if (bvid && chargeBadge)
            this.rememberChargeBadge(bvid, chargeBadge);
        else if (bvid && this.chargeKnownOff(item))
            this.rememberChargeBadge(bvid, "");
        return chargeBadge ? { ...video, chargeBadge } : video;
    }
    readChargeBadgeCache() {
        return appStore.get("chargeVideoBadges") ?? {};
    }
    rememberChargeBadge(bvid, badge) {
        this.rememberChargeBadges({ [bvid]: badge });
    }
    rememberChargeBadges(entries) {
        const ids = Object.keys(entries)
            .map((id) => id.trim())
            .filter(Boolean);
        if (ids.length === 0)
            return;
        const cache = { ...this.readChargeBadgeCache() };
        const now = Date.now();
        let changed = false;
        for (const id of ids) {
            const badge = entries[id] ?? "";
            if (cache[id]?.v === badge)
                continue;
            cache[id] = { v: badge, at: now };
            changed = true;
        }
        if (!changed)
            return;
        const keys = Object.keys(cache);
        if (keys.length > 4000) {
            keys.sort((a, b) => (cache[a]?.at ?? 0) - (cache[b]?.at ?? 0));
            for (const key of keys.slice(0, keys.length - 3200))
                delete cache[key];
        }
        appStore.set("chargeVideoBadges", cache);
    }
    /** 列表接口经常不带充电标记，用稿件详情补。失败的不写入缓存 */
    async lookupChargeBadges(bvids) {
        const unique = [
            ...new Set(bvids
                .map((id) => (typeof id === "string" ? id.trim() : ""))
                .filter(Boolean)),
        ].slice(0, 24);
        const cache = this.readChargeBadgeCache();
        const now = Date.now();
        const freshMs = 7 * 24 * 60 * 60 * 1000;
        const result = {};
        const missing = [];
        for (const id of unique) {
            const hit = cache[id];
            if (hit && now - hit.at < freshMs)
                result[id] = hit.v;
            else
                missing.push(id);
        }
        if (missing.length === 0)
            return result;
        const fetched = await this.mapLimit(missing, 4, (id) => this.fetchChargeBadge(id));
        const writes = {};
        missing.forEach((id, index) => {
            const value = fetched[index];
            if (value == null)
                return;
            result[id] = value;
            writes[id] = value;
        });
        this.rememberChargeBadges(writes);
        return result;
    }
    async fetchChargeBadge(bvid) {
        try {
            const res = await this.client.get("/x/web-interface/view", {
                params: { bvid },
                headers: { Referer: `https://www.bilibili.com/video/${bvid}/` },
                timeout: 8000,
                validateStatus: () => true,
            });
            const data = res.data?.data;
            if (res.data?.code !== 0 || !data)
                return null;
            return data.is_upower_exclusive === true ||
                Number(data.is_upower_exclusive) === 1
                ? "充电专属"
                : "";
        }
        catch {
            return null;
        }
    }
    async mapLimit(items, limit, fn) {
        const out = new Array(items.length);
        let cursor = 0;
        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                out[index] = await fn(items[index]);
            }
        });
        await Promise.all(workers);
        return out;
    }
    parseSpaceDuration(length) {
        if (typeof length === "number" && Number.isFinite(length)) {
            return Math.max(0, Math.floor(length));
        }
        if (typeof length !== "string")
            return 0;
        const parts = length
            .split(":")
            .map((part) => Number(part))
            .filter((n) => Number.isFinite(n));
        if (parts.length === 0)
            return 0;
        return parts.reduce((total, part) => total * 60 + part, 0);
    }
    async getToViewList() {
        if (!isLoggedIn())
            return { videos: [], count: 0 };
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v2/history/toview", {
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "稍后再看列表获取失败");
        }
        const data = res.data?.data;
        const list = data?.list ?? [];
        const videos = list
            .filter((item) => item.bvid)
            .map((item) => this.normalizeToViewItem(item));
        return {
            videos,
            count: data?.count ?? videos.length,
        };
    }
    /** 稍后再看：附带失效判定（title / state） */
    async getToViewListDetailed() {
        if (!isLoggedIn())
            return [];
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v2/history/toview", {
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "稍后再看列表获取失败");
        }
        const data = res.data?.data;
        const list = data?.list ?? [];
        return list
            .filter((item) => item.bvid)
            .map((item) => {
            const base = this.normalizeToViewItem(item);
            const title = String(item.title ?? "");
            const state = Number(item.state);
            const placeholder = title.includes("已失效") ||
                title.includes("视频不见了") ||
                title.includes("内容已失效") ||
                !title.trim();
            // state < 0 常见为不可见/锁定；0 正常
            const badState = Number.isFinite(state) && state < 0;
            const invalid = placeholder || badState;
            let reason;
            if (placeholder)
                reason = "标题显示为已失效";
            else if (badState)
                reason = `稿件状态异常 (state=${state})`;
            return { ...base, invalid, reason, state };
        });
    }
    async addToView(aid, bvid) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再添加稍后再看");
        const body = new URLSearchParams({
            csrf,
            aid: String(aid),
            bvid,
        });
        const res = await this.client.post("/x/v2/history/toview/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        this.assertToViewMutationResponse(res, "添加稍后再看失败");
    }
    async clearToView() {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录");
        const body = new URLSearchParams({ csrf });
        const res = await this.client.post("/x/v2/history/toview/clear", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        this.assertToViewMutationResponse(res, "清空稍后再看失败");
    }
    async removeFromToView(aid) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录");
        const body = new URLSearchParams({
            csrf,
            aid: String(aid),
        });
        const res = await this.client.post("/x/v2/history/toview/del", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        this.assertToViewMutationResponse(res, "移除稍后再看失败");
    }
    isToViewFullMessage(message) {
        const text = message.toLowerCase();
        return (text.includes("列表已满") ||
            text.includes("稍后再看已满") ||
            (text.includes("1000") &&
                (text.includes("满") || text.includes("上限") || text.includes("最多"))));
    }
    assertToViewMutationResponse(res, fallback) {
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        const code = Number(res.data?.code);
        const message = String(res.data?.message ?? "");
        if (code === 90001 || this.isToViewFullMessage(message)) {
            throw new Error("TOVIEW_FULL");
        }
        if (code === 90003) {
            throw new Error("该视频已被删除，无法添加");
        }
        if (code === 0)
            return;
        throw new Error(message || fallback);
    }
    async getSpaceDynamics(mid, offset = "") {
        await this.ensureBuvid3();
        const params = await signParams({
            host_mid: mid,
            timezone_offset: -480,
            platform: "web",
            web_location: "333.999",
            features: "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,commentsNewVersion,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,htmlOpusStyle",
            ...(offset ? { offset } : {}),
        });
        const res = await this.client.get("/x/polymer/web-dynamic/v1/feed/space", {
            params,
            headers: { Referer: `https://space.bilibili.com/${mid}/dynamic` },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "动态获取失败");
        }
        const data = res.data?.data;
        const rawItems = data?.items ?? [];
        const items = rawItems
            .map((item) => this.normalizeSpaceDynamicItem(item))
            .filter((item) => item != null);
        return {
            items,
            offset: data?.offset ?? "",
            hasMore: Boolean(data?.has_more),
            updateBaseline: data?.update_baseline ?? "",
            updateNum: Number(data?.update_num) || 0,
        };
    }
    async getSpaceOpus(mid, offset = "") {
        await this.ensureBuvid3();
        const params = await signParams({
            host_mid: mid,
            timezone_offset: -480,
            platform: "web",
            web_location: "333.1387",
            type: "all",
            ...(offset ? { offset } : {}),
        });
        const res = await this.client.get("/x/polymer/web-dynamic/v1/opus/feed/space", {
            params,
            headers: { Referer: `https://space.bilibili.com/${mid}/upload/opus` },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "图文列表获取失败");
        }
        const data = res.data?.data;
        const rawItems = data?.items ?? [];
        const items = rawItems
            .map((item) => this.normalizeOpusFavItem(item))
            .filter((item) => item != null);
        return {
            items,
            offset: String(data?.offset ?? ""),
            hasMore: Boolean(data?.has_more),
        };
    }
    /** 关注动态流（官方「动态」页） */
    async getFollowDynamics(offset = "", type = "all") {
        if (!isLoggedIn()) {
            throw new Error("请先登录后查看关注动态");
        }
        await this.ensureBuvid3();
        const params = await signParams({
            type,
            timezone_offset: -480,
            platform: "web",
            web_location: "333.1365",
            features: "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,htmlOpusStyle",
            ...(offset ? { offset } : {}),
        });
        const res = await this.client.get("/x/polymer/web-dynamic/v1/feed/all", {
            params,
            headers: { Referer: "https://t.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "关注动态获取失败");
        }
        const data = res.data?.data;
        const rawItems = data?.items ?? [];
        const items = rawItems
            .map((item) => this.normalizeSpaceDynamicItem(item))
            .filter((item) => item != null);
        return {
            items,
            offset: data?.offset ?? "",
            hasMore: Boolean(data?.has_more),
            updateBaseline: data?.update_baseline ?? "",
            updateNum: Number(data?.update_num) || 0,
        };
    }
    async getDynamicDetail(id) {
        await this.ensureBuvid3();
        const dynamicId = String(id || "").trim();
        if (!dynamicId)
            throw new Error("动态 ID 无效");
        const referer = `https://www.bilibili.com/opus/${dynamicId}`;
        const deviceJson = JSON.stringify({ platform: "web", device: "pc" });
        const webJson = JSON.stringify({ spm_id: "333.1368" });
        const features = "itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion,htmlOpusStyle";
        const common = {
            id: dynamicId,
            timezone_offset: -480,
            platform: "web",
            gaia_source: "main_web",
            web_location: "333.1368",
            features,
            "x-bili-device-req-json": deviceJson,
            "x-bili-web-req-json": webJson,
        };
        const primary = await this.fetchPolymerDynamicItem("/x/polymer/web-dynamic/v1/detail", common, referer);
        const fallback = primary.item
            ? primary
            : await this.fetchPolymerDynamicItem("/x/polymer/web-dynamic/desktop/v1/detail", common, referer);
        const rawItem = fallback.item;
        if (!rawItem) {
            throw new Error(explainDynamicDetailError(fallback.code || primary.code, fallback.message || primary.message));
        }
        let item = this.normalizeSpaceDynamicItem(rawItem);
        if (!item)
            throw new Error("动态不存在或已失效");
        item = this.mergeDynamicMeta(item, rawItem);
        const opus = await this.fetchPolymerDynamicItem("/x/polymer/web-dynamic/v1/opus/detail", {
            id: dynamicId,
            timezone_offset: -480,
            features: "onlyfansVote,onlyfansAssetsV2,decorationCard,htmlNewStyle,ugcDelete,htmlOpusStyle,commentsNewVersion,avatarTypeOpus",
        }, referer);
        const opusItem = opus.item;
        if (opusItem) {
            const parsed = this.normalizeSpaceDynamicItem(opusItem);
            item = this.mergeDynamicMeta({
                ...item,
                title: item.title || parsed?.title,
                text: item.text || parsed?.text || item.text,
                images: item.images?.length ? item.images : parsed?.images,
                cover: item.cover || parsed?.cover,
                cvId: item.cvId || parsed?.cvId,
                ipLocation: item.ipLocation || parsed?.ipLocation,
                favorited: parsed?.favorited ?? item.favorited,
                stats: {
                    ...item.stats,
                    favorite: parsed?.stats?.favorite ?? item.stats?.favorite ?? 0,
                },
            }, opusItem);
        }
        return this.enrichDynamicDetail(item);
    }
    async fetchPolymerDynamicItem(path, params, referer) {
        let blocked = false;
        let code = 0;
        let message = "";
        for (const mode of ["wbi", "plain"]) {
            const signed = mode === "wbi" ? await signParams(params) : params;
            const res = await this.client.get(path, {
                params: signed,
                headers: { Referer: referer },
                validateStatus: () => true,
            });
            if (res.status === 412 || res.data?.code === -412) {
                blocked = true;
                code = -412;
                message = "请求被 B 站安全策略拦截，请稍后重试";
                continue;
            }
            if (res.data?.code === 0) {
                const item = res.data?.data?.item;
                if (item && typeof item === "object") {
                    return {
                        item: item,
                        code: 0,
                        message: "",
                    };
                }
            }
            else if (res.data?.code != null) {
                code = Number(res.data.code) || code;
                const next = String(res.data?.message || "").trim();
                if (next)
                    message = next;
            }
        }
        if (blocked)
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        return { item: null, code, message };
    }
    mergeDynamicMeta(item, raw) {
        return {
            ...item,
            ipLocation: item.ipLocation || this.extractPubLocationFromUnknown(raw),
            cvId: item.cvId || this.extractCvFromUnknown(raw),
        };
    }
    uniqueImageUrls(urls) {
        const seen = new Set();
        const result = [];
        for (const raw of urls) {
            const url = this.absHttpUrl(String(raw ?? ""));
            if (!this.isLikelyDynamicImageUrl(url) || seen.has(url))
                continue;
            seen.add(url);
            result.push(url);
        }
        return result;
    }
    absHttpUrl(raw) {
        const text = raw.trim();
        if (!text)
            return "";
        if (text.startsWith("//"))
            return `https:${text}`;
        return this.normalizeHttps(text);
    }
    isLikelyDynamicImageUrl(url) {
        if (!url.startsWith("http"))
            return false;
        if (/space\.bilibili\.com|t\.bilibili\.com|\/video\/|\/read\/cv|\/opus\/|live\.bilibili\.com/i.test(url)) {
            return false;
        }
        if (/\/bfs\/emote\//i.test(url))
            return false;
        if (/\/bfs\//i.test(url))
            return true;
        return /\.(avif|bmp|gif|jpe?g|png|webp)(\?|#|$)/i.test(url);
    }
    extractImagesFromHtml(html) {
        if (!html)
            return [];
        const urls = [];
        const re = /<img\b[^>]*\b(?:src|data-src)=["']([^"']+)["']/gi;
        let match = re.exec(html);
        while (match) {
            const url = this.absHttpUrl(match[1] ?? "");
            if (this.isLikelyDynamicImageUrl(url))
                urls.push(url);
            match = re.exec(html);
        }
        return this.uniqueImageUrls(urls);
    }
    async doDynamicVote(voteId, optionIdxs) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再投票");
        const id = String(voteId || "").trim();
        const votes = optionIdxs.map((idx) => Number(idx)).filter((idx) => idx > 0);
        if (!id || votes.length === 0)
            throw new Error("请选择投票选项");
        const body = new URLSearchParams({
            vote_id: id,
            votes: JSON.stringify(votes),
            csrf,
        });
        const res = await this.client.post("https://api.vc.bilibili.com/vote_svr/v1/vote_svr/do_vote", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "投票失败");
        }
        return this.fillVoteCard({
            voteId: id,
            title: "",
            joinNum: 0,
            endTime: 0,
            choiceCount: votes.length,
            status: 1,
            voted: true,
            myVotes: votes,
            options: [],
        });
    }
    async fillVoteCard(card) {
        try {
            // 官网页面用这条。vote_svr 那条认不出网页上投过的票，会一直返回未投票。
            const res = await this.client.get("/x/vote/vote_info", {
                params: { vote_id: card.voteId },
                headers: { Referer: "https://www.bilibili.com/" },
                validateStatus: () => true,
            });
            if (res.data?.code !== 0)
                return card;
            const data = this.asPlainRecord(res.data?.data);
            const info = this.asPlainRecord(data?.vote_info) ?? this.asPlainRecord(data?.info);
            if (!info)
                return card;
            const options = Array.isArray(info.options)
                ? info.options
                    .map((entry) => {
                    const opt = this.asPlainRecord(entry);
                    if (!opt)
                        return null;
                    const idx = Number(opt.idx ?? opt.opt_idx) || 0;
                    const text = String(opt.desc ?? opt.opt_desc ?? opt.title ?? "").trim();
                    if (!idx || !text)
                        return null;
                    return { idx, text, count: Number(opt.cnt) || 0 };
                })
                    .filter((opt) => opt != null)
                : card.options;
            const rawVotes = data?.my_votes ?? data?.votes ?? info.my_votes;
            const myVotes = Array.isArray(rawVotes)
                ? rawVotes.map((idx) => Number(idx)).filter((idx) => idx > 0)
                : card.myVotes;
            const voted = myVotes.length > 0 || card.voted;
            return {
                ...card,
                title: String(info.title ?? "").trim() || card.title,
                joinText: undefined,
                joinNum: Number(info.join_num ?? info.cnt) || card.joinNum,
                endTime: Number(info.end_time ?? info.endtime) || card.endTime,
                choiceCount: Number(info.choice_cnt) || card.choiceCount || 1,
                status: Number(info.status) || card.status,
                voted,
                myVotes: voted ? myVotes : [],
                options,
            };
        }
        catch {
            return card;
        }
    }
    extractDynamicAttach(moduleDynamic) {
        const additional = this.asPlainRecord(moduleDynamic?.additional);
        if (!additional)
            return {};
        const type = String(additional.type ?? "");
        return {
            vote: this.extractDynamicVote(additional, type),
            lottery: this.extractDynamicLottery(additional, type),
        };
    }
    extractDynamicVote(additional, type) {
        const vote = this.asPlainRecord(additional.vote);
        if (!vote)
            return undefined;
        if (type && !type.includes("VOTE"))
            return undefined;
        const voteId = String(vote.vote_id ?? "").trim();
        if (!voteId || voteId === "0")
            return undefined;
        const button = this.pickAttachButton(vote.button);
        const voted = /已参与|已投票/.test(button.text);
        return {
            voteId,
            title: String(vote.title ?? "").trim() || "投票",
            joinText: String(vote.desc ?? "").trim() || undefined,
            joinNum: Number(vote.join_num) || 0,
            endTime: Number(vote.end_time) || 0,
            choiceCount: Number(vote.choice_cnt) || 1,
            status: Number(vote.status) || 0,
            voted,
            myVotes: [],
            buttonText: button.text || undefined,
            options: [],
        };
    }
    extractDynamicLottery(additional, type) {
        const upower = this.asPlainRecord(additional.upower_lottery);
        if (upower && (type.includes("LOTTERY") || upower.title)) {
            const hint = this.asPlainRecord(upower.hint);
            const desc = this.asPlainRecord(upower.desc);
            const button = this.pickAttachButton(upower.button);
            const jumpUrl = this.normalizeHttpUrl(this.pickDynText(upower.jump_url, desc?.jump_url, button.jumpUrl));
            return {
                title: String(upower.title ?? "").trim() || "抽奖",
                hint: this.pickDynText(hint?.text) || undefined,
                prize: this.pickDynText(desc?.text) || undefined,
                buttonText: button.text || (button.disabled ? "已结束" : "参与"),
                disabled: button.disabled,
                jumpUrl,
            };
        }
        const common = this.asPlainRecord(additional.common);
        if (!common)
            return undefined;
        const head = this.pickDynText(common.head_text);
        const title = this.pickDynText(common.title);
        if (!type.includes("LOTTERY") && !/抽奖/.test(`${head}${title}`)) {
            return undefined;
        }
        const button = this.pickAttachButton(common.button);
        return {
            title: title || head || "抽奖",
            hint: this.pickDynText(common.desc, common.desc1) || undefined,
            prize: this.pickDynText(common.desc2) || undefined,
            buttonText: button.text || (button.disabled ? "已结束" : "参与"),
            disabled: button.disabled,
            jumpUrl: this.normalizeHttpUrl(this.pickDynText(common.jump_url, button.jumpUrl)),
        };
    }
    pickAttachButton(raw) {
        const button = this.asPlainRecord(raw);
        if (!button)
            return { text: "", disabled: false, jumpUrl: "" };
        const status = Number(button.status) || 0;
        const check = this.asPlainRecord(button.check);
        const uncheck = this.asPlainRecord(button.uncheck);
        const jumpStyle = this.asPlainRecord(button.jump_style);
        const source = (status >= 1 && this.pickDynText(check?.text) ? check : undefined) ||
            (this.pickDynText(jumpStyle?.text) ? jumpStyle : undefined) ||
            (this.pickDynText(uncheck?.text) ? uncheck : undefined) ||
            check;
        return {
            text: this.pickDynText(source?.text),
            disabled: Number(source?.disable) === 1 || status >= 2,
            jumpUrl: this.pickDynText(button.jump_url),
        };
    }
    normalizeHttpUrl(raw) {
        const text = raw.trim();
        if (!text)
            return undefined;
        if (text.startsWith("//"))
            return `https:${text}`;
        if (/^https?:\/\//i.test(text))
            return text.replace(/^http:/i, "https:");
        return undefined;
    }
    async enrichDynamicDetail(item) {
        let next = {
            ...item,
            text: this.stripPicPlaceholders(item.text),
        };
        if (next.vote?.voteId) {
            next = { ...next, vote: await this.fillVoteCard(next.vote) };
        }
        if (next.orig?.vote?.voteId) {
            next = {
                ...next,
                orig: { ...next.orig, vote: await this.fillVoteCard(next.orig.vote) },
            };
        }
        if (!next.cvId)
            return next;
        try {
            const article = await this.getArticle(next.cvId);
            const images = this.uniqueImageUrls([
                ...(next.images ?? []),
                next.cover,
                article.banner,
                ...article.images,
                ...this.extractImagesFromHtml(article.content),
            ]);
            return {
                ...next,
                images,
                cover: next.cover || images[0],
                title: next.title || article.title,
            };
        }
        catch {
            return next;
        }
    }
    async likeDynamic(id, like) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点赞");
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const res = await this.client.post("/x/dynamic/feed/dyn/thumb", {
            dyn_id_str: dynId,
            up: like ? 1 : 2,
            spmid: "333.1369.0.0",
            from_spmid: "333.999.0.0",
        }, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "动态点赞失败");
        }
    }
    async favoriteDynamic(id, favorite) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再收藏");
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const res = await this.client.post("/x/community/cosmo/interface/simple_action", {
            action: favorite ? 3 : 4,
            entity: {
                object_id_str: dynId,
                type: { biz: 2 },
            },
            meta: {
                spmid: "333.1368.0.0",
                from_spmid: "333.1368.0.0",
            },
        }, {
            params: { csrf, gaia_source: "main_web" },
            headers: {
                "Content-Type": "application/json",
                Referer: `https://www.bilibili.com/opus/${dynId}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "收藏失败");
        }
    }
    async setDynamicTop(id, top) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再置顶");
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const res = await this.client.post(top ? "/x/dynamic/feed/space/set_top" : "/x/dynamic/feed/space/rm_top", { dyn_str: dynId }, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://space.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || (top ? "置顶失败" : "取消置顶失败"));
        }
    }
    async removeDynamic(id) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再删除");
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const res = await this.client.post("/x/dynamic/feed/operate/remove", { dyn_id_str: dynId }, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "删除动态失败");
        }
    }
    /** 举报动态。reasonType 与网页三点菜单一致 */
    async reportDynamic(id, accusedUid, reasonType) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再举报");
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const uid = Number(accusedUid);
        if (!Number.isFinite(uid) || uid <= 0) {
            throw new Error("无法确定被举报的用户");
        }
        const res = await this.client.post("/x/dynamic/feed/dynamic_report/add", {
            accused_uid: uid,
            dynamic_id: dynId,
            reason_type: reasonType,
            reason_desc: "",
        }, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "举报失败");
        }
    }
    /** 把这条动态上的装扮卡片设为自己的动态卡片背景 */
    async equipDynamicCard(itemId) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再设置卡片背景");
        const id = Number(itemId);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error("这条动态没有可使用的卡片装扮");
        }
        const body = new URLSearchParams({
            item_id: String(id),
            part: "card",
            csrf,
            csrf_token: csrf,
        });
        const res = await this.client.post("/x/garb/user/equip", body, {
            params: { csrf },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "设置卡片背景失败");
        }
    }
    async getTargetComments(oid, type, page = 1, sort = 0, offset = "", seekRpid = 0) {
        return this.fetchReplyMainPage(oid, type, sort, page, offset, seekRpid);
    }
    async getTargetCommentReplies(oid, type, root, page = 1) {
        await this.ensureBuvid3();
        const pageSize = 10;
        const res = await this.client.get("/x/v2/reply/reply", {
            params: {
                type,
                oid: String(oid),
                root,
                pn: page,
                ps: pageSize,
            },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "楼中楼加载失败");
        }
        const commentPage = this.normalizeCommentPage(res.data?.data, page, pageSize);
        this.rememberOwnComments(commentPage.comments, type);
        return commentPage;
    }
    async addTargetComment(oid, type, message, root = 0, parent = 0, images = []) {
        return this.postReply(oid, type, message, root, parent, images, "https://www.bilibili.com/");
    }
    async postReply(oid, type, message, root, parent, images, referer) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再发表评论");
        const text = message.trim();
        const pics = await this.uploadDrawImages(images.slice(0, 3), "new_dyn");
        if (!text && pics.length === 0)
            throw new Error("评论内容不能为空");
        const body = new URLSearchParams({
            type: String(type),
            oid: String(oid),
            message: text || "分享图片",
            plat: "1",
            csrf,
        });
        if (root > 0)
            body.set("root", String(root));
        if (parent > 0)
            body.set("parent", String(parent));
        if (pics.length > 0) {
            body.set("pictures", JSON.stringify(pics));
        }
        const res = await this.client.post("/x/v2/reply/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: referer,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "发表评论失败");
        }
        const reply = res.data?.data?.reply;
        const item = reply ? this.normalizeCommentItem(reply) : null;
        if (item) {
            try {
                const { captureLocalComment } = await import("./footprint-capture");
                captureLocalComment(item, type);
            }
            catch {
                // 足迹写入失败不影响发评论
            }
        }
        return item;
    }
    async uploadDrawImages(files, biz) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录");
        const uploaded = [];
        for (const file of files) {
            const bytes = Buffer.from(file.data);
            if (bytes.length === 0)
                continue;
            if (bytes.length > 20 * 1024 * 1024)
                throw new Error("图片不能超过 20MB");
            const form = new FormData();
            form.append("file_up", new Blob([Uint8Array.from(bytes)], {
                type: file.mime || "image/jpeg",
            }), file.name || "image.jpg");
            form.append("category", "daily");
            form.append("biz", biz);
            form.append("csrf", csrf);
            const res = await this.client.post("/x/dynamic/feed/draw/upload_bfs", form, { validateStatus: () => true });
            if (res.status === 412 || res.data?.code === -412) {
                throw new Error("请求被 B 站安全策略拦截，请稍后重试");
            }
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "图片上传失败");
            }
            const data = (res.data?.data ?? {});
            const url = String(data.image_url ?? "").replace(/^http:/, "https:");
            if (!url)
                throw new Error("图片上传失败");
            uploaded.push({
                img_src: url,
                img_width: Number(data.image_width) || 0,
                img_height: Number(data.image_height) || 0,
                img_size: Number(data.img_size) || 0,
            });
        }
        return uploaded;
    }
    async postCreateDyn(dynReq) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再发布动态");
        const res = await this.client.post("/x/dynamic/feed/create/dyn", {
            dyn_req: {
                meta: {
                    app_meta: { from: "create.dynamic.web", mobi_app: "web" },
                },
                ...dynReq,
            },
        }, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "发布动态失败");
        }
        const data = (res.data?.data ?? {});
        const id = String(data.dyn_id_str ?? data.dyn_id ?? "").trim();
        if (!id)
            throw new Error("发布成功但没有返回动态 ID");
        return { id };
    }
    currentMid() {
        return (appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID));
    }
    async createVoteCard(vote) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再发起投票");
        const options = vote.options.map((item) => item.trim()).filter(Boolean);
        if (options.length < 2)
            throw new Error("投票至少需要两个选项");
        const hours = Math.min(720, Math.max(1, Math.round(vote.durationHours || 24)));
        const body = new URLSearchParams({
            title: vote.title.trim() || "投票",
            desc: "",
            type: "0",
            choice_cnt: String(Math.min(Math.max(1, vote.choiceCount || 1), options.length)),
            duration: String(hours * 3600),
            options: JSON.stringify(options.map((desc) => ({ desc }))),
            csrf,
        });
        const res = await this.client.post("https://api.vc.bilibili.com/vote_svr/v1/vote_svr/create_vote", body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "创建投票失败");
        }
        const data = (res.data?.data ?? {});
        const id = Number(data.vote_id ?? data.id) || 0;
        if (!id)
            throw new Error("创建投票失败");
        return id;
    }
    async createLotteryCard(lottery) {
        const csrf = getCsrf();
        const sender = this.currentMid();
        if (!csrf || !sender)
            throw new Error("请先登录后再发起抽奖");
        const prize = lottery.prize.trim();
        if (!prize)
            throw new Error("请填写奖品");
        const hours = Math.min(360, Math.max(1, Math.round(lottery.durationHours || 24)));
        const body = new URLSearchParams({
            sender_uid: String(sender),
            business_type: "1",
            business_id: "0",
            at_num: "0",
            feed_limit: "0",
            first_prize: "1",
            first_prize_cmt: prize,
            first_prize_pic: "",
            lottery_time: String(Math.floor(Date.now() / 1000) + hours * 3600),
            need_post: "0",
            need_follow: lottery.needFollow ? "1" : "0",
            src_type: "1",
            csrf,
        });
        const res = await this.client.post("https://api.vc.bilibili.com/lottery_svr/v1/lottery_svr/create", body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "创建抽奖失败");
        }
        const data = (res.data?.data ?? {});
        const id = Number(data.lottery_id ?? data.id) || 0;
        if (!id)
            throw new Error("创建抽奖失败");
        return id;
    }
    async createReserveCard(reserve) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再发起预约");
        const title = reserve.title.trim();
        if (!title)
            throw new Error("请填写预约标题");
        if (!reserve.startTs)
            throw new Error("请选择预约时间");
        const body = new URLSearchParams({
            title,
            type: "2",
            from: "1",
            live_plan_start_time: String(reserve.startTs),
            create_dynamic: "0",
            csrf,
        });
        const res = await this.client.post("/x/new-reserve/reserve/create", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "创建预约失败");
        }
        const data = (res.data?.data ?? {});
        const id = Number(data.sid ?? data.reserve_id ?? data.id) || 0;
        if (!id)
            throw new Error("创建预约失败");
        return id;
    }
    buildDynContents(text, options, extras) {
        const mentions = options?.mentions ?? [];
        const topic = options?.topic;
        const source = text.trim();
        const contents = [];
        if (source) {
            const needles = [
                ...mentions.map((item) => ({
                    token: `@${item.name}`,
                    type: 2,
                    biz_id: String(item.mid),
                })),
                ...(topic
                    ? [
                        {
                            token: `#${topic.name}#`,
                            type: 5,
                            biz_id: String(topic.id),
                        },
                    ]
                    : []),
            ].sort((a, b) => b.token.length - a.token.length);
            let index = 0;
            while (index < source.length) {
                const hit = needles.find((item) => item.token && source.startsWith(item.token, index));
                if (hit) {
                    contents.push({
                        raw_text: hit.token,
                        type: hit.type,
                        biz_id: hit.biz_id,
                    });
                    index += hit.token.length;
                    continue;
                }
                let next = source.length;
                for (const item of needles) {
                    const at = source.indexOf(item.token, index + 1);
                    if (at >= 0 && at < next)
                        next = at;
                }
                const raw = source.slice(index, next);
                if (raw)
                    contents.push({ raw_text: raw, type: 1, biz_id: "" });
                index = next;
            }
        }
        contents.push(...extras);
        return contents;
    }
    async composeDynReq(text, images, options) {
        const content = text.trim();
        if (content.length > 1000)
            throw new Error("动态最多 1000 字");
        const uploaded = await this.uploadDrawImages(images.slice(0, 9), "new_dyn");
        const kept = (options?.keepImages ?? [])
            .map((src) => src.trim())
            .filter(Boolean)
            .map((src) => ({
            img_src: src,
            img_width: 0,
            img_height: 0,
            img_size: 0,
        }));
        const pics = [...kept, ...uploaded].slice(0, 9);
        const extras = [];
        let attach;
        if (options?.vote) {
            const voteId = await this.createVoteCard(options.vote);
            extras.push({
                raw_text: options.vote.title.trim() || "投票",
                type: 4,
                biz_id: String(voteId),
            });
            attach = { common_card: { type: 2, biz_id: voteId } };
        }
        if (options?.lottery) {
            const lotteryId = await this.createLotteryCard(options.lottery);
            extras.push({
                raw_text: options.lottery.prize.trim(),
                type: 3,
                biz_id: String(lotteryId),
            });
            attach = { common_card: { type: 20, biz_id: lotteryId } };
        }
        if (options?.reserve) {
            const reserveId = await this.createReserveCard(options.reserve);
            attach = { common_card: { type: 14, biz_id: reserveId } };
        }
        const contents = this.buildDynContents(content, options, extras);
        if (contents.length === 0 && pics.length === 0 && !attach) {
            throw new Error("写点内容或加一张图");
        }
        const option = {};
        if (options?.privatePub)
            option.private_pub = 1;
        if (options?.closeComment)
            option.close_comment = 1;
        if (options?.timerPubTime && options.timerPubTime > 0) {
            option.timer_pub_time = options.timerPubTime;
        }
        return {
            content: { contents },
            ...(pics.length > 0 ? { pics } : {}),
            ...(options?.topic
                ? {
                    topic: {
                        id: options.topic.id,
                        name: options.topic.name,
                        from_source: "dynamic",
                    },
                }
                : {}),
            ...(Object.keys(option).length > 0 ? { option } : {}),
            ...(attach ? { attach_card: attach } : {}),
            scene: pics.length > 0 ? 2 : 1,
        };
    }
    async createDynamic(text, images = [], options) {
        return this.postCreateDyn(await this.composeDynReq(text, images, options));
    }
    async editDynamic(id, text, images = [], options) {
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再编辑动态");
        const dynReq = await this.composeDynReq(text, images, options);
        const res = await this.client.post("/x/dynamic/feed/edit/dyn", {
            dyn_req: {
                dyn_id_str: dynId,
                meta: {
                    app_meta: { from: "create.dynamic.web", mobi_app: "web" },
                },
                ...dynReq,
            },
        }, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "编辑动态失败");
        }
    }
    async setDynamicPrivate(id, privatePub) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录");
        const dynId = String(id || "").trim();
        if (!dynId)
            throw new Error("动态 ID 无效");
        const payload = { dyn_id_str: dynId, private: privatePub ? 1 : 0 };
        const post = (path) => this.client.post(path, payload, {
            params: { csrf },
            headers: {
                "Content-Type": "application/json",
                Referer: "https://t.bilibili.com/",
            },
            validateStatus: () => true,
        });
        let res = await post("/x/dynamic/feed/operate/private");
        if (res.status === 404 || res.data?.code === -404) {
            res = await post("/x/dynamic/feed/operate/set_private");
        }
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "修改可见范围失败");
        }
    }
    async searchTopics(keyword) {
        const term = keyword.trim();
        if (!term)
            return [];
        const params = await signParams({
            keywords: term,
            page_num: 1,
            page_size: 8,
        });
        const res = await this.client.get("/x/topic/pub/search", {
            params,
            headers: { Referer: "https://t.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return [];
        const data = (res.data?.data ?? {});
        const list = (data.topic_items ?? data.list ?? data.topics);
        if (!Array.isArray(list))
            return [];
        return list
            .map((entry) => {
            const item = entry;
            const id = Number(item.id ?? item.topic_id) || 0;
            const name = String(item.name ?? item.topic_name ?? "").trim();
            if (!id || !name)
                return null;
            return { id, name };
        })
            .filter((item) => item != null);
    }
    async getTopicHead(topicId) {
        const res = await this.client.get("/x/topic/web/details/top", {
            params: { topic_id: topicId },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "话题信息加载失败");
        }
        const data = (res.data?.data ?? {});
        const info = (data.topic_item ?? data.info ?? data);
        return {
            id: topicId,
            name: String(info.name ?? info.topic_name ?? "").trim() || "话题",
            desc: String(info.description ?? info.desc ?? info.content ?? "").trim(),
            favorited: Boolean(info.is_fav ?? info.fav ?? info.is_followed),
        };
    }
    async favoriteTopic(topicId, favorite) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再关注话题");
        const body = new URLSearchParams({
            topic_id: String(topicId),
            csrf,
        });
        const res = await this.client.post(favorite ? "/x/topic/fav/sub/add" : "/x/topic/fav/sub/cancel", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message ||
                (favorite ? "关注话题失败" : "取消关注失败"));
        }
    }
    async repostDynamic(dynId, text = "") {
        const id = String(dynId || "").trim();
        if (!id)
            throw new Error("动态 ID 无效");
        const content = text.trim();
        if (content.length > 1000)
            throw new Error("转发内容最多 1000 字");
        return this.postCreateDyn({
            content: {
                contents: content ? [{ raw_text: content, type: 1, biz_id: "" }] : [],
            },
            scene: 4,
            repost_src: { dyn_id_str: id },
        });
    }
    async getHotSearch() {
        await this.ensureBuvid3();
        const params = await signParams({
            limit: 10,
            platform: "web",
            web_location: "333.1007",
        });
        const res = await this.client.get("/x/web-interface/wbi/search/square", {
            params,
            headers: { Referer: "https://search.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "热搜加载失败");
        }
        const trending = res.data?.data?.trending;
        const list = Array.isArray(trending?.list) ? trending.list : [];
        return list
            .map((entry) => {
            const item = entry;
            const keyword = String(item.keyword ?? item.show_name ?? "").trim();
            if (!keyword)
                return null;
            const icon = String(item.icon ?? "").trim();
            const next = {
                keyword,
                showName: String(item.show_name ?? keyword),
            };
            if (icon)
                next.icon = icon;
            return next;
        })
            .filter((item) => item != null)
            .slice(0, 10);
    }
    async getTopicDynamics(topicId, offset = "") {
        await this.ensureBuvid3();
        const params = await signParams({
            topic_id: topicId,
            timezone_offset: -480,
            platform: "web",
            features: "itemOpusStyle,opusBigCover,onlyfansVote,decorationCard,ugcDelete,onlyfansQaCard",
            ...(offset ? { offset } : {}),
        });
        const res = await this.client.get("/x/polymer/web-dynamic/v1/feed/topic", {
            params,
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "话题加载失败");
        }
        const data = res.data?.data;
        const rawItems = data?.items ?? [];
        const items = rawItems
            .map((item) => this.normalizeSpaceDynamicItem(item))
            .filter((item) => item != null);
        return {
            items,
            offset: data?.offset ?? "",
            hasMore: Boolean(data?.has_more),
        };
    }
    async getVideoChapters(bvid, cid) {
        await this.ensureBuvid3();
        const params = await signParams({ bvid, cid });
        const res = await this.client.get("/x/player/wbi/v2", {
            params,
            headers: { Referer: `https://www.bilibili.com/video/${bvid}` },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return [];
        const data = (res.data?.data ?? {});
        const raw = (data.view_points ?? data.viewpoint);
        if (!Array.isArray(raw))
            return [];
        return raw
            .map((entry) => {
            const point = entry;
            const from = Number(point.from) || 0;
            const content = String(point.content ?? "").trim();
            if (!content)
                return null;
            const cover = String(point.imgUrl ?? point.cover ?? "").trim();
            const next = {
                from,
                to: Number(point.to) || from,
                content,
            };
            if (cover)
                next.cover = cover;
            return next;
        })
            .filter((item) => item != null);
    }
    async getDanmakuFilters() {
        const res = await this.client.get("/x/dm/filter/user", {
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return [];
        const rule = res.data?.data?.rule;
        if (!Array.isArray(rule))
            return [];
        return rule
            .map((entry) => {
            const item = entry;
            const text = String(item.filter ?? "").trim();
            const id = Number(item.id) || 0;
            const type = Number(item.type);
            if (!text || !id)
                return null;
            const kind = type === 1 ? "regex" : type === 2 ? "user" : "text";
            return { id, text, kind };
        })
            .filter((item) => item != null);
    }
    async addDanmakuFilter(text, kind = "text") {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再添加屏蔽词");
        const word = text.trim();
        if (!word)
            throw new Error("屏蔽词不能为空");
        const type = kind === "regex" ? "1" : kind === "user" ? "2" : "0";
        if (kind === "user" && !/^\d+$/.test(word)) {
            throw new Error("屏蔽用户请填写数字 UID");
        }
        const body = new URLSearchParams({
            type,
            filter: word,
            csrf,
        });
        const res = await this.client.post("/x/dm/filter/user/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "添加屏蔽词失败");
        }
    }
    async removeDanmakuFilter(id) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录");
        const body = new URLSearchParams({
            ids: String(id),
            csrf,
        });
        const res = await this.client.post("/x/dm/filter/user/del", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "删除屏蔽词失败");
        }
    }
    async likeDanmaku(cid, dmid, like) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点赞弹幕");
        const body = new URLSearchParams({
            oid: String(cid),
            dmid: String(dmid),
            op: like ? "1" : "2",
            csrf,
        });
        const res = await this.client.post("/x/v2/dm/thumbup/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "弹幕点赞失败");
        }
    }
    async recallDanmaku(cid, dmid) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再撤回弹幕");
        const body = new URLSearchParams({
            cid: String(cid),
            dmid: String(dmid),
            csrf,
        });
        const res = await this.client.post("/x/dm/recall", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "撤回弹幕失败");
        }
        return String(res.data?.message ?? "已撤回");
    }
    async reportDanmaku(cid, dmid, reason = 11) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再举报弹幕");
        const body = new URLSearchParams({
            cid: String(cid),
            dmid: String(dmid),
            reason: String(reason),
            csrf,
        });
        const res = await this.client.post("/x/dm/report/add", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "举报弹幕失败");
        }
    }
    async likeTargetComment(oid, type, rpid, like) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再点赞");
        const body = new URLSearchParams({
            type: String(type),
            oid: String(oid),
            rpid: String(rpid),
            action: like ? "1" : "0",
            csrf,
        });
        const res = await this.client.post("/x/v2/reply/action", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "点赞失败");
        }
    }
    /** 官方历史记录（与客户端历史同步） */
    async getWatchHistory(type = "all", cursor, filters) {
        if (!isLoggedIn()) {
            throw new Error("请先登录后查看历史记录");
        }
        const keyword = filters?.keyword?.trim() ?? "";
        if (keyword) {
            return this.searchWatchHistory(type, keyword, filters);
        }
        return this.listWatchHistory(type, cursor, filters);
    }
    historyNeedsScan(filters) {
        if (!filters)
            return false;
        return Boolean(Boolean(filters.keyword?.trim()) ||
            Boolean(filters.duration) ||
            (filters.device && filters.device !== "all") ||
            filters.fromTime ||
            filters.toTime);
    }
    matchHistoryFilters(item, filters) {
        if (!filters)
            return true;
        if (filters.fromTime && item.viewAt < filters.fromTime)
            return false;
        if (filters.toTime && item.viewAt > filters.toTime)
            return false;
        if (filters.duration) {
            const seconds = item.duration;
            if (seconds <= 0)
                return false;
            if (filters.duration === 1 && seconds >= 600)
                return false;
            if (filters.duration === 2 && (seconds < 600 || seconds >= 1800)) {
                return false;
            }
            if (filters.duration === 3 && (seconds < 1800 || seconds >= 3600)) {
                return false;
            }
            if (filters.duration === 4 && seconds < 3600)
                return false;
        }
        if (filters.device && filters.device !== "all") {
            const dt = item.dt ?? 0;
            if (filters.device === "pc" && dt !== 2)
                return false;
            if (filters.device === "phone" && ![1, 3, 5, 7].includes(dt)) {
                return false;
            }
            if (filters.device === "pad" && dt !== 4 && dt !== 6)
                return false;
            if (filters.device === "tv" && dt !== 33)
                return false;
        }
        const keyword = filters.keyword?.trim().toLowerCase();
        if (keyword) {
            const hay = `${item.title} ${item.authorName}`.toLowerCase();
            if (!hay.includes(keyword))
                return false;
        }
        return true;
    }
    async fetchHistoryCursorPage(type, cursor) {
        await this.ensureBuvid3();
        const params = {
            ps: 20,
            type,
        };
        if (cursor?.max)
            params.max = cursor.max;
        if (cursor?.viewAt)
            params.view_at = cursor.viewAt;
        if (cursor?.business)
            params.business = cursor.business;
        const res = await this.client.get("/x/web-interface/history/cursor", {
            params,
            headers: { Referer: "https://www.bilibili.com/history" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "历史记录获取失败"));
        }
        const data = res.data?.data;
        const rawList = data?.list ?? [];
        const items = rawList
            .map((item) => this.normalizeHistoryItem(item))
            .filter((item) => item != null);
        const next = data?.cursor ?? {};
        const nextCursor = {
            max: Number(next.max) || 0,
            viewAt: Number(next.view_at) || 0,
            business: String(next.business ?? ""),
        };
        return {
            items,
            cursor: nextCursor,
            hasMore: items.length > 0 && nextCursor.max > 0 && nextCursor.viewAt > 0,
        };
    }
    async listWatchHistory(type, cursor, filters) {
        let start = cursor;
        if (!start && filters?.toTime) {
            start = { max: 0, viewAt: filters.toTime, business: "" };
        }
        if (!this.historyNeedsScan(filters)) {
            return this.fetchHistoryCursorPage(type, start);
        }
        const wanted = 20;
        const collected = [];
        let next = start;
        let hasMore = true;
        let guard = 0;
        let lastCursor = next ?? { max: 0, viewAt: 0, business: "" };
        while (collected.length < wanted && hasMore && guard < 12) {
            const page = await this.fetchHistoryCursorPage(type, next);
            guard += 1;
            lastCursor = page.cursor;
            hasMore = page.hasMore;
            for (const item of page.items) {
                if (filters?.fromTime && item.viewAt < filters.fromTime) {
                    hasMore = false;
                    break;
                }
                if (this.matchHistoryFilters(item, filters)) {
                    collected.push(item);
                    if (collected.length >= wanted)
                        break;
                }
            }
            next = page.cursor;
            if (page.items.length === 0)
                hasMore = false;
        }
        return {
            items: collected.slice(0, wanted),
            cursor: lastCursor,
            hasMore,
        };
    }
    async searchWatchHistory(type, keyword, filters) {
        await this.ensureBuvid3();
        const pn = Math.max(1, filters?.page ?? 1);
        const extraFilters = { ...filters, keyword: "" };
        const needFilter = this.historyNeedsScan(extraFilters);
        const params = {
            pn,
            keyword,
            ps: 20,
        };
        if (type !== "all")
            params.business = type;
        const res = await this.client.get("/x/web-interface/history/search", {
            params,
            headers: { Referer: "https://www.bilibili.com/history" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.status === 404 || res.data?.code === -404) {
            return this.listWatchHistory(type, undefined, filters);
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "历史搜索失败"));
        }
        const data = (res.data?.data ?? {});
        const rawList = data.list ?? [];
        const parsed = rawList
            .map((item) => this.normalizeHistoryItem(item))
            .filter((item) => item != null);
        const items = needFilter
            ? parsed.filter((item) => this.matchHistoryFilters(item, extraFilters))
            : parsed;
        const pageInfo = (data.page ?? {});
        const hasMore = data.has_more === true ||
            data.hasMore === true ||
            parsed.length >= 20 ||
            (Number(pageInfo.total) || 0) > pn * 20;
        return {
            items,
            cursor: { max: 0, viewAt: 0, business: "" },
            hasMore,
        };
    }
    async getHistoryShadow() {
        if (!isLoggedIn())
            return true;
        await this.ensureBuvid3();
        const res = await this.client.get("/x/v2/history/shadow", {
            headers: { Referer: "https://www.bilibili.com/history" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "历史开关获取失败"));
        }
        const raw = res.data?.data;
        const disabled = raw === true || raw === 1 || raw === "true";
        return !disabled;
    }
    async setHistoryShadow(record) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再修改历史开关");
        const res = await this.client.post("/x/v2/history/shadow/set", new URLSearchParams({
            switch: record ? "false" : "true",
            csrf,
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/history",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "历史开关设置失败"));
        }
    }
    /** 删除单条历史：kid 格式为 `{business}_{oid}` */
    async deleteWatchHistory(item) {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再删除历史");
        const business = item.business || "archive";
        const targetId = item.oid || item.kid || 0;
        if (!targetId)
            throw new Error("无效的历史记录");
        const res = await this.client.post("/x/v2/history/delete", new URLSearchParams({
            kid: `${business}_${targetId}`,
            csrf,
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/account/history",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "删除历史失败");
        }
    }
    /** 清空全部历史记录 */
    async clearWatchHistory() {
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再清空历史");
        const res = await this.client.post("/x/v2/history/clear", new URLSearchParams({ csrf }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/account/history",
                Origin: "https://www.bilibili.com",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "清空历史失败");
        }
    }
    normalizeHistoryItem(item) {
        const history = (item.history ?? {});
        const business = String(history.business ?? item.business ?? "");
        const oid = Number(history.oid) || 0;
        const kid = Number(item.kid) || oid;
        const bvid = history.bvid || undefined;
        const viewAt = Number(item.view_at) || 0;
        const title = String(item.title ?? "");
        if (!title && !bvid && !oid)
            return null;
        const coversRaw = item.covers;
        const covers = Array.isArray(coversRaw)
            ? coversRaw
                .map((url) => String(url || "").replace(/^http:/, "https:"))
                .filter(Boolean)
            : undefined;
        return {
            id: `${business || "item"}-${kid || oid}-${viewAt}`,
            kid,
            title: title || "未命名内容",
            cover: this.normalizeBfsUrl(String(item.cover ?? covers?.[0] ?? "")),
            covers,
            authorName: String(item.author_name ?? ""),
            authorFace: this.normalizeBfsUrl(String(item.author_face ?? "")),
            authorMid: Number(item.author_mid) || 0,
            viewAt,
            progress: Number(item.progress) || 0,
            duration: Number(item.duration) || 0,
            showTitle: item.show_title || undefined,
            badge: item.badge || undefined,
            tagName: item.tag_name || undefined,
            liveStatus: item.live_status == null ? undefined : Number(item.live_status),
            business,
            bvid,
            oid,
            cid: Number(history.cid) || undefined,
            uri: item.uri || undefined,
            dt: Number(history.dt ?? item.dt ?? item.device) || 0,
            favorited: Number(item.is_fav) === 1 || item.favorite === true,
        };
    }
    async getUserCollections(mid, page = 1) {
        await this.ensureBuvid3();
        const params = await signParams({
            mid,
            page_num: page,
            page_size: 20,
            web_location: "333.999",
        });
        const res = await this.client.get("/x/polymer/web-space/seasons_series_list", {
            params,
            headers: { Referer: `https://space.bilibili.com/${mid}/lists` },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "合集列表获取失败");
        }
        let itemsLists = res.data?.data
            ?.items_lists;
        let seasons = this.parseCollectionList(itemsLists?.seasons_list, "season", "created");
        let series = this.parseCollectionList(itemsLists?.series_list, "series", "created");
        if (seasons.length === 0 && series.length === 0 && page === 1) {
            const fallback = await this.client.get("/x/polymer/web-space/home/seasons_series", {
                params: await signParams({ mid, web_location: "333.999" }),
                headers: { Referer: `https://space.bilibili.com/${mid}` },
                validateStatus: () => true,
            });
            if (fallback.data?.code === 0) {
                const homeData = fallback.data?.data;
                itemsLists = homeData?.items_lists;
                seasons = this.parseCollectionList(itemsLists?.seasons_list ?? homeData?.seasons_list, "season", "created");
                series = this.parseCollectionList(itemsLists?.series_list ?? homeData?.series_list, "series", "created");
            }
        }
        const pageInfo = itemsLists?.page;
        const total = pageInfo?.total ?? seasons.length + series.length;
        const pageSize = pageInfo?.page_size ?? 20;
        return {
            seasons,
            series,
            page,
            hasMore: page * pageSize < total,
        };
    }
    async getSubscribedCollections(page = 1) {
        const mid = appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
        if (!mid) {
            return { seasons: [], series: [], page, hasMore: false };
        }
        const pageSize = 20;
        try {
            const collected = await this.fetchCollectedSeasonFolders(mid, page, pageSize);
            if (collected.items.length > 0) {
                return {
                    seasons: collected.items,
                    series: [],
                    page,
                    hasMore: collected.hasMore,
                };
            }
        }
        catch {
            // 继续走文件夹扫描兜底
        }
        const all = await this.loadSubscribedSeasonsFromFolders();
        const start = (page - 1) * pageSize;
        const slice = all.slice(start, start + pageSize);
        return {
            seasons: slice,
            series: [],
            page,
            hasMore: start + pageSize < all.length,
        };
    }
    /** 是否已订阅该 UGC 合集（只查 collected 列表，避免扫全收藏夹） */
    async getUgcSeasonSubscribed(seasonId) {
        const id = Number(seasonId) || 0;
        if (!id)
            return false;
        const mid = appStore.get("user")?.mid ?? Number(appStore.get("cookies").DedeUserID);
        if (!mid)
            return false;
        try {
            for (let page = 1; page <= 3; page++) {
                const { items, hasMore } = await this.fetchCollectedSeasonFolders(mid, page, 50);
                if (items.some((item) => item.id === id))
                    return true;
                if (!hasMore)
                    break;
            }
        }
        catch {
            // ignore
        }
        return false;
    }
    /**
     * 订阅 / 取消订阅 UGC 合集
     * fav:   POST /x/v3/fav/season/fav
     * unfav: POST /x/v3/fav/season/unfav
     */
    async setUgcSeasonSubscribe(seasonId, subscribe) {
        const id = Number(seasonId) || 0;
        if (!id)
            throw new Error("合集 ID 无效");
        const csrf = getCsrf();
        if (!csrf)
            throw new Error("请先登录后再订阅合集");
        const path = subscribe ? "/x/v3/fav/season/fav" : "/x/v3/fav/season/unfav";
        const body = new URLSearchParams({
            season_id: String(id),
            platform: "web",
            csrf,
        });
        const res = await this.client.post(path, body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://www.bilibili.com/",
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message ||
                (subscribe ? "订阅合集失败" : "取消订阅失败"));
        }
        this.subscribedSeasonsCache = null;
        return subscribe;
    }
    async getFavVideoMedias(page = 1) {
        const folders = await this.getFavFolders();
        const mediaId = this.getDefaultFavFolderId(folders);
        if (!mediaId) {
            return { items: [], page, hasMore: false };
        }
        const pageSize = 20;
        const { resources, hasMore } = await this.getFavResources(mediaId, page, pageSize);
        const items = resources.map((resource) => ({
            id: resource.id,
            type: 2,
            title: resource.title,
            cover: resource.cover,
            intro: "",
            link: resource.bvid
                ? `https://www.bilibili.com/video/${resource.bvid}`
                : "",
            bvid: resource.bvid,
            upper: resource.upper,
            duration: resource.duration,
            playCount: 0,
            favTime: 0,
        }));
        return { items, page, hasMore };
    }
    async getOpusFavorites(page = 1) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/polymer/web-dynamic/v1/opus/feed/fav", {
            params: { page, page_size: 20 },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "图文收藏获取失败");
        }
        const data = res.data?.data;
        const rawItems = data?.items ??
            data?.list ??
            [];
        const items = rawItems
            .map((item) => this.normalizeOpusFavItem(item))
            .filter((item) => item != null);
        return {
            items,
            page,
            hasMore: Boolean(data?.has_more ?? items.length >= 20),
        };
    }
    async getUpCourses(mid, page = 1) {
        const pageSize = 30;
        const pn = Math.max(1, page);
        const res = await this.client.get("/pugv/app/web/season/page", {
            params: { mid, pn, ps: pageSize },
            headers: { Referer: `https://space.bilibili.com/${mid}` },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(formatBiliApiError(res.data, "课堂列表获取失败"));
        }
        const data = (res.data?.data ?? {});
        const rawItems = (Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.list)
                ? data.list
                : []);
        const list = rawItems
            .map((item) => this.normalizeCheeseCourseItem(item))
            .filter((item) => item != null);
        const pageInfo = (data.page ?? {});
        const reported = Number(pageInfo.total ?? data.total);
        const total = Number.isFinite(reported) && reported > 0 ? reported : list.length;
        return {
            list,
            page: pn,
            total,
            hasMore: pn * pageSize < total,
        };
    }
    async getCheeseFollowList(page = 1, mid) {
        await this.ensureBuvid3();
        const pageSize = 20;
        const user = this.getAuthStatus();
        const targetMid = mid ?? user.mid ?? 0;
        if (!isLoggedIn() || targetMid <= 0) {
            return { list: [], page, hasMore: false, total: 0 };
        }
        const merged = new Map();
        let paidTotal = 0;
        if (page === 1) {
            const cheesePaid = await this.collectPaidPugvByKind("cheese");
            paidTotal = cheesePaid.length;
            for (const item of cheesePaid)
                merged.set(item.seasonId, item);
        }
        const favorite = await this.fetchCheeseFavoriteList(targetMid, page, pageSize);
        for (const item of favorite.list) {
            if (item.kind === "upower")
                continue;
            merged.set(item.seasonId, item);
        }
        const total = paidTotal + favorite.total;
        const hasMore = favorite.hasMore;
        return {
            list: [...merged.values()],
            page,
            hasMore,
            total: total || merged.size,
        };
    }
    async getUpowerPaidList() {
        await this.ensureBuvid3();
        if (!isLoggedIn()) {
            return { active: [], expired: [] };
        }
        const exclusives = await this.collectPaidPugvByKind("upower");
        try {
            const [activeList, expiredList] = await Promise.all([
                this.fetchChargeUpList(1),
                this.fetchChargeUpList(2),
            ]);
            return this.mergeChargeRecords(activeList, expiredList, exclusives);
        }
        catch {
            return this.splitExclusivesByFollow(exclusives);
        }
    }
    async collectPaidPugvByKind(kind) {
        const list = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 15) {
            const paid = await this.fetchCheesePaidList(page, 20);
            for (const item of paid.list) {
                if (item.kind === kind)
                    list.push(item);
            }
            hasMore = paid.hasMore;
            page += 1;
        }
        return list;
    }
    mergeChargeRecords(activeList, expiredList, exclusives) {
        const activeMap = new Map(activeList.map((item) => [item.mid, item]));
        const expiredMap = new Map();
        for (const item of expiredList) {
            if (activeMap.has(item.mid))
                continue;
            expiredMap.set(item.mid, item);
        }
        let orphanSeq = 0;
        for (const exclusive of exclusives) {
            const host = this.pickChargeHost(exclusive, activeMap, expiredMap);
            if (host) {
                host.exclusives.push({ ...exclusive, expired: host.expired });
                continue;
            }
            const mid = exclusive.mid && exclusive.mid > 0 ? exclusive.mid : 0;
            const key = mid > 0 ? mid : -++orphanSeq;
            expiredMap.set(key, {
                mid,
                name: exclusive.subtitle || exclusive.title,
                face: "",
                expireTime: 0,
                privilegeName: "",
                url: mid > 0 ? `https://space.bilibili.com/${mid}` : exclusive.url,
                expired: true,
                exclusives: [{ ...exclusive, expired: true }],
            });
        }
        return {
            active: this.collapseDuplicateChargeUps([...activeMap.values()]),
            expired: this.collapseDuplicateChargeUps([...expiredMap.values()]),
        };
    }
    pickChargeHost(exclusive, activeMap, expiredMap) {
        const mid = exclusive.mid ?? 0;
        if (mid > 0) {
            const byMid = activeMap.get(mid) ?? expiredMap.get(mid);
            if (byMid)
                return byMid;
        }
        const hosts = [...activeMap.values(), ...expiredMap.values()];
        const matches = hosts.filter((up) => this.chargeNamesRelated(up.name, exclusive.title, exclusive.subtitle));
        if (matches.length === 0)
            return undefined;
        matches.sort((a, b) => this.chargeHostScore(b) - this.chargeHostScore(a));
        return matches[0];
    }
    chargeHostScore(up) {
        return ((up.face ? 4 : 0) +
            (up.expireTime ? 2 : 0) +
            (up.privilegeName ? 1 : 0) +
            up.name.length / 100);
    }
    collapseDuplicateChargeUps(list) {
        const kept = [];
        for (const item of list) {
            const host = kept.find((up) => (item.mid > 0 && up.mid === item.mid) ||
                this.chargeNamesRelated(up.name, item.name));
            if (!host) {
                kept.push(item);
                continue;
            }
            const [primary, extra] = this.chargeHostScore(item) > this.chargeHostScore(host)
                ? [item, host]
                : [host, item];
            primary.exclusives.push(...extra.exclusives);
            if (!primary.face && extra.face)
                primary.face = extra.face;
            if (!primary.expireTime && extra.expireTime) {
                primary.expireTime = extra.expireTime;
            }
            if (!primary.privilegeName && extra.privilegeName) {
                primary.privilegeName = extra.privilegeName;
            }
            if (primary !== host) {
                const index = kept.indexOf(host);
                kept[index] = primary;
            }
        }
        return kept;
    }
    chargeNamesRelated(a, b, extra = "") {
        const left = this.normalizeChargeName(a);
        const right = this.normalizeChargeName(`${b}${extra}`);
        if (left.length < 2 || right.length < 2)
            return false;
        return left.includes(right) || right.includes(left);
    }
    normalizeChargeName(text) {
        return text.replace(/[\[\]【】\s·\-_/]/g, "").toLowerCase();
    }
    async splitExclusivesByFollow(exclusives) {
        const active = [];
        const expired = [];
        for (const exclusive of exclusives) {
            const mid = exclusive.mid ?? 0;
            const expiredFlag = exclusive.expired === true ||
                (mid > 0 ? !(await this.isChargeFollowActive(mid)) : true);
            const card = {
                mid,
                name: exclusive.subtitle || exclusive.title,
                face: "",
                expireTime: 0,
                privilegeName: "",
                url: exclusive.url || (mid > 0 ? `https://space.bilibili.com/${mid}` : ""),
                expired: expiredFlag,
                exclusives: [{ ...exclusive, expired: expiredFlag }],
            };
            if (!card.url)
                continue;
            (expiredFlag ? expired : active).push(card);
        }
        return { active, expired };
    }
    async fetchChargeUpList(type) {
        const result = [];
        const nowSec = Date.now() / 1000;
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 20) {
            const res = await this.liveClient.get("/xlive/revenue/v1/guard/getChargeRecord", {
                params: { page, type },
                validateStatus: () => true,
            });
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || "充电记录获取失败");
            }
            const data = res.data?.data;
            const list = Array.isArray(data?.list) ? data.list : [];
            for (const row of list) {
                if (!row || typeof row !== "object")
                    continue;
                const record = row;
                const mid = Number(record.up_uid ?? record.mid ?? 0);
                if (!mid)
                    continue;
                const tiers = Array.isArray(record.item) ? record.item : [];
                const expireTime = tiers.reduce((max, tier) => {
                    if (!tier || typeof tier !== "object")
                        return max;
                    const value = Number(tier.expire_time);
                    return Number.isFinite(value) ? Math.max(max, value) : max;
                }, 0);
                if (type === 1 && expireTime > 0 && expireTime <= nowSec)
                    continue;
                const firstTier = tiers[0];
                result.push({
                    mid,
                    name: String(record.user_name ?? "未知 UP"),
                    face: this.normalizeBfsUrl(String(record.user_face ?? "")),
                    expireTime,
                    privilegeName: String(firstTier?.name ?? ""),
                    url: `https://space.bilibili.com/${mid}`,
                    expired: type === 2,
                    exclusives: [],
                });
            }
            hasMore = data?.is_more === 1;
            page += 1;
        }
        return result;
    }
    async isChargeFollowActive(upMid) {
        const res = await this.client.get("/x/upower/charge/follow/info", {
            params: { up_mid: upMid },
            headers: { Referer: `https://space.bilibili.com/${upMid}` },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0)
            return false;
        const data = res.data?.data;
        const remain = Number(data?.remain_days);
        const privilege = Number(data?.privilege_type);
        if (privilege > 0 && remain >= 0)
            return true;
        return Number.isFinite(remain) && remain > 0;
    }
    async fetchCheesePaidList(page, pageSize) {
        const res = await this.client.get("/pugv/pay/web/my/paid", {
            params: { pn: page, ps: pageSize },
            headers: { Referer: "https://www.bilibili.com/cheese/mine/list" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            return { list: [], total: 0, hasMore: false };
        }
        const data = res.data?.data;
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const list = rawList
            .map((item) => this.normalizeCheeseCourseItem(item))
            .filter((item) => item != null);
        const total = Number(data?.total ?? list.length) || list.length;
        const hasMore = data?.next === true || page * pageSize < total;
        return { list, total, hasMore };
    }
    async fetchCheeseFavoriteList(mid, page, pageSize) {
        const res = await this.client.get("/pugv/app/web/favorite/page", {
            params: { mid, pn: page, ps: pageSize },
            headers: { Referer: "https://www.bilibili.com/cheese/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            return { list: [], total: 0, hasMore: false };
        }
        const data = res.data?.data;
        const rawList = Array.isArray(data?.items) ? data.items : [];
        const list = rawList
            .map((item) => this.normalizeCheeseCourseItem(item))
            .filter((item) => item != null);
        const pageInfo = data?.page ?? {};
        const total = Number(pageInfo.total ?? list.length) || list.length;
        const hasMore = pageInfo.next === true || page * pageSize < total;
        return { list, total, hasMore };
    }
    async getSeasonArchives(mid, seasonId, page = 1) {
        await this.ensureBuvid3();
        const baseParams = {
            mid,
            season_id: seasonId,
            page_num: page,
            page_size: 30,
            web_location: "333.1387",
            dm_img_list: "[]",
            dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
            dm_cover_img_str: "QU5HTEUgKEludGVsLCBJbnRlbChSKSBVSEQgR3JhcGhpY3MgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoSW50ZWw",
            dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":["","",""]}',
        };
        let lastMessage = "";
        for (let attempt = 1; attempt <= 2; attempt++) {
            const res = await this.client.get("/x/polymer/web-space/seasons_archives_list", {
                params: await signParams(baseParams),
                headers: { Referer: `https://space.bilibili.com/${mid}/lists` },
                validateStatus: () => true,
            });
            const code = Number(res.data?.code);
            if (code === 0) {
                return this.normalizeArchivesPage(res.data?.data, mid, page);
            }
            lastMessage = String(res.data?.message ?? "");
            const blocked = code === -352 || code === -412 || res.status === 412;
            if (!blocked)
                break;
            if (attempt === 1) {
                invalidateWbiCache();
                await sleep(800);
            }
        }
        try {
            return await this.getFavSeasonArchives(seasonId, page);
        }
        catch {
            throw new Error(lastMessage && !/^-?\d+$/.test(lastMessage)
                ? lastMessage
                : "合集视频获取被 B 站风控拦截，请稍后再试");
        }
    }
    /** 收藏夹里的合集接口：不需要 WBI，风控比空间接口宽松 */
    async getFavSeasonArchives(seasonId, page = 1, pageSize = 30) {
        await this.ensureBuvid3();
        const apiSize = 20;
        const start = (page - 1) * pageSize;
        const firstPn = Math.floor(start / apiSize) + 1;
        const lastPn = Math.floor((start + pageSize - 1) / apiSize) + 1;
        let medias = [];
        let total = 0;
        let offset = start - (firstPn - 1) * apiSize;
        for (let pn = firstPn; pn <= lastPn; pn++) {
            const res = await this.client.get("/x/space/fav/season/list", {
                params: { season_id: seasonId, pn, ps: apiSize },
                headers: { Referer: "https://www.bilibili.com/" },
                validateStatus: () => true,
            });
            if (res.data?.code !== 0) {
                if (pn === firstPn) {
                    throw new Error(res.data?.message || "合集视频获取失败");
                }
                break;
            }
            const data = res.data?.data;
            const info = data?.info;
            const list = data?.medias ?? [];
            total = Number(info?.media_count) || total;
            if (list.length > apiSize) {
                // 接口有时忽略 ps/pn，一次返回整个合集
                medias = list;
                offset = start;
                break;
            }
            medias.push(...list);
            if (list.length < apiSize)
                break;
        }
        const pageItems = medias.slice(offset, offset + pageSize);
        total = total || start + pageItems.length;
        const videos = pageItems
            .filter((item) => item.bvid)
            .map((item) => {
            const upper = item.upper;
            const cnt = item.cnt_info;
            return {
                bvid: String(item.bvid),
                aid: Number(item.id) || 0,
                title: String(item.title ?? ""),
                cover: this.normalizeVideoCoverUrl(String(item.cover ?? "")),
                duration: Number(item.duration) || 0,
                play: Number(cnt?.play) || 0,
                danmaku: Number(cnt?.danmaku) || 0,
                owner: {
                    mid: Number(upper?.mid) || 0,
                    name: String(upper?.name ?? ""),
                    face: String(upper?.face ?? ""),
                },
                pubdate: Number(item.pubtime ?? item.ctime) || 0,
            };
        });
        return {
            videos,
            page,
            hasMore: page * pageSize < total,
            total,
        };
    }
    async getSeriesArchives(seriesId, page = 1) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/series/archives", {
            params: { series_id: seriesId, page_num: page, page_size: 30 },
            headers: { Referer: "https://www.bilibili.com/" },
            validateStatus: () => true,
        });
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "系列视频获取失败");
        }
        const data = res.data?.data;
        const meta = data?.meta;
        const mid = meta?.mid ?? 0;
        return this.normalizeArchivesPage(data, mid, page);
    }
    async getBangumiFollowList(mid, type = 1, page = 1) {
        await this.ensureBuvid3();
        const res = await this.client.get("/x/space/bangumi/follow/list", {
            params: {
                vmid: mid,
                type,
                follow_status: 0,
                pn: page,
                ps: 20,
            },
            headers: {
                Referer: `https://space.bilibili.com/${mid}/${type === 1 ? "bangumi" : "cinema"}`,
            },
            validateStatus: () => true,
        });
        if (res.status === 412 || res.data?.code === -412) {
            throw new Error("请求被 B 站安全策略拦截，请稍后重试");
        }
        if (res.data?.code !== 0) {
            throw new Error(res.data?.message || "追番列表获取失败");
        }
        const data = res.data?.data;
        const list = (data?.list ?? []).map((item) => this.normalizeBangumiItem(item));
        const total = data?.total ?? list.length;
        const pageSize = 20;
        return {
            list,
            page,
            hasMore: page * pageSize < total,
            total,
        };
    }
    normalizeArchivesPage(data, mid, page) {
        const payload = data;
        const archives = payload?.archives ?? [];
        const pageInfo = payload?.page;
        const total = pageInfo?.total ?? archives.length;
        const pageSize = pageInfo?.page_size ?? 30;
        const videos = archives
            .filter((item) => item.bvid)
            .map((item) => this.normalizeArchiveVideo(item, mid));
        return {
            videos,
            page,
            hasMore: page * pageSize < total,
            total,
        };
    }
    normalizeArchiveVideo(item, mid) {
        const stat = item.stat;
        return this.withChargeBadge({
            bvid: item.bvid,
            aid: Number(item.aid) || 0,
            title: item.title ?? "",
            cover: this.normalizeVideoCoverUrl(item.pic ?? ""),
            duration: item.duration ?? 0,
            play: stat?.view ?? 0,
            danmaku: stat?.danmaku ?? 0,
            owner: {
                mid,
                name: "",
                face: "",
            },
            pubdate: item.pubdate ??
                item.ptime ??
                item.ctime ??
                item.created ??
                0,
        }, item);
    }
    parseCollectionList(raw, kind, source) {
        if (!Array.isArray(raw))
            return [];
        return raw
            .map((item) => this.normalizeCollectionItem(item, kind, source))
            .filter((item) => item != null);
    }
    normalizeCollectionItem(item, kind, source = "created") {
        const meta = item.meta ??
            item;
        const id = kind === "season"
            ? Number(meta.season_id ?? item.season_id)
            : Number(meta.series_id ?? meta.seriesId ?? item.series_id);
        if (!id)
            return null;
        const upper = meta.upper;
        const cntInfo = meta.cnt_info;
        return {
            id,
            kind,
            title: meta.name ?? meta.title ?? "未命名",
            cover: this.normalizeBfsUrl(meta.cover ?? meta.covr ?? ""),
            description: meta.description ?? meta.intro ?? "",
            total: meta.total ??
                meta.archives_count ??
                meta.media_count ??
                cntInfo?.collect ??
                0,
            ownerMid: Number(meta.mid ?? upper?.mid) || undefined,
            source,
        };
    }
    normalizeSubscribedSeason(item) {
        const media = item;
        if (Number(media.type) !== 21)
            return null;
        const upper = media.upper;
        const cntInfo = media.cnt_info;
        return {
            id: Number(media.id) || 0,
            kind: "season",
            title: media.title ?? "未命名合集",
            cover: this.normalizeBfsUrl(media.cover ?? ""),
            description: media.intro ?? "",
            total: media.page ?? cntInfo?.collect ?? 0,
            ownerMid: Number(upper?.mid) || undefined,
            source: "subscribed",
        };
    }
    normalizeFavMediaItem(item) {
        const media = item;
        const id = Number(media.id);
        if (!id)
            return null;
        const upper = media.upper;
        const cntInfo = media.cnt_info;
        const link = media.link ?? "";
        return {
            id,
            type: Number(media.type) || 0,
            title: media.title ?? "",
            cover: this.normalizeBfsUrl(media.cover ?? ""),
            intro: media.intro ?? "",
            link,
            bvid: media.bvid ?? media.bv_id ?? "",
            upper: {
                mid: Number(upper?.mid) || 0,
                name: upper?.name ?? "",
            },
            duration: Number(media.duration) || 0,
            playCount: Number(cntInfo?.play) || 0,
            favTime: Number(media.fav_time) || 0,
        };
    }
    normalizeOpusFavItem(item) {
        const opusId = item.opus_id ??
            item.id_str ??
            String(item.id ?? "");
        if (!opusId)
            return null;
        const coverObj = item.cover && typeof item.cover === "object"
            ? item.cover
            : undefined;
        const coverPic = item.cover_pic;
        const pics = item.pics ?? [];
        const modules = item.modules;
        const moduleDynamic = modules?.module_dynamic;
        const major = moduleDynamic?.major;
        const opus = major?.opus;
        const opusPics = opus?.pics ?? [];
        const textParagraph = item.text_paragraph;
        const author = item.author;
        const moduleAuthor = (item.module_author ?? modules?.module_author);
        const jumpUrl = item.jump_url ??
            item.card_uri ??
            `https://www.bilibili.com/opus/${opusId}`;
        const summary = this.extractRichText(textParagraph) ||
            this.extractRichText(item.summary) ||
            this.extractRichText(item.content) ||
            this.extractRichText(opus?.summary) ||
            this.extractRichText(moduleDynamic?.desc) ||
            "";
        const title = String(item.title ?? opus?.title ?? "").trim() ||
            summary.slice(0, 40) ||
            "图文动态";
        const coverRaw = coverObj?.url ||
            coverPic?.url ||
            (typeof item.cover === "string" ? item.cover : "") ||
            String(pics[0]?.url ?? pics[0]?.src ?? "") ||
            String(opusPics[0]?.url ?? opusPics[0]?.src ?? "") ||
            String(opus?.cover ?? "");
        return {
            id: opusId,
            title,
            cover: this.normalizeBfsUrl(coverRaw),
            summary,
            url: jumpUrl.startsWith("http")
                ? jumpUrl
                : `https:${jumpUrl.replace(/^\/\//, "//")}`,
            author: author?.name ?? moduleAuthor?.name ?? "",
        };
    }
    normalizeCheeseCourseItem(item) {
        if (!item || typeof item !== "object")
            return null;
        const raw = item;
        const season = raw.season ??
            raw.season_info ??
            raw.course ??
            raw;
        const seasonId = Number(season.season_id ?? raw.season_id ?? season.id ?? raw.id ?? raw.ssid);
        if (!seasonId)
            return null;
        const coverRaw = season.cover ?? raw.cover ?? season.cover_url ?? raw.pic;
        let cover = "";
        if (typeof coverRaw === "string") {
            cover = coverRaw;
        }
        else if (coverRaw && typeof coverRaw === "object") {
            cover = coverRaw.url ?? "";
        }
        const statusRaw = season.update_info ?? raw.update_info ?? "";
        const status = typeof statusRaw === "string" || typeof statusRaw === "number"
            ? String(statusRaw)
            : "";
        const playRaw = Number(season.play ?? raw.play ?? season.view ?? raw.view);
        const epRaw = Number(season.ep_count ??
            raw.ep_count ??
            season.episode_count ??
            raw.episode_count);
        const kind = this.detectPugvKind(raw, season, playRaw);
        const mid = this.extractPugvMid(raw, season);
        const expired = this.isPugvAccessExpired(raw, season) === true;
        return {
            seasonId,
            title: String(season.title ?? raw.title ?? "未命名课程"),
            cover: this.normalizeBfsUrl(cover),
            subtitle: String(season.subtitle ?? raw.subtitle ?? raw.sub_title ?? ""),
            epCount: Number.isFinite(epRaw) && epRaw > 0 ? epRaw : 0,
            playCount: Number.isFinite(playRaw) && playRaw > 0 ? playRaw : 0,
            status: this.normalizeCheeseStatus(status),
            url: this.resolvePugvUrl(kind, seasonId, raw, season, mid),
            kind,
            mid: mid > 0 ? mid : undefined,
            expired,
        };
    }
    /** 课堂 status=10 等是内部码；充电专属常给 play/status = -1 */
    normalizeCheeseStatus(raw) {
        const text = raw.trim();
        if (!text)
            return "";
        if (/^-?\d+$/.test(text))
            return "";
        return text;
    }
    extractPugvMid(raw, season) {
        const seasonId = Number(season.season_id ?? raw.season_id ?? season.id ?? raw.ssid ?? 0);
        const nested = [
            season.up,
            raw.up,
            season.up_info,
            raw.up_info,
            season.upper,
            raw.upper,
            season.author,
            raw.author,
            season.owner,
            raw.owner,
        ];
        for (const value of nested) {
            if (!value || typeof value !== "object")
                continue;
            const mid = Number(value.mid ??
                value.uid);
            if (mid > 0 && mid !== seasonId)
                return mid;
        }
        const fallback = Number(season.up_mid ??
            raw.up_mid ??
            season.up_id ??
            raw.up_id ??
            season.mid ??
            raw.mid);
        if (fallback > 0 && fallback !== seasonId)
            return fallback;
        return 0;
    }
    /** true 已过期；false 仍有效；null 字段里看不出来 */
    isPugvAccessExpired(raw, season) {
        const flags = [
            raw.expired,
            season.expired,
            raw.is_expired,
            season.is_expired,
            raw.overdue,
            season.overdue,
        ];
        if (flags.some((flag) => flag === true || flag === 1 || flag === "1")) {
            return true;
        }
        const expire = Number(raw.expire_time ??
            season.expire_time ??
            raw.expired_time ??
            season.expired_time ??
            raw.overdue_time ??
            raw.pay_expire ??
            season.pay_expire);
        if (!Number.isFinite(expire) || expire <= 0)
            return null;
        const ms = expire > 1e12 ? expire : expire * 1000;
        return ms < Date.now();
    }
    firstPugvBvid(raw, season) {
        const direct = String(season.bvid ?? raw.bvid ?? "");
        if (/^BV/i.test(direct))
            return direct;
        const episodes = [
            season.episodes,
            raw.episodes,
            season.ep_list,
            raw.ep_list,
        ];
        for (const list of episodes) {
            if (!Array.isArray(list) || list.length === 0)
                continue;
            const first = list[0];
            const bvid = String(first?.bvid ?? "");
            if (/^BV/i.test(bvid))
                return bvid;
        }
        return "";
    }
    /**
     * 充电专属是 UGC 合集，不是课堂。
     * /cheese/play/ss{id} 对充电合集会返回 6009083「由于版权原因…」空页。
     */
    resolvePugvUrl(kind, seasonId, raw, season, mid) {
        const rawLink = String(season.link ?? raw.link ?? raw.url ?? raw.jump_url ?? "").trim();
        const abs = rawLink.startsWith("http")
            ? rawLink
            : rawLink.startsWith("//")
                ? `https:${rawLink}`
                : "";
        if (kind === "upower") {
            if (abs && !/\/cheese\//i.test(abs))
                return abs;
            if (mid > 0) {
                return `https://space.bilibili.com/${mid}/lists/${seasonId}?type=season`;
            }
            const bvid = this.firstPugvBvid(raw, season);
            if (bvid)
                return `https://www.bilibili.com/video/${bvid}`;
            return abs;
        }
        if (abs)
            return abs;
        return `https://www.bilibili.com/cheese/play/ss${seasonId}`;
    }
    detectPugvKind(raw, season, playRaw) {
        const flags = [
            season.is_upower,
            raw.is_upower,
            season.is_upower_exclusive,
            raw.is_upower_exclusive,
            season.upower_exclusive,
            raw.upower_exclusive,
            season.is_chargeable_season,
            raw.is_chargeable_season,
            season.upower,
            raw.upower,
        ];
        if (flags.some((flag) => flag === true || flag === 1 || flag === "1")) {
            return "upower";
        }
        const labels = [
            season.cate_name,
            raw.cate_name,
            season.category,
            raw.category,
            season.badge,
            raw.badge,
            season.subtitle,
            raw.subtitle,
        ]
            .map((value) => String(value ?? ""))
            .join(" ");
        if (/充电|upower/.test(labels))
            return "upower";
        const link = String(season.link ?? raw.link ?? raw.url ?? raw.jump_url ?? "");
        if (/upower/i.test(link))
            return "upower";
        if (playRaw < 0)
            return "upower";
        const statusCode = season.status ?? raw.status;
        if (statusCode === -1 || statusCode === "-1")
            return "upower";
        return "cheese";
    }
    normalizeBangumiItem(item) {
        const newEp = item.new_ep;
        const seasonId = Number(item.season_id) || 0;
        const epId = Number(newEp?.id) || 0;
        const url = epId
            ? `https://www.bilibili.com/bangumi/play/ep${epId}`
            : `https://www.bilibili.com/bangumi/play/ss${seasonId}`;
        return {
            seasonId,
            title: item.title ?? "",
            cover: (item.cover ?? "").replace(/^http:/, "https:"),
            evaluate: item.evaluate ?? "",
            progress: newEp?.index_show ?? "",
            url,
        };
    }
    extractRichText(value) {
        if (value == null)
            return "";
        if (typeof value === "string")
            return this.stripPicPlaceholders(value);
        if (typeof value !== "object")
            return "";
        const obj = value;
        const nodes = obj.rich_text_nodes;
        if (nodes?.length) {
            return this.stripPicPlaceholders(nodes.map((node) => this.extractRichTextNode(node)).join(""));
        }
        const paragraphs = obj.paragraphs;
        if (paragraphs?.length) {
            const joined = paragraphs
                .map((paragraph) => this.extractRichText(paragraph))
                .filter(Boolean)
                .join("\n");
            if (joined)
                return this.stripPicPlaceholders(joined);
        }
        if (typeof obj.text === "string" && obj.text.trim()) {
            return this.stripPicPlaceholders(obj.text);
        }
        if (obj.text && typeof obj.text === "object") {
            const nested = this.extractRichText(obj.text);
            if (nested)
                return nested;
        }
        return "";
    }
    extractRichTextNode(node) {
        if (node == null)
            return "";
        if (typeof node === "string") {
            return this.isPicPlaceholder(node) ? "" : node;
        }
        if (typeof node !== "object")
            return "";
        const obj = node;
        const type = String(obj.type ?? obj.node_type ?? "").toUpperCase();
        const paraType = Number(obj.para_type);
        if (paraType === 2 ||
            type.includes("PIC") ||
            type.includes("IMG") ||
            type.includes("IMAGE")) {
            return "";
        }
        const raw = String(obj.orig_text ?? obj.text ?? "");
        if (this.isPicPlaceholder(raw))
            return "";
        if (typeof obj.text === "string")
            return obj.text;
        if (obj.text && typeof obj.text === "object") {
            return this.extractRichText(obj.text);
        }
        return "";
    }
    isPicPlaceholder(text) {
        return /^[\[［]图片[\]］]$/.test(text.trim());
    }
    stripPicPlaceholders(text) {
        return text
            .replace(/[\[［]图片[\]］]/g, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
    collectDynamicImages(moduleDynamic, major) {
        const urls = [];
        const seen = new Set();
        const add = (raw) => {
            const url = this.absHttpUrl(String(raw ?? ""));
            if (!this.isLikelyDynamicImageUrl(url) || seen.has(url))
                return;
            seen.add(url);
            urls.push(url);
        };
        this.collectRichImageUrls(moduleDynamic?.desc, add);
        this.collectRichImageUrls(major?.opus, add);
        this.collectRichImageUrls(major?.draw, add);
        this.collectRichImageUrls(major?.article, add);
        return urls;
    }
    collectRichImageUrls(value, add, depth = 0, visited = new WeakSet()) {
        if (depth > 10 || value == null)
            return;
        if (typeof value === "string") {
            add(value);
            return;
        }
        if (Array.isArray(value)) {
            for (const entry of value) {
                this.collectRichImageUrls(entry, add, depth + 1, visited);
            }
            return;
        }
        if (typeof value !== "object")
            return;
        if (visited.has(value))
            return;
        visited.add(value);
        const obj = value;
        add(obj.url ?? obj.src ?? obj.img_src ?? obj.cover);
        const covers = obj.covers;
        if (Array.isArray(covers)) {
            for (const cover of covers)
                add(cover);
        }
        const nestKeys = [
            "pics",
            "pic",
            "pictures",
            "items",
            "rich_text_nodes",
            "nodes",
            "paragraphs",
            "summary",
            "desc",
            "images",
            "content",
        ];
        for (const key of nestKeys) {
            if (obj[key] != null)
                this.collectRichImageUrls(obj[key], add, depth + 1, visited);
        }
        if (obj.text && typeof obj.text === "object") {
            this.collectRichImageUrls(obj.text, add, depth + 1, visited);
        }
    }
    pickDynamicModule(modules, key) {
        if (!modules)
            return undefined;
        const suffix = key.replace(/^module_/, "").toUpperCase();
        const matchType = `MODULE_TYPE_${suffix}`;
        if (Array.isArray(modules)) {
            for (const entry of modules) {
                if (!entry || typeof entry !== "object")
                    continue;
                const rec = entry;
                const type = String(rec.module_type ?? "").toUpperCase();
                if (type === matchType || type.endsWith(`_${suffix}`)) {
                    const nested = rec[key];
                    if (nested && typeof nested === "object") {
                        return nested;
                    }
                    return rec;
                }
                if (rec[key] && typeof rec[key] === "object") {
                    return rec[key];
                }
            }
            return undefined;
        }
        if (typeof modules === "object") {
            const rec = modules;
            const nested = rec[key];
            if (nested && typeof nested === "object") {
                return nested;
            }
        }
        return undefined;
    }
    extractPubLocation(moduleAuthor) {
        if (!moduleAuthor)
            return undefined;
        const pubInfo = this.asPlainRecord(moduleAuthor.pub_info);
        const candidates = [
            moduleAuthor.pub_location_text,
            moduleAuthor.pub_location,
            moduleAuthor.ptime_location_text,
            moduleAuthor.ip_location,
            moduleAuthor.location,
            pubInfo?.pub_location_text,
            pubInfo?.pub_location,
            pubInfo?.ptime_location_text,
            pubInfo?.location,
        ];
        for (const value of candidates) {
            const location = this.normalizeLocationText(value);
            if (location)
                return location;
        }
        return undefined;
    }
    normalizeLocationText(value) {
        const raw = String(value ?? "").trim();
        if (!raw)
            return undefined;
        const location = raw.replace(/^IP属地[:：]?\s*/i, "").trim();
        if (!location || location === "未知")
            return undefined;
        return location;
    }
    extractPubLocationFromUnknown(node, depth = 0) {
        if (depth > 12 || node == null)
            return undefined;
        if (typeof node === "string") {
            return /IP属地/.test(node) ? this.normalizeLocationText(node) : undefined;
        }
        if (Array.isArray(node)) {
            for (const entry of node) {
                const found = this.extractPubLocationFromUnknown(entry, depth + 1);
                if (found)
                    return found;
            }
            return undefined;
        }
        if (typeof node !== "object")
            return undefined;
        const rec = node;
        for (const key of [
            "pub_location_text",
            "ptime_location_text",
            "pub_location",
            "ip_location",
        ]) {
            const location = this.normalizeLocationText(rec[key]);
            if (location)
                return location;
        }
        for (const value of Object.values(rec)) {
            const found = this.extractPubLocationFromUnknown(value, depth + 1);
            if (found)
                return found;
        }
        return undefined;
    }
    asCvId(raw) {
        const text = String(raw ?? "").trim();
        if (!text)
            return undefined;
        const matched = text.match(/cv(\d+)/i)?.[1];
        const digits = matched ?? (/^\d+$/.test(text) ? text : "");
        if (!digits || digits.length < 4 || digits.length > 12)
            return undefined;
        const id = Number(digits);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }
    extractDynamicCvId(args) {
        const opus = this.asPlainRecord(args.major?.opus);
        const article = this.asPlainRecord(args.major?.article);
        const fallbackType = Number(args.fallback?.type);
        return (this.asCvId(opus?.jump_url) ||
            this.asCvId(article?.jump_url) ||
            this.asCvId(article?.id) ||
            this.asCvId(args.moduleAuthor?.jump_url) ||
            (fallbackType === 2 ? this.asCvId(args.fallback?.id) : undefined) ||
            (args.commentType === 12 ? this.asCvId(args.commentId) : undefined) ||
            (args.commentType === 12 ? this.asCvId(args.basic?.rid_str) : undefined));
    }
    extractCvFromUnknown(node, depth = 0) {
        if (depth > 12 || node == null)
            return undefined;
        if (typeof node === "string" || typeof node === "number") {
            const text = String(node);
            const matched = text.match(/\/read\/cv(\d{4,12})/i)?.[1] ??
                text.match(/(?:^|[^\w])cv(\d{4,12})(?:[^\d]|$)/i)?.[1];
            if (!matched)
                return undefined;
            const id = Number(matched);
            return Number.isFinite(id) && id > 0 ? id : undefined;
        }
        if (Array.isArray(node)) {
            for (const entry of node) {
                const found = this.extractCvFromUnknown(entry, depth + 1);
                if (found)
                    return found;
            }
            return undefined;
        }
        if (typeof node !== "object")
            return undefined;
        const rec = node;
        for (const value of Object.values(rec)) {
            const found = this.extractCvFromUnknown(value, depth + 1);
            if (found)
                return found;
        }
        return undefined;
    }
    parseUgcSeasonPubAction(pubAction) {
        const text = pubAction.trim();
        const suffix = "更新了合集";
        if (text.endsWith(suffix)) {
            const name = text.slice(0, -suffix.length).trim();
            if (name)
                return { name, action: suffix };
        }
        return { name: "", action: text || suffix };
    }
    extractBvidFromUrl(url) {
        const match = url.match(/BV[\w]+/);
        return match?.[0];
    }
    extractSpaceMid(...urls) {
        for (const raw of urls) {
            const url = String(raw ?? "");
            if (!url)
                continue;
            const match = url.match(/space\.bilibili\.com\/(\d+)/i);
            if (!match)
                continue;
            const mid = Number(match[1]);
            if (mid > 0)
                return mid;
        }
        return 0;
    }
    normalizeSpaceDynamicItem(item, depth = 0) {
        const id = String(item.id_str || item.id || "").trim();
        if (!id)
            return null;
        // polymer 详情偶发返回数字 type（非 DYNAMIC_TYPE_* 字符串），不能直接 .includes
        const type = String(item.type ?? "").toUpperCase();
        const basic = item.basic;
        const commentIdRaw = basic?.comment_id_str ?? basic?.comment_id ?? item.comment_id_str;
        const commentId = commentIdRaw != null && String(commentIdRaw).trim()
            ? String(commentIdRaw).trim()
            : id;
        const commentType = Number(basic?.comment_type ?? 0) || undefined;
        const modules = item.modules;
        const moduleAuthor = this.pickDynamicModule(modules, "module_author");
        const authorType = String(moduleAuthor?.type ?? "");
        const pubTime = moduleAuthor?.pub_ts ?? 0;
        const pubTimeLabel = typeof moduleAuthor?.pub_time === "string"
            ? moduleAuthor.pub_time
            : this.formatDynamicPubTime(pubTime);
        let authorMid = Number(moduleAuthor?.mid) || 0;
        let authorName = moduleAuthor?.name ?? "";
        let authorFace = (moduleAuthor?.face ?? "").replace(/^http:/, "https:");
        let pubAction = moduleAuthor?.pub_action ||
            moduleAuthor?.pub_label ||
            this.getDynamicPubAction(type);
        // 合集/番剧更新：module_author.name 是合集名，mid 是 avid/seasonId，不是 UP mid
        const isUgcSeason = authorType === "AUTHOR_TYPE_UGC_SEASON" || type.includes("UGC_SEASON");
        const isPgcAuthor = authorType === "AUTHOR_TYPE_PGC" || type.includes("_PGC");
        const collectionName = isUgcSeason ? authorName : "";
        if (isUgcSeason) {
            const parsed = this.parseUgcSeasonPubAction(pubAction);
            authorName = parsed.name || "UP主";
            pubAction = parsed.action;
            // module_author.mid 是 avid/seasonId，真实 UP mid 在空间 jump_url
            authorMid = this.extractSpaceMid(moduleAuthor?.jump_url, moduleAuthor?.avatar?.jump_url);
            const face = String(moduleAuthor?.face ?? "");
            authorFace = /\/bfs\/face\//i.test(face)
                ? face.replace(/^http:/, "https:")
                : "";
        }
        else if (isPgcAuthor) {
            authorMid = 0;
        }
        const moduleDynamic = this.pickDynamicModule(modules, "module_dynamic");
        const major = moduleDynamic?.major;
        const moduleStat = this.pickDynamicModule(modules, "module_stat");
        const likeStat = (moduleStat?.like ?? {});
        const forwardStat = (moduleStat?.forward ?? {});
        const likeCount = Number(likeStat.count) || 0;
        const replyCount = Number(moduleStat?.comment?.count) || 0;
        const forwardCount = Number(forwardStat.count) || 0;
        const favStat = (moduleStat?.favorite ?? {});
        const favCount = Number(favStat.count) || 0;
        const liked = Boolean(likeStat.status);
        const favorited = Boolean(favStat.status);
        const origRaw = item.orig ??
            item.origin ??
            (major?.forward && typeof major.forward === "object"
                ? major.forward
                : undefined);
        const exclusiveTag = this.extractExclusiveTag(modules, major);
        const pinned = this.extractDynamicPinned(modules);
        const card = this.extractDecorationCard(moduleAuthor);
        const upowerPreview = this.extractUpowerPreview(major, moduleDynamic);
        const mentions = this.extractDynamicMentions(moduleDynamic, major);
        const emotes = this.extractDynamicEmotes(moduleDynamic, major);
        const ipLocation = this.extractPubLocation(moduleAuthor);
        const cvId = this.extractDynamicCvId({
            basic,
            moduleAuthor,
            major,
            fallback: this.asPlainRecord(item.fallback),
            commentId,
            commentType,
        });
        const collectedImages = this.collectDynamicImages(moduleDynamic, major);
        const attached = this.extractDynamicAttach(moduleDynamic);
        const base = {
            id,
            type,
            pubTime,
            pubTimeLabel,
            pubAction,
            authorMid: authorMid || undefined,
            authorName,
            authorFace,
            commentId,
            commentType,
            liked,
            favorited,
            pinned,
            cardItemId: card.id,
            cardName: card.name,
            exclusiveTag,
            mentions,
            emotes,
            ipLocation,
            cvId,
            vote: attached.vote,
            lottery: attached.lottery,
        };
        if (type.includes("FORWARD") || Boolean(major?.forward)) {
            const desc = moduleDynamic?.desc;
            const text = this.extractRichText(desc);
            return {
                ...base,
                kind: "forward",
                text,
                title: undefined,
                orig: this.normalizeOrigDynamic(origRaw, depth + 1),
                stats: {
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        if (major?.archive) {
            const archive = major.archive;
            const stat = archive.stat;
            const durationRaw = archive.duration ?? archive.duration_text;
            const badgeText = this.pickDynText(archive.badge?.text);
            return {
                ...base,
                kind: "video",
                text: this.extractRichText(moduleDynamic?.desc),
                title: archive.title ?? "",
                bvid: archive.bvid,
                cover: (archive.cover ?? "").replace(/^http:/, "https:"),
                duration: this.parseDynamicDuration(durationRaw),
                exclusiveTag: exclusiveTag || (/充电|专属/.test(badgeText) ? badgeText : undefined),
                stats: {
                    view: Number(stat?.play) || 0,
                    danmaku: Number(stat?.danmaku) || 0,
                    like: Number(stat?.like) || likeCount,
                    reply: Number(stat?.reply) || replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        if (major?.ugc_season) {
            const season = major.ugc_season;
            const stat = season.stat;
            const jumpUrl = String(season.jump_url ?? moduleAuthor?.jump_url ?? "");
            const bvid = season.bvid || this.extractBvidFromUrl(jumpUrl);
            const owner = season.owner;
            const seasonMid = this.extractSpaceMid(jumpUrl, moduleAuthor?.jump_url) ||
                Number(owner?.mid ?? 0) ||
                Number(season.up_id ?? season.up_mid ?? 0) ||
                0;
            return {
                ...base,
                kind: "video",
                text: collectionName ? `合集 · ${collectionName}` : "更新了合集",
                title: String(season.title ?? collectionName ?? "合集更新"),
                bvid,
                cover: (season.cover ?? "").replace(/^http:/, "https:"),
                duration: this.parseDynamicDuration(season.duration_text ?? season.duration),
                authorMid: base.authorMid || (seasonMid > 0 ? seasonMid : undefined),
                stats: {
                    view: Number(stat?.play) || 0,
                    danmaku: Number(stat?.danmaku) || 0,
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        if (major?.article) {
            const article = major.article;
            const covers = (Array.isArray(article.covers) ? article.covers : []);
            const articleImages = this.uniqueImageUrls([
                ...collectedImages,
                ...covers.map((cover) => String(cover ?? "")),
                String(article.cover ?? ""),
            ]);
            const articleTitle = String(article.title ?? "").trim();
            const articleText = this.stripPicPlaceholders(String(article.desc ?? ""));
            return {
                ...base,
                kind: "article",
                text: articleText,
                title: articleTitle || "专栏文章",
                cover: articleImages[0],
                images: articleImages,
                cvId: base.cvId || this.asCvId(article.id),
                commentId: String(article.id || commentId),
                commentType: 12,
                stats: {
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        const liveInfo = this.extractLiveDynamic(major, type);
        if (liveInfo) {
            return {
                ...base,
                kind: "live",
                text: liveInfo.text,
                title: liveInfo.title,
                cover: liveInfo.cover,
                liveRoomId: liveInfo.roomId,
                liveUrl: liveInfo.url,
                liveState: liveInfo.state,
                stats: {
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        if (upowerPreview) {
            return {
                ...base,
                kind: "upower",
                text: upowerPreview.text,
                title: upowerPreview.title,
                cover: upowerPreview.icon,
                chargeButton: upowerPreview.button,
                chargeUrl: this.normalizeChargeJumpUrl(upowerPreview.url, authorMid || Number(upowerPreview.upMid) || 0),
                exclusiveTag: exclusiveTag || "充电专属",
                stats: {
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        if (major?.opus) {
            const opus = major.opus;
            const summary = this.extractRichText(opus.summary);
            const opusTitle = String(opus.title ?? "").trim();
            const pics = opus.pics ?? [];
            const images = this.uniqueImageUrls([
                ...collectedImages,
                ...pics.map((pic) => String(pic.url ?? pic.src ?? "")),
                String(opus.cover ?? ""),
            ]);
            return {
                ...base,
                kind: "opus",
                text: summary,
                // 仅保留真实标题，不要用正文截断冒充标题
                title: opusTitle || undefined,
                cover: images[0],
                images,
                cvId: base.cvId || this.asCvId(opus.jump_url),
                stats: {
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        const desc = moduleDynamic?.desc;
        const text = this.extractRichText(desc) ||
            this.extractRichText(moduleDynamic) ||
            "动态";
        const coverMajor = major?.draw;
        const drawItems = coverMajor?.items;
        const images = this.uniqueImageUrls([
            ...collectedImages,
            ...(drawItems ?? []).map((entry) => String(entry.src ?? entry.url ?? "")),
        ]);
        if (exclusiveTag && images.length === 0 && (!text || text === "动态")) {
            return {
                ...base,
                kind: "upower",
                text: "加入当前 UP 主的充电即可解锁观看",
                title: "充电专属动态",
                chargeButton: "去充电",
                chargeUrl: this.normalizeChargeJumpUrl("", authorMid),
                exclusiveTag,
                stats: {
                    like: likeCount,
                    reply: replyCount,
                    forward: forwardCount,
                    favorite: favCount,
                },
            };
        }
        return {
            ...base,
            kind: images.length > 0 ? "draw" : "text",
            text,
            title: undefined,
            cover: images[0],
            images,
            stats: {
                like: likeCount,
                reply: replyCount,
                forward: forwardCount,
                favorite: favCount,
            },
        };
    }
    pickDynText(...values) {
        for (const value of values) {
            if (typeof value === "string" && value.trim())
                return value.trim();
            if (!value || typeof value !== "object")
                continue;
            const obj = value;
            const nested = this.pickDynText(obj.text, obj.src, obj.img_src, obj.light_src, obj.dark_src, obj.url);
            if (nested)
                return nested;
        }
        return "";
    }
    extractDynamicPinned(modules) {
        const tag = this.pickDynamicModule(modules, "module_tag");
        if (this.pickDynText(tag?.text) === "置顶")
            return true;
        const more = this.pickDynamicModule(modules, "module_more");
        const points = more?.three_point_items;
        if (!Array.isArray(points))
            return false;
        for (const entry of points) {
            if (!entry || typeof entry !== "object")
                continue;
            const rec = entry;
            if (String(rec.type ?? "") !== "THREE_POINT_TOP")
                continue;
            const params = this.asPlainRecord(rec.params);
            if (typeof params?.status === "boolean")
                return params.status;
            return String(rec.label ?? "").includes("取消");
        }
        return false;
    }
    extractDecorationCard(moduleAuthor) {
        const card = this.asPlainRecord(moduleAuthor?.decoration_card ??
            moduleAuthor?.decorate_card ??
            moduleAuthor?.decorate);
        if (!card)
            return {};
        const id = Number(card.item_id ?? card.id) || 0;
        const name = String(card.name ?? "").trim();
        return {
            id: id > 0 ? id : undefined,
            name: name || undefined,
        };
    }
    extractExclusiveTag(modules, major) {
        const tag = this.pickDynamicModule(modules, "module_tag");
        const tagText = this.pickDynText(tag?.text);
        if (/充电|专属/.test(tagText))
            return tagText;
        const majorType = String(major?.type ?? "");
        if (majorType.includes("UPOWER"))
            return "充电专属";
        const blocked = major?.blocked;
        if (Number(blocked?.blocked_type) === 3)
            return "充电专属";
        return undefined;
    }
    extractUpowerPreview(major, moduleDynamic) {
        if (!major)
            return null;
        const blocked = major.blocked;
        if (blocked && typeof blocked === "object") {
            const blockedType = Number(blocked.blocked_type);
            const blob = `${blocked.title ?? ""} ${blocked.hint_message ?? ""} ${blocked.desc ?? ""}`;
            if (blockedType === 3 || /充电|专属/.test(blob)) {
                const button = (blocked.button ?? {});
                return {
                    title: this.pickDynText(blocked.title) || "充电专属动态",
                    text: this.pickDynText(blocked.hint_message, blocked.desc) ||
                        this.extractRichText(moduleDynamic?.desc) ||
                        "加入当前 UP 主的充电即可解锁观看",
                    button: this.pickDynText(button.text) || "去充电",
                    url: this.pickDynText(button.jump_url, blocked.jump_url),
                    icon: this.pickDynText(blocked.icon),
                };
            }
        }
        const upower = (major.upower_common ?? major.upower);
        if (upower && typeof upower === "object") {
            const button = (upower.button ?? {});
            const jumpStyle = (button.jump_style ?? {});
            return {
                title: this.pickDynText(upower.title) ||
                    this.pickDynText(upower.title_prefix) ||
                    "充电专属动态",
                text: this.pickDynText(upower.desc, upower.sub_title, upower.subtitle, upower.hint, upower.hint_message) ||
                    this.extractRichText(moduleDynamic?.desc) ||
                    "加入当前 UP 主的充电即可解锁观看",
                button: this.pickDynText(jumpStyle.text, button.text) || "去充电",
                url: this.pickDynText(button.jump_url, upower.jump_url),
                icon: this.pickDynText(upower.icon),
                upMid: Number(upower.up_mid) || undefined,
            };
        }
        const common = major.common;
        if (common && typeof common === "object") {
            const badge = this.pickDynText(common.badge?.text, common.head_text);
            const blob = `${common.title ?? ""} ${common.desc ?? ""} ${common.desc1 ?? ""} ${common.desc2 ?? ""} ${badge}`;
            if (/充电|专属|upower/i.test(blob)) {
                const button = (common.button ?? {});
                return {
                    title: this.pickDynText(common.title) || "充电专属动态",
                    text: this.pickDynText(common.desc, common.desc1, common.desc2) ||
                        "加入当前 UP 主的充电即可解锁观看",
                    button: this.pickDynText(button.text) || badge || "去充电",
                    url: this.pickDynText(button.jump_url, common.jump_url),
                    icon: this.pickDynText(common.cover, common.icon),
                };
            }
        }
        if (String(major.type ?? "").includes("UPOWER")) {
            return {
                title: "充电专属动态",
                text: "加入当前 UP 主的充电即可解锁观看",
                button: "去充电",
                url: "",
            };
        }
        return null;
    }
    normalizeChargeJumpUrl(raw, mid) {
        const url = raw.trim();
        if (/^https?:\/\//i.test(url))
            return url.replace(/^http:/i, "https:");
        const fromScheme = url.match(/[?&]mid=(\d+)/)?.[1];
        const targetMid = Number(fromScheme) || mid;
        if (targetMid > 0) {
            return `https://www.bilibili.com/h5/upower/index?mid=${targetMid}`;
        }
        return url || undefined;
    }
    normalizeOrigDynamic(raw, depth) {
        if (!raw || typeof raw !== "object" || depth > 2)
            return undefined;
        const orig = raw;
        const origId = String(orig.id_str ?? orig.id ?? "").trim();
        const origType = String(orig.type ?? "");
        const modules = orig.modules;
        const major = modules?.module_dynamic?.major;
        const none = major?.none;
        const tips = String(none?.tips ?? orig.tips ?? "").trim();
        if (!origId ||
            origId === "0" ||
            origType.includes("NONE") ||
            Boolean(none)) {
            return {
                id: origId || "0",
                type: origType || "DYNAMIC_TYPE_NONE",
                kind: "text",
                text: tips || "源动态已删除",
                pubTime: 0,
            };
        }
        return (this.normalizeSpaceDynamicItem(orig, depth) ?? {
            id: origId,
            type: origType,
            kind: "text",
            text: tips || "源动态已删除",
            pubTime: 0,
        });
    }
    parseDynamicDuration(value) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return Math.max(0, Math.floor(value));
        }
        if (typeof value !== "string" || !value.trim())
            return 0;
        if (/^\d+$/.test(value.trim()))
            return Number(value);
        const parts = value
            .split(":")
            .map((part) => Number(part))
            .filter((n) => Number.isFinite(n));
        if (parts.length === 0)
            return 0;
        return parts.reduce((total, part) => total * 60 + part, 0);
    }
    extractLiveDynamic(major, type) {
        if (!major)
            return null;
        if (major.live) {
            const live = major.live;
            return {
                title: live.title || "正在直播",
                cover: (live.cover ?? "").replace(/^http:/, "https:"),
                text: live.desc_first || live.desc_second || "",
                roomId: Number(live.id ?? live.room_id) || undefined,
                url: live.jump_url || undefined,
                state: Number(live.live_state) || 1,
            };
        }
        if (major.live_rcmd || type.includes("LIVE")) {
            const liveRcmd = major.live_rcmd;
            const contentRaw = liveRcmd?.content;
            let payload = null;
            if (typeof contentRaw === "string" && contentRaw.trim()) {
                try {
                    payload = JSON.parse(contentRaw);
                }
                catch {
                    payload = null;
                }
            }
            else if (contentRaw && typeof contentRaw === "object") {
                payload = contentRaw;
            }
            const playInfo = payload?.live_play_info ??
                payload;
            if (!playInfo)
                return null;
            return {
                title: playInfo.title || "正在直播",
                cover: String(playInfo.cover ?? playInfo.cover_from_user ?? "").replace(/^http:/, "https:"),
                text: playInfo.area_name ||
                    playInfo.parent_area_name ||
                    "",
                roomId: Number(playInfo.room_id ?? playInfo.liveid) || undefined,
                url: playInfo.link ||
                    playInfo.live_link ||
                    (playInfo.room_id
                        ? `https://live.bilibili.com/${playInfo.room_id}`
                        : undefined),
                state: Number(playInfo.live_status ?? playInfo.live_state) || 1,
            };
        }
        return null;
    }
    formatDynamicPubTime(ts) {
        if (!ts)
            return "";
        const date = new Date(ts * 1000);
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");
        return `${month}月${day}日 ${hour}:${minute}`;
    }
    getDynamicPubAction(type) {
        const t = String(type ?? "").toUpperCase();
        if (t.includes("FORWARD"))
            return "转发了动态";
        if (t.includes("UGC_SEASON"))
            return "更新了合集";
        if (t.includes("AV"))
            return "投稿了视频";
        if (t.includes("LIVE"))
            return "正在直播";
        if (t.includes("DRAW"))
            return "发布了动态";
        if (t.includes("WORD"))
            return "发布了动态";
        if (t.includes("ARTICLE"))
            return "投稿了专栏";
        return "发布了动态";
    }
    normalizeToViewItem(item) {
        const owner = item.owner;
        const stat = item.stat;
        return this.withChargeBadge({
            bvid: item.bvid,
            aid: item.aid ?? 0,
            title: item.title ?? "",
            cover: this.normalizeVideoCoverUrl(item.pic ?? ""),
            duration: item.duration ?? 0,
            play: stat?.view ?? 0,
            danmaku: stat?.danmaku ?? 0,
            owner: {
                mid: owner?.mid ?? 0,
                name: owner?.name ?? "",
                face: (owner?.face ?? "").replace(/^http:/, "https:"),
            },
            pubdate: item.pubdate ?? item.ctime ?? 0,
            progress: item.progress ?? 0,
            addAt: item.add_at ?? 0,
            cid: item.cid ?? 0,
        }, item);
    }
    isSearchVideoResult(item) {
        if (!item.bvid)
            return false;
        const type = String(item.type ?? item.result_type ?? "video").toLowerCase();
        if (type && type !== "video")
            return false;
        if (item.is_live === 1 || item.is_live === true)
            return false;
        return true;
    }
    normalizeSearchVideo(item) {
        const durationText = item.duration;
        let duration = 0;
        if (durationText?.includes(":")) {
            const parts = durationText.split(":").map(Number);
            if (parts.length === 2)
                duration = parts[0] * 60 + parts[1];
            if (parts.length === 3)
                duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        const title = String(item.title ?? "")
            .replace(/<em class="keyword">/g, "")
            .replace(/<\/em>/g, "");
        return this.withChargeBadge({
            bvid: item.bvid,
            aid: item.aid ?? 0,
            title,
            cover: this.normalizeVideoCoverUrl(item.pic ?? ""),
            duration,
            play: item.play ?? 0,
            danmaku: item.video_review ?? 0,
            owner: {
                mid: item.mid ?? 0,
                name: item.author ?? "",
                face: (item.upic ?? "").replace(/^http:/, "https:"),
            },
            pubdate: item.pubdate ??
                item.pub_time ??
                item.ctime ??
                0,
        }, item);
    }
}
export const biliApi = new BiliApiService();
