// Tiempo y precondiciones del Plan del Mentor: fechas, semanas de un periodo libre y capacidad.
//
// Módulo PURO y compartido: lo usan el núcleo (`core/mentor/plan.ts`, `planSpec.ts`) y el formulario del
// panel Plan (el cálculo en vivo y el de la API son el mismo código). Sin node:* ni DOM.

// ── Fechas (AAAA-MM-DD, siempre en calendario local sin zona: se opera en UTC para no sufrir el DST) ──

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PERIOD_DAYS = 400;
const DAY_MS = 86400000;
const two = (n: number): string => String(n).padStart(2, "0");

export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const toMs = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const fromMs = (ms: number): string => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${two(t.getUTCMonth() + 1)}-${two(t.getUTCDate())}`;
};

export const addDays = (iso: string, n: number): string => fromMs(toMs(iso) + n * DAY_MS);
/** Días de `a` a `b` (positivo si `b` es posterior). */
export const daysBetween = (a: string, b: string): number => Math.round((toMs(b) - toMs(a)) / DAY_MS);
/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoDow(iso: string): number {
  const d = new Date(toMs(iso)).getUTCDay();
  return d === 0 ? 7 : d;
}
/** Todos los días de `start` a `end`, ambos incluidos ([] si `end` < `start`). */
export function eachDay(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  const out: string[] = [];
  for (let i = 0; i <= n && i <= MAX_PERIOD_DAYS + 1; i++) out.push(addDays(start, i));
  return out;
}
/** Suma meses de calendario recortando el día (31 ene + 1 mes = 28/29 feb). */
export function addMonthsToDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + delta, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${two(first.getUTCMonth() + 1)}-${two(Math.min(d, last))}`;
}
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${two(last)}` };
}

export interface WeekRange {
  week: number;
  start: string;
  end: string;
  days: number;
}

/** Semanas de un periodo: trozos de 7 días desde `start` (la última puede ser más corta). */
export function weekRangesOf(start: string, end: string): WeekRange[] {
  const out: WeekRange[] = [];
  const total = daysBetween(start, end) + 1;
  for (let off = 0, w = 1; off < total; off += 7, w++) {
    const days = Math.min(7, total - off);
    out.push({ week: w, start: addDays(start, off), end: addDays(start, off + days - 1), days });
  }
  return out;
}

/** Semana (1..) del periodo a la que pertenece `date`; 0 si es anterior, nº de semanas + 1 si es posterior. */
export function weekIndex(date: string, start: string, end: string): number {
  if (date < start) return 0;
  const weeks = weekRangesOf(start, end).length;
  if (date > end) return weeks + 1;
  return Math.floor(daysBetween(start, date) / 7) + 1;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dm = (iso: string): string => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
/** "6 oct – 5 nov" (con año si cambia de año o no es el actual no se complica: solo si cruza de año). */
export function periodLabel(start: string, end: string): string {
  const cross = start.slice(0, 4) !== end.slice(0, 4);
  return `${dm(start)}${cross ? ` ${start.slice(0, 4)}` : ""} – ${dm(end)}${cross ? ` ${end.slice(0, 4)}` : ""}`;
}
/** "6–12 oct" / "29 oct – 4 nov": el rango corto de una semana. */
export function shortWeekLabel(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) return start === end ? dm(start) : `${Number(start.slice(8))}–${dm(end)}`;
  return `${dm(start)} – ${dm(end)}`;
}
const num1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");
export const weeksLabel = (weeks: number): string => `${num1(weeks)} ${weeks === 1 ? "semana" : "semanas"}`;

// ── Periodos predefinidos ────────────────────────────────────────────────

export const PERIOD_PRESETS = [
  { key: "1s", label: "1 semana", weeks: 1 },
  { key: "2s", label: "2 semanas", weeks: 2 },
  { key: "1m", label: "1 mes", months: 1 },
  { key: "2m", label: "2 meses", months: 2 },
  { key: "3m", label: "3 meses", months: 3 },
  { key: "6m", label: "6 meses", months: 6 },
] as const;
export type PeriodPresetKey = (typeof PERIOD_PRESETS)[number]["key"];

/** Fin inclusivo de un preset que empieza en `start`: 1 semana = 7 días; 1 mes = hasta el día anterior del mes siguiente. */
export function presetEnd(key: PeriodPresetKey, start: string): string {
  const p = PERIOD_PRESETS.find((x) => x.key === key)!;
  return "weeks" in p ? addDays(start, p.weeks * 7 - 1) : addDays(addMonthsToDate(start, p.months), -1);
}

// ── Precondiciones ───────────────────────────────────────────────────────

export const LEVELS = ["empezando", "basico", "intermedio", "avanzado", "no_se"] as const;
export type PlanLevel = (typeof LEVELS)[number];
export const PACES = ["suave", "normal", "intenso"] as const;
export type PlanPace = (typeof PACES)[number];
/** Capacidad efectiva sobre el tiempo declarado. */
export const PACE_FACTOR: Record<PlanPace, number> = { suave: 0.7, normal: 0.85, intenso: 1 };
/** El nivel declarado ajusta los minutos estimados de un tema (hipótesis, no verdad). */
export const LEVEL_FACTOR: Record<PlanLevel, number> = { empezando: 1.2, basico: 1.1, intermedio: 1, avanzado: 0.85, no_se: 1 };

export interface PlanPreconditions {
  /** AAAA-MM-DD */
  start: string;
  end: string;
  minutesPerDay: number;
  /** días de estudio, ISO: 1 = lunes … 7 = domingo */
  studyDays: number[];
  blockedDates?: string[];
  pace: PlanPace;
  goalIds: string[];
  /** materias / áreas de estudio (primer segmento de la carpeta de los temas) */
  subjects: string[];
  freeObjective?: string;
  /** nivel declarado por materia: solo una hipótesis para el reparto y la IA */
  levels: Record<string, PlanLevel>;
  deliverables: boolean;
}

export const DEFAULT_STUDY_DAYS = [1, 2, 3, 4, 5, 6];
export const MIN_MINUTES_PER_DAY = 5;
export const MAX_MINUTES_PER_DAY = 720;

const strList = (v: unknown, max: number, len = 200): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).filter(Boolean))].map((s) => s.slice(0, len)).slice(0, max);

/** Normaliza lo que llegue (UI, API, disco): nunca lanza; lo inválido se corrige o se omite. */
export function sanitizePreconditions(raw: unknown, today: string): PlanPreconditions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const start = isDate(o.start) ? o.start : today;
  const end = isDate(o.end) ? o.end : presetEnd("1m", start);
  const mpd = Math.round(Number(o.minutesPerDay));
  const studyDays = [...new Set((Array.isArray(o.studyDays) ? o.studyDays : DEFAULT_STUDY_DAYS).map((d: unknown) => Math.round(Number(d))).filter((d: number) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  const blocked = [...new Set((Array.isArray(o.blockedDates) ? o.blockedDates : []).filter(isDate))].sort().slice(0, 400) as string[];
  const levels: Record<string, PlanLevel> = {};
  for (const [k, v] of Object.entries(o.levels && typeof o.levels === "object" ? o.levels : {})) {
    if ((LEVELS as readonly string[]).includes(String(v)) && k.trim()) levels[k.trim().slice(0, 120)] = v as PlanLevel;
  }
  const free = String(o.freeObjective ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return {
    start,
    end,
    minutesPerDay: mpd >= MIN_MINUTES_PER_DAY ? Math.min(MAX_MINUTES_PER_DAY, mpd) : 120,
    studyDays: studyDays.length ? studyDays : [...DEFAULT_STUDY_DAYS],
    ...(blocked.length ? { blockedDates: blocked } : {}),
    pace: (PACES as readonly string[]).includes(String(o.pace)) ? (o.pace as PlanPace) : "normal",
    goalIds: strList(o.goalIds, 40, 80),
    subjects: strList(o.subjects, 40, 120),
    ...(free ? { freeObjective: free } : {}),
    levels,
    deliverables: o.deliverables === undefined ? true : !!o.deliverables,
  };
}

/** Motivo por el que unas precondiciones no sirven para armar un plan, o null. */
export function preconditionsProblem(pre: PlanPreconditions, today?: string): string | null {
  if (!isDate(pre.start) || !isDate(pre.end)) return "Indica las fechas de inicio y fin del periodo.";
  if (pre.end < pre.start) return "La fecha de fin es anterior a la de inicio.";
  if (daysBetween(pre.start, pre.end) + 1 > MAX_PERIOD_DAYS) return `El periodo no puede pasar de ${MAX_PERIOD_DAYS} días.`;
  if (today && pre.end < today) return "El periodo ya terminó: elige fechas que no sean pasadas.";
  if (!(pre.minutesPerDay >= MIN_MINUTES_PER_DAY)) return "El tiempo diario debe ser de al menos 5 minutos.";
  if (!pre.studyDays.length) return "Elige al menos un día de estudio.";
  if (!pre.goalIds.length && !pre.subjects.length && !pre.freeObjective) return "Elige qué quieres cubrir: una meta, una materia o escribe otro objetivo.";
  return null;
}

export interface Capacity {
  /** días del periodo (desde `from`) */
  totalDays: number;
  /** días de estudio que quedan tras quitar los bloqueados */
  studyDays: number;
  blockedDays: number;
  weeks: number;
  /** minutos declarados (días de estudio × tiempo diario) */
  rawMinutes: number;
  /** minutos reales tras el ritmo */
  effectiveMinutes: number;
  /** horas efectivas por semana (media) */
  hoursPerWeek: number;
  factor: number;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Minutos que da cada día del plan: día de estudio no bloqueado × tiempo diario × ritmo. */
export function dayMinutes(pre: Pick<PlanPreconditions, "minutesPerDay" | "studyDays" | "blockedDates" | "pace">): (date: string) => number {
  const days = new Set(pre.studyDays);
  const blocked = new Set(pre.blockedDates ?? []);
  const f = PACE_FACTOR[pre.pace] ?? 1;
  return (date) => (days.has(isoDow(date)) && !blocked.has(date) ? pre.minutesPerDay * f : 0);
}

/** Capacidad real del plan (determinista). `from` = primer día aprovechable (hoy si el periodo ya empezó). */
export function capacityOf(pre: PlanPreconditions, from?: string): Capacity {
  const first = from && from > pre.start ? from : pre.start;
  const days = isDate(first) && isDate(pre.end) ? eachDay(first, pre.end) : [];
  const f = PACE_FACTOR[pre.pace] ?? 1;
  const study = new Set(pre.studyDays);
  const blocked = new Set(pre.blockedDates ?? []);
  let studyCount = 0;
  let blockedCount = 0;
  for (const d of days) {
    if (!study.has(isoDow(d))) continue;
    if (blocked.has(d)) blockedCount++;
    else studyCount++;
  }
  const rawMinutes = studyCount * pre.minutesPerDay;
  const effectiveMinutes = Math.round(rawMinutes * f);
  const weeks = r1(days.length / 7);
  return {
    totalDays: days.length,
    studyDays: studyCount,
    blockedDays: blockedCount,
    weeks,
    rawMinutes,
    effectiveMinutes,
    hoursPerWeek: weeks > 0 ? r1(effectiveMinutes / 60 / weeks) : 0,
    factor: f,
  };
}

// ── Qué hay que cubrir ───────────────────────────────────────────────────

/** Un tema pendiente de lo que se puede elegir (para el cálculo de lo que hay que cubrir). */
export interface ScopeTopic {
  folder: string;
  /** materia / área (primer segmento de la carpeta) */
  area: string;
  minutes: number;
  /** metas activas que lo enlazan */
  goalIds: string[];
}

export const areaOfFolder = (folder: string): string => folder.split("/").filter(Boolean)[0] ?? "";

/** Minutos de un tema con el ajuste por el nivel declarado de su materia. */
export function adjustedMinutes(minutes: number, area: string, levels: Record<string, PlanLevel>): number {
  return Math.max(5, Math.round((minutes * LEVEL_FACTOR[levels[area] ?? "no_se"]) / 5) * 5);
}

/** Temas (únicos) dentro de lo elegido y sus minutos ajustados por nivel. */
export function selectionOf(pre: Pick<PlanPreconditions, "goalIds" | "subjects" | "levels">, topics: readonly ScopeTopic[]): { folders: string[]; minutes: number } {
  const goals = new Set(pre.goalIds);
  const areas = new Set(pre.subjects);
  const picked = topics.filter((t) => areas.has(t.area) || t.goalIds.some((g) => goals.has(g)));
  return { folders: picked.map((t) => t.folder), minutes: picked.reduce((n, t) => n + adjustedMinutes(t.minutes, t.area, pre.levels), 0) };
}

export interface Coverage {
  fits: boolean;
  /** diferencia en minutos (capacidad − necesidad): positiva = sobra */
  spareMinutes: number;
  text: string;
}

const hours = (min: number): string => `${num1(min / 60)} h`;

/** El aviso claro: "tus metas necesitan ~X h y tienes Y h: sobra/falta". */
export function coverage(neededMinutes: number, capacityMinutes: number): Coverage {
  const spare = capacityMinutes - neededMinutes;
  if (neededMinutes <= 0) return { fits: true, spareMinutes: spare, text: "No hay temas pendientes en lo que elegiste: el plan solo tendría entregables." };
  if (capacityMinutes <= 0) return { fits: false, spareMinutes: spare, text: `Lo elegido necesita ~${hours(neededMinutes)} y no tienes horas disponibles: revisa los días de estudio y las fechas.` };
  const head = `Lo elegido necesita ~${hours(neededMinutes)} y tienes ${hours(capacityMinutes)}`;
  return spare >= 0
    ? { fits: true, spareMinutes: spare, text: `${head}: sobran ${hours(spare)}.` }
    : { fits: false, spareMinutes: spare, text: `${head}: faltan ${hours(-spare)}. Alarga el periodo, sube el tiempo diario o quita objetivos.` };
}
