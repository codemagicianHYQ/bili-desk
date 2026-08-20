import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

interface VirtualListProps<T> {
  items: T[];
  /** 滚动容器（视频页外层） */
  scrollRootRef?: RefObject<HTMLElement | null>;
  /** 单项预估高度，用于粗算可视窗口 */
  estimateSize?: number;
  overscan?: number;
  className?: string;
  getItemKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  /** 接近底部时回调（无限加载） */
  onEndReached?: () => void;
  endReachedOffset?: number;
  footer?: ReactNode;
}

/**
 * 轻量虚拟列表：只挂载可视区附近的项。
 * 官方评论区也是「数据可分页到很多，但 DOM 只渲染窗口内」——避免几万条评论白屏。
 */
export function VirtualList<T>({
  items,
  scrollRootRef,
  estimateSize = 168,
  overscan = 6,
  className,
  getItemKey,
  renderItem,
  onEndReached,
  endReachedOffset = 800,
  footer,
}: VirtualListProps<T>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const onEndReachedRef = useRef(onEndReached);
  const [range, setRange] = useState({
    start: 0,
    end: Math.min(items.length, 24),
  });

  onEndReachedRef.current = onEndReached;

  const updateRange = useCallback(() => {
    const root = scrollRootRef?.current;
    const anchor = anchorRef.current;
    if (!root || !anchor) {
      setRange({ start: 0, end: Math.min(items.length, 24) });
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    // 列表顶部相对滚动容器内容的偏移
    const listOffset = root.scrollTop + (anchorRect.top - rootRect.top);
    const viewportStart = Math.max(0, root.scrollTop - listOffset);
    const viewportEnd = viewportStart + root.clientHeight;

    const start = Math.max(
      0,
      Math.floor(viewportStart / estimateSize) - overscan,
    );
    const end = Math.min(
      items.length,
      Math.ceil(viewportEnd / estimateSize) + overscan,
    );

    setRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );

    const distanceToBottom =
      root.scrollHeight - root.scrollTop - root.clientHeight;
    if (distanceToBottom < endReachedOffset) {
      onEndReachedRef.current?.();
    }
  }, [scrollRootRef, items.length, estimateSize, overscan, endReachedOffset]);

  useEffect(() => {
    const root = scrollRootRef?.current;
    if (!root) {
      updateRange();
      return;
    }

    updateRange();
    root.addEventListener("scroll", updateRange, { passive: true });
    window.addEventListener("resize", updateRange);
    return () => {
      root.removeEventListener("scroll", updateRange);
      window.removeEventListener("resize", updateRange);
    };
  }, [scrollRootRef, updateRange]);

  useEffect(() => {
    updateRange();
  }, [items.length, updateRange]);

  const start = Math.min(range.start, items.length);
  const end = Math.min(Math.max(range.end, start), items.length);
  const topSpacer = start * estimateSize;
  const bottomSpacer = Math.max(0, (items.length - end) * estimateSize);
  const visible = useMemo(() => items.slice(start, end), [items, start, end]);

  return (
    <div
      ref={anchorRef}
      className={className}
      style={{ overflowAnchor: "none" }}
    >
      <div style={{ height: topSpacer }} aria-hidden />
      {visible.map((item, offset) => {
        const index = start + offset;
        return (
          <div
            key={getItemKey(item, index)}
            className="[content-visibility:auto] [contain-intrinsic-size:auto_168px]"
          >
            {renderItem(item, index)}
          </div>
        );
      })}
      <div style={{ height: bottomSpacer }} aria-hidden />
      {footer}
    </div>
  );
}
