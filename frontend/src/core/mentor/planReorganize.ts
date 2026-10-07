/**
 * «Reorganizar por áreas»: convierte un plan de ESTRUCTURA ANTIGUA (un subplan por rama de carpeta: «Programación: <objetivo largo>»
 * ×10) a la estructura nueva (un subplan = un ÁREA elemental con grupos internos y fases). Es DETERMINISTA y solo ocurre cuando el
 * usuario lo pide (nunca automáticamente); el llamador guarda el plan anterior en el historial de cambios para poder deshacerlo.
 *
 * Conserva: los temas completados (`completedAt`), las semanas fijadas, los estados y proyectos de los entregables, las metas
 * requeridas, los comentarios del Mentor (notas de los subplanes) y el nombre editado a mano. Cambia: los subplanes (agrupa las ramas
 * por la tabla `lib/planAreas.ts`), el reparto semanal (se recalcula con las fases de las áreas y la capacidad real), las preguntas de
 * entregables (una global) y el nombre autogenerado («Full stack web · 6 oct–5 abr», sin «+9»). `programming_practice` sale de los
 * subplanes: es la pista de práctica aparte (su kata y sus proyectos no se tocan).
 */

import { areaDef, areasPlanName, bucketByArea, isAutoPlanName, splitNotes, type AreaBucket } from "../../lib/planAreas.js";
import { suggestionsOf } from "../../lib/practiceTrack.js";
import { buildPlan, globalDeliverableQuestion, type Plan, type PlannedTopic, type RequiredGoal, type Subplan, type SubplanSeed } from "./plan.js";
import { composeFromPreconditions, defaultDeliverableFor, requiredGoalsFor, type GoalScope } from "./planSpec.js";
import type { PracticeFocus } from "../../lib/practiceTrack.js";

export interface ReorganizeCtx {
  today: string;
  startFocus?: PracticeFocus;
  goals?: readonly GoalScope[];
}

export interface Reorganized {
  plan: Plan;
  summary: string;
  /** carpetas cuyo reparto cambió (para resaltarlas) */
  changed: string[];
  warnings: string[];
  /** temas que ya no son de ningún área (p. ej. los de `programming_practice`) */
  dropped: string[];
  moved: number;
}

/** ¿Se puede reorganizar? Solo los planes de estructura antigua con al menos un tema. */
export const canReorganize = (plan: Pick<Plan, "structure" | "subplans">): boolean => plan.structure !== "areas" && plan.subplans.some((s) => s.topics.length > 0);

const oneLine = (v: string, max: number): string => v.replace(/\s+/g, " ").trim().slice(0, max);
const isGenericDeliverable = (title: string): boolean => /^Proyecto de demostración:/i.test(title.trim());

