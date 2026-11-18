import { md5 } from "./md5";

/** 与官网当前混入表一致。改这里时桌面端和手机端一起生效。 */
export const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

export function extractWbiKey(url: string): string {
  const filename = url.slice(url.lastIndexOf("/") + 1);
  return filename.replace(/\.(jpg|jpeg|png|webp).*$/i, "").split("@")[0];
}

export function signWbiParams(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
): Record<string, string | number> {
  const mixinKey = MIXIN_KEY_ENC_TAB.map((index) => (imgKey + subKey)[index])
    .join("")
    .slice(0, 32);
  const wts = Math.floor(Date.now() / 1000);
  const signed: Record<string, string | number> = { ...params, wts };
  const query = Object.keys(signed)
    .sort()
    .map((key) => {
      const value = String(signed[key]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");
  return { ...signed, w_rid: md5(query + mixinKey) };
}
