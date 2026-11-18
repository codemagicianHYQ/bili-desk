/** 从直播弹幕 / 历史接口里抽出 `[喝彩]` → 图片地址 */
export declare function addLiveEmote(map: Record<string, string>, key: unknown, url: unknown): void;
export declare function mergeLiveEmoteMaps(...maps: Array<Record<string, string> | undefined>): Record<string, string>;
/** 解析 DANMU_MSG.info 里的表情表 / 大表情 */
export declare function parseDanmuMsgEmotes(info: unknown[]): {
    emotes: Record<string, string>;
    stickerUrl?: string;
    text: string;
};
export declare function parseHistoryItemEmotes(item: Record<string, unknown>): Record<string, string>;
