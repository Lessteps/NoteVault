/**
 * Constructor GUIADO del plan del Mentor: el plan se arma por etapas (Alcance · Esqueleto · Temas · Capacidad · Práctica ·
 * Entregables · Revisión) y la app pregunta al estudiante SOLO cuando hay una decisión real.
 *
 * Diseño (todo determinista y puro salvo el almacén):
 *  - El estado se REPRODUCE desde `pre` (precondiciones del formulario) + `answers` (lo que respondió): `computeBuild` recalcula
 *    el borrador, la etapa y la siguiente pregunta desde cero. Así «Volver a una etapa» / «Cambiar respuesta» es descartar las
 *    respuestas de esa etapa en adelante, y aceptar recalcula y revalida con la capacidad real sin fiarse de lo que mande la UI.
 *  - Las preguntas salen de reglas (nivel desconocido → nivel; varias áreas → prioridad; no cabe → recortes calculados; entregables
 *    «a discutir» → uno por subplan; práctica que no cabe → ajuste). Con un tope (`maxQuestions`); pasado el tope, valores por defecto.
 *  - La IA es OPCIONAL y solo ayuda a redactar, a elegir/ordenar temas del subplan y a añadir 1–2 preguntas derivadas de los comentarios.
 *    Todo lo que devuelve se valida aquí (`planBuildAi.ts`); nunca escribe: cada respuesta la aplica código determinista.
 *  - Persistencia en `.notevault/mentor/plans/_building/<id>.json` (aditivo, ver docs/VAULT_FORMAT.md).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  addDays,
  adjustedMinutes,
  areaOfFolder,
  daysBetween,
  isDate,
  LEVELS,
  MAX_MINUTES_PER_DAY,
  MAX_PERIOD_DAYS,
  periodLabel,
  sanitizePreconditions,
  shortWeekLabel,
  type PlanLevel,
  type PlanPreconditions,
} from "../../lib/planTime.js";
import {
  BUILD_STAGES,
  BUILD_ID_RE,
  isBuildStage,
  matchOption,
  TOPIC_BLOCK,
  MAX_BUILD_QUESTIONS,
  stageIndex,
  type BuildAnswer,
  type BuildOption,
  type BuildQuestion,
  type BuildQuestionKind,
  type BuildStage,
} from "../../lib/planBuild.js";
import { capacityWithPractice, type PracticeFocus } from "../../lib/practiceTrack.js";
import * as store from "../store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "../vaultFormat.js";
import type { CatalogTopic } from "./goalDraft.js";
import { defaultPlanName, subplanKey, subplanLabel, type SubplanSeed } from "./plan.js";
import type { PlanDraft } from "./planDraft.js";
import { autoSeeds, composeFromPreconditions, defaultDeliverableFor, markDiagnostics, resolveScope, type GoalScope } from "./planSpec.js";

export * from "../../lib/planBuild.js";

// ── Tipos persistidos ────────────────────────────────────────────────────

export interface AiScopeQuestion {
  text: string;
  why: string;
  options: string[];
}

/** Lo que la IA aportó y ya validó la app (se guarda para no volver a llamarla al recalcular). */
export interface BuildAiState {
  scopeTried: boolean;
  /** todos los bloques de temas ya se pidieron */
  topicsTried: boolean;
  /** bloques de temas ya pedidos (`<clave>#<n>`) y los que la IA respondió bien */
  topicsDone: string[];
  topicsOkBlocks: string[];
  scopeOk: boolean;
  topicsOk: boolean;
  /** como máximo 2 preguntas propias derivadas de los comentarios */
  questions: AiScopeQuestion[];
  /** redacciones mejoradas por id de pregunta */
  rewrites: Record<string, { text: string; why: string }>;
  /** temas elegidos y ordenados por clave de subplan, con su razón */
  order: Record<string, Array<{ folder: string; why: string }>>;
  discarded: string[];
  errors: string[];
}

export const emptyAi = (): BuildAiState => ({ scopeTried: false, topicsTried: false, topicsDone: [], topicsOkBlocks: [], scopeOk: false, topicsOk: false, questions: [], rewrites: {}, order: {}, discarded: [], errors: [] });

export interface SkeletonRow {
  key: string;
  area: string;
  objective: string;
  topics: number;
  minutes: number;
  /** horas de capacidad para temas que le tocan */
  hours: number;
  /** % de la capacidad */
  sharePct: number;
}

export interface BuildStep {
  stage: BuildStage;
  state: "done" | "current" | "pending";
  summary: string;
}

export interface PlanBuild {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** las precondiciones del formulario (inmutables); las decisiones del estudiante se aplican encima */
  pre: PlanPreconditions;
  /** las precondiciones efectivas tras las decisiones (periodo ampliado, tiempo subido, niveles…) */
  effective: PlanPreconditions;
  stage: BuildStage;
  steps: BuildStep[];
  answers: BuildAnswer[];
  /** el borrador parcial: vacío (`null`) hasta la etapa Temas, y completo en la Revisión */
  draft: PlanDraft | null;
  /** reparto de horas por subplan (desde la etapa Esqueleto) */
  skeleton: SkeletonRow[] | null;
  openQuestion?: BuildQuestion;
  /** ai = alguna etapa contó con la IA; rules = todo por reglas */
  source: "ai" | "rules";
  questionCount: number;
  maxQuestions: number;
  status: "building" | "review" | "abandoned";
  /** «Generar ya con lo que hay»: lo que faltaba se decidió con valores por defecto */
  finishing: boolean;
  ai: BuildAiState;
  name: string;
}

export interface BuildSummary {
  id: string;
  name: string;
  period: string;
  stage: BuildStage;
  /** etapa actual (1..7) */
  stageNumber: number;
  stages: number;
  status: PlanBuild["status"];
  question: string | null;
  /** la pregunta abierta (para contestarla desde el chat del Mentor) */
  questionId?: string;
  options?: Array<{ id: string; label: string }>;
  allowText?: boolean;
  updatedAt: string;
  source: PlanBuild["source"];
}

export function summaryOf(b: PlanBuild): BuildSummary {
  return {
    id: b.id,
    name: b.name,
    period: periodLabel(b.effective.start, b.effective.end),
    stage: b.stage,
    stageNumber: stageIndex(b.stage) + 1,
    stages: BUILD_STAGES.length,
    status: b.status,
    question: b.openQuestion?.text ?? null,
    ...(b.openQuestion ? { questionId: b.openQuestion.id, options: b.openQuestion.options.map((o) => ({ id: o.id, label: o.label })), allowText: b.openQuestion.allowText } : {}),
    updatedAt: b.updatedAt,
    source: b.source,
  };
}

// ── Contexto y decisiones ────────────────────────────────────────────────

export interface BuildCtx {
  today: string;
  /** todos los temas del catálogo (sin tope) */
  all: readonly CatalogTopic[];
  goals: readonly GoalScope[];
  startFocus?: PracticeFocus;
  /** hay IA configurada: la app pedirá las ayudas opcionales */
  aiOn: boolean;
}

