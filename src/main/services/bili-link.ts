import axios from "axios";
import { sanitizeExternalUrl } from "@shared/utils/external-url";
import { isBiliShortUrl } from "@shared/utils/bili-app-link";
import { defaultHeaders } from "./wbi";
import { getCookieString } from "../store/app-store";

async function followOnce(
  url: string,
  method: "HEAD" | "GET",
): Promise<string | null> {
  const res = await axios.request({
    url,
    method,
    maxRedirects: 0,
    timeout: 8000,
    validateStatus: () => true,
    headers: {
      ...defaultHeaders(),
      Cookie: getCookieString(),
      Referer: "https://www.bilibili.com/",
    },
  });
  const location = res.headers.location;
  if (typeof location === "string" && location.trim()) {
    return new URL(location, url).href;
  }
  return null;
}

async function followByClient(url: string): Promise<string> {
  const res = await axios.get(url, {
    maxRedirects: 5,
    timeout: 8000,
    validateStatus: () => true,
    maxContentLength: 4096,
    headers: {
      ...defaultHeaders(),
      Cookie: getCookieString(),
      Referer: "https://www.bilibili.com/",
    },
  });
  const responseUrl = (
    res.request as { res?: { responseUrl?: string } } | undefined
  )?.res?.responseUrl;
  return String(responseUrl || res.config.url || url);
}

async function followRedirects(start: string): Promise<string> {
  let current = start;
  for (let hop = 0; hop < 6; hop += 1) {
    try {
      const next =
        (await followOnce(current, "HEAD")) ??
        (await followOnce(current, "GET"));
      if (!next || next === current) break;
      current = next;
      if (!isBiliShortUrl(current)) return current;
    } catch {
      break;
    }
  }
  if (isBiliShortUrl(current)) {
    try {
      return await followByClient(current);
    } catch {
      return current;
    }
  }
  return current;
}

export async function resolveBiliUrl(raw: string): Promise<string> {
  const url = sanitizeExternalUrl(raw);
  if (!url) throw new Error("不支持的链接");
  if (!isBiliShortUrl(url)) return url;
  return followRedirects(url);
}
