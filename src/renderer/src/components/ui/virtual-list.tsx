import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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
}

function resolveEstimate<T>(
  estimate: EstimateSize<T>,
  item: T,
  index: number,
): number {
  return typeof estimate === "function" ? estimate(item, index) : estimate;
}

function findIndexAtOffset(offsets: number[], y: number): number {
  const last = offsets.length - 2;
  if (last <= 0 || y <= 0) return 0;
  if (y >= offsets[last]) return last;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * 轻量虚拟列表：只挂载可视区附近的项，并用 ResizeObserver 记住真实高度。
 * 评论附图会把条目撑得远高于默认 168px，固定估高 + content-visibility 会在滑入时跳一下。
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
  const sizesRef = useRef(new Map<string | number, number>());
  const rangeStartRef = useRef(0);
  const rafRef = useRef(0);
  const itemsRef = useRef(items);
  const [range, setRange] = useState({
    start: 0,
    end: Math.min(items.length, 24),
  });
  const [sizeVersion, setSizeVersion] = useState(0);

  onEndReachedRef.current = onEndReached;
  itemsRef.current = items;

  const getSize = useCallback(
    (index: number) => {
      const item = items[index];
      if (item == null) return 168;
      const key = getItemKey(item, index);
      return (
        sizesRef.current.get(key) ?? resolveEstimate(estimateSize, item, index)
      );
    },
    [items, getItemKey, estimateSize, sizeVersion],
  );

  const offsets = useMemo(() => {
    const next = new Array<number>(items.length + 1);
    next[0] = 0;
    for (let i = 0; i < items.length; i++) {
      next[i + 1] = next[i] + getSize(i);
    }
    return next;
  }, [items, getSize]);

  const totalSize = offsets[items.length] ?? 0;

  const updateRange = useCallback(() => {
    const root = scrollRootRef?.current;
    const anchor = anchorRef.current;
    const count = itemsRef.current.length;
    if (!root || !anchor) {
      setRange({ start: 0, end: Math.min(count, 24) });
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const listOffset = root.scrollTop + (anchorRect.top - rootRect.top);
    const viewportStart = Math.max(0, root.scrollTop - listOffset);
    const viewportEnd = viewportStart + root.clientHeight;

    const start = Math.max(
      0,
      findIndexAtOffset(offsets, viewportStart) - overscan,
    );
    let end = findIndexAtOffset(offsets, viewportEnd) + 1 + overscan;
    end = Math.min(count, Math.max(end, start + 1));
    rangeStartRef.current = start;

    setRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );

    const distanceToBottom =
      root.scrollHeight - root.scrollTop - root.clientHeight;
    if (distanceToBottom < endReachedOffset) {
      onEndReachedRef.current?.();
    }
  }, [scrollRootRef, offsets, overscan, endReachedOffset]);

  const handleMeasured = useCallback(
    (key: string | number, index: number, height: number) => {
      if (!Number.isFinite(height) || height <= 0) return;
      const prev = sizesRef.current.get(key);
      if (prev != null && Math.abs(prev - height) < 1) return;
      sizesRef.current.set(key, height);
      if (prev != null && index < rangeStartRef.current) {
        const root = scrollRootRef?.current;
        if (root) root.scrollTop += height - prev;
      }
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        setSizeVersion((value) => value + 1);
      });
    },
    [scrollRootRef],
  );

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
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRootRef, updateRange]);

  useLayoutEffect(() => {
    updateRange();
  }, [items.length, sizeVersion, updateRange]);

  const start = Math.min(range.start, items.length);
  const end = Math.min(Math.max(range.end, start), items.length);
  const topSpacer = offsets[start] ?? 0;
  const bottomSpacer = Math.max(0, totalSize - (offsets[end] ?? totalSize));
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
        const key = getItemKey(item, index);
        return (
          <VirtualRow
            key={key}
            itemKey={key}
            index={index}
            onMeasured={handleMeasured}
          >
            {renderItem(item, index)}
          </VirtualRow>
        );
      })}
      <div style={{ height: bottomSpacer }} aria-hidden />
      {footer}
    </div>
  );
}

function VirtualRow({
  itemKey,
  index,
  onMeasured,
  children,
}: {
  itemKey: string | number;
  index: number;
  onMeasured: (key: string | number, index: number, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const report = () => {
      onMeasured(itemKey, index, node.getBoundingClientRect().height);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [itemKey, index, onMeasured]);

  return <div ref={ref}>{children}</div>;
}
