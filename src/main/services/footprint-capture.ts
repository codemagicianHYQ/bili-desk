import type { CommentItem, FootprintItem } from "@shared/types";
import { appStore } from "../store/app-store";
import { upsertFootprintItems } from "../store/footprint-store";

function currentUid(): number {
  return (
    Number(appStore.get("cookies").DedeUserID) ||
    Number(appStore.get("user")?.mid) ||
    0
  );
}

export function captureLocalComment(
  comment: CommentItem | null | undefined,
  type = 1,
  source: FootprintItem["source"] = "local",
): void {
  if (!comment) return;
  const uid = currentUid();
  if (uid <= 0) return;
  const rpid = String(comment.rpidStr || comment.rpid || "").trim();
  if (!rpid) return;
  const item: FootprintItem = {
    id: `comment:${rpid}`,
    kind: "comment",
    text: comment.content || "",
    time: comment.ctime || Math.floor(Date.now() / 1000),
    oid: Number(comment.oid) || 0,
    type,
    rpid,
    source,
  };
  upsertFootprintItems(uid, [item]);
}

export function captureLocalDanmaku(payload: {
  message: string;
  bvid: string;
  progress: number;
  aid?: number;
}): void {
  const uid = currentUid();
  if (uid <= 0) return;
  const text = payload.message.trim();
  if (!text) return;
  const id = `danmaku:local:${payload.bvid}:${payload.progress}:${Date.now()}`;
  const item: FootprintItem = {
    id,
    kind: "danmaku",
    text,
    time: Math.floor(Date.now() / 1000),
    oid: Number(payload.aid) || 0,
    progressMs: Math.max(0, Math.floor(payload.progress)),
    bvid: payload.bvid,
    source: "local",
  };
  upsertFootprintItems(uid, [item]);
}
