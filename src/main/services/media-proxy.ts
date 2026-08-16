import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, RequestOptions } from "node:http";
import { protocol, app } from "electron";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const MEDIA_SCHEME = "bilimedia";

type ProxyEntry =
  | { kind: "media"; url: string; referer: string; at: number }
  | { kind: "mpd"; xml: string; at: number };

const tokens = new Map<string, ProxyEntry>();
let server: http.Server | null = null;
let port = 0;
let protocolEnabled = false;

function headerValue(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function remember(entry: ProxyEntry): string {
  const id = randomUUID();
  tokens.set(id, entry);
  if (tokens.size > 300) {
    const oldest = [...tokens.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) tokens.delete(oldest[0]);
  }
  return id;
}

function requestOnce(
  url: string,
  method: string,
  headers: Record<string, string>,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const options: RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      timeout: 60000,
    };
    const upstream = lib.request(options, resolve);
    upstream.on("timeout", () => {
      upstream.destroy(new Error("upstream timeout"));
    });
    upstream.on("error", reject);
    upstream.end();
  });
}

async function fetchUpstream(
  url: string,
  method: string,
  headers: Record<string, string>,
  redirectsLeft = 5,
): Promise<IncomingMessage> {
  const res = await requestOnce(url, method, headers);
  const status = res.statusCode ?? 0;
  const location = headerValue(res.headers.location);
  if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
    res.resume();
    const next = new URL(location, url).toString();
    return fetchUpstream(next, method, headers, redirectsLeft - 1);
  }
  return res;
}

async function readIncoming(res: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of res) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function proxyMediaToResponse(
  entry: Extract<ProxyEntry, { kind: "media" }>,
  method: string,
  range: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Referer: entry.referer || "https://www.bilibili.com/",
    "User-Agent": UA,
  };
  if (range) headers.Range = range;

  const upstream = await fetchUpstream(
    entry.url,
    method === "HEAD" ? "HEAD" : "GET",
    headers,
  );
  const host = (() => {
    try {
      return new URL(entry.url).hostname;
    } catch {
      return "";
    }
  })();
  const contentRange = headerValue(upstream.headers["content-range"]) ?? "";
  console.warn("[BiliDesk][media-proxy]", {
    status: upstream.statusCode,
    range: range ?? "",
    contentRange,
    host,
  });

  const out = new Headers();
  out.set("Access-Control-Allow-Origin", "*");
  out.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  );
  out.set(
    "Accept-Ranges",
    headerValue(upstream.headers["accept-ranges"]) || "bytes",
  );
  const contentType = headerValue(upstream.headers["content-type"]);
  if (contentType) out.set("Content-Type", contentType);
  const contentLength = headerValue(upstream.headers["content-length"]);
  if (contentLength) out.set("Content-Length", contentLength);
  if (contentRange) out.set("Content-Range", contentRange);

  if (method === "HEAD") {
    upstream.resume();
    return new Response(null, {
      status: upstream.statusCode ?? 502,
      headers: out,
    });
  }

  const body = await readIncoming(upstream);
  if (!out.has("Content-Length")) {
    out.set("Content-Length", String(body.byteLength));
  }
  return new Response(body, {
    status: upstream.statusCode ?? 502,
    headers: out,
  });
}

function mpdResponse(
  entry: Extract<ProxyEntry, { kind: "mpd" }>,
  method: string,
): Response {
  const body = Buffer.from(entry.xml, "utf-8");
  console.warn("[BiliDesk][media-proxy] mpd", {
    bytes: body.byteLength,
    method,
  });
  return new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/dash+xml; charset=utf-8",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

function lookupEntry(pathname: string): ProxyEntry | undefined {
  const mediaId = pathname.match(/\/m\/([0-9a-f-]+)/i)?.[1];
  const mpdId = pathname.match(/\/p\/([0-9a-f-]+)/i)?.[1];
  return tokens.get(mediaId ?? mpdId ?? "");
}

export async function handleBilimediaProtocol(
  request: Request,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const entry = lookupEntry(url.pathname);
    if (!entry) {
      console.warn("[BiliDesk][media-proxy] 404", url.pathname);
      return new Response("not found", { status: 404 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range",
        },
      });
    }
    if (entry.kind === "mpd") return mpdResponse(entry, request.method);
    return proxyMediaToResponse(
      entry,
      request.method,
      request.headers.get("Range") ?? request.headers.get("range"),
    );
  } catch (error) {
    console.warn("[BiliDesk][media-proxy] protocol", error);
    return new Response("proxy error", { status: 502 });
  }
}

