import { BrowserWindow, shell, app, nativeImage, screen } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc-channels";
import type { WindowState } from "@shared/types";
import {
  isBiliUrl,
  isInternalAppUrl,
  resolveInAppPathFromUrl,
} from "@shared/utils/bili-app-link";
import { appStore } from "./store/app-store";

/**
 * 液态玻璃要透桌面，Win 上必须透明窗。透明窗不能用系统最大化，
 * 所以「最大化」和播放器全屏都由这里自己铺满显示器。
 * 系统标题栏的按钮图标跟不上这种铺满，Win 上改由页面自己画标题栏。
 */
const USE_TRANSPARENT_WINDOW = process.platform === "win32";
export const USE_CUSTOM_TITLEBAR = USE_TRANSPARENT_WINDOW;

let boundsBeforePseudoMax: Electron.Rectangle | null = null;
let screenFilling = false;
let playerFullscreen = false;
let boundsBeforePlayerFullscreen: Electron.Rectangle | null = null;

function isCovering(): boolean {
  return screenFilling || playerFullscreen;
}

function keepMaximizeButton(win: BrowserWindow): void {
  if (win.isDestroyed() || process.platform !== "win32") return;
  // 铺满时可拉伸边框会在四周露出一圈缝，不能恢复
  if (isCovering()) return;
  win.setResizable(true);
  win.setMaximizable(true);
}

export function getWindowState(win: BrowserWindow): WindowState {
  if (win.isDestroyed()) return { maximized: false, fullscreen: false };
  if (USE_TRANSPARENT_WINDOW) {
    return { maximized: screenFilling, fullscreen: playerFullscreen };
  }
  return { maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
}

function emitWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.webContents.send(IPC.APP_WINDOW_STATE_CHANGED, getWindowState(win));
}

function raiseOverTaskbar(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.setAlwaysOnTop(true, "screen-saver");
  win.moveTop();
}

/**
 * 透明窗的可拉伸边框是透明的，画在窗口内侧，所以看起来四周离屏幕有一圈缝。
 * 只把这一圈边框推出屏幕。
 */
function resizeBorderDip(win: BrowserWindow, scaleFactor: number): number {
  const outer = win.getBounds();
  const content = win.getContentBounds();
  const left = Math.round(content.x - outer.x);
  const right = Math.round(outer.x + outer.width - (content.x + content.width));
  const bottom = Math.round(
    outer.y + outer.height - (content.y + content.height),
  );
  const side = Math.max(left, right, bottom);
  if (side > 0 && side <= 16) return side;
  return Math.max(1, Math.round(8 / (scaleFactor || 1)));
}

function screenFitBounds(
  area: Electron.Rectangle,
  border: number,
): Electron.Rectangle {
  return {
    x: area.x - border,
    y: area.y - border,
    width: area.width + border * 2,
    height: area.height + border * 2,
  };
}

/** 按窗口中心选显示器。系统 setFullScreen 看左上角，铺满后左上角在屏外，会跳到别的显示器。 */
function displayOfWindow(win: BrowserWindow): Electron.Display {
  const b = win.getBounds();
  return screen.getDisplayNearestPoint({
    x: Math.round(b.x + b.width / 2),
    y: Math.round(b.y + b.height / 2),
  });
}

function coverDisplay(win: BrowserWindow, display: Electron.Display): void {
  win.setHasShadow(false);
  win.setResizable(true);
  win.setBounds(display.bounds);
  const fitted = screenFitBounds(
    display.bounds,
    resizeBorderDip(win, display.scaleFactor),
  );
  win.setBounds(fitted);
  win.setResizable(false);
  win.setMaximizable(true);
  win.setMovable(false);
  win.setBounds(fitted);
  raiseOverTaskbar(win);
}

/** 显示器被拔掉后，还原位置可能整块落在屏外，挪回主屏工作区 */
function visibleBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      bounds.x < a.x + a.width - 80 &&
      bounds.x + bounds.width > a.x + 80 &&
      bounds.y < a.y + a.height - 40 &&
      bounds.y + bounds.height > a.y
    );
  });
  if (onScreen) return bounds;
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

function uncover(win: BrowserWindow, restore: Electron.Rectangle | null): void {
  win.setAlwaysOnTop(false);
  win.setHasShadow(true);
  win.setMovable(true);
  keepMaximizeButton(win);
  if (restore) win.setBounds(visibleBounds(restore));
}

