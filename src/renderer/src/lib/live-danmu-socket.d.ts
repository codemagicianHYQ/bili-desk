import type { LiveChatMessage, LiveDanmuInfo } from "@shared/types";
export interface LiveDanmuStats {
    online?: number;
    watched?: number;
    watchedText?: string;
    /** 房间观众 */
    viewers?: number;
}
interface ConnectLiveDanmuOptions {
    roomId: number;
    info: LiveDanmuInfo;
    onMessage: (message: LiveChatMessage) => void;
    onStats?: (stats: LiveDanmuStats) => void;
    onStatus?: (status: "connecting" | "live" | "closed") => void;
}
export declare function connectLiveDanmu({ roomId, info, onMessage, onStats, onStatus, }: ConnectLiveDanmuOptions): () => void;
export {};
