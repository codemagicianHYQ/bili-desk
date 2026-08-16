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
  100: "智能修复",
  112: "1080P+ 高码率",
  116: "1080P60 高帧率",
  120: "4K 超清",
  125: "HDR 真彩",
  126: "杜比视界",
  127: "8K 超高清",
  129: "HDR Vivid",
};

/** 大会员画质：720P60 / 1080P+ / 1080P60 / 4K / HDR / 杜比 / 8K */
const VIP_QUALITY_QNS = new Set([74, 100, 112, 116, 120, 125, 126, 127, 129]);

export interface PlayQualityOption {
  qn: number;
  label: string;
  needVip?: boolean;
  needLogin?: boolean;
  superscript?: string;
}

export interface PlayPrivilege {
  isVip: boolean;
  trialAble: boolean;
  trialRemaining: number | null;
}

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

export function isVipQuality(qn: number): boolean {
  return VIP_QUALITY_QNS.has(qn);
}

export function canUseVipQuality(privilege: PlayPrivilege): boolean {
  if (privilege.isVip) return true;
  return privilege.trialAble && (privilege.trialRemaining ?? 0) > 0;
}

/** 已确认无大会员且试看次数用尽时拦截；次数未知时交给服务端 */
export function isVipQualityBlocked(privilege: PlayPrivilege): boolean {
  if (privilege.isVip) return false;
  return privilege.trialRemaining != null && privilege.trialRemaining <= 0;
}

export function vipQualityBlockedNotice(qn: number): string {
  const label = shortQualityLabel(qn, formatBiliQualityLabel(qn));
  return `开通大会员即可观看${label}，普通会员每月可试看 5 次`;
}

export function vipQualityTrialNotice(
  qn: number,
  remainingAfter: number,
): string {
  const label = shortQualityLabel(qn, formatBiliQualityLabel(qn));
  if (remainingAfter <= 0) {
    return `${label} 试看已结束，开通大会员可继续观看`;
  }
  return `正在试看${label}，本月剩余 ${remainingAfter} 次`;
}

export function buildQualityOptions(
  acceptQuality: number[],
  acceptDescription?: string[],
): PlayQualityOption[] {
  const seen = new Set<number>();
  const list: PlayQualityOption[] = [];
  acceptQuality.forEach((qn, index) => {
    if (!Number.isFinite(qn) || qn <= 0 || seen.has(qn)) return;
    seen.add(qn);
    list.push({
      qn,
      label: formatBiliQualityLabel(qn, acceptDescription?.[index]),
      needVip: isVipQuality(qn),
      needLogin: qn >= 64,
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
    superscript?: string;
    need_vip?: boolean;
    needVip?: boolean;
    need_login?: boolean;
    needLogin?: boolean;
  }>;
}): PlayQualityOption[] {
  const formats = data.support_formats;
  if (Array.isArray(formats) && formats.length > 0) {
    const seen = new Set<number>();
    const list: PlayQualityOption[] = [];
    for (const item of formats) {
      const qn = Number(item.quality);
      if (!Number.isFinite(qn) || qn <= 0 || seen.has(qn)) continue;
      seen.add(qn);
      const needVip =
        typeof item.need_vip === "boolean"
          ? item.need_vip
          : typeof item.needVip === "boolean"
            ? item.needVip
            : isVipQuality(qn);
      const needLogin =
        typeof item.need_login === "boolean"
          ? item.need_login
          : typeof item.needLogin === "boolean"
            ? item.needLogin
            : qn >= 64;
      list.push({
        qn,
        label: formatBiliQualityLabel(
          qn,
          item.new_description || item.display_desc || item.description || "",
        ),
        needVip,
        needLogin,
        superscript: item.superscript?.trim() || undefined,
      });
    }
    list.sort((a, b) => b.qn - a.qn);
    return list;
  }
  return buildQualityOptions(
    data.accept_quality ?? [],
    data.accept_description,
  );
}

export function mergeQualityOptions(
  ...lists: Array<Array<PlayQualityOption> | undefined>
): PlayQualityOption[] {
  const map = new Map<number, PlayQualityOption>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (!Number.isFinite(item.qn) || item.qn <= 0) continue;
      const prev = map.get(item.qn);
      if (!prev) {
        map.set(item.qn, { ...item });
        continue;
      }
      map.set(item.qn, {
        ...prev,
        ...item,
        label: item.label || prev.label,
        needVip: item.needVip ?? prev.needVip,
        needLogin: item.needLogin ?? prev.needLogin,
        superscript: item.superscript || prev.superscript,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.qn - a.qn);
}

export function parsePlayPrivilegeFromPayload(
  data: Record<string, unknown> | undefined,
): Partial<PlayPrivilege> {
  if (!data) return {};
  const trial = (data.qn_trial_info ?? data.qnTrialInfo) as
    | Record<string, unknown>
    | undefined;
  const vip = data.vip as Record<string, unknown> | undefined;
  const result: Partial<PlayPrivilege> = {};
  if (vip && typeof vip === "object") {
    result.isVip = Number(vip.status) === 1;
  } else if (data.vipStatus != null) {
    result.isVip = Number(data.vipStatus) === 1;
  }
  if (trial && typeof trial === "object") {
    if (typeof trial.trial_able === "boolean") {
      result.trialAble = trial.trial_able;
    } else if (typeof trial.trialAble === "boolean") {
      result.trialAble = trial.trialAble;
    }
    const remaining = Number(trial.remaining_times ?? trial.remainingTimes);
    if (Number.isFinite(remaining)) {
      result.trialRemaining = Math.max(0, remaining);
      if (result.trialAble == null) result.trialAble = remaining > 0;
    }
  }
  return result;
}

export function mergePlayPrivilege(
  ...parts: Array<Partial<PlayPrivilege> | undefined>
): PlayPrivilege {
  const merged: PlayPrivilege = {
    isVip: false,
    trialAble: false,
    trialRemaining: null,
  };
  for (const part of parts) {
    if (!part) continue;
    if (typeof part.isVip === "boolean") merged.isVip = part.isVip;
    if (typeof part.trialAble === "boolean") merged.trialAble = part.trialAble;
    if (part.trialRemaining != null && Number.isFinite(part.trialRemaining)) {
      merged.trialRemaining = Math.max(0, part.trialRemaining);
    }
  }
  if (merged.isVip) {
    merged.trialAble = false;
  }
  return merged;
}
