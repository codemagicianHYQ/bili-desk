import { useSyncExternalStore } from "react";
import { formatDisplayedError } from "@/lib/ipc-error";
export function createBackgroundTask(subscribeProgress) {
    let state = {
        running: false,
        progress: null,
        meta: null,
        result: null,
        error: "",
        acknowledged: true,
    };
    const listeners = new Set();
    const set = (patch) => {
        state = { ...state, ...patch };
        for (const listener of listeners)
            listener();
    };
    subscribeProgress?.((progress) => {
        if (state.running)
            set({ progress });
    });
    return {
        getState: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async run(fn, initial, meta) {
            if (state.running)
                throw new Error("任务正在进行中");
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
            }
            catch (err) {
                set({
                    running: false,
                    progress: null,
                    error: formatDisplayedError(err, undefined, "操作失败"),
                });
                throw err;
            }
        },
        acknowledge: () => {
            if (!state.acknowledged)
                set({ acknowledged: true });
        },
    };
}
export function useBackgroundTask(task) {
    return useSyncExternalStore(task.subscribe, task.getState);
}
export const integrityScanTask = createBackgroundTask((callback) => window.biliDesk.bili.onIntegrityProgress(callback));
export const upActivityScanTask = createBackgroundTask((callback) => window.biliDesk.bili.onUpActivityProgress(callback));
export const collectionClassifyTask = createBackgroundTask((callback) => window.biliDesk.bili.onCollectionClassifyProgress(callback));