export interface BuildInput {
  pre: PlanPreconditions;
  answers: readonly BuildAnswer[];
  ai: BuildAiState;
  maxQuestions: number;
}

type WeightMode = "light" | "ok" | "intense";
interface Decisions {
  levels: Record<string, PlanLevel>;
  first?: string;
  boost: Record<string, number>;
  removed: Set<string>;
  weight: WeightMode;
  end?: string;
  minutes?: number;
  kata15: boolean;
  fewer: boolean;
  noProject: boolean;
  deliverables: Record<string, "yes" | "no" | "later">;
  /** respuesta a la pregunta GLOBAL de entregables («deliverable:all»): sí en todas, no, después, o sí salvo en un área */
  allDeliverables?: "yes" | "no" | "later";
  deliverableExcept: string[];
  capacityRounds: number;
  capacityKept: boolean;
  /** «añadir más temas»: devolver los que la IA dejó fuera y/o sumar áreas pendientes */
  restore: boolean;
  extraAreas: string[];
}

const after = (s: string, prefix: string): string => (s.startsWith(prefix) ? s.slice(prefix.length) : "");

export function foldAnswers(answers: readonly BuildAnswer[]): Decisions {
  const d: Decisions = { levels: {}, boost: {}, removed: new Set(), weight: "ok", kata15: false, fewer: false, noProject: false, deliverables: {}, capacityRounds: 0, capacityKept: false, restore: false, extraAreas: [], deliverableExcept: [] };
  for (const a of answers) {
    const c = a.choice;
    switch (a.kind) {
      case "level": {
        const area = after(a.questionId, "level:");
        if (area && (LEVELS as readonly string[]).includes(c)) d.levels[area] = c as PlanLevel;
        break;
      }
      case "priority":
        if (c.startsWith("first:")) {
          d.first = c.slice(6);
          d.boost[d.first] = (d.boost[d.first] ?? 1) * 1.4;
        }
        break;
      case "skeleton":
        if (c.startsWith("more:")) d.boost[c.slice(5)] = (d.boost[c.slice(5)] ?? 1) * 1.5;
        else if (c.startsWith("drop:")) d.removed.add(c.slice(5));
        break;
      case "weight":
        if (c === "light" || c === "intense") d.weight = c;
        break;
      case "capacity":
        d.capacityRounds++;
        if (c.startsWith("drop:")) d.removed.add(c.slice(5));
        else if ((c.startsWith("extend:") || c.startsWith("shorten:")) && isDate(c.slice(c.indexOf(":") + 1))) d.end = c.slice(c.indexOf(":") + 1);
        else if ((c.startsWith("raise:") || c.startsWith("lower:")) && Number(c.slice(c.indexOf(":") + 1)) > 0) d.minutes = Math.round(Number(c.slice(c.indexOf(":") + 1)));
        else if (c === "add:omit") d.restore = true;
        else if (c.startsWith("add:area:") && c.slice(9)) d.extraAreas.push(c.slice(9));
        else if (c === "keep") d.capacityKept = true;
        break;
      case "practice":
        if (c === "kata15") d.kata15 = true;
        else if (c === "fewer") d.fewer = true;
        else if (c === "noproject") d.noProject = true;
        break;
      case "deliverable": {
        const key = after(a.questionId, "deliverable:");
        if (key === "all") {
          if (c === "yes" || c === "no" || c === "later") d.allDeliverables = c;
          else if (c.startsWith("except:") && c.slice(7)) {
            d.allDeliverables = "yes";
            d.deliverableExcept.push(c.slice(7));
          }
        } else if (key && (c === "yes" || c === "no" || c === "later")) d.deliverables[key] = c;
        break;
      }
      default:
        break;
    }
  }
  return d;
}

function effectivePre(pre: PlanPreconditions, d: Decisions): PlanPreconditions {
  const out: PlanPreconditions = { ...pre, levels: { ...pre.levels, ...d.levels } };
  if (d.end && isDate(d.end) && d.end >= addDays(pre.start, 6) && daysBetween(pre.start, d.end) + 1 <= MAX_PERIOD_DAYS) out.end = d.end;
  if (d.minutes && d.minutes >= 15 && d.minutes <= MAX_MINUTES_PER_DAY) out.minutesPerDay = d.minutes;
  if (d.extraAreas.length) out.subjects = [...new Set([...pre.subjects, ...d.extraAreas])];
  if (pre.practice) {
    const p = { ...pre.practice };
    if (d.kata15 && p.kataMinutes > 15) p.kataMinutes = 15;
    if (d.fewer && p.sessionsPerWeek > 1) p.sessionsPerWeek -= 1;
    if (d.noProject) {
      p.sessionsPerWeek = 0;
      p.monthly = false;
    }
    p.monthly = p.monthly && p.sessionsPerWeek > 0;
    if (p.kataMinutes <= 0 && p.sessionsPerWeek <= 0) delete out.practice;
    else out.practice = p;
  }
  return out;
}

// ── Ensamblado del borrador ──────────────────────────────────────────────

const mins = (s: Pick<SubplanSeed, "topics">): number => s.topics.reduce((n, t) => n + t.estMinutes, 0);
const hoursText = (m: number): string => `${String(Math.round((m / 60) * 10) / 10).replace(".", ",")} h`;
const fromOf = (pre: PlanPreconditions, today: string): string => (today > pre.start ? today : pre.start);

interface Assembled {
  /** temas que la IA dejó fuera (de bloques que respondió bien), por clave de subplan */
  omitted: Array<{ key: string; topic: SubplanSeed["topics"][number] }>;
  seeds: SubplanSeed[];
  draft: PlanDraft;
  cap: ReturnType<typeof capacityWithPractice>;
  /** clave de subplan por id del subplan del borrador */
  keyOfId: Record<string, string>;
}

