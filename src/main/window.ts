import { BrowserWindow, shell, app, nativeImage } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import { IPC } from "@shared/ipc-channels";
import {
  isBiliUrl,
  isInternalAppUrl,
  resolveInAppPathFromUrl,
} from "@shared/utils/bili-app-link";
import { appStore } from "./store/app-store";

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

/**
 * 液态玻璃 = 系统 Acrylic 磨砂透桌面。
 * 必须 transparent + #00000000；材质要在 show 前后各设一次，否则客户端常是死灰。
 */
export function applyWindowGlassEffect(
  win: BrowserWindow,
  enabled: boolean,
): boolean {
  if (win.isDestroyed()) return false;

  appStore.set("windowGlass", enabled);

  if (process.platform === "win32") {
    try {
      win.setBackgroundMaterial(enabled ? "acrylic" : "none");
    } catch (err) {
      console.warn("[BiliDesk] setBackgroundMaterial failed", err);
    }
  }

  win.setBackgroundColor(enabled ? "#00000000" : "#121212");
  return enabled;
}

export function createMainWindow(): BrowserWindow {
  const icon = resolveAppIcon();
  const glassOn = Boolean(appStore.get("windowGlass"));

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: "BiliDesk",
    transparent: true,
    backgroundColor: "#00000000",
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
    // show 前再刷一次材质，避免客户端区域灰死
    if (appStore.get("windowGlass")) {
      applyWindowGlassEffect(win, true);
    }
    win.show();
    if (appStore.get("windowGlass")) {
      setTimeout(() => {
        if (!win.isDestroyed()) applyWindowGlassEffect(win, true);
      }, 50);
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
