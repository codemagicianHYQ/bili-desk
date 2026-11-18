import { type BiliFailureHint } from "@shared/bili-error";
/** 解开 Electron IPC 包装后的真实错误文案 */
export declare function extractIpcErrorMessage(err: unknown): string;
/** 页面上展示的一句话原因（含删除、下架、未登录、风控等） */
export declare function formatDisplayedError(err: unknown, hint?: BiliFailureHint, fallback?: string): string;
/** 评论区被关闭（正常业务态，不是系统故障） */
export declare function isCommentClosedMessage(message: string): boolean;
export declare function formatCommentLoadError(err: unknown): {
    closed: boolean;
    message: string;
};
/** UP 主页 / 用户空间相关错误，转成可读原因 */
export declare function formatUserSpaceError(err: unknown): string;
export interface ContentUnavailableCopy {
    title: string;
    detail: string;
}
/** 视频 / 动态打不开时的具体原因 */
export declare function describeContentUnavailable(kind: "video" | "dynamic", err: unknown): ContentUnavailableCopy;
