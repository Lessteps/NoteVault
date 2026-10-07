// Pista «Programming practice» dentro del Plan del Mentor: kata diario + proyecto semanal full stack (+ proyecto mensual).
//
// Módulo PURO y compartido (núcleo, API y formulario): sin node:* ni DOM. Qué es la práctica la define el módulo
// `programming_practice` de la app (kata diario `pp_kata`; proyecto semanal en cuatro fases: especificación,
// construcción, defensa y postmortem); aquí solo se PLANIFICA en el calendario del plan. Nunca se inventan
// minutos ni fases: salen de las precondiciones; la IA solo puede sugerir el TEMA de cada proyecto y, si el foco no
// está fijado, el foco, y todo se valida contra el esquema fijo de abajo.
//
// Por qué una pista aparte (`Plan.programmingPractice`) y no un subplan especial: un subplan es «área + objetivo» con
// temas repartidos por semanas, entregable y metas, y alimenta los contadores, el % y la fusión por área+objetivo
// de `mergePlans`. La práctica no tiene temas, se agenda en días concretos del calendario y su estado sale de otro
// módulo; mezclarla ensuciaría todo eso y las filas por área.

import {
  capacityOf,
  classifyBranch,
  eachDay,
  isDate,
  isoDow,
  PACE_FACTOR,
  PRACTICE_FOCUSES,
  weekRangesOf,
  type Capacity,
  type PlanPreconditions,
  type PracticeFocus,
} from "./planTime.js";

export { PRACTICE_FOCUSES };
export type { PracticeFocus };

/** El nombre de la rama en la interfaz (coincide con la carpeta `programming_practice` de la vault). */
export const PRACTICE_NAME = "Programming practice";
/** Qué es, en una frase (se usa igual en tarjetas, ayudas, formulario, prompts de la IA y documentación). */
export const PRACTICE_PURPOSE = "práctica diaria enfocada en prepararte para entrevistas técnicas y en mejorar tu lógica y tu resolución de procesos";
/** Descripción completa: el reto diario de lógica (kata) es el centro y los proyectos de práctica son el complemento. */
export const PRACTICE_BLURB = `${PRACTICE_NAME} es un sistema de ${PRACTICE_PURPOSE}: un reto de lógica (kata) cada día, al estilo de las entrevistas técnicas, y proyectos de práctica como complemento.`;

export const PRACTICE_PHASES = ["build", "construct", "defend", "postmortem"] as const;
export type PracticePhase = (typeof PRACTICE_PHASES)[number];
export const PHASE_LABEL: Record<PracticePhase, string> = { build: "Especificación", construct: "Construcción", defend: "Defensa", postmortem: "Postmortem" };
export const FOCUS_LABEL: Record<PracticeFocus, string> = {
  backend: "Backend",
  databases: "Bases de datos",
  frontend: "Frontend",
  desktop: "Desktop",
  mobile: "Mobile",
  automation: "Automatización",
};
/** Foco tal como se nombra en los títulos genéricos del plan automático. */
const FOCUS_TITLE: Record<PracticeFocus, string> = { backend: "Backend", databases: "Databases", frontend: "Frontend", desktop: "Desktop", mobile: "Mobile", automation: "Automation" };

export type PhaseStatus = "pendiente" | "en_curso" | "hecho" | "saltado";

export interface PracticeSession {
  /** AAAA-MM-DD */
  date: string;
  minutes: number;
  /** fases del proyecto semanal que se trabajan en esta sesión (en orden) */
  phases: PracticePhase[];
}

export interface PracticeWeek {
  week: number;
  start: string;
  end: string;
  focus: PracticeFocus;
  /** tema del proyecto de la semana (sugerido por la IA o escrito a mano); el plan automático lo deja vacío */
  theme?: string;
  sessions: PracticeSession[];
}

export interface PracticeTrack {
  /** reto de lógica diario: días ISO (los de estudio del plan por defecto) */
  kata?: { minutesPerDay: number; days: number[] };
  /** un proyecto full stack (frontend + backend + base de datos) por semana, con sus cuatro fases */
  weeklyProject?: { sessionsPerWeek: number; minutesPerSession: number; focusMode: "rotate" | PracticeFocus; weeks: PracticeWeek[] };
  /** proyectos mayores que cruzan varias semanas (integran los semanales) */
  monthlyProject?: { blocks: Array<{ fromWeek: number; toWeek: number; theme?: string }> };
}

