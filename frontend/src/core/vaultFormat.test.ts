import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_EXTS,
  BOOKMARKS_FILE,
  DATA_DIR,
  DEFAULT_COLUMNS,
  DEFAULT_CURRENCY,
  FORMAT_VERSION,
  formatLayout,
  GOAL_FIELDS,
  GOAL_ITEM_FIELDS,
  ISSUE_FIELDS,
  isSyncConflict,
  LAYOUT,
  LEGACY_DIRS,
  MOVEMENT_KEYS,
  PROJECT_FIELDS,
  RESERVED_DIRS,
  TASK_KEYS,
  TASK_STATUSES,
  WEEKDAY_KEYS,
} from "./vaultFormat";

describe("vaultFormat", () => {
  it("defines base format constants", () => {
    expect(FORMAT_VERSION).toBe(4);
    expect(DATA_DIR).toBe(".notevault");
    expect(RESERVED_DIRS).toEqual([".notevault"]);
    expect(LEGACY_DIRS).toEqual(["habits", "ejercicio", "tareas", "proyectos"]);
    expect(BOOKMARKS_FILE).toBe(".notevault-bookmarks.json");
    expect(DEFAULT_CURRENCY).toBe("COP");
  });

  it("has exact layout paths", () => {
    expect(LAYOUT.data_dir).toBe(".notevault");
    expect(LAYOUT.habits_config).toBe(".notevault/habits/habits_config.json");
    expect(LAYOUT.exercises).toBe(".notevault/ejercicio/exercises.json");
    expect(LAYOUT.trash_dir).toBe(".notevault/.papelera");
    expect(LAYOUT.bookmarks).toBe(".notevault-bookmarks.json");
    expect(LAYOUT.study_ledger).toBe(".notevault/estudio/ledger/{id}.json");
  });

  it("formats layout templates correctly", () => {
    const habitPath = formatLayout(LAYOUT.habits_day, { year: 2026, month: 9, date: "2026-09-12" });
    expect(habitPath).toBe(".notevault/habits/2026/09/2026-09-12.md");

    const exercisePath = formatLayout(LAYOUT.exercise_day, { year: 2026, month: 11, date: "2026-11-05" });
    expect(exercisePath).toBe(".notevault/ejercicio/2026/11/2026-11-05.json");

    const taskPath = formatLayout(LAYOUT.task, { id: "t20260912-123456" });
    expect(taskPath).toBe(".notevault/tareas/t20260912-123456.md");

    const issuePath = formatLayout(LAYOUT.issue, { project: "p1", id: "x1" });
    expect(issuePath).toBe(".notevault/proyectos/p1/issues/x1.md");
  });

  it("detects sync conflict files", () => {
    expect(isSyncConflict("note.sync-conflict-20260912-123456.md")).toBe(true);
    expect(isSyncConflict(".notevault/.sync-conflict-abc.json")).toBe(true);
    expect(isSyncConflict("normal-note.md")).toBe(false);
  });

  it("preserves enum and field orders", () => {
    expect(WEEKDAY_KEYS).toEqual([
      "lunes", "martes", "miercoles", "jueves",
      "viernes", "sabado", "domingo",
    ]);
    expect(TASK_STATUSES).toEqual(["Sin empezar", "En progreso", "Completado", "Bloqueado"]);
    expect(DEFAULT_COLUMNS).toEqual(["Por hacer", "En curso", "En revisión", "Hecho"]);
    expect(ATTACHMENT_EXTS).toContain(".png");
    expect(ATTACHMENT_EXTS).toContain(".pdf");

    // First key of entities must be id
    expect(TASK_KEYS[0]).toBe("id");
    expect(GOAL_FIELDS[0]).toEqual(["id", "id"]);
    expect(GOAL_ITEM_FIELDS[0]).toEqual(["id", "id"]);
    expect(PROJECT_FIELDS[0]).toEqual(["id", "id"]);
    expect(ISSUE_FIELDS[0]).toEqual(["id", "id"]);
    expect(MOVEMENT_KEYS[0]).toBe("id");
  });
});
