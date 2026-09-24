/**
 * Reminder rules shared by every NoteVault client.
 * Ported from notevault_app/core/reminder_scheduler.py.
 */

import { formatDate, parseIsoDate } from "./dates";

export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
export const DEFAULT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const DEFAULT_MAX_PENDING = 60;

export interface TaskLike {
  id: string;
  name?: string;
  title?: string;
  subject?: string;
  reminder_context?: string;
  reminder?: Date | string | null;
  reminder_done?: boolean;
  is_done?: boolean;
  due?: Date | string | null;
  reminder_kind?: string;
}

export class ScheduledReminder {
  taskId: string;
  when: Date;
  title: string;
  body: string;
  overdue: boolean;
  kind: string;

  constructor(
    taskId: string,
    when: Date,
    title: string,
    body: string,
    overdue: boolean = false,
    kind: string = "task",
  ) {
    this.taskId = taskId;
    this.when = when;
    this.title = title;
    this.body = body;
    this.overdue = overdue;
    this.kind = kind;
  }

  get key(): string {
    return `${this.kind}:${this.taskId}`;
  }
}

function parseDateTime(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function describeTask(task: TaskLike): [string, string] {
  const name = task.name || task.title || "";
  const extra = task.subject || task.reminder_context || "";
  const subject = extra ? ` · ${extra}` : "";

  let limit = "";
  if (task.due) {
    const dueDate = task.due instanceof Date ? task.due : parseIsoDate(String(task.due));
    if (dueDate) {
      limit = ` · vence ${formatDate(dueDate, "%d/%m")}`;
    }
  }

  let when = "";
  const remDate = parseDateTime(task.reminder);
  if (remDate) {
    when = formatDate(remDate, "%H:%M");
  }

  const body = `${name}${subject}${limit}  (${when})`.trim();
  return [name, body];
}

export function buildReminder(task: TaskLike, now: Date = new Date()): ScheduledReminder | null {
  const remDate = parseDateTime(task.reminder);
  if (!remDate || task.reminder_done) {
    return null;
  }
  if (task.is_done) {
    return null;
  }
  const [title, body] = describeTask(task);
  return new ScheduledReminder(
    task.id,
    remDate,
    title,
    body,
    remDate.getTime() < now.getTime(),
    task.reminder_kind || "task",
  );
}

/** Reminders whose time has arrived and that nobody has shown yet. */
export function dueNow(tasks: TaskLike[], now: Date = new Date()): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const nowMs = now.getTime();

  for (const task of tasks) {
    const reminder = buildReminder(task, now);
    if (!reminder || reminder.when.getTime() > nowMs) {
      continue;
    }
    if (nowMs - reminder.when.getTime() > STALE_AFTER_MS) {
      continue;
    }
    out.push(reminder);
  }

  return out.sort((a, b) => a.when.getTime() - b.when.getTime());
}

/** Reminders too old to be worth showing. */
export function staleReminders(tasks: TaskLike[], now: Date = new Date()): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const nowMs = now.getTime();

  for (const task of tasks) {
    const reminder = buildReminder(task, now);
    if (!reminder) continue;
    if (nowMs - reminder.when.getTime() > STALE_AFTER_MS) {
      out.push(reminder);
    }
  }

  return out;
}

/** Future reminders within the upcoming window, soonest first. */
export function upcomingReminders(
  tasks: TaskLike[],
  now: Date = new Date(),
  windowMs: number = DEFAULT_WINDOW_MS,
  limit: number = DEFAULT_MAX_PENDING,
): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const nowMs = now.getTime();
  const horizon = nowMs + windowMs;

  for (const task of tasks) {
    const reminder = buildReminder(task, now);
    if (!reminder) continue;
    const whenMs = reminder.when.getTime();
    if (whenMs > nowMs && whenMs <= horizon) {
      out.push(reminder);
    }
  }

  out.sort((a, b) => a.when.getTime() - b.when.getTime());
  return out.slice(0, limit);
}

export function summarizeReminders(reminders: ScheduledReminder[]): [string, string] {
  if (!reminders.length) {
    return ["", ""];
  }
  if (reminders.length === 1) {
    return ["Recordatorio de tarea", `• ${reminders[0]!.body}`];
  }
  const lines = reminders.map((r) => `• ${r.body}`);
  return [`${reminders.length} recordatorios de tareas`, lines.join("\n")];
}
