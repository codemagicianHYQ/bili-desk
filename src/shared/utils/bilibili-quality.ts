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

/** 控制栏短标签，避免「1080P 高清」把全屏按钮挤出视口 */
export function shortQualityLabel(qn: number, fullLabel?: string): string {
  if (qn === BILI_AUTO_QN) return "自动";
  const full = (fullLabel || formatBiliQualityLabel(qn)).trim();
  const match = full.match(/^(8K|4K|HDR|杜比视界|\d+P(?:\+|60)?)/i);
  return match?.[1] ?? full.split(/\s+/)[0] ?? full;
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

export function parsePlayQualities(data: {
  accept_quality?: number[];
  accept_description?: string[];
  support_formats?: Array<{
    quality?: number;
    new_description?: string;
    display_desc?: string;
    description?: string;
  }>;
}): Array<{ qn: number; label: string }> {
  const formats = data.support_formats;
  if (Array.isArray(formats) && formats.length > 0) {
    return buildQualityOptions(
      formats.map((item) => Number(item.quality)),
      formats.map(
        (item) =>
          item.new_description || item.display_desc || item.description || "",
      ),
    );
  }
  return buildQualityOptions(
    data.accept_quality ?? [],
    data.accept_description,
  );
}

export function mergeQualityOptions(
  ...lists: Array<Array<{ qn: number; label: string }> | undefined>
): Array<{ qn: number; label: string }> {
  const qns: number[] = [];
  const labels: string[] = [];
  const seen = new Set<number>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (!Number.isFinite(item.qn) || item.qn <= 0 || seen.has(item.qn)) {
        continue;
      }
      seen.add(item.qn);
      qns.push(item.qn);
      labels.push(item.label);
    }
  }
  return buildQualityOptions(qns, labels);
}
