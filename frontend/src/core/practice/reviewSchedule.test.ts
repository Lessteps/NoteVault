import { describe, expect, it } from "vitest";
import { addDays, addPractice, daysUntil, newReview, parseReview, serializeReview } from "./reviewSchedule";

const fresh = () => newReview("1.1 Números", "Matemáticas/1 A/1.1 Números", "mathematics");
const ev = (date: string, skill: string, passed = true) => ({ date, skill, passed });

describe("topic review schedule", () => {
  it("first practice day schedules the next review in three days", () => {
    const s = addPractice(fresh(), ev("2026-09-29", "solve"));
    expect(s.level).toBe(1);
    expect(s.next).toBe("2026-10-02");
  });

  it("many skills on the same day are one practice day, whatever the skill", () => {
    let s = fresh();
    for (const skill of ["solve", "process", "prove", "solve"]) s = addPractice(s, ev("2026-09-29", skill));
    expect(s.days).toHaveLength(1);
    expect(s.days[0]!.skills).toEqual(["solve", "process", "prove"]);
    expect(s.days[0]!.attempts).toBe(4);
    expect(s.level).toBe(1);
    expect(s.next).toBe("2026-10-02");
  });

  it("climbs the ladder only when the review is done on or after its due date", () => {
    let s = addPractice(fresh(), ev("2026-09-29", "solve")); // next 10-02
    s = addPractice(s, ev("2026-09-30", "solve")); // early: does not climb, pushes the date
    expect(s.level).toBe(1);
    expect(s.next).toBe("2026-10-03");
    s = addPractice(s, ev("2026-10-04", "solve")); // due: level 2 → +7
    expect(s.level).toBe(2);
    expect(s.next).toBe("2026-10-11");
    s = addPractice(s, ev("2026-10-11", "prove")); // level 3 → +14
    expect(s.next).toBe("2026-10-25");
  });

  it("a day with nothing passed brings the topic back tomorrow", () => {
    const s = addPractice(fresh(), ev("2026-09-29", "solve", false));
    expect(s.next).toBe("2026-09-30");
    const better = addPractice(s, ev("2026-09-29", "solve", true));
    expect(better.next).toBe("2026-10-02");
  });

  it("round-trips through its note and reads the dates", () => {
    const s = addPractice(addPractice(fresh(), ev("2026-09-29", "solve")), ev("2026-09-29", "prove", false));
    const text = serializeReview(s, "2026-09-29");
    expect(text).toContain("next_review: 2026-10-02");
    expect(text).toContain("Próximo repaso:");
    expect(text).toContain("| 2026-09-29 | solve, prove | 2 | 1 |");
    expect(parseReview(text)).toEqual(s);
  });

  it("date helpers", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysUntil("2026-10-02", "2026-09-29")).toBe(3);
    expect(parseReview("no es un repaso")).toBeNull();
  });
});
