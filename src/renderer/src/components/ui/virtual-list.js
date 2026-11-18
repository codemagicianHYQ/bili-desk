import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
function resolveEstimate(estimate, item, index) {
    return typeof estimate === "function" ? estimate(item, index) : estimate;
}
function findIndexAtOffset(offsets, y) {
    const last = offsets.length - 2;
    if (last <= 0 || y <= 0)
        return 0;
    if (y >= offsets[last])
        return last;
    let lo = 0;
    let hi = last;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= y)
            lo = mid;
        else
            hi = mid - 1;
    }
    return lo;
}
/**
 * 轻量虚拟列表：只挂载可视区附近的项，并用 ResizeObserver 记住真实高度。
 * 评论附图会把条目撑得远高于默认 168px，固定估高 + content-visibility 会在滑入时跳一下。
 */
export function VirtualList({ items, scrollRootRef, estimateSize = 168, overscan = 6, className, getItemKey, renderItem, onEndReached, endReachedOffset = 800, footer, scrollToKey, }) {
    const anchorRef = useRef(null);
    const onEndReachedRef = useRef(onEndReached);
    const sizesRef = useRef(new Map());
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
    const getSize = useCallback((index) => {
        const item = items[index];
        if (item == null)
            return 168;
        const key = getItemKey(item, index);
        return (sizesRef.current.get(key) ?? resolveEstimate(estimateSize, item, index));
    }, [items, getItemKey, estimateSize, sizeVersion]);
    const offsets = useMemo(() => {
        const next = new Array(items.length + 1);
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
        const start = Math.max(0, findIndexAtOffset(offsets, viewportStart) - overscan);
        let end = findIndexAtOffset(offsets, viewportEnd) + 1 + overscan;
        end = Math.min(count, Math.max(end, start + 1));
        rangeStartRef.current = start;
        setRange((prev) => prev.start === start && prev.end === end ? prev : { start, end });
        const distanceToBottom = root.scrollHeight - root.scrollTop - root.clientHeight;
        if (distanceToBottom < endReachedOffset) {
            onEndReachedRef.current?.();
        }
    }, [scrollRootRef, offsets, overscan, endReachedOffset]);
    const handleMeasured = useCallback((key, index, height) => {
        if (!Number.isFinite(height) || height <= 0)
            return;
        const prev = sizesRef.current.get(key);
        if (prev != null && Math.abs(prev - height) < 1)
            return;
        sizesRef.current.set(key, height);
        if (prev != null && index < rangeStartRef.current) {
            const root = scrollRootRef?.current;
            if (root)
                root.scrollTop += height - prev;
        }
        if (rafRef.current)
            return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = 0;
            setSizeVersion((value) => value + 1);
        });
    }, [scrollRootRef]);
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
            if (rafRef.current)
                window.cancelAnimationFrame(rafRef.current);
        };
    }, [scrollRootRef, updateRange]);
    useLayoutEffect(() => {
        updateRange();
    }, [items.length, sizeVersion, updateRange]);
    const scrolledKeyRef = useRef(null);
    useEffect(() => {
        if (scrollToKey == null || scrollToKey === "")
            return;
        if (scrolledKeyRef.current === scrollToKey)
            return;
        const index = items.findIndex((item, itemIndex) => getItemKey(item, itemIndex) === scrollToKey);
        if (index < 0)
            return;
        const root = scrollRootRef?.current;
        const anchor = anchorRef.current;
        if (!root || !anchor)
            return;
        const rootRect = root.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const listOffset = root.scrollTop + (anchorRect.top - rootRect.top);
        root.scrollTo({
            top: Math.max(0, listOffset + (offsets[index] ?? 0) - 72),
            behavior: "smooth",
        });
        scrolledKeyRef.current = scrollToKey;
    }, [scrollToKey, items, offsets, getItemKey, scrollRootRef]);
    const start = Math.min(range.start, items.length);
    const end = Math.min(Math.max(range.end, start), items.length);
    const topSpacer = offsets[start] ?? 0;
    const bottomSpacer = Math.max(0, totalSize - (offsets[end] ?? totalSize));
    const visible = useMemo(() => items.slice(start, end), [items, start, end]);
    return (_jsxs("div", { ref: anchorRef, className: className, style: { overflowAnchor: "none" }, children: [_jsx("div", { style: { height: topSpacer }, "aria-hidden": true }), visible.map((item, offset) => {
                const index = start + offset;
                const key = getItemKey(item, index);
                return (_jsx(VirtualRow, { itemKey: key, index: index, onMeasured: handleMeasured, children: renderItem(item, index) }, key));
            }), _jsx("div", { style: { height: bottomSpacer }, "aria-hidden": true }), footer] }));
}
function VirtualRow({ itemKey, index, onMeasured, children, }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node)
            return;
        const report = () => {
            onMeasured(itemKey, index, node.getBoundingClientRect().height);
        };
        report();
        const observer = new ResizeObserver(report);
        observer.observe(node);
        return () => observer.disconnect();
    }, [itemKey, index, onMeasured]);
    return _jsx("div", { ref: ref, children: children });
}
