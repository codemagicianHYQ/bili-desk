/** 把 B 站错误码 / IPC 包装译成用户能看懂的原因。主进程抛错和页面展示共用。 */
export type BiliFailureHint = "video" | "dynamic" | "article" | "live" | "user" | "season" | "audio";
export interface BiliFailureCopy {
    title: string;
    detail: string;
}
export declare function stripIpcErrorText(input: unknown): string;
export declare function describeBiliFailure(input: unknown, hint?: BiliFailureHint, fallback?: string): BiliFailureCopy;
/** 行内提示用的一句话原因 */
export declare function formatBiliFailureText(input: unknown, hint?: BiliFailureHint, fallback?: string): string;
