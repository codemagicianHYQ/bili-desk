/** 从直播弹幕 / 历史接口里抽出 `[喝彩]` → 图片地址 */

function httpsUrl(value: unknown): string {
  const url = String(value ?? "")
    .trim()
    .replace(/^http:/, "https:");
  return url.startsWith("http") ? url : "";
}

function bracketToken(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/\[[^[\]]{1,32}\]/);
  if (match) return match[0];
  if (raw.startsWith("[") && raw.endsWith("]")) return raw;
  return "";
}

export function addLiveEmote(
  map: Record<string, string>,
  key: unknown,
  url: unknown,
): void {
  const token = bracketToken(key);
  const href = httpsUrl(url);
  if (token && href) map[token] = href;
}

export function mergeLiveEmoteMaps(
  ...maps: Array<Record<string, string> | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, url] of Object.entries(map)) addLiveEmote(out, key, url);
  }
  return out;
}

function absorbEmoteRecord(
  map: Record<string, string>,
  item: Record<string, unknown>,
): void {
  const url =
    item.url ??
    item.icon_url ??
    item.gif_url ??
    item.perm ??
    (item.emoji as Record<string, unknown> | undefined)?.url;
  addLiveEmote(
    map,
    item.emoji ??
      item.text ??
      item.emoticon_unique ??
      item.descript ??
      item.name,
    url,
  );
}

function absorbEmotesObject(map: Record<string, string>, value: unknown): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        absorbEmoteRecord(map, item as Record<string, unknown>);
      }
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      addLiveEmote(map, key, rec.url ?? rec.icon_url);
      absorbEmoteRecord(map, rec);
    } else {
      addLiveEmote(map, key, item);
    }
  }
}

/** 解析 DANMU_MSG.info 里的表情表 / 大表情 */
export function parseDanmuMsgEmotes(info: unknown[]): {
  emotes: Record<string, string>;
  stickerUrl?: string;
  text: string;
} {
  const emotes: Record<string, string> = {};
  const rawText = info[1];
  let text =
    typeof rawText === "string"
      ? rawText.trim()
      : rawText && typeof rawText === "object"
        ? String(
            (rawText as Record<string, unknown>).text ??
              (rawText as Record<string, unknown>).emoji ??
              "",
          ).trim()
        : "";

  const meta = Array.isArray(info[0]) ? (info[0] as unknown[]) : [];
  const sticker =
    meta[13] && typeof meta[13] === "object" && !Array.isArray(meta[13])
      ? (meta[13] as Record<string, unknown>)
      : null;
  const stickerUrl = sticker ? httpsUrl(sticker.url) : "";
  if (sticker) {
    absorbEmoteRecord(emotes, sticker);
    if (text) addLiveEmote(emotes, text, stickerUrl);
  }

  const extraWrap =
    meta[15] && typeof meta[15] === "object"
      ? (meta[15] as Record<string, unknown>)
      : null;
  let extra = extraWrap?.extra;
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra) as unknown;
    } catch {
      extra = null;
    }
  }
  if (extra && typeof extra === "object") {
    absorbEmotesObject(
      emotes,
      (extra as Record<string, unknown>).emots ?? extra,
    );
  }

  if (!text) {
    text = Object.keys(emotes)[0] ?? (stickerUrl ? "[表情]" : "");
    if (text === "[表情]" && stickerUrl) emotes[text] = stickerUrl;
  }

  return {
    emotes,
    stickerUrl: stickerUrl || undefined,
    text,
  };
}

export function parseHistoryItemEmotes(
  item: Record<string, unknown>,
): Record<string, string> {
  const emotes: Record<string, string> = {};
  absorbEmotesObject(emotes, item.emots);
  absorbEmotesObject(emotes, item.emoticon);
  absorbEmoteRecord(emotes, item);
  return emotes;
}
