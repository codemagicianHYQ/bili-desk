import axios from "axios";
import { session } from "electron";
import { extractWbiKey, signWbiParams } from "@shared/wbi-sign";
import { appStore, getCookieString, setCookies } from "../store/app-store";

let cachedKeys: { imgKey: string; subKey: string; expires: number } | null =
  null;

interface NavResponse {
  code?: number;
  message?: string;
  data?: {
    wbi_img?: {
      img_url?: string;
      sub_url?: string;
    };
  };
}

async function ensureBuvid3ForWbi(): Promise<void> {
  if (appStore.get("cookies").buvid3) return;

  try {
    const res = await axios.get(
      "https://api.bilibili.com/x/frontend/finger/spi",
      {
        headers: defaultHeaders(),
        timeout: 10000,
        validateStatus: () => true,
      },
    );
    const b3 = res.data?.data?.b_3 as string | undefined;
    if (b3) setCookies({ buvid3: b3 });
  } catch {
    // ignore
  }
}

async function fetchNavWbiImg(): Promise<{ img_url: string; sub_url: string }> {
  await ensureBuvid3ForWbi();

  const headers = {
    ...defaultHeaders(),
    Accept: "application/json, text/plain, */*",
    Cookie: getCookieString(),
  };

  let lastError = "unknown error";

  try {
    const res = await session.defaultSession.fetch(
      "https://api.bilibili.com/x/web-interface/nav",
      {
        headers,
      },
    );
    const json = (await res.json()) as NavResponse;
    const wbiImg = json?.data?.wbi_img;
    if (wbiImg?.img_url && wbiImg?.sub_url) {
      return { img_url: wbiImg.img_url, sub_url: wbiImg.sub_url };
    }
    lastError = `nav fetch status ${res.status}, code ${json?.code ?? "n/a"}: ${json?.message ?? "missing wbi_img"}`;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  try {
    const res = await axios.get<NavResponse>(
      "https://api.bilibili.com/x/web-interface/nav",
      {
        headers,
        timeout: 10000,
        validateStatus: () => true,
      },
    );
    const wbiImg = res.data?.data?.wbi_img;
    if (wbiImg?.img_url && wbiImg?.sub_url) {
      return { img_url: wbiImg.img_url, sub_url: wbiImg.sub_url };
    }
    lastError = `nav axios code ${res.data?.code ?? "n/a"}: ${res.data?.message ?? "missing wbi_img"}`;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  throw new Error(`Failed to fetch WBI keys (${lastError})`);
}

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (cachedKeys && Date.now() < cachedKeys.expires) {
    return { imgKey: cachedKeys.imgKey, subKey: cachedKeys.subKey };
  }

  const wbiImg = await fetchNavWbiImg();
  const imgKey = extractWbiKey(wbiImg.img_url);
  const subKey = extractWbiKey(wbiImg.sub_url);

  if (!imgKey || !subKey) {
    throw new Error("Failed to parse WBI keys from nav response");
  }

  cachedKeys = { imgKey, subKey, expires: Date.now() + 30 * 60 * 1000 };
  return { imgKey, subKey };
}

export function defaultHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.bilibili.com/",
    Origin: "https://www.bilibili.com",
  };
}

export function invalidateWbiCache(): void {
  cachedKeys = null;
}

export async function signParams(
  params: Record<string, string | number>,
): Promise<Record<string, string | number>> {
  const { imgKey, subKey } = await getWbiKeys();
  return signWbiParams(params, imgKey, subKey);
}

export function getCsrf(): string {
  return appStore.get("cookies").bili_jct;
}
