/**
 * Cierre del día y memoria del Mentor.
 *
 * Idea: la IA NO corre todo el rato. Durante el día la app registra, SIN IA y de forma determinista, lo que pasó (temas terminados frente a
 * los previstos, intentos, errores, katas). Al CERRAR el día, el estudiante añade en sus palabras cómo le fue y el Mentor hace UNA revisión:
 * guarda para sí mismo lo que debe recordar (observaciones, lo que dijo el estudiante) y propone CORRECCIONES, que el estudiante convierte en
 * tareas con un clic. Esa memoria entra después en el informe del Mentor (`brief.ts`, proveedor `mentor_memory`).
 *
 * Todo vive en `.notevault/mentor/` (datos de la app, nunca notas):
 *   daily/<AAAA-MM-DD>.json   el registro del día + la revisión del cierre
 *   memory.json               la memoria acumulada (recortada) y las correcciones abiertas
 *
 * Este módulo es PURO salvo `DayCloseStore` (lectura/escritura de esos dos archivos).
 */

import * as path from "node:path";
import * as store from "../store.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_OBSERVATIONS = 30;
export const MAX_STUDENT_SAID = 20;
export const MAX_CORRECTIONS = 40;
const clean = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ── Registro determinista del día ───────────────────────────────────────

export interface DayRecordInput {
  date: string;
  /** temas previstos por los planes activos para ese día */
  planned: ReadonlyArray<{ folder: string; title: string; minutes: number; done: boolean }>;
  /** títulos de los temas que pasaron a «completo» ese día */
  completed: readonly string[];
  /** intentos calificados de ese día */
  attempts: ReadonlyArray<{ discipline: string; skill: string; subject: string; score: number; counted: boolean; verdict: string; seconds: number }>;
  /** errores registrados ese día */
  errors: ReadonlyArray<{ category: string; subject: string; topic: string; skill: string; repeat: number }>;
  /** katas por área marcados ese día */
  katas: ReadonlyArray<{ areaId: string; status: string }>;
}

export interface WeakSpot {
  key: string;
  discipline: string;
  skill: string;
  attempts: number;
  avgScore: number;
  errors: number;
}

export interface DayRecord {
  date: string;
  builtAt: string;
  planned: { topics: number; minutes: number; done: number; pending: Array<{ folder: string; title: string }> };
  completed: string[];
  attempts: { total: number; counted: number; avgScore: number | null; minutes: number; wrong: number };
  weak: WeakSpot[];
  errorsByCategory: Record<string, number>;
  katas: { done: number; skipped: number };
}

const round = (n: number): number => Math.round(n * 10) / 10;

export function buildDayRecord(input: DayRecordInput, builtAt = new Date().toISOString()): DayRecord {
  const pending = input.planned.filter((t) => !t.done).map((t) => ({ folder: t.folder, title: t.title }));
  const scored = input.attempts.filter((a) => Number.isFinite(a.score));
  const spots = new Map<string, WeakSpot>();
  for (const a of input.attempts) {
    const key = `${a.discipline}:${a.skill}`;
    const s = spots.get(key) ?? { key, discipline: a.discipline, skill: a.skill, attempts: 0, avgScore: 0, errors: 0 };
    s.avgScore = (s.avgScore * s.attempts + (Number.isFinite(a.score) ? a.score : 0)) / (s.attempts + 1);
    s.attempts += 1;
    spots.set(key, s);
  }
  const errorsByCategory: Record<string, number> = {};
  for (const e of input.errors) {
    errorsByCategory[e.category || "otro"] = (errorsByCategory[e.category || "otro"] ?? 0) + Math.max(1, e.repeat);
    const s = spots.get(`${e.subject}:${e.skill}`) ?? [...spots.values()].find((x) => x.skill === e.skill && x.skill !== "");
    if (s) s.errors += Math.max(1, e.repeat);
  }
  const weak = [...spots.values()]
    .map((s) => ({ ...s, avgScore: round(s.avgScore) }))
    .filter((s) => s.errors > 0 || s.avgScore < 60)
    .sort((a, b) => b.errors - a.errors || a.avgScore - b.avgScore)
    .slice(0, 6);
  return {
    date: input.date,
    builtAt,
    planned: { topics: input.planned.length, minutes: input.planned.reduce((n, t) => n + t.minutes, 0), done: input.planned.length - pending.length, pending },
    completed: [...input.completed],
    attempts: {
      total: input.attempts.length,
      counted: input.attempts.filter((a) => a.counted).length,
      avgScore: scored.length ? round(scored.reduce((n, a) => n + a.score, 0) / scored.length) : null,
      minutes: Math.round(input.attempts.reduce((n, a) => n + (a.seconds || 0), 0) / 60),
      wrong: input.attempts.filter((a) => a.verdict === "incorrect" || a.verdict === "partial").length,
    },
    weak,
    errorsByCategory,
    katas: { done: input.katas.filter((k) => k.status === "done").length, skipped: input.katas.filter((k) => k.status === "skipped").length },
  };
}

