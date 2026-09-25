import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { GoalManager } from "../../core/goalManager.js";
import { AppState } from "../appState.js";
import { habitsApi } from "./habits.js";
import { goalsApi } from "./goals.js";

describe("goalsApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof goalsApi>;
  let habits: ReturnType<typeof habitsApi>;
  let g: Record<string, any>;
  let today: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_goals_test_"));
    app = new AppState(tmpDir);
    api = goalsApi(app);
    habits = habitsApi(app);
    today = todayIso();
    g = api.goals_create({ name: "Backend", icon: "💻" }, [
      "Aprender SQL",
      "API REST",
    ]);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function getItemsMap(): Record<string, any> {
    const list = api.goals_get(g.id).items as Array<Record<string, any>>;
    return Object.fromEntries(list.map((i) => [i.name, i]));
  }

  it("creates with checklist and computes progress", () => {
    const items = getItemsMap();
    expect(Object.keys(items).sort()).toEqual(["API REST", "Aprender SQL"]);

    api.goals_set_done(g.id, items["API REST"]!.id, today, true);
    const data = api.goals_get(g.id);
    expect(data.stats.counts).toEqual([1, 2]);
    expect(data.stats.progress).toBeCloseTo(0.5);

    const gm = new GoalManager(tmpDir);
    expect(gm.getItem(g.id, items["API REST"]!.id)!.status).toBe("Hecha");
  });

  it("repeating item shows today and ticks the day log", () => {
    const it = api.goals_item_create(g.id, "Leer 20 min", "", {
      repeat: "daily",
    }) as { id: string };

    const rows = api.goals_today(today).rows as Array<any>;
    expect(rows.some((r) => r.item.id === it.id)).toBe(true);

    api.goals_set_done(g.id, it.id, today, true);
    const updatedRows = api.goals_today(today).rows as Array<any>;
    const match = updatedRows.find((r) => r.item.id === it.id);
    expect(match.done).toBe(true);
  });

  it("supports measurable value", () => {
    const it = api.goals_item_create(g.id, "Correr", "", {
      target: "10",
      unit: "km",
    }) as { id: string };

    api.goals_set_done(g.id, it.id, today, false, "4,5");
    const item = getItemsMap()["Correr"]!;
    expect(item.value).toBe(4.5);
    expect(item.progress).toBeCloseTo(0.45);

    expect(() =>
      api.goals_set_done(g.id, it.id, today, false, "mucho")
    ).toThrow(ApiError);
  });

  it("ticks and unticks linked habit", () => {
    const habit = habits.habits_add({ name: "Estudiar" }) as { id: string };
    const it = api.goals_item_create(g.id, "Repasar", "", {
      repeat: "daily",
      habit_links: [habit.id, "inventado"],
    }) as { id: string; habit_links: string[] };

    expect(it.habit_links).toEqual([habit.id]);

    api.goals_set_done(g.id, it.id, today, true);
    expect(habits.habits_day(today).completed[habit.id]).toBe(true);

    api.goals_set_done(g.id, it.id, today, false);
    expect(habits.habits_day(today).completed[habit.id]).toBe(false);
  });

  it("moves and indents items in the tree", () => {
    let items = getItemsMap();
    api.goals_item_indent(g.id, items["API REST"]!.id, 1);
    items = getItemsMap();
    expect(items["API REST"]!.parent).toBe(items["Aprender SQL"]!.id);

    api.goals_item_move(g.id, items["API REST"]!.id, "", 0);
    items = getItemsMap();
    expect(items["API REST"]!.parent).toBe("");
  });

  it("refuses invalid input and cleans newlines in fields", () => {
    for (const bad of [
      { status: "Quizá" },
      { colour: "blue" },
      { end: "mañana" },
    ]) {
      expect(() => api.goals_update(g.id, bad)).toThrow(ApiError);
    }

    expect(() => api.goals_list("raro")).toThrow(ApiError);

    const updated = api.goals_update(g.id, {
      name: "a\nstatus: Archivada",
    });
    expect(updated.status).toBe("Activa");
  });

  it("deleting goal removes it from list", () => {
    api.goals_delete(g.id);
    expect(api.goals_list()).toEqual([]);
  });
});
