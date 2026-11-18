/** 从直播弹幕 / 历史接口里抽出 `[喝彩]` → 图片地址 */
function httpsUrl(value) {
    const url = String(value ?? "")
        .trim()
        .replace(/^http:/, "https:");
    return url.startsWith("http") ? url : "";
}
function bracketToken(value) {
    const raw = String(value ?? "").trim();
    if (!raw)
        return "";
    const match = raw.match(/\[[^[\]]{1,32}\]/);
    if (match)
        return match[0];
    if (raw.startsWith("[") && raw.endsWith("]"))
        return raw;
    return "";
}
export function addLiveEmote(map, key, url) {
    const token = bracketToken(key);
    const href = httpsUrl(url);
    if (token && href)
        map[token] = href;
}
export function mergeLiveEmoteMaps(...maps) {
    const out = {};
    for (const map of maps) {
        if (!map)
            continue;
        for (const [key, url] of Object.entries(map))
            addLiveEmote(out, key, url);
    }
    return out;
}
function absorbEmoteRecord(map, item) {
    const url = item.url ??
        item.icon_url ??
        item.gif_url ??
        item.perm ??
        item.emoji?.url;
    addLiveEmote(map, item.emoji ??
        item.text ??
        item.emoticon_unique ??
        item.descript ??
        item.name, url);
}
function absorbEmotesObject(map, value) {
    if (!value)
        return;
    if (Array.isArray(value)) {
        for (const item of value) {
            if (item && typeof item === "object") {
                absorbEmoteRecord(map, item);
            }
        }
        return;
    }
    if (typeof value !== "object")
        return;
    for (const [key, item] of Object.entries(value)) {
        if (item && typeof item === "object") {
            const rec = item;
            addLiveEmote(map, key, rec.url ?? rec.icon_url);
            absorbEmoteRecord(map, rec);
        }
        else {
            addLiveEmote(map, key, item);
        }
    }
}
/** 解析 DANMU_MSG.info 里的表情表 / 大表情 */
export function parseDanmuMsgEmotes(info) {
    const emotes = {};
    const rawText = info[1];
    let text = typeof rawText === "string"
        ? rawText.trim()
        : rawText && typeof rawText === "object"
            ? String(rawText.text ??
                rawText.emoji ??
                "").trim()
            : "";
    const meta = Array.isArray(info[0]) ? info[0] : [];
    const sticker = meta[13] && typeof meta[13] === "object" && !Array.isArray(meta[13])
        ? meta[13]
        : null;
    const stickerUrl = sticker ? httpsUrl(sticker.url) : "";
    if (sticker) {
        absorbEmoteRecord(emotes, sticker);
        if (text)
            addLiveEmote(emotes, text, stickerUrl);
    }
    const extraWrap = meta[15] && typeof meta[15] === "object"
        ? meta[15]
        : null;
    let extra = extraWrap?.extra;
    if (typeof extra === "string") {
        try {
            extra = JSON.parse(extra);
        }
        catch {
            extra = null;
        }
    }
    if (extra && typeof extra === "object") {
        absorbEmotesObject(emotes, extra.emots ?? extra);
    }
    if (!text) {
        text = Object.keys(emotes)[0] ?? (stickerUrl ? "[表情]" : "");
        if (text === "[表情]" && stickerUrl)
            emotes[text] = stickerUrl;
    }
    return {
        emotes,
        stickerUrl: stickerUrl || undefined,
        text,
    };
}
export function parseHistoryItemEmotes(item) {
    const emotes = {};
    absorbEmotesObject(emotes, item.emots);
    absorbEmotesObject(emotes, item.emoticon);
    absorbEmoteRecord(emotes, item);
    return emotes;
}
