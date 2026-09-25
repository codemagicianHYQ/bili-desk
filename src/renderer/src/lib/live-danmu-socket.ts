import type { LiveChatMessage, LiveDanmuInfo } from "@shared/types";
import { parseDanmuMsgEmotes } from "@shared/utils/live-danmu-emotes";
import {
  decodeLivePackets,
  encodeLivePacket,
  LIVE_OP_AUTH,
  LIVE_OP_AUTH_REPLY,
  LIVE_OP_HEARTBEAT,
  LIVE_OP_HEARTBEAT_REPLY,
  LIVE_OP_NOTIFY,
} from "@shared/utils/live-danmu-protocol";

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

const SKIP_CMDS = new Set([
  "SEND_GIFT",
  "COMBO_SEND",
  "GUARD_BUY",
  "SUPER_CHAT_MESSAGE",
  "SUPER_CHAT_MESSAGE_JPN",
  "NOTICE_MSG",
  "POPULARITY_RED_POCKET_NEW",
  "POPULARITY_RED_POCKET_START",
  "POPULARITY_RED_POCKET_WINNER_LIST",
]);

function decodeText(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

function parseColor(value: unknown): string | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n === 16777215) return undefined;
  return `#${n.toString(16).padStart(6, "0")}`;
}

function parseNotify(
  json: Record<string, unknown>,
  emit: (message: LiveChatMessage) => void,
  onStats?: (stats: LiveDanmuStats) => void,
): void {
  const cmd = String(json.cmd ?? "");
  if (SKIP_CMDS.has(cmd) || SKIP_CMDS.has(cmd.split(":")[0] ?? "")) return;

  if (cmd === "DANMU_MSG" || cmd.startsWith("DANMU_MSG")) {
    const info = (json.info ?? []) as unknown[];
    let text = "";
    let emotes: Record<string, string> | undefined;
    let stickerUrl: string | undefined;
    try {
      const parsed = parseDanmuMsgEmotes(info);
      text = parsed.text;
      emotes =
        Object.keys(parsed.emotes).length > 0 ? parsed.emotes : undefined;
      stickerUrl = parsed.stickerUrl;
    } catch {
      text = typeof info[1] === "string" ? info[1].trim() : "";
    }
    if (!text && typeof info[1] === "string") text = info[1].trim();
    const user = (info[2] ?? []) as unknown[];
    if (!text) return;
    emit({
      id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "danmu",
      uid: Number(user[0] ?? 0) || 0,
      uname: String(user[1] ?? "用户"),
      text,
      color: parseColor((info[0] as unknown[])?.[3]),
      time: Date.now(),
      emotes,
      stickerUrl,
    });
    return;
  }

  if (cmd === "INTERACT_WORD") {
    const data = (json.data ?? {}) as Record<string, unknown>;
    const uname = String(data.uname ?? "").trim();
    if (!uname) return;
    emit({
      id: `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "enter",
      uid: Number(data.uid ?? 0) || 0,
      uname,
      text: "进入直播间",
      time: Date.now(),
    });
    return;
  }

  if (cmd === "WATCHED_CHANGE") {
    const data = (json.data ?? {}) as Record<string, unknown>;
    const num = Number(data.num ?? 0);
    const text = String(data.text_large ?? data.text_small ?? "").trim();
    onStats?.({
      watched: Number.isFinite(num) && num > 0 ? num : undefined,
      watchedText: text || undefined,
    });
    return;
  }

  if (cmd === "ONLINE_RANK_COUNT") {
    const data = (json.data ?? {}) as Record<string, unknown>;
    const viewers = Number(data.count ?? data.onlineNum ?? 0);
    if (Number.isFinite(viewers) && viewers > 0) onStats?.({ viewers });
    return;
  }

  if (cmd === "ROOM_REAL_TIME_MESSAGE_UPDATE") {
    const data = (json.data ?? {}) as Record<string, unknown>;
    const online = Number(data.online ?? 0);
    if (Number.isFinite(online) && online > 0) onStats?.({ online });
  }
}

async function readSocketData(data: unknown): Promise<ArrayBuffer | null> {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Blob) return data.arrayBuffer();
  if (data instanceof Uint8Array) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }
  return null;
}

function markLive(
  ws: WebSocket,
  onStatus: ConnectLiveDanmuOptions["onStatus"],
  startHeartbeat: () => void,
  already: { live: boolean },
): void {
  if (already.live) return;
  already.live = true;
  onStatus?.("live");
  startHeartbeat();
}

export function connectLiveDanmu({
  roomId,
  info,
  onMessage,
  onStats,
  onStatus,
}: ConnectLiveDanmuOptions): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let heartbeat: number | null = null;
  let hostIndex = 0;
  let retryTimer: number | null = null;
  const hosts =
    info.hosts.length > 0
      ? info.hosts
      : [{ host: "broadcastlv.chat.bilibili.com", wssPort: 443 }];

  const stopHeartbeat = () => {
    if (heartbeat != null) {
      window.clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const cleanup = () => {
    closed = true;
    stopHeartbeat();
    if (retryTimer != null) window.clearTimeout(retryTimer);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // ignore
      }
      socket = null;
    }
    onStatus?.("closed");
  };

  const open = () => {
    if (closed) return;
    const host = hosts[hostIndex % hosts.length];
    if (!host) {
      onStatus?.("closed");
      return;
    }
    onStatus?.("connecting");
    const already = { live: false };
    const url = `wss://${host.host}:${host.wssPort}/sub`;
    const ws = new WebSocket(url);
    socket = ws;
    ws.binaryType = "arraybuffer";

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeat = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeLivePacket(LIVE_OP_HEARTBEAT));
        }
      }, 30000);
    };

    ws.onopen = () => {
      if (closed) return;
      const auth = JSON.stringify({
        uid: info.uid || 0,
        roomid: roomId,
        protover: 1,
        platform: "web",
        type: 2,
        key: info.token || "",
        buvid: info.buvid || "",
      });
      ws.send(encodeLivePacket(LIVE_OP_AUTH, auth));
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      if (closed) return;
      void readSocketData(event.data).then((buf) => {
        if (!buf) return;
        return decodeLivePackets(buf).then((packets) => {
          for (const packet of packets) {
            if (packet.op === LIVE_OP_AUTH_REPLY) {
              markLive(ws, onStatus, startHeartbeat, already);
              continue;
            }
            if (
              packet.op === LIVE_OP_HEARTBEAT_REPLY &&
              packet.body.length >= 4
            ) {
              const view = new DataView(
                packet.body.buffer,
                packet.body.byteOffset,
                packet.body.byteLength,
              );
              const online = view.getUint32(0);
              if (online > 0) onStats?.({ online });
              continue;
            }
            if (packet.op !== LIVE_OP_NOTIFY) continue;
            try {
              const json = JSON.parse(decodeText(packet.body)) as Record<
                string,
                unknown
              >;
              const before = already.live;
              parseNotify(
                json,
                (message) => {
                  if (!before) markLive(ws, onStatus, startHeartbeat, already);
                  onMessage(message);
                },
                onStats,
              );
            } catch {
              // ignore non-json
            }
          }
        });
      });
    };

    ws.onclose = () => {
      stopHeartbeat();
      if (closed) return;
      if (!already.live) onStatus?.("closed");
      hostIndex += 1;
      retryTimer = window.setTimeout(open, 1600);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  };

  open();
  return cleanup;
}
