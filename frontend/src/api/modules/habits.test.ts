import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, parseIsoDate, todayIso, weekday } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { HabitManager } from "../../core/habitManager.js";
import { AppState } from "../appState.js";
import { habitsApi } from "./habits.js";

describe("habitsApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof habitsApi>;
  let every: Record<string, any>;
  let mwf: Record<string, any>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_habits_test_"));
    app = new AppState(tmpDir);
    api = habitsApi(app);

    // Start from a known, small set instead of defaults
    for (const h of api.habits_list()) {
      api.habits_remove(h.id as string);
    }
    every = api.habits_add({ name: "Agua", icon: "💧" });
    mwf = api.habits_add({ name: "Pelo", icon: "🧴", days: [0, 2, 4] });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("check in writes the same day file", () => {
    const today = todayIso();
    api.habits_set_done(today, every.id, true);

    const mgr = new HabitManager(tmpDir);
    expect(mgr.getDay(today).completed[every.id]).toBe(true);

    const day = api.habits_day(today);
    expect(day.completed[every.id]).toBe(true);
  });

  it("range knows active days", () => {
    const monday = "2026-01-05";
    const tuesday = "2026-01-06";
    const rows = api.habits_range(monday, tuesday);
    expect(rows[0]!.active).toContain(mwf.id); // Monday
    expect(rows[1]!.active).not.toContain(mwf.id); // Tuesday

    expect(() => api.habits_range("2020-01-01", "2026-01-01")).toThrow(ApiError);
  });

  it("rates count only scheduled days", () => {
    // A Mon/Wed/Fri habit done every time it was due is at 100%, not 3/7
    const ref = parseIsoDate("2026-01-11")!; // Sunday
    let d = addDays(ref, -6); // Monday
    while (d <= ref) {
      if ([0, 2, 4].includes(weekday(d))) {
        api.habits_set_done(todayIso(d), mwf.id, true);
      }
      d = addDays(d, 1);
    }

    const stats = api.habits_stats("2026-01-11");
    expect(stats.habits[mwf.id]!.week).toBe(1.0);
    expect(stats.habits[mwf.id]!.day).toBeNull(); // not due on Sunday
  });

  it("calculates streak", () => {
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      api.habits_set_done(todayIso(addDays(today, -i)), every.id, true);
    }
    const streak = api.habits_stats().streak;
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const dayOfYear = Math.floor(
      (today.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
    ) + 1;
    expect(streak).toBe(Math.min(3, dayOfYear));
  });

  it("manages subtasks", () => {
    const sub = api.habits_add_subtask(every.id, "Primer vaso") as { id: string };
    const today = todayIso();
    api.habits_set_subtask(today, every.id, sub.id, true);

    const day = api.habits_day(today);
    expect(day.subtasks[every.id]![sub.id]).toBe(true);

    expect(() => api.habits_set_subtask(today, every.id, "nope", true)).toThrow(ApiError);
  });

  it("day notes cannot break the file", () => {
    const today = todayIso();
    api.habits_set_done(today, every.id, true);
    api.habits_set_day_text(today, 'bien"\ncompleted:\n  agua: false', "diario\n---\nx: 1");

    const mgr = new HabitManager(tmpDir);
    const day = mgr.getDay(today);
    expect(day.completed[every.id]).toBe(true);
    expect(day.notes).not.toContain("\n");
    expect(day.journal).toContain("diario");
  });

  it("edits schedule and options", () => {
    const up = api.habits_update(every.id, {
      repeat: "every:2",
      time: "07:30",
      start_date: "2026-01-01",
      colour: "#33b679",
    });
    expect(up.repeat).toBe("every:2");
    expect(up.schedule).toContain("07:30");

    for (const bad of [{ time: "7h" }, { colour: "red;" }, { start_date: "ayer" }]) {
      expect(() => api.habits_update(every.id, bad)).toThrow(ApiError);
    }
  });

  it("reorders and removes habits", () => {
    const ids = [mwf.id, every.id];
    api.habits_reorder(ids);
    expect(api.habits_list().map((h) => h.id)).toEqual(ids);

    expect(() => api.habits_reorder([mwf.id])).toThrow(ApiError);

    api.habits_remove(mwf.id);
    expect(api.habits_list().map((h) => h.id)).toEqual([every.id]);
  });

  it("removing every habit does not bring defaults back", () => {
    for (const h of api.habits_list()) {
      api.habits_remove(h.id as string);
    }
    const api2 = habitsApi(new AppState(tmpDir));
    expect(api2.habits_list()).toEqual([]);
    expect(new HabitManager(tmpDir).habits()).toEqual([]);
  });
});
