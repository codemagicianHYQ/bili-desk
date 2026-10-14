import { BrowserWindow, shell, app, nativeImage, screen } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc-channels";
import {
  isBiliUrl,
  isInternalAppUrl,
  resolveInAppPathFromUrl,
} from "@shared/utils/bili-app-link";
import { appStore } from "./store/app-store";

/** 液态玻璃要透桌面，Win 上必须透明窗。系统因此会禁用最大化，点击改由自己铺满整块屏幕。 */
const USE_TRANSPARENT_WINDOW = process.platform === "win32";

let boundsBeforePseudoMax: Electron.Rectangle | null = null;
let screenFilling = false;

function keepMaximizeButton(win: BrowserWindow): void {
  if (win.isDestroyed() || process.platform !== "win32") return;
  win.setResizable(true);
  win.setMaximizable(true);
}

function raiseOverTaskbar(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.setAlwaysOnTop(true, "screen-saver");
  win.moveTop();
}

/**
 * 透明窗的可拉伸边框是透明的，画在窗口内侧，所以看起来四周离屏幕有一圈缝。
 * 只把这一圈边框推出屏幕，标题栏按钮仍留在屏幕里。
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

/**
 * 铺满当前显示器的整块屏幕（含任务栏区域）。
 * 只有点最大化 / 双击标题栏才会进出，聚焦窗口不会重新进入。
 */
function applyPseudoMaximize(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  if (screenFilling) {
    const restore = boundsBeforePseudoMax;
    boundsBeforePseudoMax = null;
    screenFilling = false;
    win.setAlwaysOnTop(false);
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setHasShadow(true);
    if (restore) win.setBounds(restore);
    keepMaximizeButton(win);
    return;
  }

  const current = win.getBounds();
  const display = screen.getDisplayMatching(current);
  boundsBeforePseudoMax = current;
  screenFilling = true;
  if (win.isFullScreen()) win.setFullScreen(false);
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
  win.setBounds(fitted);
  raiseOverTaskbar(win);
}

function bindScreenFillFocus(win: BrowserWindow): void {
  win.on("blur", () => {
    if (!screenFilling || win.isDestroyed()) return;
    win.setAlwaysOnTop(false);
  });
  win.on("focus", () => {
    if (!screenFilling || win.isDestroyed()) return;
    raiseOverTaskbar(win);
  });
}

const WM_NCLBUTTONDOWN = 0x00a1;
const WM_NCLBUTTONDBLCLK = 0x00a3;
const HTMAXBUTTON = 9;
const HTCAPTION = 2;

function readMessageWord(value: Buffer): number {
  if (value.length >= 8) return Number(value.readBigUInt64LE(0));
  if (value.length >= 4) return value.readUInt32LE(0);
  return 0;
}

function hookCaptionMaximize(win: BrowserWindow): void {
  let lastToggle = 0;
  const toggle = () => {
    const now = Date.now();
    if (now - lastToggle < 300) return;
    lastToggle = now;
    setTimeout(() => applyPseudoMaximize(win), 0);
  };
  win.hookWindowMessage(WM_NCLBUTTONDOWN, (wParam) => {
    if (readMessageWord(wParam) === HTMAXBUTTON) toggle();
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
    screenFilling = false;
    win.setAlwaysOnTop(false);
    hookCaptionMaximize(win);
    bindScreenFillFocus(win);
  }

  win.on("enter-full-screen", () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.APP_FULLSCREEN_CHANGED, true);
    }
  });
  win.on("leave-full-screen", () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.APP_FULLSCREEN_CHANGED, false);
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

export function toggleWindowMaximize(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  if (USE_TRANSPARENT_WINDOW) {
    applyPseudoMaximize(win);
    return Boolean(boundsBeforePseudoMax);
  }
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
}
