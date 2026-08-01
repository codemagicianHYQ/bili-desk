import { BrowserWindow, shell, app, nativeImage } from "electron";
import { existsSync } from "fs";
import { join } from "path";

function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, "icon.ico"),
        join(process.resourcesPath, "icon.png"),
        join(__dirname, "../../resources/icon.ico"),
        join(__dirname, "../../resources/icon.png"),
      ]
    : [
        join(__dirname, "../../resources/icon.ico"),
        join(__dirname, "../../resources/icon.png"),
      ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const image = nativeImage.createFromPath(path);
    if (!image.isEmpty()) return image;
  }
  return undefined;
}

export function createMainWindow(): BrowserWindow {
  const icon = resolveAppIcon();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: "BiliDesk",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}