/** Título de la semana: «Proyecto semanal 3 · foco Databases» o con el tema si lo hay. */
export function weekTitle(w: Pick<PracticeWeek, "week" | "focus" | "theme">): string {
  return w.theme ? `${w.theme} · foco ${FOCUS_TITLE[w.focus]}` : `Proyecto semanal ${w.week} · foco ${FOCUS_TITLE[w.focus]}`;
}

// ── Reparto de fases en las sesiones de la semana ───────────────────────

/**
 * Con `n` sesiones por semana: 1 = todo junto; 2 = especificar y construir / defender y postmortem; 3 = especificar /
 * construir / defender y postmortem; 4 = una fase por sesión; más de 4 = las sesiones extra son de construcción.
 */
export function phasesForSessions(n: number): PracticePhase[][] {
  if (n <= 0) return [];
  if (n === 1) return [[...PRACTICE_PHASES]];
  if (n === 2) return [["build", "construct"], ["defend", "postmortem"]];
  if (n === 3) return [["build"], ["construct"], ["defend", "postmortem"]];
  return [["build"], ...Array.from({ length: n - 3 }, () => ["construct"] as PracticePhase[]), ["defend"], ["postmortem"]];
}

/** `n` elementos repartidos de forma pareja (el primero y el último incluidos si n > 1). */
function spread<T>(items: readonly T[], n: number): T[] {
  if (n <= 0 || !items.length) return [];
  if (n >= items.length) return [...items];
  if (n === 1) return [items[0]!];
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]!);
}

/**
 * Focos que entran en la rotación del proyecto semanal: todos salvo los de las ramas que el plan EXCLUYÓ (si el estudiante dejó fuera
 * Desktop y Mobile, la práctica tampoco rota por ellos). Sin exclusiones, todos.
 */
export function focusPool(pre: Pick<PlanPreconditions, "branchExcluded">): PracticeFocus[] {
  const out = new Set((pre.branchExcluded ?? []).map((b) => classifyBranch(b) as string));
  const pool = PRACTICE_FOCUSES.filter((f) => !out.has(f));
  return pool.length ? pool : [...PRACTICE_FOCUSES];
}

/** Focos para `count` semanas: fijo, o rotando por las áreas del stack (`pool`) desde `start` (por defecto, backend). */
export function rotateFocuses(count: number, mode: "rotate" | PracticeFocus, start?: PracticeFocus, pool: readonly PracticeFocus[] = PRACTICE_FOCUSES): PracticeFocus[] {
  if (mode !== "rotate") return Array.from({ length: count }, () => mode);
  const list = pool.length ? pool : PRACTICE_FOCUSES;
  const at = Math.max(0, list.indexOf(start ?? "backend"));
  return Array.from({ length: count }, (_, i) => list[(at + i) % list.length]!);
}

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface PracticeSuggestions {
  weeks?: Array<{ week: number; focus?: string; theme?: string }>;
  monthlyTheme?: string;
}

export interface BuildTrackOpts {
  /** primer día aprovechable (hoy si el periodo ya empezó) */
  from?: string;
  /** primer foco de la rotación (p. ej. el sugerido por el perfil de práctica) */
  startFocus?: PracticeFocus;
  /** lo que propuso la IA: solo se aceptan temas y, con foco rotativo, focos del esquema; nunca minutos ni fases */
  suggestions?: PracticeSuggestions;
}

export const MONTHLY_BLOCK_WEEKS = 4;

