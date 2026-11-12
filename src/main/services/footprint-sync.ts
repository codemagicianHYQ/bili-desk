import { BrowserWindow } from "electron";
import { IPC } from "@shared/ipc-channels";
import type { FootprintSyncKinds, FootprintSyncProgress } from "@shared/types";
import { appStore } from "../store/app-store";
import { biliApi } from "./bili-api";
import { messageApi } from "./message-api";
import {
  loadFootprint,
  setFootprintSyncCursor,
  upsertFootprintItems,
  resetFootprintSyncCursors,
  flushFootprintStore,
  removeFootprintComments,
} from "../store/footprint-store";
import {
  closeAicuBridge,
  fetchAicuReplies,
  fetchAicuVideoDanmaku,
  resetAicuChallengeGate,
  setAicuChallengeListener,
} from "./aicu-api";

const IDLE: FootprintSyncProgress = {
  running: false,
  phase: "idle",
  fetched: 0,
  totalHint: 0,
  page: 0,
  message: "",
};

let progress: FootprintSyncProgress = { ...IDLE };
let abortFlag = false;
let running = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** AICU 只追加旧索引。同步后再问 B 站，把已经删掉的评论从本地列表去掉。 */
async function reconcileDeletedComments(uid: number): Promise<{
  removed: number;
  note: string;
}> {
  const comments = loadFootprint(uid).items.filter(
    (item) => item.kind === "comment" && item.rpid && item.oid > 0,
  );
  const gone: string[] = [];
  let note = "";
  let consecutiveFailures = 0;
  for (let index = 0; index < comments.length; index += 1) {
    if (abortFlag) {
      note = "已停止";
      break;
    }
    const item = comments[index];
    setProgress({
      phase: "verify",
      running: true,
      page: 0,
      fetched: index + 1,
      totalHint: comments.length,
      message: `正在向 B 站核对评论是否还在 · ${index + 1}/${comments.length}`,
    });
    try {
      const presence = await biliApi.probeReplyPresence(
        item.oid,
        item.type || 1,
        item.rpid || "",
      );
      consecutiveFailures = 0;
      if (presence === "gone" && item.rpid) gone.push(String(item.rpid));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/限流|登录失效/.test(message)) {
        note = message;
        break;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures >= 4) {
        note =
          "连续多次没有对上 B 站，核对先停在这里。已经确认删除的会去掉，剩下的下次同步再对。";
        break;
      }
    }
    if (index < comments.length - 1) await sleep(120);
  }
  const removed = gone.length > 0 ? removeFootprintComments(uid, gone) : 0;
  return { removed, note };
}

function currentUid(): number {
  const fromCookie = Number(appStore.get("cookies").DedeUserID) || 0;
  if (fromCookie > 0) return fromCookie;
  return Number(appStore.get("user")?.mid) || 0;
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.BILI_FOOTPRINT_PROGRESS, progress);
    }
  }
}

function setProgress(patch: Partial<FootprintSyncProgress>): void {
  progress = { ...progress, ...patch };
  broadcast();
}

export function getFootprintSyncStatus(): FootprintSyncProgress {
  return { ...progress };
}

export function abortFootprintSync(): void {
  if (!running) return;
  abortFlag = true;
  closeAicuBridge();
  setProgress({ message: "正在停止同步…" });
}

