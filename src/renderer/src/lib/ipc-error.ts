/** 解开 Electron IPC 包装后的真实错误文案 */
export function extractIpcErrorMessage(err: unknown): string {
  let message = "";
  if (err instanceof Error) message = err.message;
  else if (typeof err === "string") message = err;
  else if (err != null) message = String(err);

  const match = message.match(
    /Error invoking remote method '[^']+': (?:(?:Error|TypeError|RangeError): )?([\s\S]+)$/,
  );
  return (match?.[1] ?? message).trim();
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

  if (raw.includes("安全策略") || raw.includes("412") || raw.includes("-412")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }

  if (raw.includes("风控") || raw.includes("-352")) {
    return "投稿接口触发风控，请稍后重试或重新登录";
  }

  return raw;
}
