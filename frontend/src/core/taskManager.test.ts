import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseDate,
  parseDt,
  STATUS_DONE,
  STATUS_TODO,
  Task,
  TaskManager,
} from "./taskManager";

describe("TaskManager", () => {
  let tempDir: string;
  let tm: TaskManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-task-test-"));
    tm = new TaskManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates task ID matching pattern ^t\\d{8}-[0-9a-f]{6}$", () => {
    const task = tm.create("Tarea de prueba");
    expect(task.id).toMatch(/^t\d{8}-[0-9a-f]{6}$/);
  });

  it("invalidates cache when a task file is changed externally", () => {
    const d = parseDate("2026-09-14")!;
    const t = tm.create("Tarea 1", { due: d });
    expect(tm.tasks()).toHaveLength(1);

    const taskPath = tm._path(t.id);
    const content = fs.readFileSync(taskPath, "utf-8");
    fs.writeFileSync(
      taskPath,
      content.replace('name: "Tarea 1"', 'name: "Tarea Modificada"'),
      "utf-8",
    );

    const refreshed = tm.tasks();
    expect(refreshed[0]?.name).toBe("Tarea Modificada");
  });

  it("creates, retrieves, filters and deletes tasks", () => {
    const t1 = tm.create("Comprar leche", {
      subject: "Personal",
      priority: 2,
      due: parseDate("2026-09-15"),
    });
    const t2 = tm.create("Estudiar TypeScript", {
      subject: "Programación",
      priority: 3,
      due: parseDate("2026-09-10"),
    });

    expect(tm.subjects()).toEqual(["Personal", "Programación"]);

    const filtered = tm.filtered("typescript");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe(t2.id);

    tm.update(t1.id, { status: STATUS_DONE });
    expect(tm.get(t1.id)?.is_done).toBe(true);

    const hideDone = tm.filtered("", "", "", 0, true);
    expect(hideDone.map((t) => t.id)).toEqual([t2.id]);

    tm.delete(t2.id);
    expect(tm.get(t2.id)).toBeNull();
    expect(tm.tasks()).toHaveLength(1);
  });

  it("rolls repeating task forward when marked as done", () => {
    const task = tm.create("Hábito diario", {
      due: parseDate("2026-09-10"),
      start: parseDate("2026-09-10"),
      repeat: "daily",
      reminder: parseDt("2026-09-10T09:00"),
      reminder_done: true,
    });

    tm.update(task.id, { status: STATUS_DONE });
    const reloaded = tm.get(task.id)!;

    // Daily repetition rolls to next day
    expect(reloaded.status).toBe(STATUS_TODO);
    expect(reloaded.due).toEqual(parseDate("2026-09-11"));
    expect(reloaded.start).toEqual(parseDate("2026-09-11"));
    expect(reloaded.reminder).toEqual(parseDt("2026-09-11T09:00"));
    expect(reloaded.reminder_done).toBe(false);
  });

  it("manages upcoming and due reminders", () => {
    const past = new Date(Date.now() - 3600 * 1000);
    const future = new Date(Date.now() + 3600 * 1000);

    const tPast = tm.create("Tarea pasada", { reminder: past });
    const tFuture = tm.create("Tarea futura", { reminder: future });

    const dueReminders = tm.due_reminders();
    expect(dueReminders.map((t) => t.id)).toContain(tPast.id);
    expect(dueReminders.map((t) => t.id)).not.toContain(tFuture.id);

    tm.mark_reminder_shown(tPast.id);
    expect(tm.due_reminders().map((t) => t.id)).not.toContain(tPast.id);

    const upcoming = tm.upcoming_reminders();
    expect(upcoming.map((t) => t.id)).toContain(tFuture.id);
    expect(upcoming.map((t) => t.id)).not.toContain(tPast.id);
  });

  it("matches golden file TASK_ID.md byte-for-byte", () => {
    const task = new Task("TASK_ID", {
      name: "Ensayo de historia",
      created: parseDate("2026-09-14"),
      start: parseDate("2026-09-12"),
      due: parseDate("2026-09-20"),
      status: "Sin empezar",
      subject: "Historia",
      priority: 2,
      reminder: parseDt("2026-09-19T18:00"),
      reminder_done: false,
      repeat: "weekly:0,3",
      repeat_until: parseDate("2026-10-31"),
      body: "# Ensayo\n\n- Buscar fuentes\n",
    });

    tm.save(task);

    const writtenPath = path.join(tempDir, ".notevault", "tareas", "TASK_ID.md");
    const goldenPath = path.resolve(
      __dirname,
      "__golden__",
      ".notevault",
      "tareas",
      "TASK_ID.md",
    );

    const got = fs.readFileSync(writtenPath);
    const want = fs.readFileSync(goldenPath);

    expect(got.equals(want)).toBe(true);
  });
});
