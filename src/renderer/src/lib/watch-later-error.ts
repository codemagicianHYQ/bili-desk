export const TOVIEW_FULL_ERROR = "TOVIEW_FULL";
export const TOVIEW_FULL_MESSAGE = "稍后再看已达上限";

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

function cleanIpcErrorMessage(message: string): string {
  const match = message.match(
    /Error invoking remote method '[^']+': (?:(?:Error|TypeError|RangeError): )?([\s\S]+)$/,
  );
  return match?.[1]?.trim() || message.trim();
}

export function isWatchLaterFullError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    message.includes(TOVIEW_FULL_ERROR) ||
    message.includes("90001") ||
    text.includes("列表已满") ||
    text.includes("稍后再看已满") ||
    (text.includes("1000") &&
      (text.includes("满") || text.includes("上限") || text.includes("最多")))
  );
}

export function formatWatchLaterError(err: unknown): string {
  const raw = cleanIpcErrorMessage(extractErrorMessage(err));

  if (isWatchLaterFullError(raw)) {
    return TOVIEW_FULL_MESSAGE;
  }
  if (raw.includes("412") || raw.includes("安全策略")) {
    return "请求被 B 站安全策略拦截，请稍后重试";
  }
  if (raw.includes("登录")) {
    return "请先登录后再添加稍后再看";
  }
  if (raw.includes("已被删除") || raw.includes("90003")) {
    return "该视频已被删除，无法添加";
  }

  return raw || "操作失败";
}
