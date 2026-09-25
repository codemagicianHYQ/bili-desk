/** 简介 / 评论里识别到的外链，只放行 http(s) */

/**
 * 不能用 `[^\s]+`：中文、全角标点、分号都会被吃进同一条链接。
 * 路径只保留常见 URL 字符，在 ；：。，、| 和汉字处断开。
 */
const URL_SPLIT_RE =
  /(https?:\/\/[\w.~:/?#@!$&'*+=%[\],()-]+|www\.[\w.~:/?#@!$&'*+=%[\],()-]+)/gi;

const TRAILING_PUNCT_RE = /[),.;:!?。，、；：！？…》>\]\}」』】）]+$/u;

/** 裸 BV 号：BV + 10 位，和官网长度一致 */
const BVID_SPLIT_RE = /(BV[0-9A-Za-z]{10})/gi;

export type LinkifyPart =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string }
  | { kind: "bvid"; value: string };

export function normalizeBvid(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^bv/i, "BV");
}

function splitBvidParts(text: string): LinkifyPart[] {
  if (!text) return [];
  BVID_SPLIT_RE.lastIndex = 0;
  return text
    .split(BVID_SPLIT_RE)
    .filter(Boolean)
    .map((chunk) =>
      /^BV[0-9A-Za-z]{10}$/i.test(chunk)
        ? { kind: "bvid" as const, value: chunk }
        : { kind: "text" as const, value: chunk },
    );
}

export function sanitizeExternalUrl(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const withScheme = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function splitLinkifiedText(text: string): LinkifyPart[] {
  if (!text) return [];
  const parts: LinkifyPart[] = [];
  const chunks = text.split(URL_SPLIT_RE);
  for (const chunk of chunks) {
    if (!chunk) continue;
    const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(chunk);
    if (!looksLikeUrl) {
      parts.push(...splitBvidParts(chunk));
      continue;
    }
    const core = chunk.replace(TRAILING_PUNCT_RE, "");
    const trail = chunk.slice(core.length);
    const href = sanitizeExternalUrl(core);
    if (href) {
      parts.push({ kind: "url", value: core, href });
      if (trail) parts.push(...splitBvidParts(trail));
    } else {
      parts.push(...splitBvidParts(chunk));
    }
  }
  return parts;
}