/** La pista de práctica del plan (determinista) a partir de las preferencias; `undefined` si no hay práctica. */
export function buildPracticeTrack(pre: PlanPreconditions, opts: BuildTrackOpts = {}): PracticeTrack | undefined {
  const prefs = pre.practice;
  if (!prefs || !isDate(pre.start) || !isDate(pre.end)) return undefined;
  const from = opts.from && opts.from > pre.start ? opts.from : pre.start;
  const study = new Set(pre.studyDays);
  const blocked = new Set(pre.blockedDates ?? []);
  const track: PracticeTrack = {};
  if (prefs.kataMinutes > 0) track.kata = { minutesPerDay: prefs.kataMinutes, days: [...pre.studyDays].sort((a, b) => a - b) };
  if (prefs.sessionsPerWeek > 0) {
    const ranges = weekRangesOf(pre.start, pre.end);
    const active = ranges.filter((r) => r.end >= from);
    const pool = focusPool(pre);
    const focuses = rotateFocuses(active.length, prefs.focus, opts.startFocus, pool);
    const sugg = new Map((opts.suggestions?.weeks ?? []).map((w) => [Math.round(Number(w.week)), w]));
    const weeks: PracticeWeek[] = ranges.map((r) => {
      const days = r.end < from ? [] : eachDay(r.start > from ? r.start : from, r.end).filter((d) => study.has(isoDow(d)) && !blocked.has(d));
      const picked = spread(days, prefs.sessionsPerWeek);
      const phases = phasesForSessions(picked.length);
      const idx = active.indexOf(r);
      const s = sugg.get(r.week);
      const sFocus = prefs.focus === "rotate" && s && (pool as readonly string[]).includes(String(s.focus)) ? (s.focus as PracticeFocus) : null;
      const theme = oneLine(s?.theme, 80);
      return {
        week: r.week,
        start: r.start,
        end: r.end,
        focus: sFocus ?? (idx >= 0 ? focuses[idx]! : prefs.focus === "rotate" ? (pool.includes(opts.startFocus ?? "backend") ? (opts.startFocus ?? "backend") : pool[0]!) : prefs.focus),
        ...(theme ? { theme } : {}),
        sessions: picked.map((date, i) => ({ date, minutes: prefs.minutesPerSession, phases: phases[i]! })),
      };
    });
    track.weeklyProject = { sessionsPerWeek: prefs.sessionsPerWeek, minutesPerSession: prefs.minutesPerSession, focusMode: prefs.focus, weeks };
    if (prefs.monthly) {
      const withSessions = weeks.filter((w) => w.sessions.length).map((w) => w.week);
      const blocks: Array<{ fromWeek: number; toWeek: number; theme?: string }> = [];
      if (withSessions.length) {
        const first = withSessions[0]!;
        const last = withSessions[withSessions.length - 1]!;
        for (let a = first; a <= last; a += MONTHLY_BLOCK_WEEKS) {
          const b = Math.min(last, a + MONTHLY_BLOCK_WEEKS - 1);
          if (b - a + 1 >= 2) blocks.push({ fromWeek: a, toWeek: b });
        }
      }
      const mt = oneLine(opts.suggestions?.monthlyTheme, 80);
      if (blocks.length && mt) blocks[0] = { ...blocks[0]!, theme: mt };
      if (blocks.length) track.monthlyProject = { blocks };
    }
  }
  return track.kata || track.weeklyProject ? track : undefined;
}

// ── Tiempo reservado ────────────────────────────────────────────────────

/** Minutos de práctica de cada día del calendario (kata + sesiones del proyecto semanal). */
export function practiceDayMinutes(track: PracticeTrack | undefined, range: { blockedDates?: readonly string[]; from: string }): (date: string) => number {
  if (!track) return () => 0;
  const blocked = new Set(range.blockedDates ?? []);
  const kataDays = new Set(track.kata?.days ?? []);
  const sessions = new Map<string, number>();
  for (const w of track.weeklyProject?.weeks ?? []) for (const s of w.sessions) sessions.set(s.date, (sessions.get(s.date) ?? 0) + s.minutes);
  return (date) => {
    if (date < range.from || blocked.has(date)) return 0;
    return (track.kata && kataDays.has(isoDow(date)) ? track.kata.minutesPerDay : 0) + (sessions.get(date) ?? 0);
  };
}

export interface PracticeCapacity extends Capacity {
  /** minutos para estudiar temas (capacidad efectiva menos la práctica reservada) */
  topicMinutes: number;
  /** minutos reservados a la práctica (kata + proyecto semanal) */
  practiceMinutes: number;
  kataMinutes: number;
  projectMinutes: number;
  /** días en que la práctica reservada sola ya no cabe en el tiempo diario */
  overflowDays: number;
  track: PracticeTrack | undefined;
}

/**
 * Capacidad con la práctica reservada: cada día de estudio da `minutesPerDay × ritmo`; de ahí se restan los
 * minutos de práctica de ese día (fijos: el ritmo no los recorta) y el resto es para temas.
 */
