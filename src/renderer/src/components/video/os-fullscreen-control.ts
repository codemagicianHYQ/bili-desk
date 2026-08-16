import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";

const ICON_ENTER = `<svg class="icon" width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M625.777778 256h142.222222V398.222222h113.777778V142.222222H625.777778v113.777778zM256 398.222222V256H398.222222v-113.777778H142.222222V398.222222h113.777778zM768 625.777778v142.222222H625.777778v113.777778h256V625.777778h-113.777778zM398.222222 768H256V625.777778h-113.777778v256H398.222222v-113.777778z"/></svg>`;
const ICON_EXIT = `<svg class="icon" width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M768 298.666667h170.666667v85.333333h-256V128h85.333333v170.666667zM341.333333 384H85.333333V298.666667h170.666667V128h85.333333v256z m426.666667 341.333333v170.666667h-85.333333v-256h256v85.333333h-170.666667zM341.333333 640v256H256v-170.666667H85.333333v-85.333333h256z"/></svg>`;

export function setOsFullscreenLayout(on: boolean) {
  document.documentElement.classList.toggle("bili-os-fullscreen", on);
}

function paint(element: HTMLElement, on: boolean) {
  const btn = element.querySelector<HTMLElement>(".bili-fs-btn");
  if (!btn) return;
  btn.innerHTML = on ? ICON_EXIT : ICON_ENTER;
  btn.setAttribute("aria-label", on ? "退出全屏" : "全屏");
}

function kickPlayback(art: Artplayer) {
  const video = art.video as HTMLVideoElement | undefined;
  if (!video || video.paused) return;
  void video.play().catch(() => undefined);
}

/**
 * Electron 窗口全屏。不要走 HTML5 requestFullscreen，也不要 art.fullscreenWeb：
 * Artplayer 默认会把播放器挪到 body，DASH/MSE 画面会卡死，只剩声音。
 */
export function createOsFullscreenControl(): ComponentOption {
  let controlEl: HTMLElement | null = null;
  let artRef: Artplayer | null = null;
  let osOn = false;
  let webBeforeOs = false;
  let unsubscribe: (() => void) | null = null;
  let pending = false;

  const syncIcon = () => {
    if (controlEl) paint(controlEl, osOn);
  };

  const apply = async (art: Artplayer, next: boolean) => {
    if (pending || next === osOn) return;
    pending = true;
    try {
      if (next) {
        webBeforeOs = art.fullscreenWeb;
        if (art.fullscreenWeb) art.fullscreenWeb = false;
        setOsFullscreenLayout(true);
        osOn = true;
        syncIcon();
        await window.biliDesk.app.setFullscreen(true);
        requestAnimationFrame(() => kickPlayback(art));
      } else {
        osOn = false;
        syncIcon();
        await window.biliDesk.app.setFullscreen(false);
        setOsFullscreenLayout(false);
        if (webBeforeOs) art.fullscreenWeb = true;
        requestAnimationFrame(() => kickPlayback(art));
      }
    } catch {
      osOn = false;
      setOsFullscreenLayout(false);
      syncIcon();
    } finally {
      pending = false;
    }
  };

  return {
    name: "bili-fullscreen",
    position: "right",
    index: 70,
    html: `<div class="bili-fs-btn" aria-label="全屏">${ICON_ENTER}</div>`,
    tooltip: "全屏",
    mounted(this: Artplayer, element) {
      controlEl = element;
      artRef = this;
      element.classList.add("bili-fs-control");
      unsubscribe = window.biliDesk.app.onFullscreenChange((on) => {
        const art = artRef;
        if (!art) return;
        if (on === osOn) {
          syncIcon();
          return;
        }
        osOn = on;
        setOsFullscreenLayout(on);
        if (!on && webBeforeOs && !art.fullscreenWeb) {
          art.fullscreenWeb = true;
        }
        if (on) requestAnimationFrame(() => kickPlayback(art));
        syncIcon();
      });
    },
    click(_component, event) {
      event.preventDefault();
      event.stopPropagation();
      const art = artRef;
      if (!art) return;
      void apply(art, !osOn);
    },
    beforeUnmount() {
      unsubscribe?.();
      unsubscribe = null;
      controlEl = null;
      artRef = null;
      setOsFullscreenLayout(false);
      if (osOn) {
        osOn = false;
        void window.biliDesk.app.setFullscreen(false);
      }
    },
  };
}
