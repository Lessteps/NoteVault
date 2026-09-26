// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { SmoothSparkline, Sparkline } from "./charts";

describe("SmoothSparkline", () => {
  it("renders an SVG with gradient and path", () => {
    const el = SmoothSparkline({ values: [1, 5, 2, 8, 4], colour: "#22d3ee" });
    expect(el).toBeDefined();
    expect(el?.type).toBe("svg");
    expect(el?.props["aria-hidden"]).toBe(true);
  });

  it("handles empty or default values gracefully", () => {
    const el = SmoothSparkline({ colour: "#f59e0b" });
    expect(el).toBeDefined();
    expect(el?.type).toBe("svg");
  });
});
