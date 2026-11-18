interface VideoFavButtonProps {
    aid: number;
    title?: string;
    intro?: string;
    ownerName?: string;
    /** 展示用收藏总数；有值时按钮显示数字而非文案 */
    count?: number;
    className?: string;
    /** toolbar：视频页互动栏样式 */
    appearance?: "default" | "toolbar";
    /** 0 隐藏；三连长按充电进度 */
    chargeProgress?: number;
    pop?: boolean;
    /** 三连等外部操作后的收藏态，优先于本地列表 */
    collected?: boolean;
    /** 变化时重新拉取收藏夹（三连成功后同步） */
    reloadToken?: number;
    onCollectedChange?: (collected: boolean) => void;
}
export declare function VideoFavButton({ aid, title, intro, ownerName, count, className, appearance, chargeProgress, pop, collected, reloadToken, onCollectedChange, }: VideoFavButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
