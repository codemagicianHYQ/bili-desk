import { createRequire } from "module";
/**
 * Win11 的 Acrylic 在窗口失焦时会被 DWM 换成灰色实底。
 * 失焦后补发一次 WM_NCACTIVATE(TRUE)，让 DWM 继续按激活态画背景；真实键盘焦点不受影响。
 */
const WM_NCACTIVATE = 0x0086;
const WINDOW_EDIT = 9;
const FOCUS_WINDOW = 5;
let executeDwm;
function loadExecuteDwm() {
    if (executeDwm !== undefined)
        return executeDwm;
    executeDwm = null;
    if (process.platform !== "win32")
        return null;
    try {
        const require = createRequire(import.meta.url);
        const native = require(`mica-electron/src/micaElectron_${process.arch}.node`);
        executeDwm = native.executeDwm ?? null;
    }
    catch (err) {
        console.warn("[BiliDesk] keep-backdrop-active unavailable", err);
    }
    return executeDwm;
}
function readHwnd(win) {
    const handle = win.getNativeWindowHandle();
    return handle.length >= 8
        ? Number(handle.readBigUInt64LE(0))
        : handle.readUInt32LE(0);
}
function readWord(value) {
    if (value.length >= 8)
        return Number(value.readBigUInt64LE(0));
    if (value.length >= 4)
        return value.readUInt32LE(0);
    return 0;
}
export function keepBackdropActive(win, enabled) {
    const fn = loadExecuteDwm();
    if (!fn)
        return;
    const reactivate = () => {
        if (win.isDestroyed() || win.isFocused() || !enabled())
            return;
        try {
            fn(readHwnd(win), WINDOW_EDIT, FOCUS_WINDOW);
        }
        catch (err) {
            console.warn("[BiliDesk] keep-backdrop-active failed", err);
        }
    };
    win.hookWindowMessage(WM_NCACTIVATE, (wParam) => {
        if (readWord(wParam) === 0)
            setTimeout(reactivate, 0);
    });
    win.on("blur", () => setTimeout(reactivate, 0));
}
export function refreshBackdropActive(win) {
    const fn = loadExecuteDwm();
    if (!fn || win.isDestroyed() || win.isFocused())
        return;
    try {
        fn(readHwnd(win), WINDOW_EDIT, FOCUS_WINDOW);
    }
    catch {
        /* ignore */
    }
}
