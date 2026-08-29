import { BrowserWindow, ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc-channels";
import { appStore } from "../store/app-store";
import type { Theme } from "@shared/types";
import { sanitizeExternalUrl } from "@shared/utils/external-url";
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
  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_event, raw: string) => {
    const url = sanitizeExternalUrl(raw);
    if (!url) throw new Error("不支持的链接");
    await shell.openExternal(url);
  });
  ipcMain.handle(IPC.APP_RESOLVE_BILI_URL, (_event, raw: string) =>
    resolveBiliUrl(raw),
  );
}