export function capacityWithPractice(pre: PlanPreconditions, from?: string, suggestions?: BuildTrackOpts): PracticeCapacity {
  const cap = capacityOf(pre, from);
  const first = from && from > pre.start ? from : pre.start;
  const track = buildPracticeTrack(pre, { ...suggestions, from: first });
  if (!track) return { ...cap, topicMinutes: cap.effectiveMinutes, practiceMinutes: 0, kataMinutes: 0, projectMinutes: 0, overflowDays: 0, track };
  const pm = practiceDayMinutes(track, { blockedDates: pre.blockedDates, from: first });
  const f = PACE_FACTOR[pre.pace] ?? 1;
  const study = new Set(pre.studyDays);
  const blocked = new Set(pre.blockedDates ?? []);
  const kataPerDay = track.kata?.minutesPerDay ?? 0;
  const kataDays = new Set(track.kata?.days ?? []);
  let topic = 0;
  let practice = 0;
  let kata = 0;
  let overflow = 0;
  for (const d of eachDay(first, pre.end)) {
    if (!study.has(isoDow(d)) || blocked.has(d)) continue;
    const dayCap = pre.minutesPerDay * f;
    const p = pm(d);
    practice += p;
    if (kataDays.has(isoDow(d))) kata += kataPerDay;
    if (p > dayCap + 0.5) overflow++;
    topic += Math.max(0, dayCap - p);
  }
  return { ...cap, topicMinutes: Math.round(topic), practiceMinutes: Math.round(practice), kataMinutes: Math.round(kata), projectMinutes: Math.round(practice - kata), overflowDays: overflow, track };
}

// ── De la pista a «Hoy» ─────────────────────────────────────────────────

export interface PracticeItem {
  kind: "kata" | "project";
  planId: string;
  /** texto corto del plan, para el chip «Plan: …» */
  label: string;
  week: number;
  date: string;
  estMinutes: number;
  focus?: PracticeFocus;
  theme?: string;
  /** fases de la sesión de hoy (proyecto) */
  phases?: PracticePhase[];
}

export interface PracticePlanLike {
  id: string;
  start: string;
  end: string;
  archived?: boolean;
  name?: string;
  preconditions?: { blockedDates?: string[] };
  programmingPractice?: PracticeTrack;
}

export const phasesText = (phases: readonly PracticePhase[]): string => phases.map((p) => PHASE_LABEL[p]).join(" + ");

/** Id estable del bloque de «Hoy»: sirve para el registro manual (hecho/saltado) y para recuperar las fases. */
export const kataBlockId = (planId: string): string => `practice:${planId}:kata`;
export const projectBlockId = (planId: string, week: number, phases: readonly PracticePhase[]): string => `practice:${planId}:project:w${week}:${phases.join("+")}`;
const BLOCK_RE = /^practice:(.+):project:w(\d+):([a-z+]+)$/;
export function parseProjectBlockId(id: string): { planId: string; week: number; phases: PracticePhase[] } | null {
  const m = BLOCK_RE.exec(id);
  if (!m) return null;
  const phases = m[3]!.split("+").filter((p): p is PracticePhase => (PRACTICE_PHASES as readonly string[]).includes(p));
  return phases.length ? { planId: m[1]!, week: Number(m[2]), phases } : null;
}

/**
 * Lo que la práctica de los planes activos pide el día `date`: el kata si es día de kata y no se hizo, y la sesión del
 * proyecto semanal que toca hoy según el calendario del plan (si sus fases no están ya hechas).
 */
export function practiceItemsFor(
  date: string,
  plans: readonly PracticePlanLike[],
  done?: { kata?: (planId: string, date: string) => boolean; project?: (planId: string, week: number, phases: readonly PracticePhase[]) => boolean },
  label: (p: PracticePlanLike) => string = (p) => p.name ?? p.id,
): PracticeItem[] {
  const out: PracticeItem[] = [];
  const ordered = [...plans].sort((a, b) => a.start.localeCompare(b.start));
  for (const plan of ordered) {
    const track = plan.programmingPractice;
    if (!track || plan.archived || date < plan.start || date > plan.end) continue;
    const week = weekRangesOf(plan.start, plan.end).find((r) => date >= r.start && date <= r.end)?.week ?? 1;
    const blocked = new Set(plan.preconditions?.blockedDates ?? []);
    const lbl = label(plan);
    if (track.kata && track.kata.days.includes(isoDow(date)) && !blocked.has(date) && !done?.kata?.(plan.id, date)) {
      out.push({ kind: "kata", planId: plan.id, label: lbl, week, date, estMinutes: track.kata.minutesPerDay });
    }
    const w = track.weeklyProject?.weeks.find((x) => x.week === week);
    const s = w?.sessions.find((x) => x.date === date);
    if (w && s && !done?.project?.(plan.id, w.week, s.phases)) {
      out.push({ kind: "project", planId: plan.id, label: lbl, week: w.week, date, estMinutes: s.minutes, focus: w.focus, ...(w.theme ? { theme: w.theme } : {}), phases: s.phases });
    }
  }
  return out;
}

