/** B 站直播弹幕 WebSocket 协议（只解析弹幕 / 进场，忽略礼物特效） */
export declare const LIVE_OP_HEARTBEAT = 2;
export declare const LIVE_OP_HEARTBEAT_REPLY = 3;
export declare const LIVE_OP_NOTIFY = 5;
export declare const LIVE_OP_AUTH = 7;
export declare const LIVE_OP_AUTH_REPLY = 8;
export declare function encodeLivePacket(op: number, body?: string | Uint8Array): ArrayBuffer;
export declare function decodeLivePackets(data: ArrayBuffer): Promise<Array<{
    op: number;
    body: Uint8Array;
}>>;
