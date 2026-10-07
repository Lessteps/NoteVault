/**
 * Estado de la pista «Programming practice» de un plan: qué se hizo del kata diario y de las cuatro fases de cada
 * proyecto semanal.
 *
 * Se DERIVA, sin guardar nada, de lo que el módulo `programming_practice` ya escribe:
 *  - kata: los intentos con la skill `pp_kata` (un intento ese día = kata del día hecho);
 *  - proyecto: `projects/_specs/<x>.spec.json` (fecha de la especificación → fase «Especificación») y
 *    `projects/<x>/.pp.json` (fecha de creación + `state`: building / defended / done + nota de la defensa);
 *    cada proyecto se atribuye a la semana del plan en que se creó su especificación o su carpeta.
 * Lo que no se puede derivar con fiabilidad (p. ej. un kata hecho fuera de la app, o un proyecto de otra semana) se
 * registra a mano con los bloques de «Hoy» del Mentor (hecho / saltado): `practice:<plan>:kata`,
 * `practice:<plan>:project:w<N>:<fases>`. El estado final de una fase es el MEJOR de ambas fuentes.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { eachDay, isoDow, weekRangesOf } from "../../lib/planTime.js";
import { kataBlockId, parseProjectBlockId, PRACTICE_PHASES, type PhaseStatus, type PracticePhase, type PracticeTrack } from "../../lib/practiceTrack.js";
import * as store from "../store.js";
import type { PlanBlock, SessionRecord } from "./sessionLog.js";

const PP_FOLDER = "programming_practice";
const KATA_SKILL = "pp_kata";

export interface PpProjectRef {
  folder: string;
  title: string;
  state: "spec" | "building" | "defended" | "done";
  /** AAAA-MM-DD en que se creó (la carpeta, o la especificación si aún no hay carpeta) */
  date: string;
  /** la defensa oral ya se calificó */
  graded: boolean;
  score?: number;
}

