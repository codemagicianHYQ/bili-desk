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

function readVarint(
  buf: Uint8Array,
  offset: number,
): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 70n) break;
  }
  return { value, next: pos };
}

function readString(buf: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    buf.subarray(offset, offset + length),
  );
}

function decodeCommandDm(buf: Uint8Array): RawCommandDm {
  let offset = 0;
  let id = "";
  let oid = 0;
  let mid = "";
  let command = "";
  let content = "";
  let progress = 0;
  let extra = "";

  while (offset < buf.length) {
    const tag = readVarint(buf, offset);
    offset = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);

    if (wire === 0) {
      const num = readVarint(buf, offset);
      offset = num.next;
      if (field === 1) id = id || String(num.value);
      else if (field === 2) oid = Number(num.value);
      else if (field === 3) mid = mid || String(num.value);
      else if (field === 6) progress = Number(num.value);
    } else if (wire === 2) {
      const len = readVarint(buf, offset);
      offset = len.next;
      const size = Number(len.value);
      const text = readString(buf, offset, size);
      offset += size;
      if (field === 3) mid = text || mid;
      else if (field === 4) command = text;
      else if (field === 5) content = text;
      else if (field === 7 || field === 8) {
        // ctime / mtime 忽略
      } else if (field === 9) extra = text;
      else if (field === 10) id = text || id;
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 5) {
      offset += 4;
    } else {
      break;
    }
  }

  return { id, oid, mid, command, content, progress, extra };
}

export function decodeDmWebViewCommandDms(buf: Uint8Array): RawCommandDm[] {
  const items: RawCommandDm[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const tag = readVarint(buf, offset);
    offset = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);

    if (wire === 2) {
      const len = readVarint(buf, offset);
      offset = len.next;
      const size = Number(len.value);
      const slice = buf.subarray(offset, offset + size);
      offset += size;
      if (field === 9) {
        const dm = decodeCommandDm(slice);
        if (dm.command) items.push(dm);
      }
    } else if (wire === 0) {
      offset = readVarint(buf, offset).next;
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 5) {
      offset += 4;
    } else {
      break;
    }
  }
  return items;
}
