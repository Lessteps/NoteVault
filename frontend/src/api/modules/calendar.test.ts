import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, formatDate } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { ScheduleManager } from "../../core/scheduleManager.js";
import { TaskManager } from "../../core/taskManager.js";
import { AppState } from "../appState.js";
import { calendarApi } from "./calendar.js";
import { habitsApi } from "./habits.js";

const MON = new Date(2026, 0, 5); // 2026-01-05 is a Monday
const MON_STR = "2026-01-05";

function findOccs(
  rows: Record<string, any[]>,
  dayStr: string,
  match: Record<string, any>,
): any[] {
  const list = rows[dayStr] || [];
  return list.filter((o) =>
    Object.entries(match).every(([k, v]) => o[k] === v),
  );
}

describe("calendarApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof calendarApi>;
  let hApi: ReturnType<typeof habitsApi>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_cal_"));
    app = new AppState(tmpDir);
    api = calendarApi(app);
    hApi = habitsApi(app);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createEvent(extra: Record<string, any> = {}): Record<string, any> {
    const payload = {
      mode: "create",
      kind: "event",
      title: "Dentista",
      date: MON_STR,
      start: "09:00",
      duration: 45,
      colour: "#33b679",
      repeat: "",
      orig: {},
      ...extra,
    };
    return api.cal_save(payload);
  }

  it("test_event_round_trip", () => {
    createEvent({ location: "Centro", description: "traer carnet" });
    const rows = api.cal_range(MON_STR, MON_STR) as Record<string, any[]>;
    const ev = findOccs(rows, MON_STR, { kind: "event" })[0];
    expect(ev.start).toBe("09:00");
    expect(ev.duration_min).toBe(45);
    expect(ev.colour).toBe("#33b679");

    const info = api.cal_item(MON_STR, ev.id, "event") as Record<string, any>;
    expect(info.location).toBe("Centro");
    expect(
      new ScheduleManager(tmpDir).getDayFile(MON).events[0].title,
    ).toBe("Dentista");
  });

  it("test_moving_an_event_to_another_day", () => {
    createEvent();
    const rows1 = api.cal_range(MON_STR, MON_STR) as Record<string, any[]>;
    const ev = findOccs(rows1, MON_STR, { kind: "event" })[0];

    const tueStr = formatDate(addDays(MON, 1), "%Y-%m-%d");
    api.cal_move(ev, tueStr, "11:30", 90);

    const rows2 = api.cal_range(MON_STR, tueStr) as Record<string, any[]>;
    expect(findOccs(rows2, MON_STR, { kind: "event" })).toHaveLength(0);

    const moved = findOccs(rows2, tueStr, { kind: "event" })[0];
    expect(moved.start).toBe("11:30");
    expect(moved.duration_min).toBe(90);
  });

  it("test_repeating_event_becomes_a_routine", () => {
    createEvent({ title: "Gym", repeat: "weekly:0,2" });
    const sunStr = formatDate(addDays(MON, 6), "%Y-%m-%d");
    const tueStr = formatDate(addDays(MON, 1), "%Y-%m-%d");
    const wedStr = formatDate(addDays(MON, 2), "%Y-%m-%d");

    const rows = api.cal_range(MON_STR, sunStr) as Record<string, any[]>;
    expect(findOccs(rows, MON_STR, { kind: "routine", title: "Gym" })).toHaveLength(1);
    expect(findOccs(rows, wedStr, { kind: "routine" })).toHaveLength(1);
    expect(findOccs(rows, tueStr, { kind: "routine" })).toHaveLength(0);

    const routines = api.cal_routines() as Array<Record<string, any>>;
    const rid = routines[0]!.id;

    // Skip one day only, then tick another.
    api.cal_delete({ kind: "routine", id: rid, date: MON_STR }, "one");
    api.cal_set_done(wedStr, rid, true);

    const rowsAfter = api.cal_range(MON_STR, wedStr) as Record<string, any[]>;
    expect(findOccs(rowsAfter, MON_STR, { kind: "routine" })).toHaveLength(0);
    expect(findOccs(rowsAfter, wedStr, { kind: "routine" })[0].done).toBe(true);
  });

  it("test_task_created_from_the_calendar", () => {
    api.cal_save({
      mode: "create",
      kind: "task",
      title: "Entregar",
      date: MON_STR,
      start: "18:00",
      subject: "Física",
      reminder_min: 30,
      colour: "#039be5",
      orig: {},
    });

    const tasks = new TaskManager(tmpDir).tasks();
    expect(tasks).toHaveLength(1);
    const task = tasks[0]!;
    expect(formatDate(task.due!, "%Y-%m-%d")).toBe(MON_STR);
    expect(task.due_time).toBe("18:00");
    expect(task.subject).toBe("Física");

    const rows = api.cal_range(MON_STR, MON_STR) as Record<string, any[]>;
    const occ = findOccs(rows, MON_STR, { kind: "task" })[0];
    api.cal_set_done(MON_STR, occ.id, true);

    expect(new TaskManager(tmpDir).get(task.id)!.is_done).toBe(true);
  });

  it("test_habit_blocks_are_merged_and_tickable", () => {
    const h = hApi.habits_add({
      name: "Leer",
      in_calendar: true,
      time: "07:00",
    }) as Record<string, any>;

    const rows = api.cal_range(MON_STR, MON_STR) as Record<string, any[]>;
    const occ = findOccs(rows, MON_STR, { id: `habit:${h.id}` })[0];
    expect(occ.checkable).toBe(true);

    api.cal_set_done(MON_STR, occ.id, true);
    const dayData = hApi.habits_day(MON_STR) as Record<string, any>;
    expect(dayData.completed[h.id]).toBe(true);
  });

  it("test_bad_input_is_refused", () => {
    const badList = [
      { colour: "red;" },
      { start: "25:00" },
      { date: "ayer" },
      { kind: "habit" },
    ];
    for (const bad of badList) {
      expect(() => createEvent(bad)).toThrow(ApiError);
    }

    expect(() => api.cal_range("2020-01-01", "2026-01-01")).toThrow(ApiError);
    expect(() => api.cal_routine_save(null, { title: "x", repeat: "" })).toThrow(ApiError);
  });

  it("test_titles_are_one_line", () => {
    createEvent({ title: "a\nb" });
    const rows = api.cal_range(MON_STR, MON_STR) as Record<string, any[]>;
    const ev = findOccs(rows, MON_STR, { kind: "event" })[0];
    expect(ev.title).toBe("a b");
  });

  it("test_settings_and_routine_management", () => {
    const settings = api.cal_settings();
    expect(settings).toBeDefined();

    api.cal_routine_save(null, {
      title: "Meditar",
      repeat: "daily",
      colour: "#039be5",
      start: "08:00",
    });
    const routines = api.cal_routines() as Array<Record<string, any>>;
    const meditar = routines.find((r) => r.title === "Meditar");
    expect(meditar).toBeDefined();

    api.cal_routine_remove(meditar!.id);
    const afterRemove = api.cal_routines() as Array<Record<string, any>>;
    expect(afterRemove.some((r) => r.id === meditar!.id)).toBe(false);
  });
});
