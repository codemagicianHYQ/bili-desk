import { ipcMain, type IpcMainInvokeEvent } from "electron";

export function handleIpc(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        console.error(`[IPC ${channel}] failed: ${message}`);
      } catch {
        // 开发终端管道断开时，写日志会抛 EPIPE，不能盖住原来的接口错误
      }
      throw error;
    }
  });
}
