import type Artplayer from "artplayer";
import type { ComponentOption } from "artplayer/types/component";

const ICON_OS_ENTER = `<svg class="icon" width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M625.777778 256h142.222222V398.222222h113.777778V142.222222H625.777778v113.777778zM256 398.222222V256H398.222222v-113.777778H142.222222V398.222222h113.777778zM768 625.777778v142.222222H625.777778v113.777778h256V625.777778h-113.777778zM398.222222 768H256V625.777778h-113.777778v256H398.222222v-113.777778z"/></svg>`;
const ICON_OS_EXIT = `<svg class="icon" width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M768 298.666667h170.666667v85.333333h-256V128h85.333333v170.666667zM341.333333 384H85.333333V298.666667h170.666667V128h85.333333v256z m426.666667 341.333333v170.666667h-85.333333v-256h256v85.333333h-170.666667zM341.333333 640v256H256v-170.666667H85.333333v-85.333333h256z"/></svg>`;

/** 网页全屏：铺满应用窗口，不是显示器全屏 */
const ICON_WEB_ENTER = `<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v14H3V5zm2 2v10h14V7H5z"/><path d="M1 2h4v2H3v2H1V2zm18 0h4v4h-2V4h-2V2zM1 18h2v2h2v2H1v-4zm20 2h-2v2h4v-4h-2v2z"/></svg>`;
const ICON_WEB_EXIT = `<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v14H3V5zm2 2v10h14V7H5z"/><path d="M8 9h8v6H8V9z"/></svg>`;

type FillMode = "none" | "web" | "os";

const controllers = new WeakMap<Artplayer, FillController>();

export function setPlayerFillLayout(on: boolean) {
  document.documentElement.classList.toggle("bili-player-fill", on);
  document.documentElement.classList.toggle("bili-os-fullscreen", on);
}

/** @deprecated 与 setPlayerFillLayout 相同，保留给旧调用 */
export function setOsFullscreenLayout(on: boolean) {
  setPlayerFillLayout(on);
}

export function bindPlayerResize(art: Artplayer, container: HTMLElement) {
  let lastWidth = 0;
  let lastHeight = 0;
  let frame = 0;
  let disposed = false;

  const emitIfChanged = (width: number, height: number) => {
    if (disposed) return;
    if (width < 2 || height < 2) return;
    if (Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) {
      return;
    }
    lastWidth = width;
    lastHeight = height;
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      try {
        art.emit("resize");
      } catch {
        // Artplayer 销毁后忽略
      }
    });
  };

  const onWinResize = () => {
    emitIfChanged(container.clientWidth, container.clientHeight);
  };

  window.addEventListener("resize", onWinResize);
  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    emitIfChanged(box.width, box.height);
  });
  observer.observe(container);

  return () => {
    disposed = true;
    window.removeEventListener("resize", onWinResize);
    observer.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  };
}

function paint(
  element: HTMLElement | null,
  selector: string,
  on: boolean,
  enterIcon: string,
  exitIcon: string,
  enterLabel: string,
  exitLabel: string,
) {
  if (!element) return;
  const btn = element.querySelector<HTMLElement>(selector);
  if (!btn) return;
  btn.innerHTML = on ? exitIcon : enterIcon;
  const label = on ? exitLabel : enterLabel;
  btn.setAttribute("aria-label", label);
  element.setAttribute("aria-label", label);
  element.setAttribute("data-index-tip", label);
}

function afterLayout(art: Artplayer) {
  art.emit("resize");
  const video = art.video as HTMLVideoElement | undefined;
  if (!video || video.paused) return;
  void video.play().catch(() => undefined);
}

class FillController {
  mode: FillMode = "none";
  pending = false;
  disposed = false;
  webEl: HTMLElement | null = null;
  osEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private onKeyDown: ((event: KeyboardEvent) => void) | null = null;
  private onDblClick: (() => void) | null = null;
  private onWebFullscreen: ((value: boolean) => void) | null = null;
  private onToggleOs: (() => void) | null = null;
  private onToggleWeb: (() => void) | null = null;

