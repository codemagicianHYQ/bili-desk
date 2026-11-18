import type { CollectionClassifyProgress, CollectionClassifyResult, IntegrityScanProgress, IntegrityScanResult, IntegrityScanScope, UpActivityArchive, UpActivityScanProgress } from "@shared/types";
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
export declare function createBackgroundTask<P, R, M = undefined>(subscribeProgress?: (callback: (progress: P) => void) => () => void): BackgroundTask<P, R, M>;
export declare function useBackgroundTask<P, R, M>(task: BackgroundTask<P, R, M>): BackgroundTaskState<P, R, M>;
export declare const integrityScanTask: BackgroundTask<IntegrityScanProgress, IntegrityScanResult, IntegrityScanScope>;
export declare const upActivityScanTask: BackgroundTask<UpActivityScanProgress, UpActivityArchive, undefined>;
export declare const collectionClassifyTask: BackgroundTask<CollectionClassifyProgress, CollectionClassifyResult, undefined>;
