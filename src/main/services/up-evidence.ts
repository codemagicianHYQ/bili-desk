import type { Evidence } from "./collection-taxonomy";

/** 签名里联系方式 / 防骗声明这类片段跟内容无关，打分前剔掉 */
const SIGN_CONTACT =
  /@|邮箱|微信|vx|wx|v[:：]|q[:：]|qq|群[:：\d]|\d{6,}|https?:|www\.|\.com|\.cn|\.top/i;
const SIGN_BOILERPLATE =
  /^(商务|合作|工作联系|投稿)|谨防|仅此|唯一|小号|同名|全网|不回私信|私信|备注来意|领取资料/;

export function cleanUpSign(sign: string): string {
  return sign
    .split(/[\n|｜,，。;；!！]+/)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part && !SIGN_CONTACT.test(part) && !SIGN_BOILERPLATE.test(part),
    )
    .join(" ");
}

export function buildUpEvidence(
  up: { uname: string; sign: string; official?: { title: string } },
  titles: string[],
): Evidence[] {
  return [
    { text: up.official?.title ?? "", weight: 3 },
    { text: up.uname, weight: 2 },
    { text: cleanUpSign(up.sign), weight: 2 },
    ...titles.map((text) => ({ text, weight: 1 })),
  ];
}