/** ¿Pasó algo registrable ese día? (un día vacío no merece una llamada a la IA). */
export function dayHasActivity(r: DayRecord, student: StudentDay): boolean {
  return r.completed.length > 0 || r.attempts.total > 0 || r.katas.done + r.katas.skipped > 0 || r.planned.topics > 0 || !!student.feeling || !!student.notes;
}

// ── Lo que dice el estudiante ───────────────────────────────────────────

export interface StudentDay {
  /** cómo se sintió (1 = fatal … 5 = muy bien), opcional */
  mood?: 1 | 2 | 3 | 4 | 5;
  /** «lo que me costó» / «cómo me fue», en sus palabras */
  feeling: string;
  /** algo que quiere que el Mentor tenga en cuenta de aquí en adelante */
  notes: string;
}

export function sanitizeStudentDay(raw: unknown): StudentDay {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mood = Math.round(Number(r.mood));
  return { ...(mood >= 1 && mood <= 5 ? { mood: mood as StudentDay["mood"] } : {}), feeling: clean(r.feeling, 600), notes: clean(r.notes, 400) } as StudentDay;
}

// ── Revisión del cierre (IA o reglas) ───────────────────────────────────

export const CORRECTION_KINDS = ["redo", "review", "note_fix", "practice", "plan"] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];
export const CORRECTION_LABEL: Record<CorrectionKind, string> = { redo: "Rehacer", review: "Repasar", note_fix: "Corregir nota", practice: "Practicar", plan: "Ajustar el plan" };

export interface CorrectionDraft {
  title: string;
  why: string;
  kind: CorrectionKind;
  /** carpeta del tema, si aplica */
  topic?: string;
}

export interface DayReview {
  source: "ai" | "rules";
  summary: string;
  /** notas del Mentor para sí mismo (qué observó) */
  observations: string[];
  /** lo que el estudiante dijo y debe tenerse en cuenta */
  studentSaid: string[];
  corrections: CorrectionDraft[];
}

const asKind = (v: unknown): CorrectionKind => ((CORRECTION_KINDS as readonly string[]).includes(String(v)) ? (String(v) as CorrectionKind) : "review");

export function sanitizeReview(raw: unknown, source: DayReview["source"], topics: ReadonlySet<string> = new Set()): DayReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown, n: number, len: number): string[] => (Array.isArray(v) ? v : []).map((x) => clean(x, len)).filter(Boolean).slice(0, n);
  const seen = new Set<string>();
  const corrections: CorrectionDraft[] = [];
  for (const c of Array.isArray(r.corrections) ? r.corrections : []) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const title = clean(o.title, 120);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const topic = clean(o.topic, 300);
    corrections.push({ title, why: clean(o.why, 240), kind: asKind(o.kind), ...(topic && (topics.size === 0 || topics.has(topic)) ? { topic } : {}) });
    if (corrections.length >= 5) break;
  }
  const summary = clean(r.summary, 400);
  if (!summary && !corrections.length) return null;
  return { source, summary, observations: list(r.observations, 5, 200), studentSaid: list(r.studentSaid, 4, 200), corrections };
}

