// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { applyRenderingSettings } from "./app";

describe("applyRenderingSettings", () => {
  it("sets and unsets data-perf and data-motion attributes on documentElement", () => {
    applyRenderingSettings({ liteEffects: true, reduceMotion: true });
    expect(document.documentElement.dataset.perf).toBe("lite");
    expect(document.documentElement.dataset.motion).toBe("reduced");

    applyRenderingSettings({ liteEffects: false, reduceMotion: false });
    expect(document.documentElement.dataset.perf).toBeUndefined();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});