function assemble(effPre: PlanPreconditions, d: Decisions, ai: BuildAiState, ctx: BuildCtx, answersCount: number): Assembled {
  const scope = resolveScope(effPre, ctx.all, ctx.goals);
  // sin diagnósticos todavía: se vuelven a marcar tras reordenar
  let seeds: SubplanSeed[] = autoSeeds(effPre, scope, ctx.goals).map((s) => {
    const { notes: _n, ...rest } = s;
    return { ...rest, topics: s.topics.map(({ diagnostic: _d, ...t }) => t) };
  });
  seeds = seeds.filter((s) => !d.removed.has(subplanKey(s)));
  const why: Record<string, string> = {};
  const omitted: Assembled["omitted"] = [];
  const restored = new Set<string>();
  if (ai.topicsOk) {
    seeds = seeds.map((s) => {
      const key = subplanKey(s);
      const order = ai.order[key];
      if (!order?.length) return s;
      const byFolder = new Map(s.topics.map((t) => [t.folder, t]));
      const picked: SubplanSeed["topics"] = [];
      for (const x of order) {
        const t = byFolder.get(x.folder);
        if (!t || picked.includes(t)) continue;
        picked.push(t);
        if (x.why) why[x.folder] = x.why;
      }
      if (!picked.length) return s;
      // los bloques que la IA no respondió se conservan en su orden natural; los que sí, y no mencionó, quedan fuera
      const rest = s.topics.filter((t, i) => !picked.includes(t) && !ai.topicsOkBlocks.includes(`${key}#${Math.floor(i / TOPIC_BLOCK)}`));
      const out = s.topics.filter((t) => !picked.includes(t) && !rest.includes(t));
      for (const t of out) omitted.push({ key, topic: t });
      if (d.restore) for (const t of out) restored.add(t.folder);
      return { ...s, topics: [...picked, ...rest, ...(d.restore ? out : [])] };
    });
  }
  if (d.first) {
    const i = seeds.findIndex((s) => subplanKey(s) === d.first);
    if (i > 0) seeds = [seeds[i]!, ...seeds.slice(0, i), ...seeds.slice(i + 1)];
  }
  seeds = markDiagnostics(seeds, effPre);
  const wantsDeliverable = (s: SubplanSeed): boolean => d.deliverables[subplanKey(s)] === "yes" || (d.allDeliverables === "yes" && !d.deliverableExcept.includes(subplanKey(s)) && d.deliverables[subplanKey(s)] !== "no");
  seeds = seeds.map((s) => (wantsDeliverable(s) && !s.deliverable ? { ...s, deliverable: defaultDeliverableFor(s) } : s));

  const from = fromOf(effPre, ctx.today);
  const cap = capacityWithPractice(effPre, from, { startFocus: ctx.startFocus });
  if (d.weight === "light") {
    const w0 = seeds.map((s) => mins(s) * (d.boost[subplanKey(s)] ?? 1));
    const tot = w0.reduce((n, x) => n + x, 0);
    seeds = seeds.map((s, i) => {
      const budget = cap.topicMinutes * 0.7 * (tot > 0 ? w0[i]! / tot : 1 / Math.max(1, seeds.length));
      const keep: SubplanSeed["topics"] = [];
      let acc = 0;
      for (const t of s.topics) {
        if (keep.length && acc + t.estMinutes > budget) break;
        keep.push(t);
        acc += t.estMinutes;
      }
      return { ...s, topics: keep };
    });
  }
  // «añadir más temas»: lo añadido solo llena hasta ~90 % de la capacidad (holgura del 10 %)
  if (d.restore || d.extraAreas.length) {
    const isExtra = (s: SubplanSeed): boolean => !s.goalId && d.extraAreas.includes(s.area);
    const cut = (s: SubplanSeed, budget: number, onlyRestored: boolean): SubplanSeed => {
      const keep = [...s.topics];
      let total = keep.reduce((n, t) => n + t.estMinutes, 0);
      while (keep.length > 1 && total > budget) {
        const i = onlyRestored ? keep.map((t) => restored.has(t.folder)).lastIndexOf(true) : keep.length - 1;
        if (i < 0) break;
        total -= keep[i]!.estMinutes;
        keep.splice(i, 1);
      }
      return { ...s, topics: keep };
    };
    const target = cap.topicMinutes * 0.9;
    const base = seeds.filter((s) => !isExtra(s)).reduce((n, s) => n + mins(s), 0);
    const extras = seeds.filter(isExtra);
    seeds = seeds.map((s) => (isExtra(s) ? cut(s, Math.max(0, target - base) / Math.max(1, extras.length), false) : s));
    if (d.restore) {
      let over = seeds.reduce((n, s) => n + mins(s), 0) - target;
      seeds = seeds.map((s) => {
        if (over <= 0 || isExtra(s)) return s;
        const before = mins(s);
        const next = cut(s, Math.max(0, before - over), true);
        over -= before - mins(next);
        return next;
      });
    }
  }
  if (Object.keys(d.boost).length) seeds = seeds.map((s) => ({ ...s, weight: Math.max(1, Math.round(mins(s) * (d.boost[subplanKey(s)] ?? 1))) }));

  const rationale = `Plan armado paso a paso${answersCount ? ` con ${answersCount} ${answersCount === 1 ? "respuesta tuya" : "respuestas tuyas"}` : ""}${ai.topicsOk ? " y el criterio del Mentor para elegir y ordenar los temas" : ", con tus metas y materias en su orden natural"}.`;
  const draft = composeFromPreconditions(seeds, effPre, {
    today: ctx.today,
    auto: !ai.topicsOk,
    rationale,
    discarded: ai.discarded,
    why,
    startFocus: ctx.startFocus,
    ...(d.weight === "intense" ? { compact: true } : {}),
    ...(ai.errors.length && !ai.topicsOk && !ai.scopeOk ? { fallbackReason: ai.errors[0] } : {}),
  });
  const keyOfId: Record<string, string> = {};
  draft.subplans.forEach((sp, i) => {
    keyOfId[sp.id] = subplanKey(seeds[i] ?? sp);
  });
  // lo que el estudiante respondió «no» ya no queda pendiente (por área, o para todas con la pregunta global)
  const noKeys = new Set(Object.entries(d.deliverables).filter(([, v]) => v === "no").map(([k]) => k));
  if (d.allDeliverables === "no") for (const s of seeds) noKeys.add(subplanKey(s));
  for (const k of d.deliverableExcept) noKeys.add(k);
  if (draft.openQuestions?.length) {
    const lacking = draft.subplans.filter((sp) => !sp.deliverable && !noKeys.has(keyOfId[sp.id] ?? ""));
    const kept = draft.openQuestions.filter((q) => (q.subplanId ? !noKeys.has(keyOfId[q.subplanId] ?? "") : lacking.length > 0));
    if (kept.length) draft.openQuestions = kept;
    else delete draft.openQuestions;
  }
  return { seeds, draft, cap, keyOfId, omitted };
}

// ── Preguntas ────────────────────────────────────────────────────────────

export const LEVEL_NAMES: Record<PlanLevel, string> = { empezando: "Empezando", basico: "Básico", intermedio: "Intermedio", avanzado: "Avanzado", no_se: "No sé" };

const opt = (id: string, label: string, hint?: string): BuildOption => ({ id, label, ...(hint ? { hint } : {}) });

function applyRewrite(q: BuildQuestion, ai: BuildAiState): BuildQuestion {
  const r = ai.rewrites[q.id];
  return r && q.kind !== "ai" ? { ...q, text: r.text || q.text, why: r.why || q.why, by: "ai" } : q;
}

const seedLabel = (s: SubplanSeed): string => subplanLabel(s);