/** 必须在 app.whenReady 之前调用 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function attachMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => handleBilimediaProtocol(request));
  protocolEnabled = true;
  console.warn("[BiliDesk][media-proxy] protocol", `${MEDIA_SCHEME}://`);
}

function setCors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  );
}

async function handleHttpProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let pathname = req.url ?? "/";
  try {
    pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    // keep raw url
  }

  const entry = lookupEntry(pathname);
  if (!entry) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  try {
    const response =
      entry.kind === "mpd"
        ? mpdResponse(entry, req.method ?? "GET")
        : await proxyMediaToResponse(
            entry,
            req.method ?? "GET",
            req.headers.range ? String(req.headers.range) : null,
          );
    const headers: http.OutgoingHttpHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
    };
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    res.writeHead(response.status, headers);
    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (error) {
    console.warn("[BiliDesk][media-proxy]", error);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  }
}

export async function startMediaProxy(): Promise<void> {
  if (server) return;
  server = http.createServer((req, res) => {
    void handleHttpProxy(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address() as AddressInfo;
      port = address.port;
      console.warn(
        "[BiliDesk][media-proxy] listening",
        `http://127.0.0.1:${port}`,
      );
      resolve();
    });
  });
}

function mediaUrl(kind: "m" | "p", id: string): string {
  const useProtocol = protocolEnabled && app.isPackaged;
  if (useProtocol) return `${MEDIA_SCHEME}://play/${kind}/${id}`;
  if (port) return `http://127.0.0.1:${port}/${kind}/${id}`;
  if (protocolEnabled) return `${MEDIA_SCHEME}://play/${kind}/${id}`;
  return "";
}

export function wrapMediaUrl(realUrl: string, referer: string): string {
  if (
    !realUrl ||
    realUrl.startsWith("data:") ||
    realUrl.startsWith(`${MEDIA_SCHEME}:`) ||
    realUrl.startsWith("http://127.0.0.1")
  ) {
    return realUrl;
  }
  if (!protocolEnabled && !port) return realUrl;
  const id = remember({ kind: "media", url: realUrl, referer, at: Date.now() });
  return mediaUrl("m", id);
}

export function wrapMpd(xml: string): string {
  if (!xml) return xml;
  if (!protocolEnabled && !port) return xml;
  const id = remember({ kind: "mpd", xml, at: Date.now() });
  return mediaUrl("p", id);
}

function isAllowedMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith(".bilivideo.com") ||
      host.endsWith(".bilivideo.cn") ||
      host.endsWith(".akamaized.net") ||
      host === "akamaized.net" ||
      host.endsWith(".hdslb.com")
    );
  } catch {
    return false;
  }
}

let rangeLogCount = 0;

/** 主进程拉 DASH 分片，避开渲染进程 CORS / Private Network Access */
export async function fetchMediaRange(
  url: string,
  referer: string,
  range?: string,
): Promise<Uint8Array> {
  if (!isAllowedMediaUrl(url)) {
    throw new Error("非法媒体地址");
  }
  const headers: Record<string, string> = {
    Referer: referer || "https://www.bilibili.com/",
    "User-Agent": UA,
  };
  if (range) {
    headers.Range = range.startsWith("bytes=") ? range : `bytes=${range}`;
  }
  const upstream = await fetchUpstream(url, "GET", headers);
  const status = upstream.statusCode ?? 0;
  if (status >= 400) {
    upstream.resume();
    throw new Error(`媒体分片 HTTP ${status}`);
  }
  const body = await readIncoming(upstream);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // ignore
  }
  if (status !== 206 || rangeLogCount < 2) {
    rangeLogCount += 1;
    console.warn("[BiliDesk][media-range]", {
      status,
      range: headers.Range ?? "",
      bytes: body.byteLength,
      host,
    });
  }
  return body;
}
