import { describe, expect, it } from "vitest";
import { normalizeClock, normalizeMinutes } from "./peek";

describe("normalizeMinutes", () => {
  it("pads and accepts 0-59", () => {
    expect(normalizeMinutes("0")).toBe("00");
    expect(normalizeMinutes("9")).toBe("09");
    expect(normalizeMinutes("45")).toBe("45");
    expect(normalizeMinutes("59")).toBe("59");
  });

  it("rejects what a native time input never produced", () => {
    expect(normalizeMinutes("")).toBeNull();
    expect(normalizeMinutes("60")).toBeNull();
    expect(normalizeMinutes("9a")).toBeNull();
    expect(normalizeMinutes("-1")).toBeNull();
  });
});

describe("normalizeClock", () => {
  it("keeps the native HH:MM shape", () => {
    expect(normalizeClock("9:5")).toBe("09:05");
    expect(normalizeClock("09:05")).toBe("09:05");
    expect(normalizeClock("0905")).toBe("09:05");
    expect(normalizeClock("9")).toBe("09:00");
    expect(normalizeClock(" 23:59 ")).toBe("23:59");
    expect(normalizeClock("9.15")).toBe("09:15");
  });

  it("rejects out of range and junk", () => {
    expect(normalizeClock("24:00")).toBeNull();
    expect(normalizeClock("12:60")).toBeNull();
    expect(normalizeClock("")).toBeNull();
    expect(normalizeClock("tarde")).toBeNull();
  });
});