/** Los candidatos a pregunta de cada etapa, en orden (la primera sin responder es la que se hace). */
function levelQuestions(seeds: readonly SubplanSeed[], effPre: PlanPreconditions, answeredLevels: number): BuildQuestion[] {
  if (answeredLevels >= 2) return [];
  const byArea = new Map<string, number>();
  for (const s of seeds) for (const t of s.topics) byArea.set(areaOfFolder(t.folder), (byArea.get(areaOfFolder(t.folder)) ?? 0) + t.estMinutes);
  return [...byArea.entries()]
    .filter(([area]) => area && !effPre.levels[area])
    .sort((a, b) => b[1] - a[1])
    .map(([area, m]) => ({
      id: `level:${area}`,
      stage: "alcance" as const,
      kind: "level" as const,
      text: `¿Qué nivel tienes en ${area}?`,
      why: `Ajusta lo que tarda cada tema (~${hoursText(m)} pendientes ahora): a quien empieza le damos más margen; «No sé» añade un diagnóstico corto.`,
      options: LEVELS.map((l) => opt(l, LEVEL_NAMES[l])),
      allowText: false,
      defaultChoice: "skip",
      mentorChoice: "no_se",
      by: "rules" as const,
    }));
}

function priorityQuestion(seeds: readonly SubplanSeed[]): BuildQuestion {
  return {
    id: "priority",
    stage: "alcance",
    kind: "priority",
    text: `Tienes ${seeds.length} frentes (${seeds.slice(0, 4).map((s) => s.area).filter((a, i, l) => l.indexOf(a) === i).join(", ")}). ¿Cuál va primero?`,
    why: "El que vaya primero recibe algo más de tu tiempo y aparece arriba en el plan.",
    options: [...seeds.slice(0, 4).map((s) => opt(`first:${subplanKey(s)}`, `«${seedLabel(s)}» primero`)), opt("equal", "Repartimos a partes iguales")],
    allowText: false,
    defaultChoice: "equal",
    mentorChoice: "equal",
    by: "rules",
  };
}

function skeletonQuestion(rows: readonly SkeletonRow[]): BuildQuestion {
  const lines = rows.map((r) => `${r.area} ${hoursText(r.hours * 60)}`).join(" · ");
  return {
    id: "skeleton",
    stage: "esqueleto",
    kind: "skeleton",
    text: `Así se repartirían tus horas de estudio: ${lines}. ¿Lo ajustamos?`,
    why: "Puedes darle más tiempo a un área o quitar una; el resto se reparte con lo que queda y las áreas se secuencian por fases.",
    options: [
      opt("ok", "Está bien"),
      ...rows.slice(0, 3).map((r) => opt(`more:${r.key}`, `Más tiempo a «${r.area}»`)),
      ...(rows.length > 1 ? rows.slice(0, 3).map((r) => opt(`drop:${r.key}`, `Quitar «${r.area}»`)) : []),
    ],
    allowText: false,
    defaultChoice: "ok",
    mentorChoice: "ok",
    by: "rules",
  };
}

function weightQuestion(util: number): BuildQuestion {
  const pct = Math.round(util * 100);
  return util >= 0.85
    ? {
        id: "weight",
        stage: "temas",
        kind: "weight",
        text: `Estos temas usan el ${pct} % de tu capacidad. ¿Te parece demasiado pesado?`,
        why: "Cerca del límite cualquier imprevisto te atrasa; «Más ligero» deja fuera los últimos temas de cada subplan.",
        options: [opt("light", "Más ligero", "unos 3 de cada 4 temas"), opt("ok", "Está bien")],
        allowText: false,
        defaultChoice: "ok",
        mentorChoice: "ok",
        by: "rules",
      }
    : {
        id: "weight",
        stage: "temas",
        kind: "weight",
        text: `Con estos temas solo usas el ${pct} % de tu capacidad. ¿Lo compactamos para terminar antes?`,
        why: "«Más intenso» llena primero las primeras semanas y deja el final del periodo libre.",
        options: [opt("intense", "Más intenso", "terminar antes"), opt("ok", "Está bien")],
        allowText: false,
        defaultChoice: "ok",
        mentorChoice: "ok",
        by: "rules",
      };
}

function capacityQuestion(round: number, a: Assembled, effPre: PlanPreconditions, today: string): BuildQuestion | null {
  const { draft, cap, seeds } = a;
  const need = draft.totalMinutes;
  const have = cap.topicMinutes;
  const lack = Math.max(0, need - have);
  const options: BuildOption[] = [];
  let mentor = "keep";
  // ampliar el periodo
  const from = fromOf(effPre, today);
  for (let w = 1; w <= 60; w++) {
    const e = addDays(effPre.end, 7 * w);
    if (daysBetween(effPre.start, e) + 1 > MAX_PERIOD_DAYS) break;
    if (capacityWithPractice({ ...effPre, end: e }, from).topicMinutes >= need) {
      options.push(opt(`extend:${e}`, `Ampliar el periodo hasta el ${shortWeekLabel(e, e)}`, "así cabe todo"));
      break;
    }
  }
  // subir el tiempo diario
  for (let m = effPre.minutesPerDay + 15; m <= MAX_MINUTES_PER_DAY; m += 15) {
    if (capacityWithPractice({ ...effPre, minutesPerDay: m }, from).topicMinutes >= need) {
      options.push(opt(`raise:${m}`, `Subir el tiempo diario a ${hoursText(m)}`, "así cabe todo"));
      break;
    }
  }
  // quitar un subplan
  if (seeds.length > 1) {
    const ranked = [...seeds].sort((x, y) => mins(y) - mins(x)).slice(0, 3);
    for (const s of ranked) {
      const left = need - mins(s);
      options.push(opt(`drop:${subplanKey(s)}`, `Quitar «${s.area}»`, left <= have ? `así cabe (sobran ${hoursText(have - left)})` : `libera ${hoursText(mins(s))}`));
    }
  }
  const best = options[0];
  if (best) mentor = best.id;
  options.push(opt("keep", "Dejarlo así", "queda el aviso de que no cabe"));
  return {
    id: `capacity:${round}`,
    stage: "capacidad",
    kind: "capacity",
    text: `No cabe todo: necesitas ${hoursText(need)} y tienes ${hoursText(have)} (faltan ${hoursText(lack)}). ¿Qué recortamos?`,
    why: "Las opciones están calculadas con tu capacidad real; lo que elijas se aplica y se vuelve a repartir.",
    options,
    allowText: false,
    defaultChoice: "keep",
    mentorChoice: mentor,
    by: "rules",
  };
}

