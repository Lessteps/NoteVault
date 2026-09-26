import { describe, expect, it } from "vitest";
import { computeVirtualRange } from "./useVirtualList";

describe("computeVirtualRange", () => {
  it("renders all items when itemCount is small", () => {
    const range = computeVirtualRange(20, 30, 0, 600);
    expect(range.isVirtual).toBe(false);
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(20);
    expect(range.totalHeight).toBe(600);
    expect(range.startOffset).toBe(0);
  });

  it("calculates windowed range for large item counts", () => {
    // 500 items, 30px each, scrollTop 600, viewport 300, overscan 2
    // rawStart = 600 / 30 = 20
    // visibleCount = ceil(300 / 30) = 10
    // startIndex = max(0, 20 - 2) = 18
    // endIndex = min(500, 20 + 10 + 2) = 32
    const range = computeVirtualRange(500, 30, 600, 300, 2);
    expect(range.isVirtual).toBe(true);
    expect(range.startIndex).toBe(18);
    expect(range.endIndex).toBe(32);
    expect(range.totalHeight).toBe(15000);
    expect(range.startOffset).toBe(18 * 30);
  });

  it("clamps at list boundaries", () => {
    // At the very top
    const top = computeVirtualRange(500, 30, 0, 300, 5);
    expect(top.startIndex).toBe(0);
    expect(top.endIndex).toBe(15);

    // At the very bottom
    const bottom = computeVirtualRange(100, 30, 3000, 300, 5);
    expect(bottom.endIndex).toBe(100);
  });
});
