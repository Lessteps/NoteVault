// Currículo de PRÁCTICA del plan (`Plan.practiceCurriculum`) y PROYECTOS diario / semanal / mensual conectados a lo estudiado.
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Documentado en docs/VAULT_FORMAT.md («Currículo de práctica y
// proyectos»).
//
// Qué guarda el currículo (aditivo, opcional; solo existe si el usuario pulsa «Generar la práctica del plan con el Mentor»):
//  - por SEMANA del plan: ejercicios concretos ligados a un TEMA real del plan (`topic` = carpeta), retos de lógica tipo entrevista, el título
//    del proyecto semanal y mini-proyectos diarios ligados a un tema ancla;
//  - por MES (AAAA-MM): el proyecto mensual.
//  La IA NUNCA decide fechas ni minutos: la app coloca cada ejercicio en el día en que su tema se practica (bloque de práctica de la agenda
//  por enfoque) y los minutos salen del reparto. Todo lo que llega de fuera se valida contra los temas y semanas reales del plan.
//  Sin IA hay PLANTILLAS deterministas por tipo de tema («Practica <tema> en <lenguaje>: 3 ejercicios del tema»), marcadas como automáticas.
//  Si un tema ya tiene notas de ejercicios en la vault, se priorizan y se enlazan; la IA solo propone ejercicios nuevos donde faltan.
//
// Proyectos
//  - DIARIO: aplica los temas teóricos y prácticos de ESE día (id `dp:<fecha>`, entregable de tipo `daily_project`).
//  - SEMANAL: acumula los diarios de la semana (el de Programming practice `wp:<n>` si la pista lo tiene; si no, `ww:<n>`).
//  - MENSUAL: integra los semanales del mes (el de la pista `mp:<semana>` si existe; si no, `mm:<AAAA-MM>`).
//  Los tres cuentan como entregables en los conteos por día, semana y mes.

import { weekRangesOf } from "./planTime.js";
import { dailyPieceOf, integratedDaily, integratedMonthly, integratedWeekly, monthlyPieceOf, weeklyPieceOf } from "./planAreaPractice.js";
import { languageIdOf, languageName } from "./planLanguages.js";
import type { PracticeType } from "./planDayFocus.js";
import type { PlanSchedule, ScheduleDay, SchedulePlan } from "./planSchedule.js";

// ── Modelo ──────────────────────────────────────────────────────────────

export const MAX_EXERCISE_TITLE = 120;
export const MAX_STATEMENT = 280;
export const MAX_PROJECT_DESC = 320;

export interface CurriculumExercise {
  /** carpeta del tema real del plan al que se liga */
  topic: string;
  practice: PracticeType;
  language?: string;
  title: string;
  statement?: string;
  /** `vault` = el tema ya tiene ejercicios en la vault y se prioriza (no los inventa la IA); `ai` / `template` = propuesto */
  source: "ai" | "template" | "vault";
  /** nº de ejercicios que el tema ya tiene en la vault (solo `vault`) */
  existing?: number;
}

export interface CurriculumLogic {
  title: string;
  statement?: string;
  source: "ai" | "template";
}

export interface CurriculumDaily {
  /** tema ancla (carpeta): el día en que se estudia lleva este mini-proyecto */
  topic: string;
  title: string;
  description?: string;
  source: "ai" | "template";
}

export interface CurriculumWeek {
  week: number;
  source: "ai" | "template";
  exercises: CurriculumExercise[];
  logic: CurriculumLogic[];
  weeklyProject?: { title: string; description?: string };
  dailyProjects: CurriculumDaily[];
}

export interface CurriculumMonth {
  month: string;
  title: string;
  description?: string;
  source: "ai" | "template";
}

export interface PracticeCurriculum {
  generatedAt: string;
  /** ai = todos los bloques con IA · mixed = alguno cayó a plantillas · template = sin IA */
  source: "ai" | "mixed" | "template";
  weeks: CurriculumWeek[];
  monthly: CurriculumMonth[];
  warnings?: string[];
}

// ── Lectura segura ──────────────────────────────────────────────────────

const one = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const PRACTICE_TYPES: readonly string[] = ["language", "database", "ui", "scripting", "tooling", "area"];

export interface CurriculumScope {
  start: string;
  end: string;
  /** carpetas de temas reales del plan */
  folders: ReadonlySet<string>;
}

export const scopeOfPlan = (plan: Pick<SchedulePlan, "start" | "end" | "subplans">): CurriculumScope => ({ start: plan.start, end: plan.end, folders: new Set(plan.subplans.flatMap((s) => s.topics.map((t) => t.folder))) });

/** Valida una semana del currículo que llega de fuera (IA o disco): temas y semanas reales, textos acotados. Nunca lanza. */
export function sanitizeCurriculumWeek(raw: unknown, scope: CurriculumScope, source: "ai" | "template", weekOverride?: number): CurriculumWeek | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, any>;
  const weeks = weekRangesOf(scope.start, scope.end).length;
  const week = Math.round(Number(weekOverride ?? o.week));
  if (!Number.isFinite(week) || week < 1 || week > weeks) return null;
  const exercises: CurriculumExercise[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(o.exercises) ? o.exercises : []) {
    const topic = one(e?.topic, 400);
    const title = one(e?.title, MAX_EXERCISE_TITLE);
    if (!topic || !title || !scope.folders.has(topic)) continue;
    const key = `${topic}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const practice = PRACTICE_TYPES.includes(String(e.practice)) ? (e.practice as PracticeType) : "area";
    const language = one(e.language, 24);
    const statement = one(e.statement, MAX_STATEMENT);
    const src = e.source === "vault" ? "vault" : source;
    const existing = src === "vault" ? Math.max(0, Math.round(Number(e.existing) || 0)) : 0;
    exercises.push({ topic, practice, ...(language ? { language } : {}), title, ...(statement ? { statement } : {}), source: src, ...(existing ? { existing } : {}) });
  }
  const logic: CurriculumLogic[] = [];
  for (const l of Array.isArray(o.logic) ? o.logic : []) {
    const title = one(l?.title, MAX_EXERCISE_TITLE);
    if (!title) continue;
    const statement = one(l?.statement, MAX_STATEMENT);
    logic.push({ title, ...(statement ? { statement } : {}), source });
  }
  const wp = o.weeklyProject && typeof o.weeklyProject === "object" ? o.weeklyProject : null;
  const wpTitle = one(wp?.title, 100);
  const wpDesc = one(wp?.description, MAX_PROJECT_DESC);
  const dailyProjects: CurriculumDaily[] = [];
  const dseen = new Set<string>();
  for (const d of Array.isArray(o.dailyProjects) ? o.dailyProjects : []) {
    const topic = one(d?.topic, 400);
    const title = one(d?.title, 100);
    if (!topic || !title || !scope.folders.has(topic) || dseen.has(topic)) continue;
    dseen.add(topic);
    const description = one(d?.description, MAX_PROJECT_DESC);
    dailyProjects.push({ topic, title, ...(description ? { description } : {}), source });
  }
  return { week, source, exercises: exercises.slice(0, 40), logic: logic.slice(0, 10), ...(wpTitle ? { weeklyProject: { title: wpTitle, ...(wpDesc ? { description: wpDesc } : {}) } } : {}), dailyProjects: dailyProjects.slice(0, 14) };
}

/** Normaliza el currículo leído de disco; `undefined` si no hay nada utilizable. */
export function sanitizeCurriculum(raw: unknown, scope: CurriculumScope): PracticeCurriculum | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, any>;
  const weeks: CurriculumWeek[] = [];
  const seen = new Set<number>();
  for (const w of Array.isArray(o.weeks) ? o.weeks : []) {
    const clean = sanitizeCurriculumWeek(w, scope, w?.source === "ai" ? "ai" : "template");
    if (!clean || seen.has(clean.week) || !(clean.exercises.length || clean.logic.length || clean.weeklyProject || clean.dailyProjects.length)) continue;
    seen.add(clean.week);
    weeks.push(clean);
  }
  weeks.sort((a, b) => a.week - b.week);
  const monthly: CurriculumMonth[] = [];
  for (const m of Array.isArray(o.monthly) ? o.monthly : []) {
    const month = String(m?.month ?? "");
    const title = one(m?.title, 100);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < scope.start.slice(0, 7) || month > scope.end.slice(0, 7) || !title || monthly.some((x) => x.month === month)) continue;
    const description = one(m?.description, MAX_PROJECT_DESC);
    monthly.push({ month, title, ...(description ? { description } : {}), source: m?.source === "ai" ? "ai" : "template" });
  }
  if (!weeks.length && !monthly.length) return undefined;
  const warnings = (Array.isArray(o.warnings) ? o.warnings : []).map((x: unknown) => one(x, 240)).filter(Boolean).slice(0, 12);
  const generatedAt = typeof o.generatedAt === "string" && o.generatedAt ? o.generatedAt.slice(0, 40) : new Date(0).toISOString();
  const source = weeks.every((w) => w.source === "ai") && weeks.length ? "ai" : weeks.every((w) => w.source === "template") ? "template" : "mixed";
  return { generatedAt, source, weeks, monthly, ...(warnings.length ? { warnings } : {}) };
}

// ── Plantillas deterministas (sin IA) ───────────────────────────────────

export const shortOf = (t: string): string => t.replace(/^[\d.\s_-]+/, "").trim() || t;

/** Ejercicio de plantilla para un tema según el tipo de práctica del bloque (marcado como automático al enseñarlo). */
export function templateExercise(practice: PracticeType, topicTitle: string, language?: string): { title: string; statement: string } {
  const t = shortOf(topicTitle);
  switch (practice) {
    case "language":
      return { title: `Practica ${t} en ${language || "el lenguaje del plan"}: 3 ejercicios del tema`, statement: `Escribe tres funciones pequeñas que usen «${t}», cada una con su caso de prueba.` };
    case "database":
      return { title: `Diseña la tabla y escribe la consulta de «${t}»: 3 ejercicios en SQL`, statement: `Crea una tabla de ejemplo, inserta datos y escribe tres consultas que practiquen «${t}».` };
    case "ui":
      return { title: `Construye un componente con «${t}»: 3 variantes`, statement: `Implementa un componente accesible que use «${t}» y pruébalo con teclado.` };
    case "scripting":
      return { title: `Automatiza una tarea con «${t}» en ${language || "un script"}: 3 ejercicios`, statement: `Escribe un script que lea un archivo, aplique «${t}» y deje un registro de lo que hizo.` };
    case "tooling":
      return { title: `Aplica «${t}» en un repositorio de práctica: 3 ejercicios`, statement: `Haz tres cambios en un repositorio de prueba usando «${t}» y comprueba el resultado.` };
    default:
      return { title: `Practica «${t}»: 3 ejercicios del tema`, statement: `Resuelve tres ejercicios cortos que apliquen «${t}».` };
  }
}

/** Retos de lógica de plantilla por enfoque (entrevista técnica), uno por día de la semana, rotando. */
const LOGIC_BY_FOCUS: Record<string, readonly string[]> = {
  backend: ["Agrupa registros por clave y cuenta ocurrencias (diccionarios)", "Valida y normaliza una lista de peticiones (cadenas y casos límite)", "Encuentra duplicados en un registro de eventos", "Fusiona dos listas ordenadas de resultados", "Limita el ritmo de peticiones con una ventana deslizante"],
  databases: ["Encuentra el segundo valor más alto sin ordenar toda la lista", "Simula un JOIN entre dos listas de diccionarios", "Agrega ventas por mes con un recorrido", "Detecta filas huérfanas entre dos tablas"],
  frontend: ["Aplana una estructura anidada de menús", "Filtra y ordena una lista por varios criterios", "Implementa un debounce paso a paso", "Valida un formulario con reglas encadenadas"],
  automation: ["Renombra archivos según un patrón sin colisiones", "Procesa un registro línea a línea y resume errores", "Planifica tareas con dependencias (orden topológico simple)", "Reintenta una operación con espera creciente"],
  tooling: ["Ordena versiones con formato 1.10.2", "Detecta conflictos entre dos listas de cambios", "Resume un historial de commits por autor"],
  generic: ["Dos sumas: encuentra el par que suma el objetivo", "Palíndromo con casos límite", "Paréntesis balanceados", "Frecuencia de palabras", "Invierte una lista enlazada"],
};

export function templateLogic(focusId: string | undefined, index: number): { title: string; statement: string } {
  const list = LOGIC_BY_FOCUS[focusId ?? ""] ?? LOGIC_BY_FOCUS.generic!;
  const title = list[((index % list.length) + list.length) % list.length]!;
  return { title, statement: `${title}. Explica la complejidad y prueba los casos límite.` };
}

// ── Ejercicios del día ──────────────────────────────────────────────────

export interface DayExercise {
  id: string;
  title: string;
  statement?: string;
  /** tema real al que se liga (para «Ver tema») */
  folder: string;
  topicTitle: string;
  practice: PracticeType;
  language?: string;
  source: "ai" | "template" | "vault";
  /** ejercicios que el tema ya tiene en la vault */
  existing?: number;
  /** marcado como automático (plantilla) */
  auto: boolean;
}

export interface ExistingExercises {
  /** carpeta del tema → nº de ejercicios en la vault */
  count(folder: string): number;
}

/**
 * Ejercicios concretos de un bloque de práctica de un día: los temas del bloque, uno o dos ejercicios por tema. Prioridad: ejercicios que
 * el tema YA tiene en la vault (se enlazan), luego el currículo de la IA (de la semana del día) y, si no hay, la plantilla por tipo de tema.
 */
export function dayExercisesOf(
  plan: Pick<SchedulePlan, "practiceCurriculum">,
  day: Pick<ScheduleDay, "week">,
  block: { practice?: PracticeType; language?: string; items: ReadonlyArray<{ folder: string; title: string; language?: string }> },
  existing?: ExistingExercises,
): DayExercise[] {
  const cw = plan.practiceCurriculum?.weeks.find((w) => w.week === day.week);
  const out: DayExercise[] = [];
  const seenFolders = new Set<string>();
  for (const it of block.items) {
    if (seenFolders.has(it.folder)) continue;
    seenFolders.add(it.folder);
    const practice = block.practice ?? "area";
    const lang = it.language ?? block.language;
    const vaultN = existing?.count(it.folder) ?? 0;
    const mine = (cw?.exercises ?? []).filter((e) => e.topic === it.folder && (e.practice === practice || !PRACTICE_TYPES.includes(e.practice) || e.practice === "area" || practice === "area"));
    const fromVault = mine.find((e) => e.source === "vault");
    if (vaultN > 0 || fromVault) {
      const n = vaultN || fromVault?.existing || 0;
      out.push({ id: `${it.folder}#vault`, title: `Haz los ejercicios del tema «${shortOf(it.title)}»${n ? ` (${n} en tu vault)` : ""}`, folder: it.folder, topicTitle: it.title, practice, ...(lang ? { language: lang } : {}), source: "vault", ...(n ? { existing: n } : {}), auto: false });
    }
    const proposed = mine.filter((e) => e.source !== "vault");
    if (proposed.length) {
      for (const e of proposed.slice(0, 2)) out.push({ id: `${it.folder}#${e.title}`, title: e.title, ...(e.statement ? { statement: e.statement } : {}), folder: it.folder, topicTitle: it.title, practice: e.practice, ...((e.language ?? lang) ? { language: e.language ?? lang! } : {}), source: e.source, auto: e.source === "template" });
    } else if (!vaultN && !fromVault) {
      const t = templateExercise(practice, it.title, lang);
      out.push({ id: `${it.folder}#auto`, title: t.title, statement: t.statement, folder: it.folder, topicTitle: it.title, practice, ...(lang ? { language: lang } : {}), source: "template", auto: true });
    }
  }
  return out;
}

