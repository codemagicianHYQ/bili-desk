import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";

const ICON_ENTER = `<svg class="icon" width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M625.777778 256h142.222222V398.222222h113.777778V142.222222H625.777778v113.777778zM256 398.222222V256H398.222222v-113.777778H142.222222V398.222222h113.777778zM768 625.777778v142.222222H625.777778v113.777778h256V625.777778h-113.777778zM398.222222 768H256V625.777778h-113.777778v256H398.222222v-113.777778z"/></svg>`;
const ICON_EXIT = `<svg class="icon" width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M768 298.666667h170.666667v85.333333h-256V128h85.333333v170.666667zM341.333333 384H85.333333V298.666667h170.666667V128h85.333333v256z m426.666667 341.333333v170.666667h-85.333333v-256h256v85.333333h-170.666667zM341.333333 640v256H256v-170.666667H85.333333v-85.333333h256z"/></svg>`;

export function setOsFullscreenLayout(on: boolean) {
  document.documentElement.classList.toggle("bili-os-fullscreen", on);
}

export function bindPlayerResize(art: Artplayer, container: HTMLElement) {
  const emit = () => art.emit("resize");
  window.addEventListener("resize", emit);
  const observer = new ResizeObserver(emit);
  observer.observe(container);
  return () => {
    window.removeEventListener("resize", emit);
    observer.disconnect();
  };
}

function paint(element: HTMLElement, on: boolean) {
  const btn = element.querySelector<HTMLElement>(".bili-fs-btn");
  if (!btn) return;
  btn.innerHTML = on ? ICON_EXIT : ICON_ENTER;
  btn.setAttribute("aria-label", on ? "退出全屏" : "全屏");
}

function afterLayout(art: Artplayer) {
  art.emit("resize");
  const video = art.video as HTMLVideoElement | undefined;
  if (!video || video.paused) return;
  void video.play().catch(() => undefined);
}

/**
 * Electron 窗口全屏。不要走 HTML5 requestFullscreen，也不要 art.fullscreenWeb：
 * Artplayer 网页全屏只相对播放器容器 100%，会被视频页栏宽卡住；
 * FULLSCREEN_WEB_IN_BODY 还会把节点挪到 body，DASH/MSE 画面会卡死。
 */
export function createOsFullscreenControl(): ComponentOption {
  let controlEl: HTMLElement | null = null;
  let artRef: Artplayer | null = null;
  let osOn = false;
  let unsubscribe: (() => void) | null = null;
  let pending = false;
  let onKeyDown: ((event: KeyboardEvent) => void) | null = null;
  let onDblClick: (() => void) | null = null;
  let onWebFullscreen: ((value: boolean) => void) | null = null;

  const syncIcon = () => {
    if (controlEl) paint(controlEl, osOn);
  };

  const apply = async (art: Artplayer, next: boolean) => {
    if (pending || next === osOn) return;
    pending = true;
    try {
      if (art.fullscreenWeb) art.fullscreenWeb = false;
      if (next) {
        setOsFullscreenLayout(true);
        osOn = true;
        syncIcon();
        await window.biliDesk.app.setFullscreen(true);
        requestAnimationFrame(() => afterLayout(art));
      } else {
        osOn = false;
        syncIcon();
        await window.biliDesk.app.setFullscreen(false);
        setOsFullscreenLayout(false);
        requestAnimationFrame(() => afterLayout(art));
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

      onDblClick = () => {
        const art = artRef;
        if (art) void apply(art, !osOn);
      };
      this.on("dblclick", onDblClick);

      onWebFullscreen = (value: boolean) => {
        const art = artRef;
        if (!art || !value) return;
        art.fullscreenWeb = false;
        void apply(art, true);
      };
      this.on("fullscreenWeb", onWebFullscreen);

      onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !osOn) return;
        const art = artRef;
        if (!art) return;
        event.preventDefault();
        void apply(art, false);
      };
      document.addEventListener("keydown", onKeyDown);

      unsubscribe = window.biliDesk.app.onFullscreenChange((on) => {
        const art = artRef;
        if (!art) return;
        if (on === osOn) {
          syncIcon();
          return;
        }
        osOn = on;
        setOsFullscreenLayout(on);
        requestAnimationFrame(() => afterLayout(art));
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
      const art = artRef;
      if (onDblClick) art?.off("dblclick", onDblClick);
      if (onWebFullscreen) art?.off("fullscreenWeb", onWebFullscreen);
      if (onKeyDown) document.removeEventListener("keydown", onKeyDown);
      onDblClick = null;
      onWebFullscreen = null;
      onKeyDown = null;
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
