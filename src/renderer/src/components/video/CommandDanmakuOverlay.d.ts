interface CommandDanmakuOverlayProps {
    aid: number;
    cid: number;
    /** 当前播放秒数；由父组件从播放器同步 */
    currentTime: number;
    className?: string;
}
export declare function CommandDanmakuOverlay({ aid, cid, currentTime, className, }: CommandDanmakuOverlayProps): import("react/jsx-runtime").JSX.Element | null;
export {};
