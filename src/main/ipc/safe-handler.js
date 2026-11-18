import { ipcMain } from "electron";
export function handleIpc(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            return await handler(event, ...args);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            try {
                console.error(`[IPC ${channel}] failed: ${message}`);
            }
            catch {
                // 开发终端管道断开时，写日志会抛 EPIPE，不能盖住原来的接口错误
            }
            throw error;
        }
    });
}
