import { type ReactNode, type RefObject } from "react";
type EstimateSize<T> = number | ((item: T, index: number) => number);
interface VirtualListProps<T> {
    items: T[];
    /** 滚动容器（视频页外层） */
    scrollRootRef?: RefObject<HTMLElement | null>;
    /** 单项预估高度；带图评论要按内容估，否则 spacer 会差一截然后跳 */
    estimateSize?: EstimateSize<T>;
    overscan?: number;
    className?: string;
    getItemKey: (item: T, index: number) => string | number;
    renderItem: (item: T, index: number) => ReactNode;
    /** 接近底部时回调（无限加载） */
    onEndReached?: () => void;
    endReachedOffset?: number;
    footer?: ReactNode;
    /** 把这一项滚进滚动容器，虚拟列表会跟着挂载它 */
    scrollToKey?: string | number | null;
}
/**
 * 轻量虚拟列表：只挂载可视区附近的项，并用 ResizeObserver 记住真实高度。
 * 评论附图会把条目撑得远高于默认 168px，固定估高 + content-visibility 会在滑入时跳一下。
 */
export declare function VirtualList<T>({ items, scrollRootRef, estimateSize, overscan, className, getItemKey, renderItem, onEndReached, endReachedOffset, footer, scrollToKey, }: VirtualListProps<T>): import("react/jsx-runtime").JSX.Element;
export {};
