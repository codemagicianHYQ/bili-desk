export declare const REFRESH_DONE_EVENT = "bilidesk:refresh-done";
/** 通过事件刷新的页面拉完数据后调用，顶栏刷新按钮据此停止转圈 */
export declare function notifyRefreshDone(): void;
/** 订阅顶栏刷新事件；handler 结束后自动通知顶栏 */
export declare function usePageRefresh(eventName: string, handler: () => Promise<unknown>): void;
