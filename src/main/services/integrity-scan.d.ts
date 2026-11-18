import type { IntegrityScanProgress, IntegrityScanResult, IntegrityScanScope } from "@shared/types";
export declare function isPlaceholderTitle(title: string): boolean;
/** 收藏夹 medias[].attr：1 其他原因失效，9 UP 删除；不要把 attr!==0 一律当失效 */
export declare function isInvalidFavAttr(attr: number): boolean;
export declare function favInvalidReason(attr: number, title: string): string;
/** 按分类单独扫描，只更新对应归档，不影响其它 Tab */
export declare function runIntegrityScan(scope?: IntegrityScanScope, onProgress?: (p: IntegrityScanProgress) => void): Promise<IntegrityScanResult>;
export declare function getIntegrityArchive(): IntegrityScanResult;
export declare function dismissInvalidVideo(id: string): IntegrityScanResult;
export declare function dismissAbnormalFollowing(mid: number): IntegrityScanResult;
export declare function clearIntegrityArchive(scope?: IntegrityScanScope): IntegrityScanResult;
