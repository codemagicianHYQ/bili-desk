import { BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc-channels";
import { appStore } from "../store/app-store";
import type { Theme } from "@shared/types";
import { sanitizeExternalUrl } from "@shared/utils/external-url";
import { resolveInAppPathFromUrl } from "@shared/utils/bili-app-link";
import { resolveBiliUrl } from "../services/bili-link";

function windowFromEvent(
  event: Electron.IpcMainInvokeEvent,
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerAppIpc(): void {
  ipcMain.handle(IPC.APP_GET_THEME, () => appStore.get("theme"));
  ipcMain.handle(IPC.APP_SET_THEME, (_e, theme: Theme) => {
    appStore.set("theme", theme);
    return theme;
  });
  ipcMain.handle(IPC.APP_SET_FULLSCREEN, (event, on: boolean) => {
    const win = windowFromEvent(event);
    if (!win || win.isDestroyed()) return false;
    win.setFullScreen(Boolean(on));
    return win.isFullScreen();
  });
  ipcMain.handle(IPC.APP_GET_FULLSCREEN, (event) => {
    const win = windowFromEvent(event);
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  });
  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (event, raw: string) => {
    const url = sanitizeExternalUrl(raw);
    if (!url) throw new Error("不支持的链接");
    const inApp = resolveInAppPathFromUrl(url);
    if (inApp) {
      event.sender.send(IPC.APP_NAVIGATE, inApp);
      return;
    }
    await shell.openExternal(url);
  });
  ipcMain.handle(IPC.APP_RESOLVE_BILI_URL, (_event, raw: string) =>
    resolveBiliUrl(raw),
  );
  ipcMain.handle(IPC.APP_PROBE_SHORTCUT, (_event, accelerator: string) => {
    const combo = String(accelerator ?? "").trim();
    if (!combo) return { taken: false };
    let registered = false;
    try {
      registered = globalShortcut.register(combo, () => undefined);
      if (!registered) {
        return { taken: true, reason: "已被系统或其他软件占用" };
      }
      return { taken: false };
    } catch {
      return { taken: true, reason: "系统不允许注册该快捷键" };
    } finally {
      if (registered) globalShortcut.unregister(combo);
    }
  });
}