/** 右上角最大化：铺满当前显示器的整块屏幕（含任务栏区域），再点一次还原。 */
function applyPseudoMaximize(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  // 播放器全屏时按最大化 / 双击标题栏：先退出全屏，不叠两层状态
  if (playerFullscreen) {
    setWindowFullscreen(win, false);
    return;
  }

  if (screenFilling) {
    const restore = boundsBeforePseudoMax;
    boundsBeforePseudoMax = null;
    screenFilling = false;
    uncover(win, restore);
    emitWindowState(win);
    return;
  }

  const display = displayOfWindow(win);
  boundsBeforePseudoMax = win.getBounds();
  screenFilling = true;
  coverDisplay(win, display);
  emitWindowState(win);
}

export function setWindowFullscreen(win: BrowserWindow, on: boolean): boolean {
  if (win.isDestroyed()) return false;
  if (!USE_TRANSPARENT_WINDOW) {
    win.setFullScreen(on);
    return win.isFullScreen();
  }
  if (on === playerFullscreen) return playerFullscreen;

  if (on) {
    const display = displayOfWindow(win);
    boundsBeforePlayerFullscreen = win.getBounds();
    playerFullscreen = true;
    coverDisplay(win, display);
  } else {
    const restore = boundsBeforePlayerFullscreen;
    boundsBeforePlayerFullscreen = null;
    playerFullscreen = false;
    if (screenFilling) {
      coverDisplay(win, displayOfWindow(win));
    } else {
      uncover(win, restore);
    }
  }
  win.webContents.send(IPC.APP_FULLSCREEN_CHANGED, playerFullscreen);
  emitWindowState(win);
  return playerFullscreen;
}

export function isWindowFullscreen(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  return USE_TRANSPARENT_WINDOW ? playerFullscreen : win.isFullScreen();
}

function bindCoverWatchers(win: BrowserWindow): void {
  win.on("blur", () => {
    if (!isCovering() || win.isDestroyed()) return;
    win.setAlwaysOnTop(false);
  });
  win.on("focus", () => {
    if (!isCovering() || win.isDestroyed()) return;
    raiseOverTaskbar(win);
  });
  // 系统偶尔仍会真正最大化透明窗（例如拖到屏幕顶端），收回来改走自己的铺满
  win.on("maximize", () => {
    if (win.isDestroyed()) return;
    win.unmaximize();
    // 双击标题栏时钩子会在下一拍自己切换，这里晚一点再看，避免切两次
    setTimeout(() => {
      if (!win.isDestroyed() && !isCovering()) applyPseudoMaximize(win);
    }, 50);
  });

  const refit = () => {
    if (!isCovering() || win.isDestroyed()) return;
    coverDisplay(win, displayOfWindow(win));
  };
  screen.on("display-metrics-changed", refit);
  screen.on("display-removed", refit);
  screen.on("display-added", refit);
  win.on("closed", () => {
    screen.off("display-metrics-changed", refit);
    screen.off("display-removed", refit);
    screen.off("display-added", refit);
  });

  // 页面重载后播放器状态从零开始，窗口不能还卡在播放器全屏里
  win.webContents.on("did-start-loading", () => {
    if (playerFullscreen) setWindowFullscreen(win, false);
  });
}

const WM_SYSCOMMAND = 0x0112;
const WM_NCLBUTTONDBLCLK = 0x00a3;
const SC_MAXIMIZE = 0xf030;
const HTCAPTION = 2;

function readMessageWord(value: Buffer): number {
  if (value.length >= 8) return Number(value.readBigUInt64LE(0));
  if (value.length >= 4) return value.readUInt32LE(0);
  return 0;
}

/**
 * 双击标题栏 / Win+↑ 走这里。
 * 不能处理 SC_RESTORE：从任务栏把最小化的窗口点回来也是 SC_RESTORE，会被误当成最大化。
 */
function hookCaptionMaximize(win: BrowserWindow): void {
  let lastToggle = 0;
  const toggle = () => {
    const now = Date.now();
    if (now - lastToggle < 300) return;
    lastToggle = now;
    setTimeout(() => applyPseudoMaximize(win), 0);
  };
  win.hookWindowMessage(WM_SYSCOMMAND, (wParam) => {
    if ((readMessageWord(wParam) & 0xfff0) === SC_MAXIMIZE) toggle();
  });
  win.hookWindowMessage(WM_NCLBUTTONDBLCLK, (wParam) => {
    if (readMessageWord(wParam) === HTCAPTION) toggle();
  });
}

function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, "icon.png"),
        join(process.resourcesPath, "icon.ico"),
        join(__dirname, "../../resources/icon.png"),
        join(__dirname, "../../resources/icon.ico"),
      ]
    : [
        join(__dirname, "../../resources/icon.png"),
        join(__dirname, "../../resources/icon.ico"),
      ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const image = nativeImage.createFromPath(path);
    if (!image.isEmpty()) return image;
  }
  return undefined;
}

