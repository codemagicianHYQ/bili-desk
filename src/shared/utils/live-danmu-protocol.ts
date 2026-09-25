/** B 站直播弹幕 WebSocket 协议（只解析弹幕 / 进场，忽略礼物特效） */

export const LIVE_OP_HEARTBEAT = 2;
export const LIVE_OP_HEARTBEAT_REPLY = 3;
export const LIVE_OP_NOTIFY = 5;
export const LIVE_OP_AUTH = 7;
export const LIVE_OP_AUTH_REPLY = 8;

const HEADER_LEN = 16;

export function encodeLivePacket(
  op: number,
  body: string | Uint8Array = "",
): ArrayBuffer {
  const payload =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const buf = new ArrayBuffer(HEADER_LEN + payload.length);
  const view = new DataView(buf);
  view.setUint32(0, buf.byteLength);
  view.setUint16(4, HEADER_LEN);
  view.setUint16(6, 1);
  view.setUint32(8, op);
  view.setUint32(12, 1);
  new Uint8Array(buf, HEADER_LEN).set(payload);
  return buf;
}

export async function decodeLivePackets(
  data: ArrayBuffer,
): Promise<Array<{ op: number; body: Uint8Array }>> {
  const out: Array<{ op: number; body: Uint8Array }> = [];
  await walkPackets(new Uint8Array(data), out);
  return out;
}

function copyBytes(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.byteLength);
  out.set(body);
  return out;
}

async function walkPackets(
  bytes: Uint8Array,
  out: Array<{ op: number; body: Uint8Array }>,
): Promise<void> {
  let offset = 0;
  while (offset + HEADER_LEN <= bytes.length) {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      bytes.length - offset,
    );
    const packLen = view.getUint32(0);
    const headerLen = view.getUint16(4);
    const ver = view.getUint16(6);
    const op = view.getUint32(8);
    if (packLen < headerLen || offset + packLen > bytes.length) break;
    const body = copyBytes(
      bytes.subarray(offset + headerLen, offset + packLen),
    );
    if (ver === 2 || ver === 3) {
      try {
        const raw = await inflatePacket(body);
        await walkPackets(new Uint8Array(raw), out);
      } catch {
        // 解压失败时仍按明文试一次，避免整包丢掉
        out.push({ op, body });
      }
    } else {
      out.push({ op, body });
    }
    offset += packLen;
  }
}

async function inflatePacket(body: Uint8Array): Promise<ArrayBuffer> {
  try {
    return await decompressWith(body, "deflate");
  } catch {
    try {
      return await decompressWith(body, "deflate-raw");
    } catch {
      if (body.length > 6) {
        return decompressWith(body.subarray(2, body.length - 4), "deflate-raw");
      }
      throw new Error("inflate failed");
    }
  }
}

async function decompressWith(
  body: Uint8Array,
  format: CompressionFormat,
): Promise<ArrayBuffer> {
  const copy = copyBytes(body);
  const stream = new Blob([copy])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Response(stream).arrayBuffer();
}
