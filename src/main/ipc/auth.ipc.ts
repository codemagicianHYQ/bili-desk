import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { biliApi } from '../services/bili-api'
import { clearAuth } from '../store/app-store'
import { appStore } from '../store/app-store'
import type { Theme } from '@shared/types'

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.AUTH_GET_QR, () => biliApi.getQrCode())
  ipcMain.handle(IPC.AUTH_POLL, (_e, qrcodeKey: string) => biliApi.pollLogin(qrcodeKey))
  ipcMain.handle(IPC.AUTH_LOGOUT, () => {
    biliApi.logout()
  })
  ipcMain.handle(IPC.AUTH_STATUS, async () => {
    const user = await biliApi.fetchCurrentUser()
    return user ?? biliApi.getAuthStatus()
  })
}

export function registerAppIpc(): void {
  ipcMain.handle(IPC.APP_GET_THEME, () => appStore.get('theme'))
  ipcMain.handle(IPC.APP_SET_THEME, (_e, theme: Theme) => {
    appStore.set('theme', theme)
    return theme
  })
}
