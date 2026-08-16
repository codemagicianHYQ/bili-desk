/** 自动：由播放器按账号权限请求默认档 */
export const BILI_AUTO_QN = 0;
/** 登录用户常见最高免费档，接口会按权限自动降级 */
export const BILI_DEFAULT_QN = 80;

const BILI_QN_LABELS: Record<number, string> = {
  16: "360P 流畅",
  32: "480P 标清",
  64: "720P 准高清",
  74: "720P60 高帧率",
  80: "1080P 高清",
  112: "1080P+ 高码率",
  116: "1080P60 高帧率",
  120: "4K 超清",
  125: "HDR 真彩",
  126: "杜比视界",
  127: "8K 超高清",
};

export function formatBiliQualityLabel(qn: number, fallback?: string): string {
  return BILI_QN_LABELS[qn] ?? fallback?.trim() ?? `${qn}P`;
}

export function resolvePlayQn(qn?: number): number {
  if (qn == null || qn <= 0) return BILI_DEFAULT_QN;
  return qn;
}

export function buildQualityOptions(
  acceptQuality: number[],
  acceptDescription?: string[],
): Array<{ qn: number; label: string }> {
  const seen = new Set<number>();
  const list: Array<{ qn: number; label: string }> = [];
  acceptQuality.forEach((qn, index) => {
    if (!Number.isFinite(qn) || qn <= 0 || seen.has(qn)) return;
    seen.add(qn);
    list.push({
      qn,
      label: formatBiliQualityLabel(qn, acceptDescription?.[index]),
    });
  });
  list.sort((a, b) => b.qn - a.qn);
  return list;
}