export interface DayLogic {
  title: string;
  statement?: string;
  source: "ai" | "template";
  auto: boolean;
}

/** Reto de lógica (interview prep) del día: el del currículo de la semana (rotando por día de estudio) o uno de plantilla por enfoque. */
export function dayLogicOf(plan: Pick<SchedulePlan, "practiceCurriculum">, sch: PlanSchedule, day: ScheduleDay): DayLogic | null {
  if (!day.study || !day.practice.kata) return null;
  const idx = sch.days.filter((d) => d.week === day.week && d.study && d.date <= day.date).length - 1;
  const cw = plan.practiceCurriculum?.weeks.find((w) => w.week === day.week);
  if (cw?.logic.length) {
    const l = cw.logic[((idx % cw.logic.length) + cw.logic.length) % cw.logic.length]!;
    return { title: l.title, ...(l.statement ? { statement: l.statement } : {}), source: l.source, auto: l.source === "template" };
  }
  const t = templateLogic(day.focus?.id, idx);
  return { ...t, source: "template", auto: true };
}

// ── Proyectos diario / semanal / mensual ────────────────────────────────

export interface DayProject {
  id: string;
  date: string;
  title: string;
  description: string;
  minutes: number;
  /** temas del día a los que se conecta */
  topics: Array<{ folder: string; title: string; role: "theory" | "practice" }>;
  /** qué parte del semanal avanza hoy */
  weeklyPart: string;
  weeklyId: string;
  source: "ai" | "template";
  /** áreas que integra (una en modo «por fases»; varias en modo «juntas») */
  areaIds: string[];
  /** nombre corto de la pieza del día (alimenta el proyecto semanal) */
  piece: string;
}

