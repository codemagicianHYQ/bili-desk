import {
  describeBiliFailure,
  formatBiliFailureText,
  stripIpcErrorText,
  type BiliFailureHint,
} from "@shared/bili-error";

/** 解开 Electron IPC 包装后的真实错误文案 */
export function extractIpcErrorMessage(err: unknown): string {
  return stripIpcErrorText(err);
}

/** 页面上展示的一句话原因（含删除、下架、未登录、风控等） */
export function formatDisplayedError(
  err: unknown,
  hint?: BiliFailureHint,
  fallback = "操作失败，请稍后重试",
): string {
  return formatBiliFailureText(err, hint, fallback);
}

/** 评论区被关闭（正常业务态，不是系统故障） */
export function isCommentClosedMessage(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    text.includes("关闭评论区") ||
    text.includes("评论区已关闭") ||
    text.includes("禁止评论") ||
    text.includes("评论功能已关闭")
  );
}

export function formatCommentLoadError(err: unknown): {
  closed: boolean;
  message: string;
} {
  const raw = extractIpcErrorMessage(err);
  if (isCommentClosedMessage(raw)) {
    return { closed: true, message: "UP主已关闭评论区" };
  }
  return {
    closed: false,
    message: formatDisplayedError(err, undefined, "评论加载失败"),
  };
}

/** UP 主页 / 用户空间相关错误，转成可读原因 */
export function formatUserSpaceError(err: unknown): string {
  const raw = extractIpcErrorMessage(err);
  if (!raw) return "加载失败，请稍后重试";

  if (
    raw.includes("啥都木有") ||
    raw.includes("用户不存在") ||
    raw.includes("账号已注销") ||
    raw.includes("用户已注销") ||
    raw.includes("该用户不存在") ||
    /(?:^|[^\d])-404(?:[^\d]|$)/.test(raw)
  ) {
    return "该用户不存在或账号已注销";
  }

  if (
    raw.includes("隐私") ||
    raw.includes("不可见") ||
    raw.includes("隐藏了") ||
    (raw.includes("无权访问") && raw.includes("隐私"))
  ) {
    return "该用户已设置隐私，无法查看主页内容";
  }

  if (
    raw.includes("访问权限不足") ||
    raw.includes("无权访问") ||
    raw.includes("没有权限") ||
    /(?:^|[^\d])-403(?:[^\d]|$)/.test(raw)
  ) {
    return "投稿列表暂时无法访问，请稍后重试或重新登录";
  }

  if (raw.includes("过于频繁") || raw.includes("-799")) {
    return "请求过于频繁，请稍后再试";
  }

  if (raw.includes("请求错误") || raw.includes("-400")) {
    return "翻页失败，请稍后重试";
  }

  if (raw.includes("安全策略") || raw.includes("412") || raw.includes("-412")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }

  if (raw.includes("风控") || raw.includes("-352")) {
    return "投稿接口触发风控，请稍后重试或重新登录";
  }

  return formatDisplayedError(err, "user", "加载失败，请稍后重试");
}

export interface ContentUnavailableCopy {
  title: string;
  detail: string;
}

/** 视频 / 动态打不开时的具体原因 */
export function describeContentUnavailable(
  kind: "video" | "dynamic",
  err: unknown,
): ContentUnavailableCopy {
  return describeBiliFailure(
    err,
    kind,
    kind === "video"
      ? "视频信息获取失败，请稍后重试。"
      : "动态加载失败，请稍后重试。",
  );
}
