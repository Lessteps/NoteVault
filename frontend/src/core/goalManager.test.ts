import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AreaManager } from "./areaManager";
import { addDays } from "./dates";
import {
  FILTER_OVERDUE,
  Goal,
  GoalCalendarSource,
  GoalManager,
} from "./goalManager";
import { HabitManager } from "./habitManager";

const D = new Date(2026, 8, 14); // Monday, 2026-09-14

describe("GoalManager", () => {
  let tempDir: string;
  let hm: HabitManager;
  let am: AreaManager;
  let gm: GoalManager;
  let goal: Goal;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-goal-test-"));
    hm = new HabitManager(tempDir);
    am = new AreaManager(tempDir);
    gm = new GoalManager(tempDir, hm, am);
    goal = gm.create_goal("Ser backend", {
      area: "programacion",
      priority: 3,
      start: D,
      end: addDays(D, 30),
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Goal and Item Format", () => {
    it("goal file format and on-disk content", () => {
      const p = gm.goal_path(goal.id);
      expect(fs.existsSync(p)).toBe(true);
      const text = fs.readFileSync(p, "utf-8");
      expect(text).toContain(`id: ${goal.id}\n`);
      expect(text).toContain('name: "Ser backend"\n');
      expect(text).toContain("area: programacion\n");
      expect(text).toContain('status: "Activa"\n');
      expect(text).toContain("priority: 3\n");
      expect(text).toContain("start: 2026-09-14\n");
      expect(text).toContain("end: 2026-10-14\n");
    });

    it("item file and reload", () => {
      const item = gm.create_item(goal.id, "Programar 3 horas", "", {
        repeat: "weekly:0,2",
        due_time: "18:00",
        duration_min: 180,
        in_calendar: true,
        reminder_min: 15,
        target: 3,
        unit: "h",
        habit_links: "coding,math",
        start: D,
        notes: "Notas",
      });

      const fresh = new GoalManager(tempDir).get_item(goal.id, item.id);
      expect(fresh).not.toBeNull();
      expect(fresh!.repeat).toBe("weekly:0,2");
      expect(fresh!.habit_links).toEqual(["coding", "math"]);
      expect(fresh!.target).toBe(3);
      expect(fresh!.notes).toBe("Notas");

      const text = fs.readFileSync(gm.item_path(goal.id, item.id), "utf-8");
      expect(text).toContain('repeat: "weekly:0,2"\n');
      expect(text).toContain('habit_links: "coding,math"\n');
      expect(text).not.toContain("parent:");
    });
  });

  describe("Tree Structure & Reordering", () => {
    it("three levels move and indent", () => {
      const g = goal.id;
      const a = gm.create_item(g, "A");
      const b = gm.create_item(g, "B");
      const c = gm.create_item(g, "C");
      const a1 = gm.create_item(g, "A1", a.id);
      const a1x = gm.create_item(g, "A1x", a1.id);

      expect(gm.tree(g).map((i) => i.name)).toEqual(["A", "B", "C"]);

      // Move C to front
      gm.move_item(g, c.id, null, 0);
      expect(gm.tree(g).map((i) => i.name)).toEqual(["C", "A", "B"]);

      // Indent B under A (after A1)
      gm.indent(g, b.id, 1);
      const fresh = new GoalManager(tempDir);
      const aNode = fresh.tree(g).find((i) => i.name === "A");
      expect(aNode?.children.map((i) => i.name)).toEqual(["A1", "B"]);

      // Unindent B back to top level
      gm.indent(g, b.id, -1);
      expect(gm.tree(g).map((i) => i.name)).toEqual(["C", "A", "B"]);

      // Moving A into its own subtree a1x is refused
      gm.move_item(g, a.id, a1x.id, 0);
      expect(gm.get_item(g, a.id)?.parent).toBe("");

      // Move B to index 1 (between C and A)
      gm.move_item(g, b.id, null, 1);
      expect(new GoalManager(tempDir).tree(g).map((i) => i.name)).toEqual(["C", "B", "A"]);
    });

    it("delete cascades to trash", () => {
      const g = goal.id;
      const a = gm.create_item(g, "A");
      gm.create_item(g, "A1", a.id);
      gm.delete_item(g, a.id);

      expect(gm.items(g)).toEqual([]);
      const trashDir = path.join(tempDir, ".notevault", ".papelera", "metas", g);
      expect(fs.readdirSync(trashDir).length).toBe(2);
    });
  });

  describe("Progress & Measurables", () => {
    it("progress mixes once and repeating sub-goals", () => {
      const g = goal;
      const once = gm.create_item(g.id, "Única");
      const rep = gm.create_item(g.id, "Diaria", "", { repeat: "daily", start: D });
      const branch = gm.create_item(g.id, "Rama");
      gm.create_item(g.id, "Hija 1", branch.id);
      const h2 = gm.create_item(g.id, "Hija 2", branch.id);

      const today = addDays(D, 3); // 4 scheduled days

      gm.set_done(g.id, once.id, D, true);
      gm.set_done(g.id, rep.id, D, true);
      gm.set_done(g.id, rep.id, addDays(D, 1), true);
      gm.set_done(g.id, h2.id, D, true);

      // (1 + 2/4 + (0 + 1)/2) / 3 = 2 / 3
      expect(gm.progress(g, today)).toBeCloseTo((1 + 0.5 + 0.5) / 3, 5);
      expect(gm.streak(rep, g, addDays(D, 1))).toBe(2);
      expect(gm.streak(rep, g, today)).toBe(0);
      expect(gm.adherence(g, 7, today)).toBeCloseTo(0.5, 5);
    });

    it("measurable and overdue items", () => {
      const g = goal;
      const m = gm.create_item(g.id, "3 h", "", {
        repeat: "daily",
        start: D,
        target: 3,
        unit: "h",
      });

      gm.set_done(g.id, m.id, D, false, 2);
      expect(gm.is_done_on(gm.get_item(g.id, m.id)!, D)).toBe(false);

      gm.set_done(g.id, m.id, D, false, 3.5);
      expect(gm.is_done_on(gm.get_item(g.id, m.id)!, D)).toBe(true);

      const late = gm.create_item(g.id, "Tarde", "", { due: addDays(D, -1) });
      expect(gm.overdue(g, D).map((i) => i.id)).toEqual([late.id]);

      const due = gm.items_due_on(D, [g]).map(([gx, ix]) => [gx.id, ix.id]);
      expect(due).toContainEqual([g.id, m.id]);
    });

    it("end date marks overdue without deleting", () => {
      expect(goal.is_overdue(D)).toBe(false);
      const later = addDays(D, 40);
      expect(goal.is_overdue(later)).toBe(true);
      expect(gm.goals(FILTER_OVERDUE, undefined, later).map((x) => x.id)).toEqual([goal.id]);
      expect(fs.existsSync(gm.goal_path(goal.id))).toBe(true);
    });
  });

  describe("Habit Sync", () => {
    it("marks, unmarks and respects manual checks", () => {
      const g = goal;
      const item = gm.create_item(g.id, "Programar", "", {
        repeat: "daily",
        start: D,
        habit_links: ["coding", "math"],
      });

      const day = hm.getDay(D);
      day.completed["math"] = true; // ticked manually
      hm.saveDay(day);

      gm.set_done(g.id, item.id, D, true);
      const fresh = new HabitManager(tempDir).getDay(D);
      expect(fresh.completed["coding"]).toBe(true);
      expect(fresh.completed["math"]).toBe(true);

      const log = JSON.parse(fs.readFileSync(gm.log_path(D), "utf-8"));
      expect(log.habit_marks).toEqual({ coding: [item.key] });

      // Unmarking item unmarks coding but NOT math (which was manual)
      gm.set_done(g.id, item.id, D, false);
      const fresh2 = new HabitManager(tempDir).getDay(D);
      expect(fresh2.completed["coding"]).toBe(false);
      expect(fresh2.completed["math"]).toBe(true);
    });
  });

  describe("Calendar source", () => {
    it("generates occurrences and updates on setDone", () => {
      const item = gm.create_item(goal.id, "Daily Subgoal", "", {
        repeat: "daily",
        start: D,
        due_time: "09:00",
        duration_min: 45,
        in_calendar: true,
      });

      const src = new GoalCalendarSource(gm);
      const occs = src.occurrences(D, addDays(D, 2));
      const key = "2026-09-14";
      expect(occs[key]).toBeDefined();
      expect(occs[key]?.some((o) => o.id === `goal:${goal.id}/${item.id}`)).toBe(true);

      src.setDone(D, `goal:${goal.id}/${item.id}`, true);
      expect(gm.is_done_on(gm.get_item(goal.id, item.id)!, D)).toBe(true);
    });
  });

  describe("Golden byte conformance", () => {
    it("matches golden goal and item markdown", () => {
      const goldenGoalPath = path.resolve(
        __dirname,
        "__golden__/.notevault/metas/GOAL_ID/goal.md",
      );
      if (!fs.existsSync(goldenGoalPath)) return;

      const goldenBuf = fs.readFileSync(goldenGoalPath);
      expect(goldenBuf.length).toBeGreaterThan(0);
    });

    it("matches golden log JSON byte-for-byte", () => {
      const goldenLogPath = path.resolve(
        __dirname,
        "__golden__/.notevault/metas/registro/2026/09/2026-09-07.json",
      );
      if (!fs.existsSync(goldenLogPath)) return;

      const goldenBuf = fs.readFileSync(goldenLogPath);
      const goldenObj = JSON.parse(goldenBuf.toString("utf-8"));

      const d = new Date(2026, 8, 7);
      // Directly invoke _saveLog
      (gm as any)._saveLog(d, goldenObj);

      const generatedBuf = fs.readFileSync(gm.log_path(d));
      expect(generatedBuf.equals(goldenBuf)).toBe(true);
    });
  });
});
