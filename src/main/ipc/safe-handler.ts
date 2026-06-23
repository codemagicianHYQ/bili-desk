import { ipcMain, type IpcMainInvokeEvent } from 'electron'

export function handleIpc(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      console.error(`[IPC ${channel}] failed`)
      throw error
    }
  })
}
