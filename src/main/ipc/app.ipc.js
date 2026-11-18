import { BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc-channels";
import { appStore } from "../store/app-store";
import { sanitizeExternalUrl } from "@shared/utils/external-url";
import { isBiliShortUrl, resolveInAppPathFromUrl, } from "@shared/utils/bili-app-link";
import { resolveBiliUrl } from "../services/bili-link";
import { applyWindowGlassEffect, getWindowState, isWindowFullscreen, setWindowFullscreen, toggleWindowMaximize, } from "../window";
function windowFromEvent(event) {
    return BrowserWindow.fromWebContents(event.sender);
}
export function registerAppIpc() {
    ipcMain.handle(IPC.APP_GET_THEME, () => appStore.get("theme"));
    ipcMain.handle(IPC.APP_SET_THEME, (_e, theme) => {
        appStore.set("theme", theme);
        return theme;
    });
    ipcMain.handle(IPC.APP_SET_THEME_PRESET, (_e, preset) => {
        const next = String(preset || "rose");
        appStore.set("themePreset", next);
        return next;
    });
    ipcMain.handle(IPC.APP_SET_WINDOW_GLASS, (event, enabled) => {
        const win = windowFromEvent(event);
        if (!win || win.isDestroyed())
            return false;
        return applyWindowGlassEffect(win, Boolean(enabled));
    });
    ipcMain.handle(IPC.APP_SET_FULLSCREEN, (event, on) => {
        const win = windowFromEvent(event);
        if (!win || win.isDestroyed())
            return false;
        return setWindowFullscreen(win, Boolean(on));
    });
    ipcMain.handle(IPC.APP_GET_FULLSCREEN, (event) => {
        const win = windowFromEvent(event);
        if (!win || win.isDestroyed())
            return false;
        return isWindowFullscreen(win);
    });
    ipcMain.handle(IPC.APP_WINDOW_MINIMIZE, (event) => {
        const win = windowFromEvent(event);
        if (win && !win.isDestroyed())
            win.minimize();
    });
    ipcMain.handle(IPC.APP_WINDOW_TOGGLE_MAXIMIZE, (event) => {
        const win = windowFromEvent(event);
        if (!win || win.isDestroyed()) {
            return { maximized: false, fullscreen: false };
        }
        return toggleWindowMaximize(win);
    });
    ipcMain.handle(IPC.APP_WINDOW_CLOSE, (event) => {
        const win = windowFromEvent(event);
        if (win && !win.isDestroyed())
            win.close();
    });
    ipcMain.handle(IPC.APP_WINDOW_GET_STATE, (event) => {
        const win = windowFromEvent(event);
        if (!win || win.isDestroyed()) {
            return { maximized: false, fullscreen: false };
        }
        return getWindowState(win);
    });
    ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (event, raw) => {
        const url = sanitizeExternalUrl(raw);
        if (!url)
            throw new Error("不支持的链接");
        const resolved = isBiliShortUrl(url) ? await resolveBiliUrl(url) : url;
        const inApp = resolveInAppPathFromUrl(resolved);
        if (inApp) {
            event.sender.send(IPC.APP_NAVIGATE, inApp);
            return;
        }
        await shell.openExternal(resolved);
    });
    ipcMain.handle(IPC.APP_RESOLVE_BILI_URL, (_event, raw) => resolveBiliUrl(raw));
    ipcMain.handle(IPC.APP_PROBE_SHORTCUT, (_event, accelerator) => {
        const combo = String(accelerator ?? "").trim();
        if (!combo)
            return { taken: false };
        let registered = false;
        try {
            registered = globalShortcut.register(combo, () => undefined);
            if (!registered) {
                return { taken: true, reason: "已被系统或其他软件占用" };
            }
            return { taken: false };
        }
        catch {
            return { taken: true, reason: "系统不允许注册该快捷键" };
        }
        finally {
            if (registered)
                globalShortcut.unregister(combo);
        }
    });
}
