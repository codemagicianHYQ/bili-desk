import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { biliApi } from '../services/bili-api';
import { appStore } from '../store/app-store';
export function registerAuthIpc() {
    ipcMain.handle(IPC.AUTH_GET_QR, () => biliApi.getQrCode());
    ipcMain.handle(IPC.AUTH_POLL, (_e, qrcodeKey) => biliApi.pollLogin(qrcodeKey));
    ipcMain.handle(IPC.AUTH_LOGOUT, () => {
        biliApi.logout();
    });
    ipcMain.handle(IPC.AUTH_STATUS, async () => {
        await biliApi.keepLoginFresh();
        const user = await biliApi.fetchCurrentUser();
        return user ?? biliApi.getAuthStatus();
    });
}
export function registerAppIpc() {
    ipcMain.handle(IPC.APP_GET_THEME, () => appStore.get('theme'));
    ipcMain.handle(IPC.APP_SET_THEME, (_e, theme) => {
        appStore.set('theme', theme);
        return theme;
    });
}
