import { describe, expect, it } from "vitest";
import { datesBetween, Recurrence } from "./recurrence";

describe("recurrence", () => {
  const fixedDay = "2026-09-12"; // Saturday (weekday index 5)
  const anchor = "2026-09-01";
  const until = "2026-09-30";

  it("parses empty or none as non-repeating", () => {
    const r1 = Recurrence.parse("");
    expect(r1.repeats).toBe(false);
    expect(r1.toString()).toBe("");
    expect(r1.describe()).toBe("No se repite");

    const r2 = Recurrence.parse("none");
    expect(r2.repeats).toBe(false);
  });

  it("parses daily", () => {
    const r = Recurrence.parse("daily");
    expect(r.repeats).toBe(true);
    expect(r.toString()).toBe("daily");
    expect(r.describe()).toBe("Todos los días");
    expect(r.occursOn("2026-09-12")).toBe(true);
  });

  it("parses weekly rules and formats correctly", () => {
    const r = Recurrence.parse("weekly:0,2,4"); // Mon, Wed, Fri
    expect(r.repeats).toBe(true);
    expect(r.toString()).toBe("weekly:0,2,4");
    expect(r.describe()).toBe("Cada lun, mié, vie");
    expect(r.occursOn("2026-09-14")).toBe(true); // Monday
    expect(r.occursOn("2026-09-15")).toBe(false); // Tuesday
    expect(r.occursOn("2026-09-16")).toBe(true); // Wednesday

    // All days normalizes to daily
    const rAll = Recurrence.parse("weekly:0,1,2,3,4,5,6");
    expect(rAll.toString()).toBe("daily");

    // Single weekday
    const rOne = Recurrence.parse("weekly:0");
    expect(rOne.describe()).toBe("Cada lunes");

    // Workdays
    const rWork = Recurrence.parse("weekly:0,1,2,3,4");
    expect(rWork.describe()).toBe("Días laborables (lun a vie)");

    // Weekend
    const rEnd = Recurrence.parse("weekly:5,6");
    expect(rEnd.describe()).toBe("Fines de semana");
  });

  it("parses every:N days", () => {
    const r = Recurrence.parse("every:3");
    expect(r.repeats).toBe(true);
    expect(r.toString()).toBe("every:3");
    expect(r.describe()).toBe("Cada 3 días");

    expect(r.occursOn("2026-09-01", anchor)).toBe(true);
    expect(r.occursOn("2026-09-02", anchor)).toBe(false);
    expect(r.occursOn("2026-09-04", anchor)).toBe(true);

    // every:1 normalizes to daily
    const r1 = Recurrence.parse("every:1");
    expect(r1.toString()).toBe("daily");
  });

  it("parses monthly days and handles short months", () => {
    const r = Recurrence.parse("monthly:1,15,31");
    expect(r.repeats).toBe(true);
    expect(r.toString()).toBe("monthly:1,15,31");
    expect(r.describe()).toBe("Cada mes los días 1, 15, 31");

    expect(r.occursOn("2026-09-01")).toBe(true);
    expect(r.occursOn("2026-09-15")).toBe(true);
    // September has 30 days, min(31, 30) = 30
    expect(r.occursOn("2026-09-30")).toBe(true);
    expect(r.occursOn("2026-09-12")).toBe(false);

    // Conformance test: 31 in February 2027 (non leap-year -> 28 days)
    const r31 = Recurrence.parse("monthly:31");
    expect(r31.occursOn("2027-02-28")).toBe(true);
    expect(r31.occursOn("2027-02-27")).toBe(false);
  });

  it("respects anchor and until boundaries", () => {
    const r = Recurrence.parse("daily");
    expect(r.occursOn("2026-08-31", anchor, until)).toBe(false);
    expect(r.occursOn("2026-09-01", anchor, until)).toBe(true);
    expect(r.occursOn("2026-09-30", anchor, until)).toBe(true);
    expect(r.occursOn("2026-10-01", anchor, until)).toBe(false);
  });

  it("computes nextAfter correctly", () => {
    const r = Recurrence.parse("weekly:0,2"); // Mon, Wed
    // 2026-09-12 is Saturday -> next occurrence is Monday 2026-09-14
    const nxt = r.nextAfter(fixedDay);
    expect(nxt).not.toBeNull();
    expect(nxt?.toISOString().slice(0, 10)).toBe("2026-09-14");
  });

  it("yields dates within window", () => {
    const r = Recurrence.parse("every:5");
    const dates = Array.from(datesBetween(r, "2026-09-01", "2026-09-16", "2026-09-01"));
    const strings = dates.map((d) => d.toISOString().slice(0, 10));
    expect(strings).toEqual(["2026-09-01", "2026-09-06", "2026-09-11", "2026-09-16"]);
  });
});
