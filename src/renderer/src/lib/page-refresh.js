import { useEffect, useRef } from "react";
export const REFRESH_DONE_EVENT = "bilidesk:refresh-done";
/** 通过事件刷新的页面拉完数据后调用，顶栏刷新按钮据此停止转圈 */
export function notifyRefreshDone() {
    window.dispatchEvent(new CustomEvent(REFRESH_DONE_EVENT));
}
/** 订阅顶栏刷新事件；handler 结束后自动通知顶栏 */
export function usePageRefresh(eventName, handler) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(() => {
        const onRefresh = () => {
            void handlerRef.current().finally(notifyRefreshDone);
        };
        window.addEventListener(eventName, onRefresh);
        return () => window.removeEventListener(eventName, onRefresh);
    }, [eventName]);
}