export function reorganizeByAreas(plan: Plan, ctx: ReorganizeCtx): Reorganized | null {
  if (!canReorganize(plan)) return null;
  const pre = plan.preconditions ? { ...plan.preconditions, start: plan.start, end: plan.end } : undefined;
  const goals = ctx.goals ?? [];

  // todos los temas, en el orden original del plan (subplan y semana), con lo que hay que conservar
  const all: Array<{ folder: string; title: string; skills?: string[]; estMinutes: number; sub: Subplan; topic: PlannedTopic }> = [];
  for (const sub of plan.subplans) {
    for (const t of [...sub.topics].sort((a, b) => a.targetWeek - b.targetWeek)) {
      if (all.some((x) => x.folder === t.folder)) continue;
      all.push({ folder: t.folder, title: t.title, ...(t.skills?.length ? { skills: t.skills } : {}), estMinutes: t.estMinutes, sub, topic: t });
    }
  }
  const buckets: Array<AreaBucket<(typeof all)[number]>> = bucketByArea(all, { keepOrder: true });
  const placed = new Set(buckets.flatMap((b) => b.topics.map((t) => t.folder)));
  const dropped = all.filter((x) => !placed.has(x.folder)).map((x) => x.folder);
  const before = new Map(all.map((x) => [x.folder, x.topic.targetWeek]));

  const seeds: SubplanSeed[] = buckets.map((b) => {
    const folders = new Set(b.topics.map((t) => t.folder));
    const sources = [...new Map(b.topics.map((t) => [t.sub.id, t.sub])).values()];
    const groupTitle = new Map(b.groups.map((g) => [g.id, g.title]));
    // comentarios del Mentor de los subplanes de origen (sin el aviso interno «sin la selección de la IA»)
    const noteParts: string[] = [];
    let rulesFallback = false;
    for (const s of sources) {
      const { note, rulesFallback: rf } = splitNotes(s.notes);
      if (rf) rulesFallback = true;
      const clean = note.replace(/Nivel «no sé» en [^:]+: empieza con un diagnóstico corto de «[^»]*» para calibrar el resto\.\s*/g, "").trim();
      if (!clean) continue;
      const groups = [...new Set(b.topics.filter((t) => t.sub.id === s.id).map((t) => groupTitle.get(t.group)))].filter(Boolean);
      noteParts.push(sources.length > 1 && groups.length === 1 ? `${groups[0]} — ${clean}` : clean);
    }
    const required = new Map<string, RequiredGoal>();
    for (const s of sources) {
      for (const g of s.requiredGoals) required.set(`${g.goalId}:${g.itemId ?? ""}`, g);
      if (s.goalId && !required.has(`${s.goalId}:`)) required.set(`${s.goalId}:`, { goalId: s.goalId, note: "Meta que este subplan ayudaba a cumplir" });
    }
    for (const g of requiredGoalsFor(b.areaId, folders, goals)) if (!required.has(`${g.goalId}:${g.itemId ?? ""}`)) required.set(`${g.goalId}:${g.itemId ?? ""}`, g);
    const withDeliverable = sources.find((s) => s.deliverable);
    const base = { area: b.name, areaId: b.areaId, objective: "", groups: b.groups };
    const def = defaultDeliverableFor({ ...base, objective: "" });
    const old = withDeliverable?.deliverable;
    return {
      area: b.name,
      areaId: b.areaId,
      objective: areaDef(b.areaId)?.objective ?? `Avanzar en ${b.name}`,
      groups: b.groups,
      // los completados no se reparten: vuelven a su sitio al final, con su fecha
      topics: b.topics.filter((t) => !t.topic.completedAt).map((t) => ({ folder: t.folder, title: t.title, ...(t.skills ? { skills: t.skills } : {}), estMinutes: t.estMinutes, group: t.group, ...(t.topic.diagnostic ? { diagnostic: true } : {}) })),
      requiredGoals: [...required.values()].slice(0, 10),
      ...(old ? { deliverable: isGenericDeliverable(old.title) ? { ...def, status: old.status, ...(old.projectId ? { projectId: old.projectId } : {}) } : { ...old } } : {}),
      ...(noteParts.length ? { notes: oneLine(noteParts.join(" "), 400) } : {}),
      ...(rulesFallback ? { fallback: { kind: "rules" as const, reason: "no consta el motivo (el plan se generó antes de registrarlo)" } } : {}),
    };
  });

  const pins = new Map<string, number>();
  for (const x of all) if (x.topic.pinned && !x.topic.completedAt) pins.set(x.folder, x.topic.targetWeek);
  const weeks = Math.max(1, Math.floor((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 / 7) + 1);

  let subplans: Subplan[];
  let hoursPerWeek = plan.hoursPerWeek;
  let programmingPractice = plan.programmingPractice;
  const warnings: string[] = [];
  if (pre) {
    const draft = composeFromPreconditions(seeds, pre, {
      today: ctx.today,
      auto: !!plan.auto,
      rationale: plan.rationale ?? "",
      startFocus: ctx.startFocus,
      practiceSuggestions: suggestionsOf(plan.programmingPractice),
    });
    subplans = draft.subplans;
    hoursPerWeek = draft.hoursPerWeek;
    programmingPractice = draft.programmingPractice;
    warnings.push(...draft.warnings);
  } else {
    const built = buildPlan(seeds, { start: plan.start, end: plan.end, hoursPerWeek: plan.hoursPerWeek ?? 10, from: ctx.today > plan.start ? ctx.today : plan.start });
    subplans = built.plan.subplans;
    warnings.push(...built.warnings);
  }
  // completados y fijados vuelven a su sitio: el orden de la ruta del área (Bases → Lenguaje → Conocimientos) manda; un tema completado toma
  // la semana del tema anterior de la ruta para no descuadrar las semanas
  const areaOf = new Map<string, string>();
  const rank = new Map<string, number>();
  for (const b of buckets) b.topics.forEach((t, i) => (areaOf.set(t.folder, b.areaId), rank.set(t.folder, i)));
  subplans = subplans.map((s) => {
    const bucket = buckets.find((b) => b.areaId === s.areaId);
    const live = s.topics.map((t) => (pins.has(t.folder) ? { ...t, targetWeek: Math.min(weeks, pins.get(t.folder)!), pinned: true } : t));
    const done = all
      .filter((x) => x.topic.completedAt && areaOf.get(x.folder) === s.areaId)
      .map((x) => ({ ...x.topic, group: bucket?.topics.find((t) => t.folder === x.folder)?.group }));
    const ordered = [...live, ...done].sort((a, b) => (rank.get(a.folder) ?? 0) - (rank.get(b.folder) ?? 0));
    let lastWeek = ordered.find((t) => !t.completedAt)?.targetWeek ?? 1;
    const topics = ordered.map((t) => {
      if (!t.completedAt) {
        lastWeek = t.targetWeek;
        return t;
      }
      return { ...t, targetWeek: Math.min(weeks, lastWeek) };
    });
    return { ...s, topics: topics.map((t) => (t.group === undefined ? (({ group: _g, ...r }) => r)(t) : t)) };
  }) as Subplan[];

  const { name: oldName, openQuestions: oldQuestions, ...rest } = plan;
  const lacking = subplans.some((s) => !s.deliverable);
  const name = isAutoPlanName(oldName) ? areasPlanName(subplans, plan.start, plan.end) : oldName;
  const next: Plan = {
    ...rest,
    structure: "areas",
    ...(name ? { name } : {}),
    ...(hoursPerWeek ? { hoursPerWeek } : {}),
    ...(programmingPractice ? { programmingPractice } : {}),
    // una sola pregunta global de entregables si había alguna pendiente
    ...(oldQuestions?.some((q) => q.id === "deliverables") && lacking ? { openQuestions: [globalDeliverableQuestion()] } : {}),
    subplans,
    updatedAt: new Date().toISOString(),
  };
  if (!programmingPractice) delete next.programmingPractice;

  const after = new Map<string, number>();
  for (const s of subplans) for (const t of s.topics) after.set(t.folder, t.targetWeek);
  const moved = [...after.entries()].filter(([f, w]) => before.get(f) !== w).length;
  const changed = [...after.entries()].filter(([f, w]) => before.get(f) !== w).map(([f]) => f).slice(0, 200);
  const doneN = all.filter((x) => x.topic.completedAt).length;
  const summary = `Reorganizado por áreas: ${subplans.map((s) => s.area).join(", ")}. ${after.size} ${after.size === 1 ? "tema conservado" : "temas conservados"}${doneN ? ` (${doneN} ya completados)` : ""}${dropped.length ? `; ${dropped.length} ${dropped.length === 1 ? "tema de práctica salió" : "temas de práctica salieron"} de las áreas (la práctica diaria va aparte)` : ""}.`;
  return { plan: next, summary, changed, warnings, dropped, moved };
}