/** La revisión sin IA: reglas simples sobre el registro. Siempre hay una. */
export function reviewByRules(r: DayRecord, student: StudentDay): DayReview {
  const corrections: CorrectionDraft[] = [];
  for (const t of r.planned.pending.slice(0, 3)) corrections.push({ title: `Retomar «${t.title}»`, why: "Estaba previsto para hoy y no se terminó.", kind: "redo", topic: t.folder });
  for (const w of r.weak.slice(0, 2)) {
    if (w.errors > 0) corrections.push({ title: `Repasar ${w.skill || w.discipline}`, why: `${w.errors} ${w.errors === 1 ? "error" : "errores"} hoy en esta habilidad${w.avgScore ? ` (media ${w.avgScore})` : ""}.`, kind: "review" });
  }
  const parts: string[] = [];
  parts.push(r.planned.topics ? `${r.planned.done} de ${r.planned.topics} temas previstos terminados` : "Sin temas previstos");
  if (r.attempts.total) parts.push(`${r.attempts.total} ${r.attempts.total === 1 ? "intento" : "intentos"}${r.attempts.avgScore !== null ? `, nota media ${r.attempts.avgScore}` : ""}`);
  if (r.katas.done) parts.push(`${r.katas.done} ${r.katas.done === 1 ? "kata" : "katas"}`);
  return {
    source: "rules",
    summary: `${parts.join(" · ")}.`,
    observations: r.weak.slice(0, 2).map((w) => `Flojea en ${w.skill || w.discipline}: media ${w.avgScore} en ${w.attempts} ${w.attempts === 1 ? "intento" : "intentos"}.`),
    studentSaid: [student.feeling, student.notes].filter(Boolean).slice(0, 2),
    corrections: corrections.slice(0, 5),
  };
}

// ── Memoria del Mentor ──────────────────────────────────────────────────

export type CorrectionStatus = "open" | "task" | "done" | "dismissed";

export interface Correction extends CorrectionDraft {
  id: string;
  /** día del cierre que la propuso */
  date: string;
  status: CorrectionStatus;
  taskId?: string;
}

export interface MentorMemory {
  version: 1;
  updatedAt: string;
  /** cierres hechos con revisión (fechas) */
  closedDays: string[];
  observations: Array<{ date: string; text: string }>;
  studentSaid: Array<{ date: string; text: string }>;
  corrections: Correction[];
}

export const emptyMemory = (): MentorMemory => ({ version: 1, updatedAt: "", closedDays: [], observations: [], studentSaid: [], corrections: [] });

export function sanitizeMemory(raw: unknown): MentorMemory {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const dated = (v: unknown, max: number): Array<{ date: string; text: string }> =>
    (Array.isArray(v) ? v : []).map((x: any) => ({ date: String(x?.date ?? ""), text: clean(x?.text, 240) })).filter((x) => DATE_RE.test(x.date) && x.text).slice(-max);
  const corrections: Correction[] = [];
  for (const c of Array.isArray(r.corrections) ? r.corrections : []) {
    const id = clean(c?.id, 60);
    const title = clean(c?.title, 120);
    if (!id || !title || !DATE_RE.test(String(c?.date ?? ""))) continue;
    const status = (["open", "task", "done", "dismissed"] as const).find((s) => s === c.status) ?? "open";
    corrections.push({ id, title, why: clean(c.why, 240), kind: asKind(c.kind), date: String(c.date), status, ...(c.topic ? { topic: clean(c.topic, 300) } : {}), ...(c.taskId ? { taskId: clean(c.taskId, 80) } : {}) });
  }
  return {
    version: 1,
    updatedAt: String(r.updatedAt ?? ""),
    closedDays: (Array.isArray(r.closedDays) ? r.closedDays : []).map(String).filter((d) => DATE_RE.test(d)).slice(-90),
    observations: dated(r.observations, MAX_OBSERVATIONS),
    studentSaid: dated(r.studentSaid, MAX_STUDENT_SAID),
    corrections: corrections.slice(-MAX_CORRECTIONS),
  };
}