export const dailyId = (date: string): string => `dp:${date}`;
export const weeklyIdOf = (plan: Pick<SchedulePlan, "programmingPractice">, week: number): string => (plan.programmingPractice?.weeklyProject?.weeks.some((w) => w.week === week && w.sessions.length) ? `wp:${week}` : `ww:${week}`);

const joinTitles = (xs: readonly string[]): string => {
  const u = [...new Set(xs.map(shortOf))];
  return u.length <= 1 ? (u[0] ?? "") : `${u.slice(0, -1).join(", ")} y ${u[u.length - 1]}`;
};

/** Mini-proyecto del día: aplica la teoría y la práctica de ESE día (el del currículo si la IA lo propuso para un tema del día). */
export function dailyProjectOf(plan: Pick<SchedulePlan, "practiceCurriculum" | "programmingPractice">, sch: PlanSchedule, day: ScheduleDay): DayProject | null {
  if (!day.study || !day.focus || !day.blocks?.length) return null;
  const topics: DayProject["topics"] = [];
  for (const b of day.blocks) for (const it of b.items) if (!topics.some((t) => t.folder === it.folder)) topics.push({ folder: it.folder, title: it.title, role: b.kind });
  if (!topics.length) {
    // día de repaso (los temas del enfoque ya están hechos): el proyecto diario recompone lo ya estudiado, conectado con los temas del repaso
    const recent = [...new Set(day.blocks.flatMap((b) => (b.note?.match(/Repasa: (.+).$/)?.[1] ?? "").split(" · ").filter(Boolean)))];
    const weekDays = sch.days.filter((d) => d.week === day.week && d.projectMinutes && d.focus);
    return {
      id: dailyId(day.date),
      date: day.date,
      title: `Proyecto de repaso de ${day.focus.label}`,
      description: recent.length ? `Combina en una pieza pequeña lo ya estudiado: ${recent.join(", ")}.` : `Recompón una pieza pequeña de ${day.focus.label.toLowerCase()} con lo ya estudiado.`,
      minutes: dailyMinutes(day),
      topics: [],
      weeklyPart: `Pieza ${weekDays.findIndex((d) => d.date === day.date) + 1} de ${weekDays.length} del proyecto semanal`,
      weeklyId: weeklyIdOf(plan, day.week),
      source: "template",
      areaIds: day.focus.areaIds ?? [],
      piece: `repaso de ${day.focus.label}`,
    };
  }
  const theory = topics.filter((t) => t.role === "theory");
  const practice = topics.filter((t) => t.role === "practice");
  const cw = plan.practiceCurriculum?.weeks.find((w) => w.week === day.week);
  const ai = cw?.dailyProjects.find((d) => topics.some((t) => t.folder === d.topic));
  const lang = day.blocks.find((b) => b.practice === "language" || b.practice === "scripting")?.language;
  const label = day.focus.label;
  const t0 = theory[0] ?? topics[0]!;
  let title: string;
  let description: string;
  let piece: string;
  // la pieza de práctica propia del área (ver `planAreaPractice.ts`): n = nº de día de ese enfoque en el plan
  const nth = sch.days.filter((d) => d.study && d.focus && d.focus.id === day.focus!.id && d.date <= day.date).length - 1;
  const titles = [t0.title, ...topics.filter((x) => x !== t0).map((x) => x.title)];
  const db = day.blocks.find((b) => b.id === "db-theory")?.items[0];
  const areaIds = day.focus.areaIds ?? [];
  if (ai) {
    title = ai.title;
    description = ai.description ?? `Aplica ${joinTitles(topics.map((t) => t.title))}.`;
    piece = ai.title;
  } else if (day.focus.together && areaIds.length > 1) {
    // modo «juntas»: una feature pequeña de punta a punta (pantalla + endpoint + tabla)
    const p = integratedDaily(areaIds, titles, nth);
    ({ title, description, piece } = p);
  } else {
    const p = dailyPieceOf(day.focus.id, nth, titles, { ...(lang ? { lang } : {}), ...(db ? { db: db.title } : {}) });
    if (p) {
      ({ title, description, piece } = p);
    } else {
      title = `Mini-proyecto de «${shortOf(t0.title)}»`;
      description = `Un ejercicio práctico de ${label.toLowerCase()} que aplica ${joinTitles(topics.map((t) => t.title))}.`;
      piece = shortOf(t0.title);
    }
  }
  const weekDays = sch.days.filter((d) => d.week === day.week && d.projectMinutes && d.focus);
  const n = weekDays.findIndex((d) => d.date === day.date) + 1;
  return {
    id: dailyId(day.date),
    date: day.date,
    title,
    description: description.slice(0, MAX_PROJECT_DESC),
    minutes: dailyMinutes(day),
    topics,
    weeklyPart: `Pieza ${n} de ${weekDays.length} del proyecto semanal`,
    weeklyId: weeklyIdOf(plan, day.week),
    source: ai ? ai.source : "template",
    areaIds,
    piece,
  };
  void practice;
}

