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

/** 液态玻璃要透桌面，Win 上必须透明窗。系统因此会禁用最大化，点击改由自己铺满工作区。 */
const USE_TRANSPARENT_WINDOW = process.platform === "win32";

let boundsBeforePseudoMax: Electron.Rectangle | null = null;

function keepMaximizeButton(win: BrowserWindow): void {
  if (win.isDestroyed() || process.platform !== "win32") return;
  win.setResizable(true);
  win.setMaximizable(true);
}

function applyPseudoMaximize(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (boundsBeforePseudoMax) {
    const restore = boundsBeforePseudoMax;
    boundsBeforePseudoMax = null;
    win.setBounds(restore);
    keepMaximizeButton(win);
    return;
  }
  const current = win.getBounds();
  boundsBeforePseudoMax = current;
  win.setBounds(screen.getDisplayMatching(current).workArea);
  keepMaximizeButton(win);
}

const WM_SYSCOMMAND = 0x0112;
const WM_NCLBUTTONDOWN = 0x00a1;
const WM_NCLBUTTONUP = 0x00a2;
const WM_NCLBUTTONDBLCLK = 0x00a3;
const SC_MAXIMIZE = 0xf030;
const SC_RESTORE = 0xf120;
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
  win.hookWindowMessage(WM_SYSCOMMAND, (wParam) => {
    const cmd = readMessageWord(wParam) & 0xfff0;
    if (cmd === SC_MAXIMIZE || cmd === SC_RESTORE) toggle();
  });
  win.hookWindowMessage(WM_NCLBUTTONDOWN, (wParam) => {
    if (readMessageWord(wParam) === HTMAXBUTTON) toggle();
  });
  win.hookWindowMessage(WM_NCLBUTTONUP, (wParam) => {
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
    hookCaptionMaximize(win);
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