/** Lo que una pista ya guarda (temas y focos), como sugerencias para regenerarla sin perderlos. */
export function suggestionsOf(track: PracticeTrack | undefined): PracticeSuggestions | undefined {
  const weeks = (track?.weeklyProject?.weeks ?? []).map((w) => ({ week: w.week, focus: w.focus, ...(w.theme ? { theme: w.theme } : {}) }));
  const monthlyTheme = track?.monthlyProject?.blocks[0]?.theme;
  return weeks.length || monthlyTheme ? { ...(weeks.length ? { weeks } : {}), ...(monthlyTheme ? { monthlyTheme } : {}) } : undefined;
}

// ── Lectura segura de disco ─────────────────────────────────────────────

/** Normaliza una pista leída de disco (nunca lanza); `undefined` si no hay nada utilizable. Las fechas deben caer en el plan. */
export function sanitizePracticeTrack(raw: unknown, start: string, end: string): PracticeTrack | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, any>;
  const track: PracticeTrack = {};
  const int = (v: unknown, lo: number, hi: number): number | null => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  if (o.kata && typeof o.kata === "object") {
    const m = int(o.kata.minutesPerDay, 1, 600);
    const days = [...new Set((Array.isArray(o.kata.days) ? o.kata.days : []).map((d: unknown) => Math.round(Number(d))).filter((d: number) => d >= 1 && d <= 7))].sort((a, b) => (a as number) - (b as number)) as number[];
    if (m && days.length) track.kata = { minutesPerDay: m, days };
  }
  const wp = o.weeklyProject;
  if (wp && typeof wp === "object") {
    const ranges = weekRangesOf(start, end);
    const weeks: PracticeWeek[] = [];
    for (const rw of Array.isArray(wp.weeks) ? wp.weeks : []) {
      const n = int(rw?.week, 1, ranges.length);
      if (!n || weeks.some((w) => w.week === n)) continue;
      const r = ranges[n - 1]!;
      const focus = (PRACTICE_FOCUSES as readonly string[]).includes(String(rw.focus)) ? (rw.focus as PracticeFocus) : "backend";
      const sessions: PracticeSession[] = [];
      for (const rs of Array.isArray(rw.sessions) ? rw.sessions : []) {
        const minutes = int(rs?.minutes, 1, 600);
        const phases = (Array.isArray(rs?.phases) ? rs.phases : []).filter((p: unknown): p is PracticePhase => (PRACTICE_PHASES as readonly string[]).includes(String(p)));
        if (!isDate(rs?.date) || rs.date < r.start || rs.date > r.end || !minutes || !phases.length) continue;
        sessions.push({ date: rs.date, minutes, phases });
      }
      const theme = oneLine(rw.theme, 80);
      weeks.push({ week: n, start: r.start, end: r.end, focus, ...(theme ? { theme } : {}), sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)) });
    }
    weeks.sort((a, b) => a.week - b.week);
    if (weeks.length) {
      const focusMode = (PRACTICE_FOCUSES as readonly string[]).includes(String(wp.focusMode)) ? (wp.focusMode as PracticeFocus) : "rotate";
      track.weeklyProject = { sessionsPerWeek: int(wp.sessionsPerWeek, 1, 7) ?? 1, minutesPerSession: int(wp.minutesPerSession, 1, 600) ?? 60, focusMode, weeks };
    }
  }
  const blocks: Array<{ fromWeek: number; toWeek: number; theme?: string }> = [];
  for (const b of Array.isArray(o.monthlyProject?.blocks) ? o.monthlyProject.blocks : []) {
    const a = int(b?.fromWeek, 1, 80);
    const z = int(b?.toWeek, 1, 80);
    const theme = oneLine(b?.theme, 80);
    if (a && z && z >= a) blocks.push({ fromWeek: a, toWeek: z, ...(theme ? { theme } : {}) });
  }
  if (blocks.length && track.weeklyProject) track.monthlyProject = { blocks };
  return track.kata || track.weeklyProject ? track : undefined;
}
