import { appStore } from "../store/app-store";
import { upsertFootprintItems } from "../store/footprint-store";
function currentUid() {
    return (Number(appStore.get("cookies").DedeUserID) ||
        Number(appStore.get("user")?.mid) ||
        0);
}
export function captureLocalComment(comment, type = 1, source = "local") {
    if (!comment)
        return;
    const uid = currentUid();
    if (uid <= 0)
        return;
    const rpid = String(comment.rpidStr || comment.rpid || "").trim();
    if (!rpid)
        return;
    const item = {
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
export function captureLocalDanmaku(payload) {
    const uid = currentUid();
    if (uid <= 0)
        return;
    const text = payload.message.trim();
    if (!text)
        return;
    const id = `danmaku:local:${payload.bvid}:${payload.progress}:${Date.now()}`;
    const item = {
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
