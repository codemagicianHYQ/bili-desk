import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 全局弹层必须高于：
 * - Artplayer 控制条（会单独合成图层）
 * - OS 全屏舞台 `.bili-player-stage`（z-index: 10000）
 * - 侧栏/顶栏的 backdrop-filter（会锁住子元素图层，下拉会被视频卡片盖住）
 *
 * 下拉、菜单、对话框一律 OverlayPortal 挂到 document.body，
 * 用 fixed + APP_OVERLAY_ZCLASS。不要用 z-50 写在页面树里。
 */
export const APP_OVERLAY_ZCLASS = "z-[20000]";

export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
