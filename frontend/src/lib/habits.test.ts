import { describe, expect, it } from "vitest";
import { addDays, daysBetween, level, monthBounds, pct, weekStart } from "./habits";

describe("habit dates", () => {
  it("walks days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-09-24")).toBe("2026-09-21");   // Thursday
    expect(weekStart("2026-09-27")).toBe("2026-09-21");   // Sunday
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
  });
  it("lists a range and month bounds", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toEqual(
      ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(monthBounds(2028, 1)).toEqual(["2028-02-01", "2028-02-29"]);
  });
  it("formats rates and levels", () => {
    expect(pct(null)).toBe("—");
    expect(pct(0.666)).toBe("67%");
    expect(level(1, true)).toBe(4);
    expect(level(1, false)).toBe(0);
    expect(level(0.5, true)).toBe(2);
  });
});
