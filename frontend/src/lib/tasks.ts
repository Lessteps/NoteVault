// Pure helpers for Tareas: subtasks live as "- [ ]" lines in the task body,
// and repeat rules use the same strings as core/recurrence.py.

export interface Subtask {
  /** Line index in the body. */
  line: number;
  title: string;
  done: boolean;
}

const SUB_RE = /^(\s*[-*+]\s+)\[([ xX])\]\s?(.*)$/;

export function parseSubtasks(body: string): Subtask[] {
  const out: Subtask[] = [];
  body.split("\n").forEach((ln, i) => {
    const m = SUB_RE.exec(ln);
    if (m) out.push({ line: i, title: m[3]!.trim(), done: m[2] !== " " });
  });
  return out;
}

export function setSubtask(body: string, line: number, done: boolean): string {
  const lines = body.split("\n");
  const m = SUB_RE.exec(lines[line] ?? "");
  if (!m) return body;
  lines[line] = `${m[1]}[${done ? "x" : " "}] ${m[3]}`;
  return lines.join("\n");
}

export function removeSubtask(body: string, line: number): string {
  const lines = body.split("\n");
  if (!SUB_RE.test(lines[line] ?? "")) return body;
  lines.splice(line, 1);
  return lines.join("\n");
}

export function addSubtask(body: string, title: string): string {
  const clean = title.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return body;
  const subs = parseSubtasks(body);
  const lines = body ? body.split("\n") : [];
  const at = subs.length ? subs[subs.length - 1]!.line + 1 : lines.length;
  lines.splice(at, 0, `- [ ] ${clean}`);
  return lines.join("\n");
}

// ── Repeat rules ──────────────────────────────────────────────────────────

export type RepeatKind = "none" | "daily" | "workdays" | "weekly" | "every" | "monthly";

export interface Repeat {
  kind: RepeatKind;
  weekdays: number[]; // 0 = Monday
  every: number;
  monthDays: number[];
}

export const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function ints(text: string, lo: number, hi: number): number[] {
  // Skip empty pieces: Number("") is 0, which would read as Monday.
  return [...new Set(text.split(",").filter((x) => x.trim() !== "").map((x) => Number(x.trim())).filter(
    (n) => Number.isInteger(n) && n >= lo && n <= hi,
  ))].sort((a, b) => a - b);
}

export function parseRepeat(text: string | null | undefined): Repeat {
  const base: Repeat = { kind: "none", weekdays: [], every: 2, monthDays: [] };
  const t = (text ?? "").trim().toLowerCase();
  const [kind = "", args = ""] = t.split(":");
  if (kind === "daily") return { ...base, kind: "daily" };
  if (kind === "weekly") {
    const days = ints(args, 0, 6);
    if (days.join() === "0,1,2,3,4") return { ...base, kind: "workdays", weekdays: days };
    return days.length ? { ...base, kind: "weekly", weekdays: days } : base;
  }
  if (kind === "every") {
    const n = Number(args);
    return Number.isInteger(n) && n > 1 ? { ...base, kind: "every", every: n } : base;
  }
  if (kind === "monthly") {
    const days = ints(args, 1, 31);
    return days.length ? { ...base, kind: "monthly", monthDays: days } : base;
  }
  return base;
}

export function formatRepeat(r: Repeat): string {
  switch (r.kind) {
    case "daily":
      return "daily";
    case "workdays":
      return "weekly:0,1,2,3,4";
    case "weekly":
      return r.weekdays.length ? `weekly:${[...r.weekdays].sort((a, b) => a - b).join(",")}` : "";
    case "every":
      return `every:${Math.max(2, Math.min(365, Math.round(r.every)))}`;
    case "monthly":
      return r.monthDays.length ? `monthly:${[...r.monthDays].sort((a, b) => a - b).join(",")}` : "";
    default:
      return "";
  }
}

// ── Dates ─────────────────────────────────────────────────────────────────

export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
  "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

/** Local "YYYY-MM-DDTHH:MM", the format reminders are stored in. */
export function nowLocal(): string {
  const d = new Date();
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "2026-09-20" -> "20 sep" (and the year when it is not this year). */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const label = `${d} ${MONTHS[(m ?? 1) - 1]!.slice(0, 3).toLowerCase()}`;
  return y === new Date().getFullYear() ? label : `${label} ${y}`;
}

/** Monday-first grid of 6 weeks covering the month of `month` (YYYY-MM). */
export function monthGrid(year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month0, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
