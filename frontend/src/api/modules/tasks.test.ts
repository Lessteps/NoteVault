import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STATUS_DONE, STATUS_TODO, TaskManager } from "../../core/taskManager.js";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { tasksApi } from "./tasks.js";

let dir: string;
let api: ReturnType<typeof tasksApi>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_tasks_"));
  api = tasksApi(new AppState(dir));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("tasks api", () => {
  it("create, list, update", () => {
    const t = api.tasks_create({
      name: "Ensayo",
      subject: "Historia",
      priority: 3,
      due: "2026-09-20",
      due_time: "18:30",
    }) as Record<string, unknown>;
    expect(t.priority).toBe(3);
    expect(t.due).toBe("2026-09-20");
    const listed = api.tasks_list() as Record<string, unknown>[];
    expect(listed.map((x) => x.id)).toEqual([t.id]);
    const up = api.tasks_update(t.id as string, {
      status: "En progreso",
      body: "- [ ] leer",
    }) as Record<string, unknown>;
    expect(up.status).toBe("En progreso");
    expect(up.body).toBe("- [ ] leer");
    expect((api.tasks_meta() as Record<string, unknown>).subjects).toContain("Historia");
    const again = new TaskManager(dir).get(t.id as string);
    expect(again?.subject).toBe("Historia");
  });

  it("completing a repeating task rolls forward", () => {
    const today = new Date();
    const t = api.tasks_create({ name: "Diaria", due: iso(today), repeat: "daily" }) as Record<
      string,
      unknown
    >;
    const up = api.tasks_update(t.id as string, { status: STATUS_DONE }) as Record<string, unknown>;
    expect(up.status).toBe(STATUS_TODO);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(up.due).toBe(iso(tomorrow));
  });

  it("range includes repeats", () => {
    const t = api.tasks_create({ name: "Lunes", due: "2026-01-05", repeat: "weekly:0" }) as Record<
      string,
      unknown
    >;
    const hits = api.tasks_in_range("2026-01-01", "2026-01-31") as { date: string; id: string }[];
    const days = hits
      .filter((h) => h.id === t.id)
      .map((h) => h.date)
      .sort();
    expect(days).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
    expect(() => api.tasks_in_range("2026-01-01", "2027-01-01")).toThrow(ApiError);
  });

  it("delete goes to trash", () => {
    const t = api.tasks_create({ name: "Borrar" }) as Record<string, unknown>;
    api.tasks_delete(t.id as string);
    expect(api.tasks_list()).toEqual([]);
    const trashed = fs.readdirSync(path.join(dir, ".trash")).filter((f) => f.endsWith(".md"));
    expect(trashed.length).toBe(1);
  });

  it("reminders", () => {
    const t = api.tasks_create({ name: "Aviso", reminder: "2000-01-01T09:00" }) as Record<
      string,
      unknown
    >;
    const due = api.tasks_due_reminders() as Record<string, unknown>[];
    expect(due.map((x) => x.id)).toEqual([t.id]);
    api.tasks_mark_reminder_shown(t.id as string);
    expect(api.tasks_due_reminders()).toEqual([]);
  });

  it("newlines cannot inject frontmatter", () => {
    const t = api.tasks_create({
      name: "x\nstatus: Completado\npriority: 3",
      subject: "a\r\nreminder: 2000-01-01T00:00",
    }) as Record<string, unknown>;
    const again = new TaskManager(dir).get(t.id as string);
    expect(again?.status).toBe(STATUS_TODO);
    expect(again?.priority).toBe(1);
    expect(again?.reminder).toBeNull();
    expect(again?.name.includes("\n")).toBe(false);
  });

  it("body cannot close the frontmatter", () => {
    const t = api.tasks_create({ name: "B" }) as Record<string, unknown>;
    api.tasks_update(t.id as string, { body: "texto\n---\nstatus: Completado" });
    const again = new TaskManager(dir).get(t.id as string);
    expect(again?.status).toBe(STATUS_TODO);
  });

  it("invalid values are refused", () => {
    const t = api.tasks_create({ name: "V" }) as Record<string, unknown>;
    for (const bad of [
      { status: "Hackeado" },
      { due: "mañana" },
      { due_time: "25:00" },
      { reminder: "no" },
    ]) {
      expect(() => api.tasks_update(t.id as string, bad)).toThrow(ApiError);
    }
    expect((api.tasks_update(t.id as string, { priority: 99 }) as Record<string, unknown>).priority).toBe(3);
    expect(() => api.tasks_update("no-existe", { name: "x" })).toThrow(ApiError);
  });
});
