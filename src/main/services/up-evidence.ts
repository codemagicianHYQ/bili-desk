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

/** 视频标题是主要依据；昵称常是谐音梗 / 口头禅（如「青川没吃饭」其实是游戏区），权重最低 */
const TITLE_WEIGHT = 1.5;
const UNAME_WEIGHT = 1;
const SIGN_WEIGHT = 1.5;
const OFFICIAL_WEIGHT = 3;
/** 至少这么多条标题才认为标题能代表这位 UP 的方向 */
const TITLES_DECISIVE_COUNT = 3;
/** 标题单独打出这么多分，才压过昵称 / 签名 */
const TITLES_OVERRIDE_SCORE = 4.5;

export function buildUpEvidence(
  up: { uname: string; sign: string; official?: { title: string } },
  titles: string[],
): Evidence[] {
  return [
    { text: up.official?.title ?? "", weight: OFFICIAL_WEIGHT },
    { text: up.uname, weight: UNAME_WEIGHT },
    { text: cleanUpSign(up.sign), weight: SIGN_WEIGHT },
    ...titles.map((text) => ({ text, weight: TITLE_WEIGHT })),
  ];
}

export type UpMatchLevel = "rule" | "weak";

const MIN_SCORE = 6;
/** 只有一条证据时要更高的分，签名里顺口提一句不算数 */
const SINGLE_SOURCE_SCORE = 9;

/**
 * 「确定」：分数够，并且明显领先第二名。
 * 第一名已经够分、只是和第二名接近时，归低把握，不要因为分差不够就丢回未分组。
 * 总分已经很高但跨类接近（比如科技和 AI 都命中），也归低把握，别扔回未分组。
 */
export function judgeUpMatch(match: TaxonomyMatch | null): UpMatchLevel | null {
  if (!match || match.score < 4) return null;
  const ratio =
    match.runnerUp === 0
      ? Number.POSITIVE_INFINITY
      : match.score / match.runnerUp;
  const backed = match.support >= 2 || match.score >= SINGLE_SOURCE_SCORE;
  if (match.score >= MIN_SCORE && backed && ratio >= 1.4) return "rule";
  if (match.score >= MIN_SCORE && ratio >= 1.15) return "weak";
  if (ratio >= 1.5) return "weak";
  if (match.runnerUp === 0 && match.score >= 4.5) return "weak";
  // 总分已经够门槛，但几个类差不多：先低把握归上，比扔回未分组有用
  if (match.score >= MIN_SCORE) return "weak";
  return null;
}

export function classifyUpEvidence(
  up: { uname: string; sign: string; official?: { title: string } },
  titles: string[],
): { match: TaxonomyMatch | null; level: UpMatchLevel | null } {
  const match = scoreEvidence(buildUpEvidence(up, titles));
  if (match && titles.length >= TITLES_DECISIVE_COUNT) {
    const fromTitles = scoreEvidence(
      titles.map((text) => ({ text, weight: TITLE_WEIGHT })),
    );
    if (
      fromTitles &&
      fromTitles.l1 !== match.l1 &&
      fromTitles.score >= TITLES_OVERRIDE_SCORE
    ) {
      return { match: fromTitles, level: judgeUpMatch(fromTitles) };
    }
  }
  return { match, level: judgeUpMatch(match) };
}
