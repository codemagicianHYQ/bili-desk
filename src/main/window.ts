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

/**
 * Win32 始终开透明窗：Acrylic 可随时开关，切主题不必重建/重启。
 * 非玻璃主题由 CSS 实色盖住；最大化用 workArea 伪最大化。
 */
const USE_TRANSPARENT_WINDOW = process.platform === "win32";

/** 透明窗下系统最大化不可用，用 workArea 伪最大化 */
let boundsBeforePseudoMax: Electron.Rectangle | null = null;

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

function applyPseudoMaximize(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (boundsBeforePseudoMax) {
    win.setBounds(boundsBeforePseudoMax);
    boundsBeforePseudoMax = null;
    return;
  }
  boundsBeforePseudoMax = win.getBounds();
  const display = screen.getDisplayMatching(boundsBeforePseudoMax);
  win.setBounds(display.workArea);
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
    // 透明窗上用实色底，配合 CSS 不透壁纸
    win.setBackgroundColor("#121212");
    return false;
  }

  try {
    win.setBackgroundMaterial("acrylic");
  } catch {
    setWinMaterial(win, "mica");
  }
  win.setBackgroundColor("#00000000");
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
  boundsBeforePseudoMax = null;

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
    // 始终透明（Win），切玻璃只改材质，无需重启
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
    win.show();
    if (appStore.get("windowGlass")) {
      setTimeout(() => {
        if (!win.isDestroyed()) applyWindowGlassEffect(win, true);
      }, 80);
      setTimeout(() => {
        if (!win.isDestroyed()) applyWindowGlassEffect(win, true);
      }, 300);
    }
  });

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

/** 供 IPC：透明窗伪最大化切换 */
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
