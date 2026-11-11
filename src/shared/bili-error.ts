/** 把 B 站错误码 / IPC 包装译成用户能看懂的原因。主进程抛错和页面展示共用。 */

export type BiliFailureHint =
  | "video"
  | "dynamic"
  | "article"
  | "live"
  | "user"
  | "season"
  | "audio";

export interface BiliFailureCopy {
  title: string;
  detail: string;
}

const BY_CODE: Record<number, BiliFailureCopy> = {
  [-101]: {
    title: "需要登录",
    detail: "当前账号未登录，或登录已失效。",
  },
  [-111]: {
    title: "登录已失效",
    detail: "校验失败，请重新登录后再试。",
  },
  [-352]: {
    title: "触发风控",
    detail: "请求被风控拦截，请稍后重试或重新登录。",
  },
  [-400]: { title: "请求有误", detail: "参数不正确，请返回后重试。" },
  [-403]: { title: "没有权限", detail: "当前账号无权查看或操作这项内容。" },
  [-404]: { title: "内容不存在", detail: "没有找到对应内容，可能已被删除。" },
  [-412]: {
    title: "暂时无法访问",
    detail: "请求被 B 站安全策略拦截，请稍后重试。",
  },
  [-509]: { title: "操作太频繁", detail: "请求过于频繁，请稍后再试。" },
  [-799]: { title: "操作太频繁", detail: "请求过于频繁，请稍后再试。" },
  62002: {
    title: "视频不可见",
    detail: "该稿件已被隐藏、设为私密或下架。",
  },
  62004: { title: "视频审核中", detail: "该稿件正在审核，暂时无法观看。" },
  62012: {
    title: "视频已删除",
    detail: "UP 主已删除该稿件，无法继续播放。",
  },
  4101129: { title: "动态已删除", detail: "这条动态已被删除，无法查看原文。" },
  4101140: { title: "动态已删除", detail: "这条动态已被删除，无法查看原文。" },
};

const HINT_MISSING: Record<BiliFailureHint, BiliFailureCopy> = {
  video: {
    title: "视频不存在",
    detail: "没有找到这个视频，链接可能有误，或稿件已被移除。",
  },
  dynamic: {
    title: "动态已失效",
    detail: "这条动态不存在，或发布者已将其设为不可见。",
  },
  article: {
    title: "专栏不存在或已删除",
    detail: "这篇专栏已被删除，或当前账号无法查看。",
  },
  live: {
    title: "直播间不存在",
    detail: "没有找到这个直播间，可能已关闭或房间号有误。",
  },
  user: {
    title: "用户不存在",
    detail: "该用户不存在，或账号已注销。",
  },
  season: {
    title: "剧集不存在或已下架",
    detail: "这部剧集无法打开，可能已下架或地区不可看。",
  },
  audio: {
    title: "音频不存在或已下架",
    detail: "这条音频无法播放，可能已被删除。",
  },
};

export function stripIpcErrorText(input: unknown): string {
  let message = "";
  if (input instanceof Error) message = input.message;
  else if (typeof input === "string") message = input;
  else if (input != null) message = String(input);
  const match = message.match(
    /Error invoking remote method '[^']+': (?:(?:Error|TypeError|RangeError): )?([\s\S]+)$/,
  );
  return (match?.[1] ?? message).replace(/（code=-?\d+）/g, "").trim();
}

function pickCode(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^-?\d{3,7}$/.test(trimmed)) return Number(trimmed);
  const tagged = trimmed.match(/code=(-?\d{3,7})/);
  if (tagged) return Number(tagged[1]);
  const match = trimmed.match(/(?:^|[^\d-])(-?\d{3,7})(?!\d)/);
  return match ? Number(match[1]) : null;
}

export function describeBiliFailure(
  input: unknown,
  hint?: BiliFailureHint,
  fallback = "操作失败，请稍后重试",
): BiliFailureCopy {
  const raw = stripIpcErrorText(input);
  const code = raw ? pickCode(raw) : null;

  if (code === 62012 || /视频已删除|稿件已删除/.test(raw))
    return BY_CODE[62012];
  if (code === 62002 || /视频不可见|稿件不可见/.test(raw))
    return BY_CODE[62002];
  if (code === 62004 || /视频审核中|稿件审核/.test(raw)) return BY_CODE[62004];
  if (/动态已删除/.test(raw) || code === 4101129 || code === 4101140) {
    return BY_CODE[4101140];
  }
  if (/动态不可见/.test(raw)) {
    return {
      title: "动态不可见",
      detail: "发布者已将这条动态设为不可见。",
    };
  }
  if (/不支持的动态类型/.test(raw)) {
    return {
      title: "打不开这条动态",
      detail:
        "B 站详情接口不支持这种动态，常见于课程、音乐、直播分享，或已经下线的旧类型。",
    };
  }
  if (/动态不存在|动态已失效/.test(raw)) return HINT_MISSING.dynamic;
  if (/专栏.*(删除|不存在)|文章已删除/.test(raw)) return HINT_MISSING.article;
  if (/剧集.*(下架|不存在)|番剧已下架/.test(raw)) return HINT_MISSING.season;
  if (/音频.*(删除|不存在|下架)/.test(raw)) return HINT_MISSING.audio;
  if (/直播间不存在|房间不存在/.test(raw)) return HINT_MISSING.live;
  if (/未开播|已下播/.test(raw)) {
    return { title: "主播未开播", detail: "当前没有直播，开播后再来即可。" };
  }
  if (/轮播/.test(raw)) {
    return { title: "主播轮播中", detail: "主播正在轮播，暂时没有实时直播。" };
  }
  if (
    /用户不存在|账号已注销|用户已注销|啥都木有/.test(raw) &&
    (hint === "user" || /用户|账号|注销/.test(raw))
  ) {
    return HINT_MISSING.user;
  }
  if (/请先登录|未登录|账号未登录/.test(raw) || code === -101) {
    return BY_CODE[-101];
  }
  if (/csrf|重新登录/.test(raw) || code === -111) return BY_CODE[-111];
  if (/安全策略|412/.test(raw) || code === -412) return BY_CODE[-412];
  if (/风控/.test(raw) || code === -352) return BY_CODE[-352];
  if (/过于频繁|请求频繁/.test(raw) || code === -509 || code === -799) {
    return BY_CODE[-799];
  }
  if (/没有权限|权限不足|无权/.test(raw) || code === -403) return BY_CODE[-403];
  if (code === -404 || /啥都木有|Video not found/.test(raw)) {
    return hint ? HINT_MISSING[hint] : BY_CODE[-404];
  }
  if (/不存在或已失效|不存在/.test(raw) && hint) return HINT_MISSING[hint];
  if (code != null && BY_CODE[code] && /^-?\d+$/.test(raw))
    return BY_CODE[code];

  if (raw && !/^-?\d+$/.test(raw)) {
    const title = raw.length <= 16 ? raw.replace(/[。！]$/, "") : "出错了";
    return { title, detail: raw.endsWith("。") ? raw : `${raw}` };
  }
  return { title: "出错了", detail: fallback };
}

/** 行内提示用的一句话原因 */
export function formatBiliFailureText(
  input: unknown,
  hint?: BiliFailureHint,
  fallback = "操作失败，请稍后重试",
): string {
  const copy = describeBiliFailure(input, hint, fallback);
  if (!copy.detail || copy.detail === copy.title) return copy.title;
  if (copy.detail.includes(copy.title)) return copy.detail;
  return copy.detail;
}
