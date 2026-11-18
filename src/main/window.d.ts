import { BrowserWindow } from "electron";
import type { WindowState } from "@shared/types";
export declare const USE_CUSTOM_TITLEBAR: boolean;
export declare function getWindowState(win: BrowserWindow): WindowState;
export declare function setWindowFullscreen(win: BrowserWindow, on: boolean): boolean;
export declare function isWindowFullscreen(win: BrowserWindow): boolean;
/** 液态玻璃：开/关 Acrylic，即时生效，不重建窗口 */
export declare function applyWindowGlassEffect(win: BrowserWindow, enabled: boolean): boolean;
export declare function createMainWindow(): BrowserWindow;
export declare function toggleWindowMaximize(win: BrowserWindow): WindowState;