/** Holgura (más de ~25 % libre): opciones calculadas para añadir temas, acortar el periodo, bajar el tiempo diario o dejarla. */
function surplusQuestion(round: number, a: Assembled, effPre: PlanPreconditions, ctx: BuildCtx, d: Decisions): BuildQuestion | null {
  const need = a.draft.totalMinutes;
  const have = a.cap.topicMinutes;
  const target = have * 0.9;
  const free = Math.round(((have - need) / Math.max(1, have)) * 100);
  const options: BuildOption[] = [];
  const fill = (list: Array<{ estMinutes: number }>): { n: number; minutes: number } => {
    let n = 0;
    let minutes = 0;
    for (const t of list) {
      if (need + minutes + t.estMinutes > target && n > 0) break;
      n++;
      minutes += t.estMinutes;
    }
    return { n, minutes };
  };
  // 1 · devolver los temas que la IA dejó fuera
  if (!d.restore && a.omitted.length) {
    const f = fill(a.omitted.map((x) => x.topic));
    if (f.n) options.push(opt("add:omit", `Añadir ${f.n === a.omitted.length ? "los" : "los primeros"} ${f.n} temas que dejé fuera (~${hoursText(f.minutes)})`, "se vuelven a repartir"));
  }
  // 2 · sumar áreas pendientes que no están en el plan
  const inPlan = new Set(a.seeds.flatMap((s) => s.topics.map((t) => areaOfFolder(t.folder))));
  const byArea = new Map<string, CatalogTopic[]>();
  for (const t of ctx.all) {
    const area = areaOfFolder(t.folder);
    if (t.completenessPct >= 100 || !area || inPlan.has(area) || effPre.subjects.includes(area) || d.extraAreas.includes(area)) continue;
    byArea.set(area, [...(byArea.get(area) ?? []), t]);
  }
  const areas = [...byArea.entries()].sort((x, y) => y[1].length - x[1].length).slice(0, 3);
  for (const [area, ts] of areas) {
    const f = fill(ts.map((t) => ({ estMinutes: adjustedMinutes(t.estMinutes, area, effPre.levels) })));
    if (f.n) options.push(opt(`add:area:${area}`, `Añadir más temas de ${area} (+${f.n} temas, ~${hoursText(f.minutes)})`, "en su orden natural"));
  }
  const addCount = options.length;
  // 3 · acortar el periodo
  const from = fromOf(effPre, ctx.today);
  let shorter: string | null = null;
  for (let w = 1; w <= 60; w++) {
    const e = addDays(effPre.end, -7 * w);
    if (e < addDays(effPre.start, 6) || e < from) break;
    if (capacityWithPractice({ ...effPre, end: e }, from).topicMinutes >= need * 1.1) shorter = e;
    else break;
  }
  if (shorter) options.push(opt(`shorten:${shorter}`, `Acortar el periodo hasta el ${shortWeekLabel(shorter, shorter)}`, "terminas antes"));
  // 4 · bajar el tiempo diario
  for (let m = 30; m < effPre.minutesPerDay; m += 15) {
    if (capacityWithPractice({ ...effPre, minutesPerDay: m }, from).topicMinutes >= need * 1.1) {
      options.push(opt(`lower:${m}`, `Bajar el tiempo diario a ${hoursText(m)}`, "con holgura"));
      break;
    }
  }
  if (!options.length) return null;
  options.push(opt("keep", "Dejarlo con holgura para repasos y práctica"));
  return {
    id: `capacity:${round}`,
    stage: "capacidad",
    kind: "capacity",
    text: `Te sobra tiempo: los temas usan ${hoursText(need)} de ${hoursText(have)} (queda ${free} % libre). ¿Qué hacemos con la holgura?`,
    why: "Las opciones están calculadas con tu capacidad real; al añadir temas se deja ~10 % de holgura.",
    options,
    allowText: false,
    defaultChoice: "keep",
    mentorChoice: addCount ? options[0]!.id : "keep",
    by: "rules",
  };
}

function practiceQuestion(effPre: PlanPreconditions, overflow: number): BuildQuestion {
  const p = effPre.practice!;
  const options: BuildOption[] = [];
  let mentor = "keep";
  if (p.kataMinutes > 15) options.push(opt("kata15", "Bajar el kata a 15 min"));
  if (p.sessionsPerWeek > 1) options.push(opt("fewer", `Una sesión menos de proyecto por semana (${p.sessionsPerWeek - 1})`));
  if (p.sessionsPerWeek > 0) options.push(opt("noproject", "Quitar el proyecto semanal"));
  if (options[0]) mentor = options[0].id;
  options.push(opt("keep", "Dejarlo así"));
  return {
    id: "practice",
    stage: "practica",
    kind: "practice",
    text: `En ${overflow} ${overflow === 1 ? "día" : "días"} Programming practice sola ya supera tu tiempo diario. ¿La ajustamos?`,
    why: "El kata y las sesiones del proyecto semanal se reservan antes de repartir temas.",
    options,
    allowText: false,
    defaultChoice: "keep",
    mentorChoice: mentor,
    by: "rules",
  };
}

/**
 * UNA sola pregunta global de entregables para todo el plan por áreas (en vez de una por subplan): «Sí, en todas las áreas», «No»,
 * «Después» y, como excepciones, «Sí, salvo en X» para las áreas donde un proyecto propio encaja menos (Tooling, Automation…).
 */
export function deliverableQuestion(seeds: readonly SubplanSeed[]): BuildQuestion {
  const exceptable = seeds.filter((s) => s.areaId === "tooling" || s.areaId === "automation");
  const except = (exceptable.length ? exceptable : seeds.slice(-1)).slice(0, 2).filter(() => seeds.length > 1);
  return {
    id: "deliverable:all",
    stage: "entregables",
    kind: "deliverable",
    text: "¿Quieres un entregable (proyecto de demostración) por cada área del plan?",
    why: "Un entregable es un proyecto pequeño que demuestra lo aprendido en el área; «Después» lo deja pendiente en el plan. Puedes excluir un área.",
    options: [opt("yes", "Sí, en todas las áreas"), ...except.map((s) => opt(`except:${subplanKey(s)}`, `Sí, menos en «${seedLabel(s)}»`)), opt("no", "No quiero entregables"), opt("later", "Decidirlo después")],
    allowText: false,
    defaultChoice: "later",
    mentorChoice: "yes",
    by: "rules",
  };
}

function aiQuestions(ai: BuildAiState): BuildQuestion[] {
  return ai.questions.slice(0, 2).map((q, i) => ({
    id: `ai:${i + 1}`,
    stage: "alcance" as const,
    kind: "ai" as const,
    text: q.text,
    why: q.why,
    options: q.options.map((o, j) => opt(`o${j + 1}`, o)),
    allowText: true,
    defaultChoice: "skip",
    mentorChoice: "skip",
    by: "ai" as const,
  }));
}

// ── Cálculo de la etapa ──────────────────────────────────────────────────

export interface Computation {
  /** hace falta una llamada a la IA antes de seguir (la orquesta la API) */
  needs?: "ai_scope" | "ai_topics";
  stage: BuildStage;
  question?: BuildQuestion;
  effective: PlanPreconditions;
  skeleton: SkeletonRow[] | null;
  draft: PlanDraft | null;
  steps: BuildStep[];
  status: "building" | "review";
  name: string;
  /** datos para la llamada a la IA que la etapa pide (`needs`) */
  info?: { areas: string[]; rules: Array<{ id: string; text: string }>; seeds: SubplanSeed[]; block?: string };
  /** con «Generar ya» y holgura: la respuesta por defecto «añadir más temas» que se aplica sola */
  autoAdd?: { id: string; choice: string };
}