/** Minutos del proyecto diario: los del proyecto del día menos lo que se lleva el proyecto de un tema que se completa ese día. */
export const dailyMinutes = (day: Pick<ScheduleDay, "projectMinutes" | "topicProjects">): number => Math.max(0, (day.projectMinutes ?? 0) - (day.topicProjects ?? []).reduce((n, p) => n + p.minutes, 0));

export interface WeeklyProject {
  id: string;
  week: number;
  title: string;
  description: string;
  source: "ai" | "template" | "practice";
  /** mini-proyectos diarios que acumula */
  dailyIds: string[];
  dailyTitles: string[];
  /** áreas que integra; con más de una el proyecto es integrador (`areaId: "all"` en el entregable) */
  areaIds: string[];
}

export const weeklyProjectOf = (plan: Pick<SchedulePlan, "practiceCurriculum" | "programmingPractice" | "start" | "end">, sch: PlanSchedule, week: number): WeeklyProject | null => {
  const days = sch.days.filter((d) => d.week === week);
  if (!days.length) return null;
  const dailies = days.map((d) => dailyProjectOf(plan, sch, d)).filter((x): x is DayProject => !!x);
  const pw = plan.programmingPractice?.weeklyProject?.weeks.find((w) => w.week === week);
  const cw = plan.practiceCurriculum?.weeks.find((w) => w.week === week);
  const focusLabels = [...new Set(days.map((d) => d.focus?.label).filter((x): x is string => !!x))];
  const id = weeklyIdOf(plan, week);
  if (!dailies.length && !cw?.weeklyProject && !pw?.sessions.length) return null;
  const areaIds = [...new Set(days.flatMap((d) => d.focus?.areaIds ?? []))];
  const together = days.some((d) => d.focus?.together);
  // el sistema de práctica del área (Frontend = página completa que une los componentes de la semana; Backend = API completa…); con varias
  // áreas juntas, una vertical completa; con enfoques distintos en la semana, el proyecto genérico
  const focusIds = [...new Set(days.map((d) => d.focus?.id).filter((x): x is string => !!x))];
  const pieces = dailies.map((d) => d.piece);
  const sys = together && areaIds.length > 1 ? integratedWeekly(areaIds, week, pieces) : focusIds.length === 1 ? weeklyPieceOf(focusIds[0]!, week, pieces) : null;
  const title = cw?.weeklyProject?.title ?? pw?.theme ?? sys?.title ?? `Proyecto semanal ${week}${focusLabels.length ? ` · ${focusLabels.join(" + ")}` : ""}`;
  const description = cw?.weeklyProject?.description ?? sys?.description ?? `Integra lo que construiste cada día de la semana ${week}${focusLabels.length ? ` (${focusLabels.join(" y ")})` : ""} en un solo proyecto.`;
  return { id, week, title, description, source: cw?.weeklyProject ? (cw.source === "ai" ? "ai" : "template") : pw?.sessions.length ? "practice" : "template", dailyIds: dailies.map((d) => d.id), dailyTitles: dailies.map((d) => d.title), areaIds };
};