const slug = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Incorpora la revisión de un cierre a la memoria: sin duplicar correcciones abiertas ni repetir el mismo día. */
export function applyReview(mem: MentorMemory, date: string, review: DayReview, now = new Date().toISOString()): MentorMemory {
  const keep = <T extends { date: string }>(xs: T[]): T[] => xs.filter((x) => x.date !== date);
  const open = new Set(mem.corrections.filter((c) => c.status === "open" || c.status === "task").map((c) => c.title.toLowerCase()));
  const fresh: Correction[] = [];
  for (const c of review.corrections) {
    if (open.has(c.title.toLowerCase())) continue;
    open.add(c.title.toLowerCase());
    fresh.push({ ...c, id: `c-${date}-${slug(c.title) || "x"}`, date, status: "open" });
  }
  return sanitizeMemory({
    ...mem,
    updatedAt: now,
    closedDays: [...new Set([...mem.closedDays, date])].sort(),
    observations: [...keep(mem.observations), ...review.observations.map((text) => ({ date, text }))],
    studentSaid: [...keep(mem.studentSaid), ...review.studentSaid.map((text) => ({ date, text }))],
    corrections: [...mem.corrections.filter((c) => !(c.date === date && c.status === "open" && c.id.startsWith(`c-${date}-`))), ...fresh],
  });
}

/** Líneas compactas para el informe del Mentor (la IA solo ve esto de la memoria). */
export function memoryLines(mem: MentorMemory, today: string): Array<{ text: string; weight: number }> {
  const out: Array<{ text: string; weight: number }> = [];
  const open = mem.corrections.filter((c) => c.status === "open" || c.status === "task");
  for (const c of open.slice(-5)) out.push({ text: `Corrección pendiente (${c.date}): ${c.title}${c.why ? ` — ${c.why}` : ""}`, weight: 90 });
  for (const s of mem.studentSaid.slice(-3)) out.push({ text: `El estudiante dijo (${s.date}): ${s.text}`, weight: 80 });
  for (const o of mem.observations.slice(-3)) out.push({ text: `Observación (${o.date}): ${o.text}`, weight: 60 });
  const last = mem.closedDays[mem.closedDays.length - 1];
  if (last && last !== today) out.push({ text: `Último cierre de día: ${last}`, weight: 20 });
  return out;
}

// ── Almacén ─────────────────────────────────────────────────────────────

export interface StoredDay {
  version: 1;
  record: DayRecord;
  student?: StudentDay;
  review?: DayReview;
  closedAt?: string;
}

export class DayCloseStore {
  constructor(private readonly root: string) {}
  private dir(): string {
    return path.join(this.root, ".notevault", "mentor");
  }
  private dayFile(date: string): string {
    return path.join(this.dir(), "daily", `${date}.json`);
  }
  private memFile(): string {
    return path.join(this.dir(), "memory.json");
  }
  loadDay(date: string): StoredDay | null {
    if (!DATE_RE.test(date)) return null;
    const raw = store.loadJson<StoredDay>(this.dayFile(date), null);
    return raw && raw.record && raw.record.date === date ? raw : null;
  }
  saveDay(day: StoredDay): void {
    store.writeJson(this.dayFile(day.record.date), day);
  }
  memory(): MentorMemory {
    return sanitizeMemory(store.loadJson<unknown>(this.memFile(), null));
  }
  saveMemory(mem: MentorMemory): MentorMemory {
    const clean = sanitizeMemory(mem);
    store.writeJson(this.memFile(), clean);
    return clean;
  }
}