function setWinMaterial(
  win: BrowserWindow,
  material: "none" | "acrylic" | "mica",
): void {
  if (process.platform !== "win32" || win.isDestroyed()) return;
  try {
    win.setBackgroundMaterial(material);
  } catch (err) {
    console.warn("[BiliDesk] setBackgroundMaterial failed", material, err);
  }
}

/** 液态玻璃：开/关 Acrylic，即时生效，不重建窗口 */
export function applyWindowGlassEffect(
  win: BrowserWindow,
  enabled: boolean,
): boolean {
  if (win.isDestroyed()) return false;

  appStore.set("windowGlass", enabled);
  if (enabled) {
    appStore.set("themePreset", "glass");
  }

  if (!enabled) {
    setWinMaterial(win, "none");
    win.setBackgroundColor("#121212");
    keepMaximizeButton(win);
    return false;
  }

  try {
    win.setBackgroundMaterial("acrylic");
  } catch {
    setWinMaterial(win, "mica");
  }
  win.setBackgroundColor("#00000000");
  keepMaximizeButton(win);
  return true;
}

export function createMainWindow(): BrowserWindow {
  const icon = resolveAppIcon();
  const glassOn =
    Boolean(appStore.get("windowGlass")) ||
    appStore.get("themePreset") === "glass";
  if (glassOn && !appStore.get("windowGlass")) {
    appStore.set("windowGlass", true);
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: "BiliDesk",
    maximizable: true,
    fullscreenable: true,
    transparent: USE_TRANSPARENT_WINDOW,
    backgroundColor: glassOn ? "#00000000" : "#121212",
    thickFrame: true,
    roundedCorners: false,
    ...(USE_CUSTOM_TITLEBAR ? { titleBarStyle: "hidden" as const } : {}),
    ...(process.platform === "win32"
      ? {
          backgroundMaterial: (glassOn ? "acrylic" : "none") as
            | "acrylic"
            | "none",
        }
      : {}),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.on("ready-to-show", () => {
    applyWindowGlassEffect(win, Boolean(appStore.get("windowGlass")));
    keepMaximizeButton(win);
    win.show();
    if (appStore.get("windowGlass")) {
      setTimeout(() => {
        if (!win.isDestroyed()) applyWindowGlassEffect(win, true);
      }, 80);
      setTimeout(() => {
        if (!win.isDestroyed()) applyWindowGlassEffect(win, true);
      }, 300);
    }
    setTimeout(() => keepMaximizeButton(win), 0);
    setTimeout(() => keepMaximizeButton(win), 300);
  });

  if (USE_TRANSPARENT_WINDOW) {
    boundsBeforePseudoMax = null;
    boundsBeforePlayerFullscreen = null;
    screenFilling = false;
    playerFullscreen = false;
    win.setAlwaysOnTop(false);
    hookCaptionMaximize(win);
    bindCoverWatchers(win);
  } else {
    win.on("maximize", () => emitWindowState(win));
    win.on("unmaximize", () => emitWindowState(win));
  }

  win.on("enter-full-screen", () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.APP_FULLSCREEN_CHANGED, true);
      emitWindowState(win);
    }
  });
  win.on("leave-full-screen", () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.APP_FULLSCREEN_CHANGED, false);
      emitWindowState(win);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const inApp = resolveInAppPathFromUrl(url);
    if (inApp) {
      win.webContents.send(IPC.APP_NAVIGATE, inApp);
      return { action: "deny" };
    }
    if (isInternalAppUrl(url)) {
      return { action: "deny" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalAppUrl(url)) return;
    event.preventDefault();
    const inApp = resolveInAppPathFromUrl(url);
    if (inApp) {
      win.webContents.send(IPC.APP_NAVIGATE, inApp);
      return;
    }
    if (isBiliUrl(url)) return;
    void shell.openExternal(url);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[BiliDesk] render-process-gone", details);
    if (details.reason === "clean-exit" || win.isDestroyed()) return;
    win.reload();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(
      process.env.ELECTRON_RENDERER_URL.replace("localhost", "127.0.0.1"),
    );
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

export function toggleWindowMaximize(win: BrowserWindow): WindowState {
  if (win.isDestroyed()) return { maximized: false, fullscreen: false };
  if (USE_TRANSPARENT_WINDOW) {
    applyPseudoMaximize(win);
    return getWindowState(win);
  }
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return getWindowState(win);
}