export interface MonthlyBlock {
  id: string;
  title: string;
  description: string;
  fromWeek: number;
  toWeek: number;
  /** AAAA-MM (mes de calendario) cuando el bloque es el mes; ausente en bloques de la pista */
  month?: string;
  source: "ai" | "template" | "practice";
  weeklyIds: string[];
  /** áreas que integra */
  areaIds: string[];
}

/** Bloques del proyecto mensual: los de la pista Programming practice (`mp:<semana>`) o, sin pista mensual, un proyecto por mes de calendario. */
export function monthlyBlocksOf(plan: Pick<SchedulePlan, "practiceCurriculum" | "programmingPractice" | "start" | "end">, sch: PlanSchedule): MonthlyBlock[] {
  const ranges = weekRangesOf(plan.start, plan.end);
  const cur = plan.practiceCurriculum?.monthly ?? [];
  const weeklyIdsBetween = (a: number, b: number): string[] => {
    const out: string[] = [];
    for (let w = a; w <= b; w++) if (sch.days.some((d) => d.week === w)) out.push(weeklyIdOf(plan, w));
    return out;
  };
  const areasBetween = (a: number, b: number): string[] => [...new Set(sch.days.filter((d) => d.week >= a && d.week <= b).flatMap((d) => d.focus?.areaIds ?? []))];
  const blocks = plan.programmingPractice?.monthlyProject?.blocks ?? [];
  if (blocks.length) {
    return blocks.map((b) => {
      const month = ranges[b.fromWeek - 1]?.start.slice(0, 7);
      const c = cur.find((x) => x.month === month);
      return {
        id: `mp:${b.fromWeek}`,
        title: c?.title ?? (b.theme ? `Proyecto mensual: ${b.theme}` : `Proyecto mensual · semanas ${b.fromWeek}–${b.toWeek}`),
        description: c?.description ?? "Un proyecto mayor que integra los proyectos semanales del bloque.",
        fromWeek: b.fromWeek,
        toWeek: b.toWeek,
        source: c ? (c.source === "ai" ? "ai" : "template") : "practice",
        weeklyIds: weeklyIdsBetween(b.fromWeek, b.toWeek),
        areaIds: areasBetween(b.fromWeek, b.toWeek),
      } satisfies MonthlyBlock;
    });
  }
  const out: MonthlyBlock[] = [];
  let y = Number(plan.start.slice(0, 4));
  let m = Number(plan.start.slice(5, 7));
  for (let i = 0; i < 40; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const wk = ranges.filter((r) => r.end.slice(0, 7) >= key && r.start.slice(0, 7) <= key).map((r) => r.week);
    if (wk.length) {
      const c = cur.find((x) => x.month === key);
      const focuses = [...new Set(sch.days.filter((d) => d.date.startsWith(key) && d.focus).map((d) => d.focus!.label))];
      const monthAreas = [...new Set(sch.days.filter((d) => d.date.startsWith(key)).flatMap((d) => d.focus?.areaIds ?? []))];
      const focusIds = [...new Set(sch.days.filter((d) => d.date.startsWith(key) && d.focus).map((d) => d.focus!.id))];
      const together = sch.days.some((d) => d.date.startsWith(key) && d.focus?.together);
      const sys = together && monthAreas.length > 1 ? integratedMonthly(monthAreas, key) : focusIds.length === 1 ? monthlyPieceOf(focusIds[0]!, key) : null;
      out.push({
        id: `mm:${key}`,
        title: c?.title ?? (sys ? `Proyecto mensual · ${sys.title.replace(/ · \d{4}-\d{2}$/, "")}` : `Proyecto mensual · ${focuses.length ? focuses.slice(0, 2).join(" + ") : key}`),
        description: c?.description ?? sys?.description ?? "Un proyecto mayor que integra los proyectos semanales del mes.",
        fromWeek: wk[0]!,
        toWeek: wk[wk.length - 1]!,
        month: key,
        source: c ? (c.source === "ai" ? "ai" : "template") : "template",
        weeklyIds: weeklyIdsBetween(wk[0]!, wk[wk.length - 1]!),
        areaIds: monthAreas,
      });
    }
    if (key >= plan.end.slice(0, 7)) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ── Temas de práctica de una semana (entrada de la IA y de las plantillas guardadas) ──

export interface WeekPracticeTopic {
  folder: string;
  title: string;
  practice: PracticeType;
  language?: string;
  /** fecha del primer día de la semana en que se practica (solo informativa: la app decide el reparto) */
  firstDate: string;
  /** ejercicios que el tema ya tiene en la vault */
  existing: number;
}

/** Los temas que se PRACTICAN en una semana del plan (bloques de práctica de la agenda por enfoque), sin repetir tema + tipo. */
export function weekPracticeTopics(sch: PlanSchedule, week: number, existing?: ExistingExercises): WeekPracticeTopic[] {
  const out: WeekPracticeTopic[] = [];
  const seen = new Set<string>();
  for (const d of sch.days.filter((x) => x.week === week)) {
    for (const b of d.blocks ?? []) {
      if (b.kind === "practice" && b.status === "free" && b.daily) {
        // práctica diaria de lenguaje: la IA propone ejercicios del lenguaje del día ligados a los temas del día
        for (const t of b.connectedTopics ?? []) {
          const k = `${t.folder}|language|${b.languageId ?? ""}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ folder: t.folder, title: t.title, practice: "language", ...(b.language ? { language: b.language } : {}), firstDate: d.date, existing: existing?.count(t.folder) ?? 0 });
        }
        continue;
      }
      if (b.kind !== "practice" || b.status !== "topic") continue;
      for (const it of b.items) {
        const k = `${it.folder}|${b.practice ?? "area"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const lang = it.language ?? b.language;
        out.push({ folder: it.folder, title: it.title, practice: b.practice ?? "area", ...(lang ? { language: lang } : {}), firstDate: d.date, existing: existing?.count(it.folder) ?? 0 });
      }
    }
  }
  return out;
}

/** Semana de currículo por PLANTILLAS: ejercicios del tipo del bloque (o los de la vault si el tema ya los tiene) y retos de lógica por enfoque. */
export function templateCurriculumWeek(sch: PlanSchedule, week: number, existing?: ExistingExercises): CurriculumWeek {
  const exercises: CurriculumExercise[] = [];
  for (const t of weekPracticeTopics(sch, week, existing)) {
    if (t.existing > 0) {
      exercises.push({ topic: t.folder, practice: t.practice, ...(t.language ? { language: t.language } : {}), title: `Haz los ejercicios del tema «${shortOf(t.title)}»`, source: "vault", existing: t.existing });
      continue;
    }
    const x = templateExercise(t.practice, t.title, t.language);
    exercises.push({ topic: t.folder, practice: t.practice, ...(t.language ? { language: t.language } : {}), title: x.title, statement: x.statement, source: "template" });
  }
  const focusId = sch.days.find((d) => d.week === week && d.focus)?.focus?.id;
  const logic: CurriculumLogic[] = [0, 1, 2, 3, 4].map((i) => ({ ...templateLogic(focusId, i), source: "template" as const }));
  return { week, source: "template", exercises, logic, dailyProjects: [] };
}

/** Lista corta para los textos: los días con proyecto diario de una semana. */
export const dayProjectsOf = (plan: Pick<SchedulePlan, "practiceCurriculum" | "programmingPractice">, sch: PlanSchedule, week: number): DayProject[] =>
  sch.days.filter((d) => d.week === week).map((d) => dailyProjectOf(plan, sch, d)).filter((x): x is DayProject => !!x);

// ── Práctica diaria de lenguaje (bloque propio «Práctica de <lenguaje>») ──

/** Ejercicios de plantilla del bloque diario de lenguaje: sintaxis, lógica y resolución, ligados a un tema del día. */
export function languageTemplateExercises(language: string, topicTitle: string): Array<{ title: string; statement: string }> {
  const t = shortOf(topicTitle);
  const id = languageIdOf(language);
  const flavour = id === "python" ? "con listas, diccionarios y f-strings" : id === "typescript" ? "con tipos explícitos e interfaces" : id === "javascript" ? "con arrays, objetos y funciones flecha" : "con las estructuras del lenguaje";
  return [
    { title: `Sintaxis: «${t}» en ${language}`, statement: `Escribe tres líneas de ejemplo de «${t}» en ${language} ${flavour} y explica qué hace cada una.` },
    { title: `Lógica: resuelve un problema corto de «${t}» en ${language}`, statement: `Un problema pequeño (filtrar, contar o transformar datos) relacionado con «${t}», resuelto en ${language} ${flavour}.` },
    { title: `Resolución: ejercicio de «${t}» con casos de prueba (${language})`, statement: `Plantea el problema, escribe la solución en ${language} y añade al menos tres casos de prueba, incluido un caso límite.` },
  ];
}

/**
 * Ejercicios del bloque diario de práctica de lenguaje: del currículo de la IA (de la semana del día) si propuso ejercicios de ese
 * lenguaje para un tema del día; si no, plantillas de sintaxis, lógica y resolución ligadas a los temas del día.
 */
export function languageBlockExercises(plan: Pick<SchedulePlan, "practiceCurriculum">, day: Pick<ScheduleDay, "week">, block: { language?: string; connectedTopics?: ReadonlyArray<{ folder: string; title: string }> }): DayExercise[] {
  const language = block.language ?? languageName("python");
  const topics = block.connectedTopics ?? [];
  const cw = plan.practiceCurriculum?.weeks.find((w) => w.week === day.week);
  const out: DayExercise[] = [];
  for (const t of topics.slice(0, 2)) {
    const mine = (cw?.exercises ?? []).filter((e) => e.topic === t.folder && e.practice === "language" && languageIdOf(e.language) === languageIdOf(language));
    if (mine.length) {
      for (const e of mine.slice(0, 2)) out.push({ id: `${t.folder}#lang#${e.title}`, title: e.title, ...(e.statement ? { statement: e.statement } : {}), folder: t.folder, topicTitle: t.title, practice: "language", language, source: e.source, auto: e.source === "template" });
    } else {
      languageTemplateExercises(language, t.title).forEach((x, i) => out.push({ id: `${t.folder}#lang${i}`, title: x.title, statement: x.statement, folder: t.folder, topicTitle: t.title, practice: "language", language, source: "template", auto: true }));
    }
  }
  if (!out.length) {
    languageTemplateExercises(language, "lo que estudias hoy").forEach((x, i) => out.push({ id: `free#lang${i}`, title: x.title, statement: x.statement, folder: "", topicTitle: "", practice: "language", language, source: "template", auto: true }));
  }
  return out;
}