  constructor(private art: Artplayer) {
    this.onDblClick = () => {
      void this.apply(this.mode === "os" ? "none" : "os");
    };
    this.art.on("dblclick", this.onDblClick);

    this.onWebFullscreen = (value: boolean) => {
      if (this.art.fullscreenWeb) this.art.fullscreenWeb = false;
      void this.apply(value ? "web" : this.mode === "web" ? "none" : this.mode);
    };
    this.art.on("fullscreenWeb", this.onWebFullscreen);

    this.onToggleOs = () => {
      void this.apply(this.mode === "os" ? "none" : "os");
    };
    this.art.on("bili-toggle-fullscreen", this.onToggleOs);

    this.onToggleWeb = () => {
      void this.apply(this.mode === "web" ? "none" : "web");
    };
    this.art.on("bili-toggle-web-fullscreen", this.onToggleWeb);

    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || this.mode === "none") return;
      event.preventDefault();
      event.stopPropagation();
      // 官网：屏幕全屏 Esc → 网页全屏；再 Esc 才退出
      void this.apply(this.mode === "os" ? "web" : "none");
    };
    document.addEventListener("keydown", this.onKeyDown);

    this.unsubscribe = window.biliDesk.app.onFullscreenChange((on) => {
      if (this.disposed) return;
      if (on) {
        if (this.mode !== "os") {
          this.mode = "os";
          setPlayerFillLayout(true);
          this.sync();
          requestAnimationFrame(() => afterLayout(this.art));
        }
        return;
      }
      if (this.mode === "os") {
        this.mode = "none";
        setPlayerFillLayout(false);
        this.sync();
        requestAnimationFrame(() => afterLayout(this.art));
      }
    });
  }

  sync() {
    paint(
      this.webEl,
      ".bili-web-fs-btn",
      this.mode === "web",
      ICON_WEB_ENTER,
      ICON_WEB_EXIT,
      "网页全屏",
      "退出网页全屏",
    );
    paint(
      this.osEl,
      ".bili-fs-btn",
      this.mode === "os",
      ICON_OS_ENTER,
      ICON_OS_EXIT,
      "全屏",
      "退出全屏",
    );
  }

  async apply(next: FillMode) {
    if (this.disposed || this.pending || next === this.mode) return;
    this.pending = true;
    const prev = this.mode;
    try {
      if (this.art.fullscreenWeb) this.art.fullscreenWeb = false;

      if (next === "none") {
        this.mode = "none";
        this.sync();
        if (prev === "os") {
          await window.biliDesk.app.setFullscreen(false);
        }
        setPlayerFillLayout(false);
        requestAnimationFrame(() => afterLayout(this.art));
        return;
      }

      setPlayerFillLayout(true);
      this.mode = next;
      this.sync();
      if (next === "os" && prev !== "os") {
        await window.biliDesk.app.setFullscreen(true);
      } else if (next === "web" && prev === "os") {
        await window.biliDesk.app.setFullscreen(false);
      }
      requestAnimationFrame(() => afterLayout(this.art));
    } catch {
      this.mode = "none";
      setPlayerFillLayout(false);
      this.sync();
    } finally {
      this.pending = false;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.onDblClick) this.art.off("dblclick", this.onDblClick);
    if (this.onWebFullscreen) {
      this.art.off("fullscreenWeb", this.onWebFullscreen);
    }
    if (this.onToggleOs) {
      this.art.off("bili-toggle-fullscreen", this.onToggleOs);
    }
    if (this.onToggleWeb) {
      this.art.off("bili-toggle-web-fullscreen", this.onToggleWeb);
    }
    if (this.onKeyDown) document.removeEventListener("keydown", this.onKeyDown);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.webEl = null;
    this.osEl = null;
    const wasOs = this.mode === "os";
    this.mode = "none";
    setPlayerFillLayout(false);
    if (wasOs) {
      void window.biliDesk.app.setFullscreen(false);
    }
  }
}

function controllerFor(art: Artplayer): FillController {
  let current = controllers.get(art);
  if (!current || current.disposed) {
    current = new FillController(art);
    controllers.set(art, current);
  }
  return current;
}

export function exitPlayerFill(art: Artplayer | null | undefined) {
  if (art) {
    const current = controllers.get(art);
    if (current && !current.disposed) {
      void current.apply("none");
      return;
    }
  }
  setPlayerFillLayout(false);
  void window.biliDesk.app.setFullscreen(false);
}

/**
 * 网页全屏：播放器铺满应用窗口，侧栏/顶栏隐藏，窗口本身不进系统全屏。
 * 不要用 art.fullscreenWeb：会把节点挪到 body，DASH/MSE 容易卡死。
 */
export function createWebFullscreenControl(): ComponentOption {
  let controlEl: HTMLElement | null = null;
  let artRef: Artplayer | null = null;

  return {
    name: "bili-web-fullscreen",
    position: "right",
    index: 68,
    html: `<div class="bili-web-fs-btn" aria-label="网页全屏">${ICON_WEB_ENTER}</div>`,
    tooltip: "网页全屏",
    mounted(this: Artplayer, element) {
      controlEl = element;
      artRef = this;
      element.classList.add("bili-web-fs-control");
      const controller = controllerFor(this);
      controller.webEl = element;
      controller.sync();
    },
    click(_component, event) {
      event.preventDefault();
      event.stopPropagation();
      const art = artRef;
      if (!art) return;
      const controller = controllerFor(art);
      void controller.apply(controller.mode === "web" ? "none" : "web");
    },
    beforeUnmount() {
      const art = artRef;
      if (art) {
        const controller = controllers.get(art);
        if (controller) {
          if (controller.webEl === controlEl) controller.webEl = null;
          if (!controller.webEl && !controller.osEl) controller.dispose();
        }
      }
      controlEl = null;
      artRef = null;
    },
  };
}

/**
 * Electron 窗口全屏（显示器铺满）。布局与网页全屏共用，另外再 setFullscreen。
 */
export function createOsFullscreenControl(): ComponentOption {
  let controlEl: HTMLElement | null = null;
  let artRef: Artplayer | null = null;

  return {
    name: "bili-fullscreen",
    position: "right",
    index: 70,
    html: `<div class="bili-fs-btn" aria-label="全屏">${ICON_OS_ENTER}</div>`,
    tooltip: "全屏",
    mounted(this: Artplayer, element) {
      controlEl = element;
      artRef = this;
      element.classList.add("bili-fs-control");
      const controller = controllerFor(this);
      controller.osEl = element;
      controller.sync();
    },
    click(_component, event) {
      event.preventDefault();
      event.stopPropagation();
      const art = artRef;
      if (!art) return;
      const controller = controllerFor(art);
      void controller.apply(controller.mode === "os" ? "none" : "os");
    },
    beforeUnmount() {
      const art = artRef;
      if (art) {
        const controller = controllers.get(art);
        if (controller) {
          if (controller.osEl === controlEl) controller.osEl = null;
          if (!controller.webEl && !controller.osEl) controller.dispose();
        }
      }
      controlEl = null;
      artRef = null;
    },
  };
}
