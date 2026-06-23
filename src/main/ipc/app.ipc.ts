import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { appStore } from '../store/app-store'
import type { Theme } from '@shared/types'

export function registerAppIpc(): void {
  ipcMain.handle(IPC.APP_GET_THEME, () => appStore.get('theme'))
  ipcMain.handle(IPC.APP_SET_THEME, (_e, theme: Theme) => {
    appStore.set('theme', theme)
    return theme
  })
}
