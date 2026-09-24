import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HabitManager } from "./habitManager";

describe("HabitManager", () => {
  let tempDir: string;
  let hm: HabitManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-habit-test-"));
    hm = new HabitManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("initializes config with version 3 and default habits", () => {
    const habits = hm.habits();
    expect(habits.length).toBe(15);

    const configPath = path.join(tempDir, ".notevault", "habits", "habits_config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.version).toBe(3);

    const hairwash = habits.find((h) => h.id === "hairwash");
    expect(hairwash?.days).toEqual([0, 2, 4]); // Lun, Mié, Vie
  });

  it("does not reinstall default habits if user purposefully removed all habits", () => {
    const habits = hm.habits();
    for (const h of [...habits]) {
      hm.removeHabit(h.id);
    }
    expect(hm.habits()).toEqual([]);

    // Reloading manager from disk must keep empty list
    const fresh = new HabitManager(tempDir);
    expect(fresh.habits()).toEqual([]);
  });

  it("handles day logs, subtasks, and round-trips correctly", () => {
    const dateStr = "2026-09-12";
    const day = hm.getDay(dateStr);
    day.completed["nophone"] = true;
    day.setSubtask("coding", "theory", true);
    day.journal = "Diario del día.";
    hm.saveDay(day);

    const dayPath = path.join(tempDir, ".notevault", "habits", "2026", "09", "2026-09-12.md");
    expect(fs.existsSync(dayPath)).toBe(true);

    const fresh = new HabitManager(tempDir).getDay(dateStr);
    expect(fresh.completed["nophone"]).toBe(true);
    expect(fresh.subtaskDone("coding", "theory")).toBe(true);
    expect(fresh.subtaskDone("coding", "practice")).toBe(false);
    expect(fresh.journal).toBe("Diario del día.");
  });

  it("computes completion percentage only considering habits active on that weekday", () => {
    // 2026-09-14 is a Monday (weekday 0)
    const mondayStr = "2026-09-14";
    const mondayHabits = hm.habitsForDay(mondayStr);

    const day = hm.getDay(mondayStr);
    for (const h of mondayHabits) {
      day.completed[h.id] = true;
    }
    hm.saveDay(day);

    expect(new HabitManager(tempDir).dayPct(mondayStr)).toBeCloseTo(1.0);
  });

  it("adds, updates, and removes subtasks", () => {
    const sub = hm.addSubtask("reading", "Leer 10 páginas");
    expect(sub).not.toBeNull();
    expect(sub?.name).toBe("Leer 10 páginas");

    const habit = hm.getHabit("reading");
    expect(habit?.subtasks.some((s) => s.id === sub?.id)).toBe(true);

    hm.removeSubtask("reading", sub!.id);
    const updated = hm.getHabit("reading");
    expect(updated?.subtasks.some((s) => s.id === sub?.id)).toBe(false);
  });

  it("matches golden file 2026-09-12.md byte-for-byte", () => {
    const dateStr = "2026-09-12";
    const day = hm.getDay(dateStr);
    day.completed["nophone"] = true;
    day.completed["bed"] = false;
    day.setSubtask("coding", "theory", true);
    day.journal = "Diario de ejemplo.\nSegunda línea.";
    hm.saveDay(day);

    const writtenPath = path.join(
      tempDir,
      ".notevault",
      "habits",
      "2026",
      "09",
      "2026-09-12.md",
    );
    const goldenPath = path.resolve(
      __dirname,
      "__golden__",
      ".notevault",
      "habits",
      "2026",
      "09",
      "2026-09-12.md",
    );

    const got = fs.readFileSync(writtenPath);
    const want = fs.readFileSync(goldenPath);

    expect(got.equals(want)).toBe(true);
  });

  it("matches golden file habits_config.json byte-for-byte", () => {
    hm.habits();
    hm.updateHabit("reading", {
      repeat: "every:2",
      start_date: "2026-09-12",
      time: "21:00",
      duration_min: 30,
      in_calendar: true,
      reminder_min: 10,
      colour: "#33b679",
    });

    const writtenPath = path.join(tempDir, ".notevault", "habits", "habits_config.json");
    const goldenPath = path.resolve(
      __dirname,
      "__golden__",
      ".notevault",
      "habits",
      "habits_config.json",
    );

    const got = fs.readFileSync(writtenPath);
    const want = fs.readFileSync(goldenPath);

    expect(got.equals(want)).toBe(true);
  });
});
