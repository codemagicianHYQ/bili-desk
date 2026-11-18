import type { UpActivityArchive, UpActivityScanProgress } from "@shared/types";
export declare function getUpActivityArchive(): UpActivityArchive;
/** 扫描全部关注 UP 的最新稿件时间 + 最新动态时间 */
export declare function runUpActivityScan(onProgress?: (p: UpActivityScanProgress) => void): Promise<UpActivityArchive>;
export declare function clearUpActivityArchive(): UpActivityArchive;
/** 取关/拉黑后从本地缓存剔除，避免再进页面又冒出来 */
export declare function removeUpActivityRecords(mids: number[]): UpActivityArchive;