const readText = (p: string): string => {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
};
const two = (n: number): string => String(n).padStart(2, "0");
/** Fecha local AAAA-MM-DD de una fecha ISO o de un instante. */
export function localDateOf(v: string | number | Date): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** La carpeta `programming_practice` del espacio de Programación, o null si la vault no la tiene. */
export function ppAreaDir(root: string): string | null {
  let dirs: fs.Dirent[] = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."));
  } catch {
    return null;
  }
  const space =
    dirs.find((d) => /^subject:\s*["']?programming["']?\s*$/m.test(readText(path.join(root, d.name, `${d.name}.resumen.md`)).slice(0, 800))) ??
    dirs.find((d) => /^programaci[oó]n$/i.test(d.name));
  if (!space) return null;
  const area = path.join(root, space.name, PP_FOLDER);
  return fs.existsSync(area) ? area : null;
}

/** Proyectos del módulo de práctica con su fase y fecha (solo lectura; nunca lanza). */
export function readPpProjects(root: string): PpProjectRef[] {
  const area = ppAreaDir(root);
  if (!area) return [];
  const out: PpProjectRef[] = [];
  const projects = path.join(area, "projects");
  const built = new Set<string>();
  try {
    for (const e of fs.readdirSync(projects, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "_specs" || e.name.startsWith(".")) continue;
      const st = store.loadJson<any>(path.join(projects, e.name, ".pp.json"), null);
      if (!st?.spec) continue;
      built.add(e.name);
      const date = localDateOf(String(st.createdAt ?? "")) || "";
      const state = ["building", "defended", "done"].includes(String(st.state)) ? (st.state as PpProjectRef["state"]) : "building";
      const score = st.defense ? Number(st.defense.grade?.score ?? st.defense.final?.score) : NaN;
      out.push({ folder: e.name, title: String(st.spec.title ?? e.name), state, date, graded: !!st.defense?.grade, ...(Number.isFinite(score) ? { score } : {}) });
    }
    const specs = path.join(projects, "_specs");
    for (const e of fs.readdirSync(specs, { withFileTypes: true })) {
      const m = /^(.*)\.spec\.json$/.exec(e.name);
      if (!m || built.has(m[1]!)) continue;
      const sp = store.loadJson<any>(path.join(specs, e.name), null);
      if (!sp) continue;
      let date = "";
      try {
        date = localDateOf(fs.statSync(path.join(specs, e.name)).mtimeMs);
      } catch {
        /* sin fecha */
      }
      out.push({ folder: m[1]!, title: String(sp.title ?? m[1]), state: "spec", date, graded: false });
    }
  } catch {
    /* aún no hay proyectos */
  }
  return out.filter((p) => p.date);
}

/** Fechas (AAAA-MM-DD) en que hubo algún intento del kata diario (`pp_kata`), de todos los intentos de la vault. */
export function kataDates(attempts: Record<string, Record<string, any>>): Set<string> {
  const out = new Set<string>();
  for (const data of Object.values(attempts)) {
    for (const a of Array.isArray(data?.attempts) ? data.attempts : []) {
      if (String(a?.skill ?? "") !== KATA_SKILL && String(a?.mode ?? "") !== KATA_SKILL) continue;
      const d = String(a?.at ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(d);
    }
  }
  return out;
}

// ── Registro manual (bloques de Hoy) ────────────────────────────────────

export interface ManualPractice {
  /** fecha → estado del bloque del kata de este plan */
  kata: Map<string, "done" | "skipped">;
  /** semana → fase → estado */
  project: Map<number, Map<PracticePhase, "done" | "skipped">>;
}

export function manualPracticeOf(planId: string, sessions: readonly SessionRecord[]): ManualPractice {
  const out: ManualPractice = { kata: new Map(), project: new Map() };
  for (const rec of sessions) {
    for (const b of rec.blocks as PlanBlock[]) {
      const st = b.status === "done" ? "done" : b.status === "skipped" ? "skipped" : null;
      if (!st) continue;
      if (b.candidateId === kataBlockId(planId)) {
        if (out.kata.get(rec.date) !== "done") out.kata.set(rec.date, st);
        continue;
      }
      const p = parseProjectBlockId(b.candidateId);
      if (!p || p.planId !== planId) continue;
      const weekMap = out.project.get(p.week) ?? new Map<PracticePhase, "done" | "skipped">();
      for (const ph of p.phases) if (weekMap.get(ph) !== "done") weekMap.set(ph, st);
      out.project.set(p.week, weekMap);
    }
  }
  return out;
}

// ── Estado derivado ─────────────────────────────────────────────────────

export interface PracticeWeekStatus {
  week: number;
  phases: Record<PracticePhase, PhaseStatus>;
  /** el proyecto del módulo de práctica atribuido a esta semana, si lo hay */
  project?: { folder: string; title: string; state: PpProjectRef["state"]; score?: number };
  current: boolean;
  /** de dónde sale lo mostrado: el módulo de práctica, el registro manual o ambos */
  source: "pp" | "manual" | "mixed" | "none";
}

export interface PracticeStatus {
  /** el módulo `programming_practice` existe en la vault (si no, todo es registro manual) */
  ppReady: boolean;
  kata: { plannedDays: number; doneDays: number; streak: number; todayPlanned: boolean; todayDone: boolean } | null;
  /** fechas (AAAA-MM-DD) de días de kata ya hechos: de ahí sale el estado de «Kata del día» en los entregables */
  kataDoneDates: string[];
  weeks: PracticeWeekStatus[];
}

const RANK: Record<PhaseStatus, number> = { pendiente: 0, saltado: 0, en_curso: 1, hecho: 2 };
const best = (a: PhaseStatus, b: PhaseStatus): PhaseStatus => (RANK[b] > RANK[a] ? b : a);

/** Estado de las fases de un proyecto del módulo de práctica según su `state`. */
export function phasesOfProject(p: Pick<PpProjectRef, "state" | "graded">): Record<PracticePhase, PhaseStatus> {
  const none: Record<PracticePhase, PhaseStatus> = { build: "hecho", construct: "pendiente", defend: "pendiente", postmortem: "pendiente" };
  if (p.state === "spec") return none;
  if (p.state === "building") return { ...none, construct: "en_curso" };
  if (p.state === "defended") return { ...none, construct: "hecho", defend: p.graded ? "hecho" : "en_curso" };
  return { build: "hecho", construct: "hecho", defend: "hecho", postmortem: "hecho" };
}

export interface PracticeStatusInput {
  plan: { id: string; start: string; end: string; programmingPractice?: PracticeTrack; preconditions?: { blockedDates?: string[] } };
  today: string;
  projects: readonly PpProjectRef[];
  kataDates: ReadonlySet<string>;
  manual: ManualPractice;
  ppReady: boolean;
}

export function derivePracticeStatus(inp: PracticeStatusInput): PracticeStatus | null {
  const track = inp.plan.programmingPractice;
  if (!track) return null;
  const { plan, today } = inp;
  const ranges = weekRangesOf(plan.start, plan.end);

  let kata: PracticeStatus["kata"] = null;
  let kataDoneDates: string[] = [];
  if (track.kata) {
    const blocked = new Set(plan.preconditions?.blockedDates ?? []);
    const days = new Set(track.kata.days);
    const planned = eachDay(plan.start, plan.end < today ? plan.end : today).filter((d) => days.has(isoDow(d)) && !blocked.has(d));
    const isDone = (d: string): boolean => inp.kataDates.has(d) || inp.manual.kata.get(d) === "done";
    const todayPlanned = planned.includes(today);
    let streak = 0;
    const past = todayPlanned && !isDone(today) ? planned.slice(0, -1) : planned;
    for (let i = past.length - 1; i >= 0 && isDone(past[i]!); i--) streak++;
    kata = { plannedDays: planned.length, doneDays: planned.filter(isDone).length, streak, todayPlanned, todayDone: todayPlanned && isDone(today) };
    kataDoneDates = planned.filter(isDone);
  }

  const weeks: PracticeWeekStatus[] = [];
  for (const w of track.weeklyProject?.weeks ?? []) {
    const r = ranges[w.week - 1];
    if (!r) continue;
    const mine = inp.projects.filter((p) => p.date >= r.start && p.date <= r.end).sort((a, b) => RANK[phasesOfProject(b).postmortem] - RANK[phasesOfProject(a).postmortem] || b.date.localeCompare(a.date))[0];
    const derived = mine ? phasesOfProject(mine) : null;
    const man = inp.manual.project.get(w.week);
    const phases = {} as Record<PracticePhase, PhaseStatus>;
    let used = { pp: false, manual: false };
    for (const ph of PRACTICE_PHASES) {
      let st: PhaseStatus = derived ? derived[ph] : "pendiente";
      if (derived && derived[ph] !== "pendiente") used.pp = true;
      const m = man?.get(ph);
      if (m === "done") {
        st = best(st, "hecho");
        used.manual = true;
      } else if (m === "skipped" && st === "pendiente") {
        st = "saltado";
        used.manual = true;
      }
      phases[ph] = st;
    }
    weeks.push({
      week: w.week,
      phases,
      ...(mine ? { project: { folder: mine.folder, title: mine.title, state: mine.state, ...(mine.score !== undefined ? { score: mine.score } : {}) } } : {}),
      current: today >= r.start && today <= r.end,
      source: used.pp && used.manual ? "mixed" : used.pp ? "pp" : used.manual ? "manual" : "none",
    });
  }
  return { ppReady: inp.ppReady, kata, kataDoneDates, weeks };
}

/** Cierra el círculo con «Hoy»: ¿está hecha esa fase de esa semana? (todas las fases de la sesión) */
export function phasesDone(status: PracticeStatus | null, week: number, phases: readonly PracticePhase[]): boolean {
  const w = status?.weeks.find((x) => x.week === week);
  return !!w && phases.every((p) => w.phases[p] === "hecho");
}