export async function startFootprintSync(
  kinds: FootprintSyncKinds = "all",
  options?: { reset?: boolean },
): Promise<FootprintSyncProgress> {
  if (running) {
    return getFootprintSyncStatus();
  }
  const uid = currentUid();
  if (uid <= 0) {
    throw new Error("请先登录后再同步足迹");
  }

  running = true;
  abortFlag = false;
  resetAicuChallengeGate(uid);

  if (options?.reset) {
    resetFootprintSyncCursors(uid);
  }

  const doComment = kinds === "all" || kinds === "comment";
  const doDanmaku = kinds === "all" || kinds === "danmaku";
  let fetched = 0;

  setAicuChallengeListener((state, detail) => {
    if (abortFlag) return;
    if (state === "open" || state === "waiting") {
      setProgress({
        phase: "challenge",
        message: detail || "请完成 AICU 人机验证…",
      });
      return;
    }
    if (state === "done") {
      setProgress({
        phase: doComment ? "comment" : "danmaku",
        page: 1,
        message: detail || "验证通过，继续同步…",
      });
      return;
    }
    if (state === "fail") {
      setProgress({
        phase: "challenge",
        message: detail || "人机验证失败",
      });
    }
  });

  setProgress({
    running: true,
    phase: doComment ? "comment" : "danmaku",
    fetched: 0,
    totalHint: 0,
    page: 0,
    message: "开始从 AICU 同步…",
  });

  const errors: string[] = [];
  try {
    if (doComment) {
      try {
        const file = loadFootprint(uid);
        let pn = file.replyDone ? 1 : file.replyPn;
        if (file.replyDone && !options?.reset) {
          pn = 1;
        }
        let isEnd = false;
        while (!abortFlag && !isEnd) {
          setProgress({
            phase: "comment",
            page: pn,
            fetched,
            message: `正在同步评论 · 第 ${pn} 页`,
          });
          const page = await fetchAicuReplies(uid, pn, 50);
          const added = upsertFootprintItems(uid, page.items);
          fetched += page.items.length;
          isEnd = page.isEnd;
          setFootprintSyncCursor(uid, {
            replyPn: isEnd ? pn : pn + 1,
            replyDone: isEnd,
            syncedAt: Date.now(),
          });
          setProgress({
            page: pn,
            fetched,
            totalHint: page.allCount || progress.totalHint,
            message: `评论进度 ${fetched}/${page.allCount || "?"} · 第 ${pn} 页新增 ${added}`,
          });
          if (!isEnd) pn += 1;
          if (pn > 5000) break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("中止")) throw error;
        errors.push(`评论：${message}`);
        setProgress({
          message: `评论同步失败，继续尝试弹幕…`,
        });
      }
      if (abortFlag) throw new Error("已中止同步");
    }

    if (doDanmaku) {
      try {
        const file = loadFootprint(uid);
        let pn = file.dmDone && !options?.reset ? 1 : file.dmPn;
        let isEnd = false;
        let dmFetched = 0;
        while (!abortFlag && !isEnd) {
          setProgress({
            phase: "danmaku",
            page: pn,
            fetched: fetched + dmFetched,
            message: `正在同步弹幕 · 第 ${pn} 页`,
          });
          const page = await fetchAicuVideoDanmaku(uid, pn, 50);
          const added = upsertFootprintItems(uid, page.items);
          dmFetched += page.items.length;
          isEnd = page.isEnd;
          setFootprintSyncCursor(uid, {
            dmPn: isEnd ? pn : pn + 1,
            dmDone: isEnd,
            syncedAt: Date.now(),
          });
          setProgress({
            page: pn,
            fetched: fetched + dmFetched,
            totalHint: page.allCount || progress.totalHint,
            message: `弹幕进度 ${dmFetched}/${page.allCount || "?"} · 第 ${pn} 页新增 ${added}`,
          });
          if (!isEnd) pn += 1;
          if (pn > 5000) break;
        }
        fetched += dmFetched;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("中止")) throw error;
        errors.push(`弹幕：${message}`);
      }
      if (abortFlag) throw new Error("已中止同步");
    }

    let removedComments = 0;
    let verifyNote = "";
    let filled = 0;
    let fillNote = "";
    if (doComment && !abortFlag) {
      const verified = await reconcileDeletedComments(uid);
      removedComments = verified.removed;
      verifyNote = verified.note;
    }
    const newestCommentAt = loadFootprint(uid).items.reduce(
      (max, item) =>
        item.kind === "comment" ? Math.max(max, item.time || 0) : max,
      0,
    );
    const sinceLabel =
      newestCommentAt > 0
        ? `${new Date(newestCommentAt * 1000).getMonth() + 1}月${new Date(newestCommentAt * 1000).getDate()}日`
        : "现有记录";
    if (doComment && !abortFlag) {
      try {
        setProgress({
          phase: "recent",
          running: true,
          page: 0,
          fetched: 0,
          totalHint: 0,
          message: "正在把「我回复的」写进我的评论…",
        });
        const sent = await messageApi.listSentCommentsForFootprint();
        if (abortFlag) throw new Error("已中止同步");
        if (sent.length > 0) filled += upsertFootprintItems(uid, sent);
        setProgress({
          phase: "recent",
          running: true,
          fetched: sent.length,
          totalHint: sent.length,
          message: `「我回复的」写入 ${sent.length} 条，其中新出现 ${filled} 条`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("中止")) throw error;
        fillNote = message;
      }
    }
    if (doComment && !abortFlag) {
      try {
        const found = await biliApi.listOwnCommentsFromRecentHistory(
          uid,
          (done, total, batch) => {
            if (batch.length > 0) filled += upsertFootprintItems(uid, batch);
            setProgress({
              phase: "recent",
              running: true,
              page: 0,
              fetched: done,
              totalHint: total,
              message: `正在补 ${sinceLabel} 之后看过的视频 · ${done}/${total}，新找到 ${filled} 条`,
            });
          },
          () => abortFlag,
          newestCommentAt,
        );
        fillNote = found.note;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("中止")) throw error;
        fillNote = message;
      }
    }
    if (abortFlag) throw new Error("已中止同步");

    flushFootprintStore();
    const bits = [`共处理 ${fetched} 条`];
    if (doComment) {
      if (removedComments > 0)
        bits.push(`去掉 ${removedComments} 条已删除评论`);
      else if (!verifyNote) bits.push("没有发现已删除评论");
      if (filled > 0) bits.push(`补入 ${filled} 条近期发言`);
      else if (!fillNote) bits.push("「我回复的」和近期观看里没有新评论");
    }
    const extra = [verifyNote, fillNote].filter(
      (text) => text && text !== "已停止",
    );
    const summary = `${bits.join("，")}${extra.length ? `。${extra.join("。")}` : ""}`;
    if (errors.length && fetched === 0 && removedComments === 0) {
      setProgress({
        running: false,
        phase: "error",
        fetched,
        page: progress.page,
        message: errors.join("；"),
      });
    } else if (errors.length) {
      setProgress({
        running: false,
        phase: "done",
        fetched,
        message: `部分成功，${summary}。失败：${errors.join("；")}`,
      });
    } else {
      setProgress({
        running: false,
        phase: "done",
        fetched,
        message: `同步完成，${summary}`,
      });
    }
  } catch (error) {
    flushFootprintStore();
    const message = error instanceof Error ? error.message : String(error);
    setProgress({
      running: false,
      phase: message.includes("中止") ? "idle" : "error",
      fetched,
      message: message.includes("中止") ? "已停止同步" : message,
    });
  } finally {
    setAicuChallengeListener(null);
    closeAicuBridge();
    running = false;
    abortFlag = false;
  }

  return getFootprintSyncStatus();
}