export interface ComputeOpts {
  /** «Generar ya»: ninguna pregunta; todo lo que falta toma su valor por defecto */
  finishing?: boolean;
  /** no pedir llamadas a la IA (aceptar usa solo lo que ya hay) */
  noAi?: boolean;
  /** interno: evita aplicar dos veces la respuesta automática de «Generar ya» */
  noAutoFill?: boolean;
}

function skeletonOf(a: Assembled): SkeletonRow[] {
  const total = a.seeds.reduce((n, s) => n + (s.weight ?? mins(s)), 0);
  return a.seeds.map((s) => {
    const share = total > 0 ? (s.weight ?? mins(s)) / total : 1 / Math.max(1, a.seeds.length);
    return { key: subplanKey(s), area: s.area, objective: s.objective, topics: s.topics.length, minutes: mins(s), hours: Math.round(((a.cap.topicMinutes * share) / 60) * 10) / 10, sharePct: Math.round(share * 100) };
  });
}

/** El siguiente bloque de temas (≤ TOPIC_BLOCK de un subplan) que aún no se ha pedido a la IA. */
export function nextTopicBlock(seeds: readonly SubplanSeed[], ai: BuildAiState): { id: string; seed: SubplanSeed } | null {
  for (const s of seeds) {
    if (s.topics.length < 2) continue;
    const key = subplanKey(s);
    for (let i = 0; i * TOPIC_BLOCK < s.topics.length; i++) {
      const id = `${key}#${i}`;
      if (!ai.topicsDone.includes(id)) return { id, seed: { ...s, topics: s.topics.slice(i * TOPIC_BLOCK, (i + 1) * TOPIC_BLOCK) } };
    }
  }
  return null;
}

export function computeBuild(b: BuildInput, ctx: BuildCtx, opts: ComputeOpts = {}): Computation {
  if (opts.finishing && !opts.noAutoFill) {
    // «Generar ya»: si sobra más del 25 %, por defecto se añaden más temas hasta dejar ~10 % de holgura
    const first = computeBuild(b, ctx, { ...opts, noAutoFill: true });
    if (!first.autoAdd) return first;
    const synth: BuildAnswer = { questionId: first.autoAdd.id, stage: "capacidad", kind: "capacity", question: "Holgura (automática)", choice: first.autoAdd.choice, label: "Añadir más temas", skipped: "mentor", at: "auto" };
    return computeBuild({ ...b, answers: [...b.answers, synth] }, ctx, { ...opts, noAutoFill: true });
  }
  const d = foldAnswers(b.answers);
  const effPre = effectivePre(b.pre, d);
  const asm = assemble(effPre, d, b.ai, ctx, b.answers.length);
  const skeleton = skeletonOf(asm);
  const answered = new Set(b.answers.map((a) => a.questionId));
  const canAsk = !opts.finishing && b.answers.length < b.maxQuestions;
  const fromAi = (q: BuildQuestion): BuildQuestion => applyRewrite(q, b.ai);
  const next = (qs: Array<BuildQuestion | null>): BuildQuestion | undefined => {
    if (!canAsk) return undefined;
    const q = qs.find((x): x is BuildQuestion => !!x && !answered.has(x.id));
    return q ? fromAi(q) : undefined;
  };
  const draft = asm.draft;
  const util = draft.availableMinutes > 0 ? draft.totalMinutes / draft.availableMinutes : 0;

  let stage: BuildStage = "revision";
  let question: BuildQuestion | undefined;
  let needs: Computation["needs"];
  let topicBlock: { id: string; seed: SubplanSeed } | null = null;

  // 1 · Alcance
  const levelAnswers = b.answers.filter((a) => a.kind === "level").length;
  const alcance = [...levelQuestions(asm.seeds, effPre, levelAnswers), asm.seeds.length > 1 ? priorityQuestion(asm.seeds) : null];
  const ruleFirst = next(alcance);
  if (!opts.noAi && !opts.finishing && ctx.aiOn && !b.ai.scopeTried && (b.pre.notes || ruleFirst)) {
    needs = "ai_scope";
    stage = "alcance";
  } else {
    const q = next([...alcance, ...aiQuestions(b.ai)]);
    if (q) {
      stage = "alcance";
      question = q;
    }
  }
  // 2 · Esqueleto
  if (!needs && !question) {
    const q = asm.seeds.length > 1 ? next([skeletonQuestion(skeleton)]) : undefined;
    if (q) {
      stage = "esqueleto";
      question = q;
    }
  }
  // 3 · Temas (la IA elige y ordena aquí)
  if (!needs && !question) {
    const block = !opts.noAi && ctx.aiOn ? nextTopicBlock(asm.seeds, b.ai) : null;
    if (block) {
      needs = "ai_topics";
      stage = "temas";
      topicBlock = block;
    } else {
      const q = draft.fits && draft.totalMinutes > 0 && util >= 0.85 ? next([weightQuestion(util)]) : undefined;
      if (q) {
        stage = "temas";
        question = q;
      }
    }
  }
  // 4 · Capacidad
  const surplus = draft.fits && draft.availableMinutes > 0 && draft.totalMinutes > 0 && util < 0.75;
  let autoAdd: string | undefined;
  if (!needs && !question && !d.capacityKept && d.capacityRounds < 2) {
    if (!draft.fits) {
      const q = next([capacityQuestion(d.capacityRounds + 1, asm, effPre, ctx.today)]);
      if (q) {
        stage = "capacidad";
        question = q;
      }
    } else if (surplus) {
      const sq = surplusQuestion(d.capacityRounds + 1, asm, effPre, ctx, d);
      if (sq && sq.mentorChoice.startsWith("add:")) autoAdd = sq.mentorChoice;
      const q = sq ? next([sq]) : undefined;
      if (q) {
        stage = "capacidad";
        question = q;
      }
    }
  }
  // 5 · Práctica
  if (!needs && !question && effPre.practice && asm.cap.overflowDays > 0) {
    const q = next([practiceQuestion(effPre, asm.cap.overflowDays)]);
    if (q) {
      stage = "practica";
      question = q;
    }
  }
  // 6 · Entregables: ya NO se pregunta (los entregables quedan «por definir» hasta que se ejecuta el plan). Las respuestas de planes
  // antiguos (`deliverable:all`) se siguen leyendo en `Decisions`.

  const idx = stageIndex(stage);
  const summaries = summariesOf(effPre, d, asm, b.answers);
  const steps: BuildStep[] = BUILD_STAGES.map((s, i) => ({ stage: s, state: i < idx ? "done" : i === idx ? "current" : "pending", summary: i <= idx || s === "revision" ? summaries[s] : "" }));
  return {
    ...(needs ? { needs } : {}),
    stage,
    ...(question ? { question } : {}),
    effective: effPre,
    skeleton: idx >= 1 ? skeleton : null,
    draft: idx >= 2 ? draft : null,
    steps,
    status: stage === "revision" && !needs ? "review" : "building",
    name: defaultPlanName(asm.seeds, effPre.start, effPre.end),
    ...(autoAdd && !question ? { autoAdd: { id: `capacity:${d.capacityRounds + 1}`, choice: autoAdd } } : {}),
    ...(needs
      ? {
          info: {
            areas: [...new Set(asm.seeds.map((s) => s.area))],
            rules: [...alcance, asm.seeds.length > 1 ? skeletonQuestion(skeleton) : null, weightQuestion(0.9)].filter((x): x is BuildQuestion => !!x).map((x) => ({ id: x.id, text: x.text })),
            seeds: topicBlock ? [topicBlock.seed] : asm.seeds,
            ...(topicBlock ? { block: topicBlock.id } : {}),
          },
        }
      : {}),
  };
}

