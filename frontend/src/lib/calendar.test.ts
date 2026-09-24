import { describe, expect, it } from "vitest";
import { fmtDuration, layoutDay, toHm, toMin } from "./calendar";
import type { Occurrence } from "./types";

const occ = (id: string, start: string | null, duration: number | null): Occurrence => ({
  id, title: id, kind: "event", date: "2026-01-05", start, duration_min: duration, colour: "#000000",
  done: false, source: "event", editable: true, checkable: true, links: [], reminder_min: null,
});

describe("calendar helpers", () => {
  it("converts times", () => {
    expect(toMin("08:30")).toBe(510);
    expect(toMin(null)).toBeNull();
    expect(toHm(510)).toBe("08:30");
    expect(toHm(99999)).toBe("23:59");
    expect(fmtDuration(90)).toBe("1 h 30 min");
  });
  it("puts overlapping blocks side by side", () => {
    const placed = layoutDay([occ("a", "09:00", 60), occ("b", "09:30", 60), occ("c", "11:00", 30), occ("d", null, null)]);
    const by = Object.fromEntries(placed.map((p) => [p.occ.id, p]));
    expect(placed).toHaveLength(3);
    expect([by.a!.col, by.b!.col, by.a!.cols]).toEqual([0, 1, 2]);
    expect([by.c!.col, by.c!.cols]).toEqual([0, 1]);
  });
});
