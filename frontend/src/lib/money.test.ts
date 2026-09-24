import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "./money";

describe("money", () => {
  it("parses what people type", () => {
    expect(parseMoney("12.500")).toBe(1_250_000);
    expect(parseMoney("12500")).toBe(1_250_000);
    expect(parseMoney("12,5k")).toBe(1_250_000);
    expect(parseMoney("$ 1.200.000")).toBe(120_000_000);
    expect(parseMoney("3,5M")).toBe(350_000_000);
    expect(parseMoney("12500,50")).toBe(1_250_050);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("12,500")).toBe(1_250_000);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("doce")).toBeNull();
    expect(parseMoney("1.2.3k")).toBeNull();
  });
  it("formats like the classic app", () => {
    expect(formatMoney(1_250_000)).toBe("$ 12.500");
    expect(formatMoney(-1_250_000)).toBe("-$ 12.500");
    expect(formatMoney(100, "COP", true)).toBe("+$ 1");
    expect(formatMoney(1250, "USD")).toBe("$ 12,50");
    expect(formatMoney(0, "COP", true)).toBe("$ 0");
  });
});
