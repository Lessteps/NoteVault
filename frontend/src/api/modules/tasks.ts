// Ported from notevault_app/webapp/modules/tasks.py
// Tareas: the bridge over core/taskManager.

import * as fs from "node:fs";
import * as path from "node:path";
import { Recurrence } from "../../core/recurrence.js";
import {
  PRIORITY_MAX,
  STATUS_COLORS,
  STATUS_DONE,
  STATUSES,
  type Task,
  type TaskManager,
} from "../../core/taskManager.js";
import { formatDate } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import type { AppState } from "../appState.js";
import { notify } from "../notify.js";
import {
  bodyText,
  clampInt,
  isoDate,
  isoDt,
  oneLine,
  optDate,
  optDatetime,
  optTime,
} from "../common.js";

const MAX_RANGE_DAYS = 62;

export function taskDict(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    created: isoDate(t.created),
    start: isoDate(t.start),
    start_time: t.start_time,
    due: isoDate(t.due),
    due_time: t.due_time,
    status: t.status,
    subject: t.subject,
    priority: t.priority,
    reminder: isoDt(t.reminder),
    reminder_done: t.reminder_done,
    body: t.body,
    repeat: t.repeat,
    repeat_until: isoDate(t.repeat_until),
    repeat_label: t.rule.describe(),
    overdue: t.is_overdue,
    done: t.is_done,
  };
}

function taskFields(fields: unknown): Record<string, unknown> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ApiError("Datos de tarea inválidos.");
  }
  const f = fields as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ("name" in f) out.name = oneLine(f.name, 200) || "Sin título";
  if ("subject" in f) out.subject = oneLine(f.subject, 80);
  if ("status" in f) {
    if (!(STATUSES as readonly string[]).includes(f.status as string)) {
      throw new ApiError("Estado inválido.");
    }
    out.status = f.status;
  }
  if ("priority" in f) out.priority = clampInt(f.priority, 1, PRIORITY_MAX, 1);
  for (const key of ["start", "due", "repeat_until"] as const) {
    if (key in f) out[key] = optDate(f[key]);
  }
  for (const key of ["start_time", "due_time"] as const) {
    if (key in f) out[key] = optTime(f[key]);
  }
  if ("reminder" in f) {
    out.reminder = optDatetime(f.reminder);
    out.reminder_done = false;
  }
  if ("reminder_done" in f) out.reminder_done = Boolean(f.reminder_done);
  if ("repeat" in f) out.repeat = Recurrence.parse(oneLine(f.repeat, 60)).toString();
  if ("body" in f) out.body = bodyText(f.body);
  return out;
}

export function tasksApi(app: AppState) {
  const mgr = (): TaskManager => app.mgrs().tasks;

  return {
    tasks_meta(): Record<string, unknown> {
      return {
        statuses: [...STATUSES],
        status_colors: { ...STATUS_COLORS },
        done_status: STATUS_DONE,
        priority_max: PRIORITY_MAX,
        subjects: mgr().subjects(),
      };
    },

    tasks_list(): unknown[] {
      return mgr()
        .tasks()
        .map((t) => taskDict(t));
    },

    tasks_in_range(first: string, last: string): unknown[] {
      const a = optDate(first);
      const b = optDate(last);
      if (a === null || b === null || b < a) throw new ApiError("Rango de fechas inválido.");
      const spanDays = Math.round((b.getTime() - a.getTime()) / 86_400_000);
      if (spanDays > MAX_RANGE_DAYS) throw new ApiError("El rango es demasiado largo.");
      const out: { date: string; id: string }[] = [];
      for (const t of mgr().tasks()) {
        const d = new Date(a.getTime());
        while (d <= b) {
          if (t.occurs_on(d)) out.push({ date: formatDate(d, "%Y-%m-%d"), id: t.id });
          d.setDate(d.getDate() + 1);
        }
      }
      return out;
    },

    tasks_due_reminders(): unknown[] {
      return mgr()
        .due_reminders(new Date())
        .map((t) => taskDict(t));
    },

    tasks_create(fields: Record<string, unknown> | null = null): Record<string, unknown> {
      const clean = taskFields(fields || {});
      const name = (clean.name as string) ?? "Nueva tarea";
      delete clean.name;
      if (!("due" in clean)) clean.due = new Date();
      return taskDict(mgr().create(name, clean));
    },

    tasks_update(taskId: string, fields: Record<string, unknown>): Record<string, unknown> {
      const clean = taskFields(fields);
      const task = mgr().update(oneLine(taskId, 80), clean);
      if (task === null) throw new ApiError("La tarea ya no existe.");
      return taskDict(task);
    },

    tasks_delete(taskId: string): Record<string, unknown> {
      const m = mgr();
      const task = m.get(oneLine(taskId, 80));
      if (task === null) throw new ApiError("La tarea ya no existe.");
      const mm = m as unknown as { _path(id: string): string; _cache: unknown };
      const p = mm._path(task.id);
      const trash = path.join(app.root, ".trash");
      fs.mkdirSync(trash, { recursive: true });
      const parsed = path.parse(p);
      let dest = path.join(trash, parsed.base);
      let n = 1;
      while (fs.existsSync(dest)) {
        dest = path.join(trash, `${parsed.name}_${n}${parsed.ext}`);
        n += 1;
      }
      fs.renameSync(p, dest);
      mm._cache = null;
      return { ok: true };
    },

    tasks_mark_reminder_shown(taskId: string): Record<string, unknown> {
      const tid = oneLine(taskId, 80);
      const m = mgr();
      const task = m.get(tid);
      m.mark_reminder_shown(tid);
      if (task !== null && app.window !== null) {
        notify("🔔 Recordatorio de NoteVault", task.name);
      }
      return { ok: true };
    },
  };
}
