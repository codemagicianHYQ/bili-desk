/**
 * 轻量解析 /x/v2/dm/web/view 的 protobuf，只取 CommandDm（互动弹幕）列表。
 * 完整 schema 见 bilibili-API-collect DmWebViewReply.commandDms = 9
 */
export interface RawCommandDm {
    id: string;
    oid: number;
    mid: string;
    command: string;
    content: string;
    progress: number;
    extra: string;
}
export declare function decodeDmWebViewCommandDms(buf: Uint8Array): RawCommandDm[];
