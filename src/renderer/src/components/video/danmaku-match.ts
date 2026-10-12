import type { DanmakuFilter, DanmakuItem } from "@shared/types";

function crc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i);
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function midHashOf(mid: number): string {
  return crc32(String(mid)).toString(16).padStart(8, "0");
}

export function danmakuBlocked(
  item: DanmakuItem,
  filters: DanmakuFilter[],
): boolean {
  return filters.some((rule) => {
    if (rule.kind === "user") {
      const uid = Number(rule.text);
      if (!item.midHash || !Number.isFinite(uid)) return false;
      return item.midHash.toLowerCase() === midHashOf(uid);
    }
    if (rule.kind === "regex") {
      let source = rule.text.trim();
      let flags = "";
      const wrapped = source.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
      if (wrapped?.[1] != null) {
        source = wrapped[1];
        flags = (wrapped[2] ?? "").replace(/g/g, "");
      }
      try {
        return new RegExp(source, flags).test(item.text);
      } catch {
        return false;
      }
    }
    return rule.text ? item.text.includes(rule.text) : false;
  });
}
