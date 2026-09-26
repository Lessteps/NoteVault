/**
 * NoteVault Task Manager
 * Data layer for the Tareas / Proyectos module.
 * Ported from notevault_app/core/task_manager.py.
 *
 * Every task is a real markdown file the user can open and edit:
 *     {vault}/tareas/<task-id>.md
 *
 *     ---
 *     id: t20260911-abc123
 *     name: Ensayo de historia
 *     created: 2026-09-11
 *     start: 2026-09-11          # "fecha de salida" (cuando se asigna)
 *     due: 2026-09-20            # fecha límite
 *     status: Sin empezar
 *     subject: Historia
 *     priority: 2                # 1..3 estrellas
 *     reminder: 2026-09-19T18:00 # opcional
 *     reminder_done: false
 *     ---
 *
 *     (cuerpo markdown libre — el "archivo interno" de la tarea)
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseDate as parseAnyDate, Recurrence } from "./recurrence";
import { type TaskLike } from "./reminderScheduler";
import { LAYOUT } from "./vaultFormat";

export const STATUS_TODO = "Sin empezar";
export const STATUS_DOING = "En progreso";
export const STATUS_DONE = "Completado";
export const STATUS_BLOCK = "Bloqueado";
export const STATUSES = [STATUS_TODO, STATUS_DOING, STATUS_DONE, STATUS_BLOCK] as const;

export const STATUS_COLORS: Record<string, string> = {
  [STATUS_TODO]: "#8b8b96",
  [STATUS_DOING]: "#2383e2",
  [STATUS_DONE]: "#4ade80",
  [STATUS_BLOCK]: "#f2555a",
};

export const PRIORITY_MAX = 3;

export const MONTH_NAMES_ES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function parseDt(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] ? Number(m[6]) : 0,
  );
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.getDate()} de ${MONTH_NAMES_ES[d.getMonth() + 1]!.toLowerCase()}, ${d.getFullYear()}`;
}

export function fmtDateShort(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDtMinutes(d: Date | null | undefined): string {
  if (!d) return "";
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export class Task implements TaskLike {
  id: string;
  name: string;
  created: Date | null;
  start: Date | null;
  start_time: string | null;
  due: Date | null;
  due_time: string | null;
  status: string;
  subject: string;
  priority: number;
  reminder: Date | null;
  reminder_done: boolean;
  body: string;
  repeat: string;
  repeat_until: Date | null;
  extra_fields: Record<string, unknown>;

  constructor(tid: string, fields: Record<string, any> = {}) {
    this.id = tid;
    this.name = fields.name || "Sin título";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.created = fields.created ? parseDate(fields.created) : today;
    this.start = fields.start ? parseDate(fields.start) : null;
    this.start_time = fields.start_time ?? null;
    this.due = fields.due ? parseDate(fields.due) : null;
    this.due_time = fields.due_time ?? null;
    this.status = fields.status || STATUS_TODO;
    this.subject = fields.subject || "";
    this.priority = Math.trunc(Number(fields.priority || 1)) || 1;
    this.reminder = fields.reminder ? parseDt(fields.reminder) : null;
    this.reminder_done = Boolean(fields.reminder_done);
    this.body = fields.body || "";
    this.repeat = Recurrence.parse(fields.repeat).toString();
    this.repeat_until = fields.repeat_until ? parseDate(fields.repeat_until) : null;

    const knownKeys = new Set([
      "id", "name", "created", "start", "start_time", "due", "due_time",
      "status", "subject", "priority", "reminder", "reminder_done", "body",
      "repeat", "repeat_until", "extra_fields",
    ]);
    if ("extra_fields" in fields && fields.extra_fields && typeof fields.extra_fields === "object") {
      this.extra_fields = { ...fields.extra_fields };
    } else {
      this.extra_fields = {};
      for (const [k, v] of Object.entries(fields)) {
        if (!knownKeys.has(k)) {
          this.extra_fields[k] = v;
        }
      }
    }
  }

  get is_done(): boolean {
    return this.status === STATUS_DONE;
  }

  get isDone(): boolean {
    return this.is_done;
  }

  get rule(): Recurrence {
    return Recurrence.parse(this.repeat);
  }

  get anchor(): Date | null {
    return this.due ?? this.start ?? null;
  }

  occurs_on(d: Date | string): boolean {
    const target = parseDate(d);
    if (!target) return false;
    if (!this.rule.repeats) {
      const isDue = this.due ? sameDay(this.due, target) : false;
      const isStart = this.start ? sameDay(this.start, target) : false;
      return isDue || isStart;
    }
    return this.rule.occursOn(target, this.anchor, this.repeat_until);
  }

  occursOn(d: Date | string): boolean {
    return this.occurs_on(d);
  }

  get is_overdue(): boolean {
    if (!this.due || this.is_done) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return this.due.getTime() < today.getTime();
  }

  get isOverdue(): boolean {
    return this.is_overdue;
  }

  stars(): string {
    const p = Math.max(1, Math.min(PRIORITY_MAX, this.priority));
    return "★".repeat(p) + "☆".repeat(PRIORITY_MAX - p);
  }

  matches(query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [this.name, this.subject, this.status, this.body].join(" ").toLowerCase();
    return haystack.includes(q);
  }
}

export class TaskManager {
  vaultRoot: string;
  tasksDir: string;
  private _cache: Task[] | null = null;
  private _stamp: string | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.tasksDir = path.join(this.vaultRoot, LAYOUT.tasks_dir);
  }

  _path(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.md`);
  }

  private _stampOf(folder: string): string {
    try {
      if (!fs.existsSync(folder)) return "";
      const files = fs.readdirSync(folder).filter((f) => f.endsWith(".md")).sort();
      return files
        .map((f) => {
          const st = fs.statSync(path.join(folder, f));
          return `${f}:${st.mtimeMs}`;
        })
        .join(";");
    } catch {
      return "";
    }
  }

  tasks(force = false): Task[] {
    const stamp = this._stampOf(this.tasksDir);
    if (force || this._cache === null || stamp !== this._stamp) {
      this._cache = this._loadAll();
      this._stamp = stamp;
    }
    return [...this._cache];
  }

  private _loadAll(): Task[] {
    if (!fs.existsSync(this.tasksDir)) {
      return [];
    }
    const out: Task[] = [];
    const files = fs.readdirSync(this.tasksDir).filter((f) => f.endsWith(".md")).sort();
    for (const f of files) {
      const t = this._parse(path.join(this.tasksDir, f));
      if (t) {
        out.push(t);
      }
    }
    out.sort((a, b) => {
      const dueA = a.due ? a.due.getTime() : Infinity;
      const dueB = b.due ? b.due.getTime() : Infinity;
      if (dueA !== dueB) return dueA - dueB;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return out;
  }

  private _parse(filePath: string): Task | null {
    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }

    const fm: Record<string, string> = {};
    const bodyLines: string[] = [];
    let fmCount = 0;

    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "---" && fmCount < 2) {
        fmCount += 1;
        continue;
      }
      if (fmCount === 1) {
        const m = /^([a-z_0-9\-]+):\s*(.*)$/.exec(line.trim());
        if (m) {
          let val = m[2]!.trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          fm[m[1]!] = val;
        }
      } else if (fmCount >= 2) {
        bodyLines.push(line);
      }
    }

    const tid = fm.id || path.parse(filePath).name;
    const knownKeys = new Set([
      "id", "name", "created", "start", "start_time", "due", "due_time",
      "status", "subject", "priority", "reminder", "reminder_done",
      "repeat", "repeat_until", "extra_fields",
    ]);
    const extraFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm)) {
      if (!knownKeys.has(k)) {
        extraFields[k] = v;
      }
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return new Task(tid, {
      name: fm.name ?? path.parse(filePath).name,
      created: parseDate(fm.created) || today,
      start: parseDate(fm.start),
      start_time: fm.start_time || null,
      due: parseDate(fm.due),
      due_time: fm.due_time || null,
      status: fm.status || STATUS_TODO,
      subject: fm.subject || "",
      priority: parseInt(fm.priority || "1", 10) || 1,
      reminder: parseDt(fm.reminder),
      reminder_done: fm.reminder_done === "true",
      body: bodyLines.join("\n").trim(),
      repeat: fm.repeat || "",
      repeat_until: parseDate(fm.repeat_until),
      extra_fields: extraFields,
    });
  }

  save(task: Task): void {
    fs.mkdirSync(this.tasksDir, { recursive: true });
    const lines = [
      "---",
      `id: ${task.id}`,
      `name: "${task.name}"`,
      `created: ${task.created ? isoDate(task.created) : ""}`,
      `start: ${task.start ? isoDate(task.start) : ""}`,
    ];
    if (task.start_time) {
      lines.push(`start_time: ${task.start_time}`);
    }
    lines.push(`due: ${task.due ? isoDate(task.due) : ""}`);
    if (task.due_time) {
      lines.push(`due_time: ${task.due_time}`);
    }
    lines.push(`status: ${task.status}`);
    lines.push(`subject: "${task.subject}"`);
    lines.push(`priority: ${task.priority}`);
    lines.push(`reminder: ${task.reminder ? isoDtMinutes(task.reminder) : ""}`);
    lines.push(`reminder_done: ${task.reminder_done ? "true" : "false"}`);

    if (task.repeat) {
      const quoted = task.repeat.includes(":") ? `"${task.repeat}"` : task.repeat;
      lines.push(`repeat: ${quoted}`);
      if (task.repeat_until) {
        lines.push(`repeat_until: ${isoDate(task.repeat_until)}`);
      }
    }

    for (const [k, v] of Object.entries(task.extra_fields || {})) {
      if (
        typeof v === "string" &&
        (v.includes(" ") || v.includes(":")) &&
        !(v.startsWith('"') || v.startsWith("'"))
      ) {
        lines.push(`${k}: "${v}"`);
      } else {
        lines.push(`${k}: ${v}`);
      }
    }

    lines.push("---");
    lines.push("");
    lines.push(task.body.trim());
    lines.push("");

    fs.writeFileSync(this._path(task.id), lines.join("\n"), "utf-8");
    this._cache = null;
  }

  create(name = "Nueva tarea", fields: Record<string, any> = {}): Task {
    const rawCreated = fields.created;
    delete fields.created;
    let created: Date | null = null;
    if (rawCreated) {
      created = parseDate(rawCreated);
    }
    if (!created) {
      const now = new Date();
      created = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const ymd = `${created.getFullYear()}${pad(created.getMonth() + 1)}${pad(created.getDate())}`;
    const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    const tid = `t${ymd}-${hex}`;

    const task = new Task(tid, { name, created, ...fields });
    this.save(task);
    return task;
  }

  get(taskId: string): Task | null {
    for (const t of this.tasks()) {
      if (t.id === taskId) {
        return t;
      }
    }
    return null;
  }

  update(taskId: string, fields: Record<string, any> = {}): Task | null {
    const task = this.get(taskId);
    if (!task) {
      return null;
    }
    const wasDone = task.is_done;
    for (const [k, v] of Object.entries(fields)) {
      if (k === "repeat") {
        task.repeat = Recurrence.parse(v).toString();
      } else if (k === "repeat_until") {
        task.repeat_until = parseAnyDate(v);
      } else if (k === "created" || k === "start" || k === "due") {
        (task as any)[k] = parseDate(v);
      } else if (k === "reminder") {
        task.reminder = parseDt(v);
      } else if (k === "priority") {
        task.priority = Math.trunc(Number(v || 1)) || 1;
      } else if (k === "reminder_done") {
        task.reminder_done = Boolean(v);
      } else if (k in task) {
        (task as any)[k] = v;
      } else {
        task.extra_fields[k] = v;
      }
    }

    if (task.is_done && !wasDone) {
      this._rollForward(task);
    }
    this.save(task);
    return task;
  }

  private _rollForward(task: Task): void {
    const rule = task.rule;
    if (!rule.repeats || task.due === null) {
      return;
    }
    const nxt = rule.nextAfter(task.due, task.due, task.repeat_until);
    if (nxt === null) {
      return;
    }
    const shiftMs = nxt.getTime() - task.due.getTime();
    task.due = nxt;
    if (task.start !== null) {
      task.start = new Date(task.start.getTime() + shiftMs);
    }
    if (task.reminder !== null) {
      task.reminder = new Date(task.reminder.getTime() + shiftMs);
      task.reminder_done = false;
    }
    task.status = STATUS_TODO;
  }

  delete(taskId: string): void {
    const p = this._path(taskId);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
    }
    this._cache = null;
  }

  subjects(): string[] {
    const subs = new Set<string>();
    for (const t of this.tasks()) {
      if (t.subject) subs.add(t.subject);
    }
    return Array.from(subs).sort();
  }

  due_on(d: Date | string): Task[] {
    const target = parseDate(d);
    if (!target) return [];
    return this.tasks().filter((t) => t.due && sameDay(t.due, target));
  }

  dueOn(d: Date | string): Task[] {
    return this.due_on(d);
  }

  filtered(
    query = "",
    status = "",
    subject = "",
    priority = 0,
    hideDone = false,
  ): Task[] {
    const out: Task[] = [];
    for (const t of this.tasks()) {
      if (query && !t.matches(query)) continue;
      if (status && t.status !== status) continue;
      if (subject && t.subject !== subject) continue;
      if (priority && t.priority !== priority) continue;
      if (hideDone && t.is_done) continue;
      out.push(t);
    }
    return out;
  }

  upcoming_reminders(): Task[] {
    const items = this.tasks().filter((t) => t.reminder && !t.reminder_done);
    items.sort((a, b) => a.reminder!.getTime() - b.reminder!.getTime());
    return items;
  }

  upcomingReminders(): Task[] {
    return this.upcoming_reminders();
  }

  due_reminders(now?: Date): Task[] {
    const n = now || new Date();
    return this.tasks().filter(
      (t) => t.reminder && !t.reminder_done && t.reminder.getTime() <= n.getTime(),
    );
  }

  dueReminders(now?: Date): Task[] {
    return this.due_reminders(now);
  }

  mark_reminder_shown(taskId: string): void {
    this.update(taskId, { reminder_done: true });
  }

  markReminderShown(taskId: string): void {
    this.mark_reminder_shown(taskId);
  }
}
