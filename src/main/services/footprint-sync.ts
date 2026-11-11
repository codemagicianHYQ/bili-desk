import { BrowserWindow } from "electron";
import { IPC } from "@shared/ipc-channels";
import type { FootprintSyncKinds, FootprintSyncProgress } from "@shared/types";
import { appStore } from "../store/app-store";
import {
  loadFootprint,
  setFootprintSyncCursor,
  upsertFootprintItems,
  resetFootprintSyncCursors,
  flushFootprintStore,
} from "../store/footprint-store";
import {
  fetchAicuReplies,
  fetchAicuVideoDanmaku,
  resetAicuChallengeGate,
} from "./aicu-api";

const IDLE: FootprintSyncProgress = {
  running: false,
  phase: "idle",
  fetched: 0,
  totalHint: 0,
  message: "",
};

let progress: FootprintSyncProgress = { ...IDLE };
let abortFlag = false;
let running = false;

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
  resetAicuChallengeGate();
  if (options?.reset) {
    resetFootprintSyncCursors(uid);
  }

  const doComment = kinds === "all" || kinds === "comment";
  const doDanmaku = kinds === "all" || kinds === "danmaku";
  let fetched = 0;

  setProgress({
    running: true,
    phase: doComment ? "comment" : "danmaku",
    fetched: 0,
    totalHint: 0,
    message: "开始从 AICU 同步…",
  });

  const errors: string[] = [];
  try {
    if (doComment) {
      try {
        let file = loadFootprint(uid);
        let pn = file.replyDone ? 1 : file.replyPn;
        if (file.replyDone && !options?.reset) {
          // 已完整同步过：从第 1 页增量合并
          pn = 1;
        }
        let isEnd = false;
        while (!abortFlag && !isEnd) {
          setProgress({
            phase: "comment",
            fetched,
            message: `正在同步评论第 ${pn} 页…`,
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
            fetched,
            totalHint: page.allCount || progress.totalHint,
            message: `评论已拉取 ${fetched} 条（本页新增 ${added}）`,
          });
          if (!isEnd) pn += 1;
          if (pn > 5000) break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("中止")) throw error;
        errors.push(`评论：${message}`);
        setProgress({
          message: `评论同步失败，继续尝试弹幕…（${message}）`,
        });
      }
      if (abortFlag) throw new Error("已中止同步");
    }

    if (doDanmaku) {
      try {
        let file = loadFootprint(uid);
        let pn = file.dmDone && !options?.reset ? 1 : file.dmPn;
        let isEnd = false;
        let dmFetched = 0;
        while (!abortFlag && !isEnd) {
          setProgress({
            phase: "danmaku",
            fetched: fetched + dmFetched,
            message: `正在同步弹幕第 ${pn} 页…`,
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
            fetched: fetched + dmFetched,
            totalHint: page.allCount || progress.totalHint,
            message: `弹幕已拉取 ${dmFetched} 条（本页新增 ${added}）`,
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

    flushFootprintStore();
    if (errors.length && fetched === 0) {
      setProgress({
        running: false,
        phase: "error",
        fetched,
        message: errors.join("；"),
      });
    } else if (errors.length) {
      setProgress({
        running: false,
        phase: "done",
        fetched,
        message: `部分成功，共处理 ${fetched} 条。失败：${errors.join("；")}`,
      });
    } else {
      setProgress({
        running: false,
        phase: "done",
        fetched,
        message: `同步完成，共处理 ${fetched} 条`,
      });
    }
  } catch (error) {
    flushFootprintStore();
    const message = error instanceof Error ? error.message : String(error);
    setProgress({
      running: false,
      phase: message.includes("中止") ? "idle" : "error",
      fetched,
      message,
    });
  } finally {
    running = false;
    abortFlag = false;
  }

  return getFootprintSyncStatus();
}