function summariesOf(effPre: PlanPreconditions, d: Decisions, a: Assembled, answers: readonly BuildAnswer[]): Record<BuildStage, string> {
  const lv = Object.entries(d.levels).map(([k, v]) => `${k}: ${LEVEL_NAMES[v].toLowerCase()}`);
  const first = d.first ? a.seeds.find((s) => subplanKey(s) === d.first) : undefined;
  const topics = a.seeds.reduce((n, s) => n + s.topics.length, 0);
  const del = a.seeds.filter((s) => s.deliverable).length;
  const p = effPre.practice;
  return {
    alcance: [lv.length ? `Niveles — ${lv.join(", ")}` : "", first ? `«${first.area}» primero` : ""].filter(Boolean).join(" · ") || `${a.seeds.length} ${a.seeds.length === 1 ? "área" : "áreas"}`,
    esqueleto: `${a.seeds.length} ${a.seeds.length === 1 ? "área" : "áreas"}${d.removed.size ? ` (${d.removed.size} quitada${d.removed.size === 1 ? "" : "s"})` : ""}`,
    temas: `${topics} temas${d.weight === "light" ? " · más ligero" : d.weight === "intense" ? " · más intenso" : ""}`,
    capacidad: a.draft.fits ? "Cabe en el periodo" : "No cabe del todo",
    practica: p ? `${p.kataMinutes ? `kata ${p.kataMinutes} min` : "sin kata"} · ${p.sessionsPerWeek ? `${p.sessionsPerWeek} sesiones/semana` : "sin proyecto semanal"}` : "No incluida",
    entregables: effPre.deliverables === "no" && !del ? "Por definir al ejecutar el plan" : `${del} entregable${del === 1 ? "" : "s"}${a.draft.openQuestions?.length ? ` · ${a.draft.openQuestions.length} por decidir` : ""}`,
    revision: `${answers.length} ${answers.length === 1 ? "respuesta" : "respuestas"}`,
  };
}

// ── Respuestas ───────────────────────────────────────────────────────────

export interface AnswerInput {
  /** id de la opción elegida */
  choice?: string;
  /** texto libre (se interpreta como una opción si es claro; las preguntas de IA lo admiten tal cual) */
  text?: string;
  skip?: boolean;
  delegate?: boolean;
}

export class BuildAnswerError extends Error {}

/** Valida una respuesta contra la pregunta abierta y la convierte en un `BuildAnswer` (sin aplicarla: eso lo hace el recálculo). */
export function makeAnswer(q: BuildQuestion, input: AnswerInput, now: string): BuildAnswer {
  const label = (id: string): string => q.options.find((o) => o.id === id)?.label ?? (id === "skip" ? "Sin responder" : id);
  const base = { questionId: q.id, stage: q.stage, kind: q.kind, question: q.text, at: now };
  if (input.skip) return { ...base, choice: q.defaultChoice, label: `${label(q.defaultChoice)} (saltada)`, skipped: "skip" };
  if (input.delegate) return { ...base, choice: q.mentorChoice, label: `${label(q.mentorChoice)} (decide el Mentor)`, skipped: "mentor" };
  if (input.choice !== undefined && input.choice !== "") {
    if (!q.options.some((o) => o.id === input.choice)) throw new BuildAnswerError("Esa opción no existe en la pregunta.");
    return { ...base, choice: input.choice, label: label(input.choice) };
  }
  const text = String(input.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!text) throw new BuildAnswerError("Elige una opción, escribe una respuesta o usa «Saltar».");
  if (q.allowText) return { ...base, choice: "text", label: text, text };
  const hit = matchOption(q, text);
  if (!hit) throw new BuildAnswerError("No lo entendí como una de las opciones. Elige una, o usa «Que decida el Mentor».");
  return { ...base, choice: hit, label: label(hit), text };
}

// ── Almacén ──────────────────────────────────────────────────────────────

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function sanitizeOption(o: any): BuildOption | null {
  const id = oneLine(o?.id, 200);
  const label = oneLine(o?.label, 200);
  return id && label ? { id, label, ...(oneLine(o?.hint, 160) ? { hint: oneLine(o.hint, 160) } : {}) } : null;
}

export function sanitizeQuestion(raw: any): BuildQuestion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const id = oneLine(raw.id, 240);
  const options = (Array.isArray(raw.options) ? raw.options : []).map(sanitizeOption).filter((o: BuildOption | null): o is BuildOption => !!o).slice(0, 12);
  if (!id || !isBuildStage(raw.stage)) return undefined;
  const kinds: readonly string[] = ["level", "priority", "skeleton", "weight", "capacity", "practice", "deliverable", "ai"];
  if (!kinds.includes(String(raw.kind))) return undefined;
  return {
    id,
    stage: raw.stage,
    kind: raw.kind as BuildQuestionKind,
    text: oneLine(raw.text, 600),
    why: oneLine(raw.why, 400),
    options,
    allowText: raw.allowText === true,
    defaultChoice: oneLine(raw.defaultChoice, 240),
    mentorChoice: oneLine(raw.mentorChoice, 240),
    by: raw.by === "ai" ? "ai" : "rules",
  };
}

function sanitizeAnswer(raw: any): BuildAnswer | null {
  const questionId = oneLine(raw?.questionId, 240);
  if (!questionId || !isBuildStage(raw?.stage)) return null;
  return {
    questionId,
    stage: raw.stage,
    kind: (["level", "priority", "skeleton", "weight", "capacity", "practice", "deliverable", "ai"].includes(String(raw.kind)) ? raw.kind : "ai") as BuildQuestionKind,
    question: oneLine(raw.question, 600),
    choice: oneLine(raw.choice, 240),
    label: oneLine(raw.label, 300),
    ...(oneLine(raw.text, 300) ? { text: oneLine(raw.text, 300) } : {}),
    ...(raw.skipped === "skip" || raw.skipped === "mentor" ? { skipped: raw.skipped as "skip" | "mentor" } : {}),
    at: oneLine(raw.at, 40) || new Date().toISOString(),
  };
}

