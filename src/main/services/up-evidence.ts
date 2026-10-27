import {
  scoreEvidence,
  type Evidence,
  type TaxonomyMatch,
} from "./collection-taxonomy";

/** 签名里联系方式 / 防骗声明这类片段跟内容无关，打分前剔掉 */
const SIGN_CONTACT =
  /@|邮箱|微信|vx|wx|v[:：]|q[:：]|qq|群[:：\d]|\d{6,}|https?:|www\.|\.com|\.cn|\.top/i;
const SIGN_BOILERPLATE =
  /^(商务|合作|工作联系|投稿)|谨防|仅此|唯一|小号|同名|全网|不回私信|私信|备注来意|领取资料/;
/** 出现在句中的商务话术，整段不要 */
const SIGN_PROMO =
  /商[业务]合作|品牌合作|广告合作|合作联系|合作请|商务联系|商务请|商单|接广告|恰饭|注明来意/;
/** 人设标签：MBTI、血型、星座、九型人格，跟内容方向无关 */
const SIGN_PERSONA =
  /\b[ie][ns][tf][jp](-[at])?\b|\badhd\b|\b(ab|a|b|o)型血|\b(ab|a|b|o)?血型|[一二三四五六七八九纯]\s*\d?\s*号?型人格|\d\s*w\s*\d|白羊座|金牛座|双子座|巨蟹座|狮子座|处女座|天秤座|天蝎座|射手座|摩羯座|水瓶座|双鱼座|纯\s*\d\s*型/gi;

export function cleanUpSign(sign: string): string {
  return sign
    .split(/[\n|｜,，。;；!！]+/)
    .map((part) => part.replace(SIGN_PERSONA, " ").replace(/\s+/g, " ").trim())
    .filter(
      (part) =>
        part.length > 1 &&
        !SIGN_CONTACT.test(part) &&
        !SIGN_BOILERPLATE.test(part) &&
        !SIGN_PROMO.test(part),
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

export type UpMatchLevel = "rule" | "weak";

const MIN_SCORE = 6;
/** 只有一条证据时要更高的分，签名里顺口提一句不算数 */
const SINGLE_SOURCE_SCORE = 9;

/**
 * 「确定」要求至少两条证据（认证 / 昵称 / 签名 / 视频标题）指向同一个一级，
 * 或单条证据分足够高；明显领先第二名。其余有倾向的归为低把握。
 */
export function judgeUpMatch(match: TaxonomyMatch | null): UpMatchLevel | null {
  if (!match) return null;
  const leads = match.runnerUp === 0 || match.score >= match.runnerUp * 1.4;
  if (
    leads &&
    match.score >= MIN_SCORE &&
    (match.support >= 2 || match.score >= SINGLE_SOURCE_SCORE)
  ) {
    return "rule";
  }
  if (match.score >= 4 && match.score >= match.runnerUp * 1.5) return "weak";
  return null;
}

export function classifyUpEvidence(
  up: { uname: string; sign: string; official?: { title: string } },
  titles: string[],
): { match: TaxonomyMatch | null; level: UpMatchLevel | null } {
  const match = scoreEvidence(buildUpEvidence(up, titles));
  return { match, level: judgeUpMatch(match) };
}
