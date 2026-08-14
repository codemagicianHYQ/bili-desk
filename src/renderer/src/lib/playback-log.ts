export type PlaybackLogContext = Record<
  string,
  string | number | boolean | null | undefined
>;

function safeHost(url?: string): string {
  if (!url) return "-";
  if (url.startsWith("data:")) return "dash-mpd";
  try {
    return new URL(url).host || "-";
  } catch {
    return "-";
  }
}

export function describeMediaError(video?: HTMLVideoElement | null): string {
  if (!video) return "video 元素不存在";
  const err = video.error;
  const ready = `readyState=${video.readyState} networkState=${video.networkState}`;
  if (!err) return ready;
  const names: Record<number, string> = {
    1: "MEDIA_ERR_ABORTED 加载中止",
    2: "MEDIA_ERR_NETWORK 网络错误",
    3: "MEDIA_ERR_DECODE 解码失败",
    4: "MEDIA_ERR_SRC_NOT_SUPPORTED 格式不支持",
  };
  const name = names[err.code] ?? `MediaError code=${err.code}`;
  const extra = err.message?.trim();
  return extra ? `${name}：${extra}（${ready}）` : `${name}（${ready}）`;
}

export function describeDashError(event: unknown): string {
  if (event == null) return "dash.js 未知错误";
  if (typeof event === "string") return event;
  if (typeof event !== "object") return String(event);

  const record = event as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : record;
  const code = nested.code ?? record.code ?? nested.type ?? record.type;
  const message = nested.message ?? record.message;
  const parts = [
    code != null ? `code=${String(code)}` : null,
    typeof message === "string" && message.trim() ? message.trim() : null,
  ].filter(Boolean);
  return parts.length > 0 ? `dash.js ${parts.join(" ")}` : "dash.js 错误";
}

export function logPlayback(
  event: string,
  context: PlaybackLogContext,
  extra?: unknown,
): void {
  const { url, ...rest } = context;
  const payload = {
    ...rest,
    host: rest.host ?? (typeof url === "string" ? safeHost(url) : undefined),
  };
  if (extra !== undefined) {
    console.warn(`[BiliDesk][player] ${event}`, payload, extra);
    return;
  }
  console.warn(`[BiliDesk][player] ${event}`, payload);
}