function sanitizeAi(raw: any): BuildAiState {
  const ai = emptyAi();
  if (!raw || typeof raw !== "object") return ai;
  ai.scopeTried = raw.scopeTried === true;
  ai.topicsTried = raw.topicsTried === true;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => oneLine(x, 260)).filter(Boolean).slice(0, 200) : []);
  ai.topicsDone = strs(raw.topicsDone);
  ai.topicsOkBlocks = strs(raw.topicsOkBlocks);
  ai.scopeOk = raw.scopeOk === true;
  ai.topicsOk = raw.topicsOk === true;
  ai.questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q: any) => ({ text: oneLine(q?.text, 240), why: oneLine(q?.why, 200), options: (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => oneLine(o, 60)).filter(Boolean).slice(0, 5) }))
    .filter((q: AiScopeQuestion) => q.text && q.options.length >= 2)
    .slice(0, 2);
  for (const [k, v] of Object.entries(raw.rewrites && typeof raw.rewrites === "object" ? raw.rewrites : {})) {
    const text = oneLine((v as any)?.text, 240);
    const why = oneLine((v as any)?.why, 200);
    if (k && (text || why)) ai.rewrites[k.slice(0, 240)] = { text, why };
  }
  for (const [k, v] of Object.entries(raw.order && typeof raw.order === "object" ? raw.order : {})) {
    if (!Array.isArray(v)) continue;
    ai.order[k] = v.map((x: any) => ({ folder: String(x?.folder ?? "").replace(/\\/g, "/"), why: oneLine(x?.why, 200) })).filter((x: { folder: string }) => x.folder).slice(0, 400);
  }
  ai.discarded = (Array.isArray(raw.discarded) ? raw.discarded : []).map((x: unknown) => oneLine(x, 200)).filter(Boolean).slice(0, 30);
  ai.errors = (Array.isArray(raw.errors) ? raw.errors : []).map((x: unknown) => oneLine(x, 300)).filter(Boolean).slice(0, 5);
  return ai;
}

/** Normaliza lo leído de disco (nunca lanza); null si no sirve. */
export function sanitizeBuild(raw: any, fileId: string, today: string): PlanBuild | null {
  if (!raw || typeof raw !== "object" || !raw.pre || typeof raw.pre !== "object") return null;
  const id = BUILD_ID_RE.test(fileId) ? fileId : null;
  if (!id) return null;
  const pre = sanitizePreconditions(raw.pre, today);
  const eff = sanitizePreconditions(raw.effective ?? raw.pre, today);
  const stage: BuildStage = isBuildStage(raw.stage) ? raw.stage : "alcance";
  const status = raw.status === "review" || raw.status === "abandoned" ? raw.status : "building";
  const oq = sanitizeQuestion(raw.openQuestion);
  const answers = (Array.isArray(raw.answers) ? raw.answers : []).map(sanitizeAnswer).filter((a: BuildAnswer | null): a is BuildAnswer => !!a).slice(0, 40);
  const draft = raw.draft && typeof raw.draft === "object" && Array.isArray(raw.draft.subplans) ? (raw.draft as PlanDraft) : null;
  const skeleton: SkeletonRow[] | null = Array.isArray(raw.skeleton)
    ? raw.skeleton.map((r: any) => ({ key: oneLine(r?.key, 240), area: oneLine(r?.area, 80), objective: oneLine(r?.objective, 200), topics: Math.max(0, Math.round(Number(r?.topics) || 0)), minutes: Math.max(0, Math.round(Number(r?.minutes) || 0)), hours: Math.max(0, Number(r?.hours) || 0), sharePct: Math.max(0, Math.min(100, Math.round(Number(r?.sharePct) || 0))) })).filter((r: SkeletonRow) => r.key)
    : null;
  const steps: BuildStep[] = BUILD_STAGES.map((s) => {
    const r = Array.isArray(raw.steps) ? raw.steps.find((x: any) => x?.stage === s) : undefined;
    const i = stageIndex(s);
    return { stage: s, state: i < stageIndex(stage) ? "done" : i === stageIndex(stage) ? "current" : "pending", summary: oneLine(r?.summary, 200) };
  });
  return {
    id,
    createdAt: oneLine(raw.createdAt, 40) || new Date().toISOString(),
    updatedAt: oneLine(raw.updatedAt, 40) || oneLine(raw.createdAt, 40) || new Date().toISOString(),
    pre,
    effective: eff,
    stage,
    steps,
    answers,
    draft,
    skeleton,
    ...(oq ? { openQuestion: oq } : {}),
    source: raw.source === "ai" ? "ai" : "rules",
    questionCount: answers.length,
    maxQuestions: Math.max(1, Math.min(12, Math.round(Number(raw.maxQuestions) || MAX_BUILD_QUESTIONS))),
    status,
    finishing: raw.finishing === true,
    ai: sanitizeAi(raw.ai),
    name: oneLine(raw.name, 80) || `Plan en construcción · ${periodLabel(eff.start, eff.end)}`,
  };
}

/** Un archivo por plan en construcción: `.notevault/mentor/plans/_building/<id>.json`. */
export class PlanBuildStore {
  readonly vaultRoot: string;
  readonly dir: string;

  constructor(vaultRoot: string, private readonly today: () => string = () => new Date().toISOString().slice(0, 10)) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.mentor_plan_builds_dir);
  }

  private _path(id: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.mentor_plan_build, { id }));
  }

  load(id: string): PlanBuild | null {
    if (!BUILD_ID_RE.test(id)) return null;
    return sanitizeBuild(store.loadJson(this._path(id)), id, this.today());
  }

  save(b: PlanBuild): PlanBuild {
    if (!BUILD_ID_RE.test(b.id)) throw new Error("Id de plan en construcción inválido.");
    const clean = { ...b, updatedAt: new Date().toISOString() };
    store.writeJson(this._path(b.id), clean);
    return clean;
  }

  ids(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => !isSyncConflict(f) && f.endsWith(".json") && BUILD_ID_RE.test(f.slice(0, -5)))
      .map((f) => f.slice(0, -5))
      .sort();
  }

  /** Los planes en construcción (no abandonados), el último tocado primero. */
  list(): PlanBuild[] {
    return this.ids()
      .map((id) => this.load(id))
      .filter((b): b is PlanBuild => !!b && b.status !== "abandoned")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** «Abandonar»: el archivo va a la papelera de la vault (`mentor-plans`), igual que el borrado de un plan. */
  trash(id: string): boolean {
    if (!BUILD_ID_RE.test(id)) return false;
    return store.toTrash(this.vaultRoot, this._path(id), "mentor-plans") !== null;
  }

  /** Tras aceptar: el plan ya vive en `plans/<id>.json`; el estado de construcción deja de hacer falta. */
  remove(id: string): void {
    if (!BUILD_ID_RE.test(id)) return;
    try {
      fs.rmSync(this._path(id), { force: true });
    } catch {
      /* ya no estaba */
    }
  }
}
