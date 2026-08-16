import { BrowserWindow, ipcMain } from "electron";
import { IPC } from "@shared/ipc-channels";
import { appStore } from "../store/app-store";
import type { Theme } from "@shared/types";

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
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
}
