import { useSyncExternalStore } from "react";
import type {
  CollectionClassifyProgress,
  CollectionClassifyResult,
  IntegrityScanProgress,
  IntegrityScanResult,
  IntegrityScanScope,
  UpActivityArchive,
  UpActivityScanProgress,
} from "@shared/types";

/**
 * 长任务状态放在页面组件外：切走页面组件卸载，主进程仍在跑，
 * 回来时从这里拿到进度和结果。
 */
export interface BackgroundTaskState<P, R, M> {
  running: boolean;
  progress: P | null;
  /** 发起时附带的上下文，例如扫的是哪个 Tab */
  meta: M | null;
  result: R | null;
  error: string;
  /** 页面已处理过本次结果（避免每次进页都重复弹提示） */
  acknowledged: boolean;
}

export interface BackgroundTask<P, R, M> {
  getState: () => BackgroundTaskState<P, R, M>;
  subscribe: (listener: () => void) => () => void;
  run: (fn: () => Promise<R>, initial: P | null, meta?: M) => Promise<R>;
  acknowledge: () => void;
}

export function createBackgroundTask<P, R, M = undefined>(
  subscribeProgress?: (callback: (progress: P) => void) => () => void,
): BackgroundTask<P, R, M> {
  let state: BackgroundTaskState<P, R, M> = {
    running: false,
    progress: null,
    meta: null,
    result: null,
    error: "",
    acknowledged: true,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<BackgroundTaskState<P, R, M>>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  subscribeProgress?.((progress) => {
    if (state.running) set({ progress });
  });

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async run(fn, initial, meta) {
      if (state.running) throw new Error("任务正在进行中");
      set({
        running: true,
        progress: initial,
        meta: meta ?? null,
        result: null,
        error: "",
        acknowledged: false,
      });
      try {
        const result = await fn();
        set({ running: false, result });
        return result;
      } catch (err) {
        set({
          running: false,
          progress: null,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    acknowledge: () => {
      if (!state.acknowledged) set({ acknowledged: true });
    },
  };
}

export function useBackgroundTask<P, R, M>(
  task: BackgroundTask<P, R, M>,
): BackgroundTaskState<P, R, M> {
  return useSyncExternalStore(task.subscribe, task.getState);
}

export const integrityScanTask = createBackgroundTask<
  IntegrityScanProgress,
  IntegrityScanResult,
  IntegrityScanScope
>((callback) => window.biliDesk.bili.onIntegrityProgress(callback));

export const upActivityScanTask = createBackgroundTask<
  UpActivityScanProgress,
  UpActivityArchive
>((callback) => window.biliDesk.bili.onUpActivityProgress(callback));

export const collectionClassifyTask = createBackgroundTask<
  CollectionClassifyProgress,
  CollectionClassifyResult
>((callback) => window.biliDesk.bili.onCollectionClassifyProgress(callback));
