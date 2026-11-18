import type { ReplyEmotePanel } from "@shared/types";
export declare function loadReplyEmotes(): Promise<Record<string, string>>;
export declare function loadReplyEmotePackages(): Promise<ReplyEmotePanel>;
/** 评论区表情面板（全局缓存）；单条评论自带的 emotes 会覆盖同名项 */
export declare function useReplyEmotes(localEmotes?: Record<string, string>): Record<string, string>;
