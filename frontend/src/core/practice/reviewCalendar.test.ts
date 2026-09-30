import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listReviews, rescheduleReview } from "./reviewFiles";
import { DEFAULT_REMINDERS, normalizeReminderSettings, reminderText, reviewsToAnnounce } from "./reviewReminders";
import { addPractice, isIsoDate, moveReview, newReview, projectSchedule, serializeReview } from "./reviewSchedule";

describe("projectSchedule", () => {
  it("lists the pending review and the ones after it up the ladder, dated from each previous one", () => {
    // level 2 pending on 2026-10-10: it becomes level 3 (14 d), 4 (30 d), 5 (60 d)
    expect(projectSchedule("2026-10-10", 2, 4)).toEqual([
      { date: "2026-10-10", interval: 7, level: 2 },
      { date: "2026-10-24", interval: 14, level: 3 },
      { date: "2026-11-23", interval: 30, level: 4 },
      { date: "2027-01-22", interval: 60, level: 5 },
    ]);
  });

  it("stays on the longest interval at the top of the ladder and is empty without a date", () => {
    expect(projectSchedule("2026-01-01", 6, 3).map((p) => p.interval)).toEqual([120, 120, 120]);
    expect(projectSchedule("", 1)).toEqual([]);
  });
});

describe("moving a review", () => {
  it("changes only the pending date", () => {
    const s = addPractice(newReview("1.2 Suma", "M/A/1.2 Suma", "mathematics"), { date: "2026-09-29", skill: "solve", passed: true });
    const moved = moveReview(s, "2026-10-05");
    expect(moved.next).toBe("2026-10-05");
    expect(moved.level).toBe(s.level);
    expect(moved.days).toEqual(s.days);
  });

  it("accepts real calendar dates only", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("30/09/2026")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe("rescheduleReview (files)", () => {
  let root: string;
  const REL = "Matemáticas 1/Repaso/1.2 Suma.md";
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_review_"));
    fs.mkdirSync(path.join(root, "Matemáticas 1", "Repaso"), { recursive: true });
    const s = addPractice(newReview("1.2 Suma", "Matemáticas 1/A/1.2 Suma", "mathematics"), { date: "2026-09-29", skill: "solve", passed: true });
    fs.writeFileSync(path.join(root, REL), serializeReview(s, "2026-09-29"), "utf-8");
  });

  it("writes the new date, keeps the history, and the list and the projection follow it", () => {
    const item = rescheduleReview(root, REL, "2026-10-20", "2026-09-30");
    expect(item.next).toBe("2026-10-20");
    expect(item.practicedDays).toBe(1);
    expect(item.upcoming[0]!.date).toBe("2026-10-20");
    expect(listReviews(root, "2026-09-30")[0]!.next).toBe("2026-10-20");
    expect(fs.readFileSync(path.join(root, REL), "utf-8")).toContain("next_review: 2026-10-20");
  });

  it("only touches review notes inside the vault, with a valid date", () => {
    expect(() => rescheduleReview(root, REL, "mañana")).toThrow(/fecha/);
    expect(() => rescheduleReview(root, "Matemáticas 1/1.2 Suma.md", "2026-10-20")).toThrow(/nota de repaso/);
    expect(() => rescheduleReview(root, "../fuera/Repaso/x.md", "2026-10-20")).toThrow(/nota de repaso/);
    expect(() => rescheduleReview(root, ".notevault/Repaso/x.md", "2026-10-20")).toThrow(/nota de repaso/);
    expect(() => rescheduleReview(root, "Matemáticas 1/Repaso/nada.md", "2026-10-20")).toThrow(/leer/);
  });
});

describe("reminders", () => {
  const item = (path: string, next: string, inDays: number) => ({ path, topic: path, next, inDays }) as never;
  const at = (h: number) => new Date(2026, 8, 30, h, 0, 0);

  it("announces due and overdue reviews once per date, from the chosen hour", () => {
    const items = [item("a", "2026-09-30", 0), item("b", "2026-09-28", -2), item("c", "2026-10-02", 2)];
    expect(reviewsToAnnounce(items, {}, DEFAULT_REMINDERS, at(8))).toEqual([]); // before 09:00
    expect(reviewsToAnnounce(items, {}, DEFAULT_REMINDERS, at(9)).map((r) => r.path)).toEqual(["a", "b"]);
    expect(reviewsToAnnounce(items, { a: "2026-09-30" }, DEFAULT_REMINDERS, at(12)).map((r) => r.path)).toEqual(["b"]);
    // moved to another date, it counts as new
    expect(reviewsToAnnounce([item("a", "2026-09-30", 0)], { a: "2026-09-25" }, DEFAULT_REMINDERS, at(12))).toHaveLength(1);
  });

  it("stays silent when switched off, and cleans the settings it reads", () => {
    expect(reviewsToAnnounce([item("a", "2026-09-30", 0)], {}, { enabled: false, hour: 0 }, at(12))).toEqual([]);
    expect(normalizeReminderSettings({ hour: 30, enabled: 0 })).toEqual({ enabled: false, hour: 9 });
    expect(normalizeReminderSettings(null)).toEqual(DEFAULT_REMINDERS);
  });

  it("writes the notification text", () => {
    expect(reminderText([item("1.2 Suma", "x", 0)]).title).toBe("Toca repasar un tema");
    const many = reminderText(Array.from({ length: 6 }, (_, i) => item(`T${i}`, "x", 0)));
    expect(many.title).toBe("Toca repasar 6 temas");
    expect(many.body).toContain("…y 2 más");
  });
});
