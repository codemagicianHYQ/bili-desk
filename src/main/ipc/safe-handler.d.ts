import { type IpcMainInvokeEvent } from "electron";
export declare function handleIpc(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): void;
