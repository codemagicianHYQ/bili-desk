import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 全局弹层必须高于：
 * - Artplayer 控制条（会单独合成图层）
 * - OS 全屏舞台 `.bili-player-stage`（z-index: 10000）
 * 不要用 z-50：写在页面树里会被 overflow/transform 锁进中间栏。
 */
export const APP_OVERLAY_ZCLASS = "z-[20000]";

export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
