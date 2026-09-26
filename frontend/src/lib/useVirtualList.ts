// Lightweight virtual windowing hook for long lists (FileTree, search results, backlinks).
// No heavy third-party dependencies (~50 lines).

import { useEffect, useState, type RefObject } from "react";

export interface VirtualListOptions {
  itemCount: number;
  itemHeight: number;
  containerRef: RefObject<HTMLElement | null>;
  overscan?: number;
}

export interface VirtualListResult {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  startOffset: number;
  isVirtual: boolean;
  scrollToIndex: (index: number) => void;
}

export function computeVirtualRange(
  itemCount: number,
  itemHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 5,
): {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  startOffset: number;
  isVirtual: boolean;
} {
  const totalHeight = itemCount * itemHeight;
  const vp = viewportHeight || 600;

  if (totalHeight <= vp + overscan * itemHeight || itemCount <= 40) {
    return {
      startIndex: 0,
      endIndex: itemCount,
      totalHeight,
      startOffset: 0,
      isVirtual: false,
    };
  }

  const visibleCount = Math.ceil(vp / itemHeight);
  const rawStart = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(itemCount, rawStart + visibleCount + overscan);
  const startOffset = startIndex * itemHeight;

  return {
    startIndex,
    endIndex,
    totalHeight,
    startOffset,
    isVirtual: true,
  };
}

export function useVirtualList({
  itemCount,
  itemHeight,
  containerRef,
  overscan = 5,
}: VirtualListOptions): VirtualListResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      setScrollTop(el.scrollTop);
    };

    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };

    updateHeight();
    onScroll();

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateHeight);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => updateHeight());
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateHeight);
      ro?.disconnect();
    };
  }, [containerRef]);

  const range = computeVirtualRange(itemCount, itemHeight, scrollTop, viewportHeight, overscan);

  const scrollToIndex = (index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const vp = viewportHeight || 600;
    const targetTop = index * itemHeight;
    if (targetTop < el.scrollTop) {
      el.scrollTop = targetTop;
    } else if (targetTop + itemHeight > el.scrollTop + vp) {
      el.scrollTop = targetTop + itemHeight - vp;
    }
  };

  return {
    ...range,
    scrollToIndex,
  };
}
