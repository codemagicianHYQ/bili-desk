/** 把 B 站链接映射到应用内路由，短链（b23.tv）需先解析再喂进来 */

const SHORT_HOSTS = new Set(["b23.tv", "bili2233.cn", "b22.top"]);

const BILI_HOSTS = new Set([
  "bilibili.com",
  "bilibili.tv",
  "b23.tv",
  "bili2233.cn",
  "b22.top",
]);

function hostnameOf(href: string): string {
  try {
    const url = new URL(/^www\./i.test(href) ? `https://${href}` : href);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isBiliHostname(host: string): boolean {
  if (!host) return false;
  if (BILI_HOSTS.has(host)) return true;
  return host.endsWith(".bilibili.com") || host.endsWith(".bilibili.tv");
}

export function isBiliUrl(href: string): boolean {
  return isBiliHostname(hostnameOf(href));
}

export function isBiliShortUrl(href: string): boolean {
  return SHORT_HOSTS.has(hostnameOf(href));
}

function keepVideoQuery(search: URLSearchParams): string {
  const next = new URLSearchParams();
  const cid = search.get("cid");
  const t = search.get("t");
  if (cid) next.set("cid", cid);
  if (t) next.set("t", t);
  const query = next.toString();
  return query ? `?${query}` : "";
}

function firstPathSegment(pathname: string, index = 0): string {
  return pathname.split("/").filter(Boolean)[index] ?? "";
}

export function parseBiliAppPath(href: string): string | null {
  const raw = href.startsWith("//") ? `https:${href}` : href;
  let url: URL;
  try {
    url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname;

  if (host === "space.bilibili.com") {
    const mid = firstPathSegment(path);
    if (/^\d+$/.test(mid)) return `/up/${mid}`;
    return null;
  }

  if (host === "t.bilibili.com") {
    const id = firstPathSegment(path);
    if (id && id !== "topic") return `/dynamic/${id}`;
    return null;
  }

  if (host === "live.bilibili.com") {
    const first = firstPathSegment(path);
    const room = first === "blanc" ? firstPathSegment(path, 1) : first;
    if (/^\d+$/.test(room)) return `/live/${room}`;
    return null;
  }

  if (!isBiliHostname(host)) return null;

  const videoMatch = path.match(/\/(?:s\/)?video\/(BV[0-9A-Za-z]+|av\d+)/i);
  if (videoMatch) {
    const id = videoMatch[1];
    if (/^BV/i.test(id)) {
      return `/video/${id}${keepVideoQuery(url.searchParams)}`;
    }
  }

  const bvidQuery = url.searchParams.get("bvid");
  if (bvidQuery && /^BV[0-9A-Za-z]+$/i.test(bvidQuery)) {
    return `/video/${bvidQuery}${keepVideoQuery(url.searchParams)}`;
  }

  const cvId = path.match(/\/read\/cv(\d+)/i)?.[1];
  if (cvId) return `/article/${cvId}`;

  const readId = url.searchParams.get("id");
  if (
    /\/read\//i.test(path) &&
    readId &&
    /^\d+$/.test(readId)
  ) {
    return `/article/${readId}`;
  }

  const opusId = path.match(/\/opus\/(\d+)/)?.[1];
  if (opusId) return `/dynamic/${opusId}`;

  const dynamicId = path.match(/\/dynamic\/(\d+)/)?.[1];
  if (dynamicId) return `/dynamic/${dynamicId}`;

  const spaceMid = path.match(/\/space\/(\d+)/)?.[1];
  if (spaceMid) return `/up/${spaceMid}`;

  return null;
}

/** 图文 / opus：优先解析 jump_url，否则用 opus id 进应用内动态详情 */
export function resolveOpusAppPath(item: {
  id: string;
  url?: string;
}): string {
  if (item.url) {
    const parsed = parseBiliAppPath(item.url);
    if (parsed) return parsed;
  }
  return `/dynamic/${item.id}`;
}

export function isInternalAppUrl(url: string): boolean {
  const trimmed = String(url ?? "").trim();
  if (!trimmed || trimmed === "about:blank") return true;
  if (trimmed.startsWith("#")) return true;
  try {
    const parsed = new URL(
      trimmed.startsWith("//") ? `https:${trimmed}` : trimmed,
    );
    if (parsed.protocol === "file:" || parsed.protocol === "app:") return true;
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return true;
  }
}

export function extractAppHashPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hash = decodeURIComponent(parsed.hash.replace(/^#/, ""));
    if (hash.startsWith("/")) return hash;
  } catch {
    /* ignore */
  }
  return null;
}

/** 把新窗口 / 外链解析成应用内 hash 路由，解析不了返回 null */
export function resolveInAppPathFromUrl(url: string): string | null {
  return extractAppHashPath(url) ?? parseBiliAppPath(url);
}
