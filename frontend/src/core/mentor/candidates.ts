/**
 * Candidatos de estudio del Mentor: lo que la IA puede elegir para el plan de hoy.
 *
 * `buildCandidates` lee SOLO el informe (brief.ts) y devuelve una lista ordenada,
 * puntuada y ya filtrada por el tiempo disponible; la IA no inventa tareas, elige y
 * ordena entre estas. `allocate` reparte el tiempo con presupuesto por materia.
 * Todo es puro y determinista.
 *
 * Reglas de prioridad (puntuación 0..100, mayor = antes):
 *  1. Repasos SRS vencidos ........ 80 + días de retraso del más viejo (<=10) + fallos (<=5)
 *  2. Errores reincidentes ........ 85 + 3 por cada repetición por encima de 2 (<=10)
 *  3. Metas con plazo cercano ..... un tema/submeta enlazado suma hasta +33 según la
 *                                   urgencia del plazo (vencida = máximo) y la prioridad de la meta
 *  4. Temas a medias (continue) ... 55 base, +10 si hubo intento en la última semana,
 *                                   +5 si está cerca de acabar, +3 por skill débil (<=9);
 *                                   siempre por encima de los temas nuevos
 *  5. Temas sin tratar ............ nunca se asume dominio: se propone un DIAGNÓSTICO
 *                                   (untreated_diagnostic, base 50) si lo pide una meta o si
 *                                   la materia no tiene temas a medias; si los hay, queda como
 *                                   next_topic (base 30) por detrás de terminar los a medias
 *  6. Tareas / issues con plazo ... 35 + urgencia*0.35 + 2 por prioridad
 *  7. Submetas sin tema con plazo . 30 + urgencia*0.4 + 2 por prioridad
 *  Otros errores sin resolver ..... 50 (agrupados por materia, solo si son >= 3)
 *
 * Desempate: puntuación, luego tipo (el orden de arriba), luego id.
 */

import {
  sectionData,
  urgency,
  type GoalsData,
  type StudentBrief,
  type StudyPendingData,
  type TasksData,
  type TopicBrief,
  type TopicGoalLink,
  type TopicsData,
} from "./brief.js";
import { applyObjective, type SessionObjective } from "./objective.js";
import type { PlanItem } from "./plan.js";
import type { PlanBlock } from "./sessionLog.js";

export type CandidateKind =
  | "srs_review"
  | "error_fix"
  | "continue_topic"
  | "next_topic"
  | "untreated_diagnostic"
  | "task_deadline"
  | "goal_item"
  | "plan_item";

export interface CandidateLinks {
  goalId?: string;
  itemId?: string;
  topicFolder?: string;
  /** subplan del plan mensual del que viene (plan_item) */
  subplanId?: string;
  /** texto corto del subplan, para el chip "Plan: …" */
  subplan?: string;
}

export interface Candidate {
  /** estable entre llamadas: el plan guardado lo referencia */
  id: string;
  kind: CandidateKind;
  subject: string;
  topicFolder?: string;
  skills?: string[];
  estMinutes: number;
  /** 0..100 */
  score: number;
  reasons: string[];
  links: CandidateLinks;
}

export interface CandidateOptions {
  availableMinutes: number;
  /** objetivo de la sesión: empuja a lo que lo cumple y relega (sin quitar) lo demás */
  objective?: SessionObjective;
  /** lo que el plan del mes dice que toca hoy (ver plan.ts `planItemsFor`) */
  planItems?: readonly PlanItem[];
}

export interface AllocateOptions {
  /** máximo de materias distintas en el plan */
  maxSubjects?: number;
  /** tope de tiempo para una materia (fracción del total); 0.6 por defecto */
  maxShare?: number;
}

/** Estimación base de minutos por tipo (ver `estimate*`). */
export const EST_MINUTES = {
  error_fix: 15,
  error_fix_group: 10,
  continue_topic: 30,
  continue_topic_near_done: 20,
  next_topic: 30,
  untreated_diagnostic: 20,
  task_deadline: 30,
  goal_item: 25,
  plan_item_deliverable: 45,
} as const;

/** Mínimo al que se puede recortar un bloque divisible para que quepa. */
export const SPLIT_MIN_MINUTES = 10;
/** Tipos cuyo bloque se puede acortar sin perder sentido. */
const SPLITTABLE: ReadonlySet<CandidateKind> = new Set(["srs_review", "continue_topic", "next_topic", "goal_item", "plan_item"]);
const KIND_ORDER: CandidateKind[] = ["plan_item", "srs_review", "error_fix", "goal_item", "continue_topic", "untreated_diagnostic", "task_deadline", "next_topic"];

function srsMinutes(count: number): number {
  return Math.min(30, Math.max(10, Math.ceil((count * 1.2) / 5) * 5));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dueWord(daysLeft: number | null): string {
  if (daysLeft === null) return "sin fecha";
  if (daysLeft < 0) return `vencida hace ${-daysLeft} d`;
  if (daysLeft === 0) return "vence hoy";
  return `vence en ${daysLeft} d`;
}

/** Empuje (0..33) que un enlace a una meta da a lo que la cumple. */
export function goalBoost(link: Pick<TopicGoalLink, "daysLeft" | "overdue" | "goalPriority">): number {
  return Math.round((urgency(link.daysLeft, link.overdue) / 100) * 25 + Math.max(0, Math.min(4, link.goalPriority)) * 2);
}

function strongestLink(links: TopicGoalLink[]): TopicGoalLink | null {
  let best: TopicGoalLink | null = null;
  for (const l of links) if (!best || goalBoost(l) > goalBoost(best)) best = l;
  return best;
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function topicCandidate(t: TopicBrief, subjectHasInProgress: Set<string>, missingByTopic: Map<string, Set<string>>): Candidate | null {
  if (t.status === "complete" && !t.goalLinks.length) return null;
  const link = strongestLink(t.goalLinks);
  const boost = link ? goalBoost(link) : 0;
  const links: CandidateLinks = { topicFolder: t.folder };
  if (link) {
    links.goalId = link.goalId;
    links.itemId = link.itemId;
  }
  const reasons: string[] = [];
  if (link) reasons.push(`lo pide la meta "${link.goalName}" (${dueWord(link.daysLeft)})`);

  // Skills a trabajar: las que pide la meta y faltan; si no, débiles > en práctica > sin iniciar.
  const wanted = missingByTopic.get(t.folder);
  const skills = (wanted && wanted.size ? [...wanted].filter((s) => s !== "exam") : [...t.weakSkills, ...t.practicingSkills, ...t.notStartedSkills]).slice(0, 3);
  const base = { subject: t.subject, topicFolder: t.folder, ...(skills.length ? { skills } : {}), links };

  if (t.status === "untreated") {
    reasons.push(`material sin ningún intento (${plural(t.exercises, "ejercicio", "ejercicios")}, ${plural(t.theoryNotes, "nota", "notas")}): no se asume dominio`);
    const diagnostic = t.goalLinks.length > 0 || !subjectHasInProgress.has(t.subject);
    if (diagnostic) {
      reasons.push("propón un diagnóstico corto para medir dónde está");
      return { id: `topic:${t.folder}`, kind: "untreated_diagnostic", ...base, estMinutes: EST_MINUTES.untreated_diagnostic, score: clamp100(50 + boost), reasons, links };
    }
    reasons.push("antes conviene terminar los temas a medias de la materia");
    return { id: `topic:${t.folder}`, kind: "next_topic", ...base, estMinutes: EST_MINUTES.next_topic, score: clamp100(30 + boost), reasons, links };
  }

  // a medias (o completo pero aún lo pide una meta)
  let score = 55 + boost;
  if (t.status === "complete") {
    // el tema está al 100%: solo queda lo que falte (examen)
    if (t.exam !== "required_pending" && !wanted?.size) return null;
    reasons.push(t.exam === "required_pending" ? "falta el examen del tema" : "faltan requisitos de la meta");
    score = 50 + boost;
  } else {
    reasons.push(`tema a medias (${t.completenessPct}%)`);
    if (t.lastAttemptDays !== null && t.lastAttemptDays <= 7) {
      score += 10;
      reasons.push("lo trabajaste esta semana: aprovecha el impulso");
    } else if (t.lastAttemptDays !== null && t.lastAttemptDays >= 14) {
      reasons.push(`parado hace ${t.lastAttemptDays} d`);
    }
    if (t.completenessPct >= 70) {
      score += 5;
      reasons.push("cerca de terminarlo");
    }
    if (t.weakSkills.length) {
      score += Math.min(9, t.weakSkills.length * 3);
      reasons.push(`skills débiles: ${t.weakSkills.slice(0, 3).join(", ")}`);
    }
    if (t.exam === "required_pending" && t.completenessPct >= 80) reasons.push("después toca el examen");
  }
  const est = t.completenessPct >= 80 ? EST_MINUTES.continue_topic_near_done : EST_MINUTES.continue_topic;
  return { id: `topic:${t.folder}`, kind: "continue_topic", ...base, estMinutes: est, score: clamp100(score), reasons, links };
}

/** Candidatos filtrados por el tiempo disponible, puntuados y ordenados (mejor primero). */
export function buildCandidates(brief: StudentBrief, opts: CandidateOptions): Candidate[] {
  const available = Math.floor(opts.availableMinutes);
  if (!(available > 0)) return [];

  const out: Candidate[] = [];
  const goals = sectionData<GoalsData>(brief, "goals");
  const topics = sectionData<TopicsData>(brief, "topics");
  const pending = sectionData<StudyPendingData>(brief, "study_pending");
  const tasks = sectionData<TasksData>(brief, "tasks");

  // 1-2. Repasos SRS y errores
  if (pending) {
    for (const s of pending.srs.bySubject) {
      const reasons = [`${plural(s.count, "repaso vencido", "repasos vencidos")}${s.oldestOverdueDays ? `, el más viejo con ${s.oldestOverdueDays} d de retraso` : ""}`];
      if (s.lapses) reasons.push(`${plural(s.lapses, "fallo acumulado", "fallos acumulados")}`);
      out.push({
        id: `srs:${s.subject}`,
        kind: "srs_review",
        subject: s.subject,
        estMinutes: srsMinutes(s.count),
        score: clamp100(80 + Math.min(10, s.oldestOverdueDays) + Math.min(5, s.lapses)),
        reasons,
        links: {},
      });
    }
    const repeatersBySubject: Record<string, number> = {};
    for (const r of pending.errors.repeaters) {
      repeatersBySubject[r.subject] = (repeatersBySubject[r.subject] ?? 0) + 1;
      out.push({
        id: `err:${r.id}`,
        kind: "error_fix",
        subject: r.subject,
        ...(r.skill ? { skills: [r.skill] } : {}),
        estMinutes: EST_MINUTES.error_fix,
        score: clamp100(85 + Math.min(10, Math.max(0, r.repeatCount - 2) * 3)),
        reasons: [`error reincidente (${r.repeatCount} veces)${r.topic ? ` en ${r.topic}` : ""} [${r.category}]`],
        links: {},
      });
    }
    for (const [subject, total] of Object.entries(pending.errors.bySubject)) {
      const rest = total - (repeatersBySubject[subject] ?? 0);
      if (rest >= 3) {
        out.push({
          id: `err:${subject}`,
          kind: "error_fix",
          subject,
          estMinutes: EST_MINUTES.error_fix_group,
          score: 50,
          reasons: [`${plural(rest, "error sin resolver", "errores sin resolver")} acumulados en ${subject}`],
          links: {},
        });
      }
    }
  }

  // 3-5. Temas (a medias / sin tratar / pedidos por metas)
  const topicFolders = new Set<string>();
  if (topics) {
    const inProgress = new Set(topics.topics.filter((t) => t.status === "in_progress").map((t) => t.subject));
    const missingByTopic = new Map<string, Set<string>>();
    for (const g of goals?.goals ?? []) {
      for (const it of g.items) {
        for (const tl of it.topics) {
          if (!tl.missing.length) continue;
          const set = missingByTopic.get(tl.folder) ?? new Set<string>();
          for (const m of tl.missing) set.add(m);
          missingByTopic.set(tl.folder, set);
        }
      }
    }
    for (const t of topics.topics) {
      topicFolders.add(t.folder);
      const c = topicCandidate(t, inProgress, missingByTopic);
      if (c) out.push(c);
    }
  }

  // Submetas de metas sin tema enlazado (o con enlaces que el informe de temas no cubre)
  for (const g of goals?.goals ?? []) {
    const goalSoon = g.overdue || (g.daysLeft !== null && g.daysLeft <= 14);
    for (const it of g.items) {
      const covered = it.topics.length > 0 && it.topics.every((t) => !t.broken && topicFolders.has(t.folder));
      if (covered) continue;
      const brokenLinks = it.topics.filter((t) => t.broken);
      const itemSoon = it.daysLeft !== null && it.daysLeft <= 14;
      if (!goalSoon && !itemSoon && !brokenLinks.length) continue;
      const days = [g.daysLeft, it.daysLeft].filter((d): d is number => d !== null);
      const left = days.length ? Math.min(...days) : null;
      const reasons: string[] = [];
      if (left !== null) reasons.push(`${it.daysLeft !== null && it.daysLeft === left ? "la submeta" : `la meta "${g.name}"`} ${dueWord(left)}`);
      if (brokenLinks.length) reasons.push(`enlace a tema roto (${brokenLinks.map((b) => b.folder).join(", ")}): repáralo en Metas`);
      reasons.push(`submeta "${it.name}" al ${it.progressPct}%`);
      out.push({
        id: `goal:${g.id}:${it.id}`,
        kind: "goal_item",
        subject: g.area || "metas",
        estMinutes: EST_MINUTES.goal_item,
        score: clamp100(30 + urgency(left, left !== null && left < 0) * 0.4 + 2 * Math.max(it.priority, g.priority)),
        reasons,
        links: { goalId: g.id, itemId: it.id },
      });
    }
  }

  // 6. Tareas e issues con plazo
  const allTasks = opts.objective?.type === "tasks";
  for (const t of tasks?.tasks ?? []) {
    if (!allTasks && (t.daysLeft === null || t.daysLeft > 14)) continue;
    out.push({
      id: `task:${t.id}`,
      kind: "task_deadline",
      subject: t.subject || "tareas",
      estMinutes: EST_MINUTES.task_deadline,
      score: clamp100(35 + urgency(t.daysLeft) * 0.35 + 2 * t.priority),
      reasons: [`tarea "${t.name}" ${dueWord(t.daysLeft)}`],
      links: {},
    });
  }
  for (const p of tasks?.projects ?? []) {
    for (const i of p.dueSoon) {
      out.push({
        id: `issue:${p.id}:${i.id}`,
        kind: "task_deadline",
        subject: p.area || p.name,
        estMinutes: i.estimateMin ? Math.min(60, Math.max(15, Math.round(i.estimateMin / 5) * 5)) : EST_MINUTES.task_deadline,
        score: clamp100(35 + urgency(i.daysLeft) * 0.35 + 2 * i.priority),
        reasons: [`issue "${i.title}" del proyecto "${p.name}" ${dueWord(i.daysLeft)}`],
        links: {},
      });
    }
  }

  // 7. Lo que el plan del mes dice que toca: sustituye al candidato de ese tema y sube al principio
  let withPlan = out;
  if (opts.planItems?.length) withPlan = addPlanItems(out, opts.planItems, topics);
  const ranked = opts.objective ? applyObjective(withPlan, opts.objective, brief) : withPlan;
  return sortCandidates(fit(ranked, available));
}

/** Empuje que da el plan del mes a lo que toca esta semana (por encima de repasos y errores corrientes). */
const PLAN_BOOST = 45;

function addPlanItems(list: Candidate[], items: readonly PlanItem[], topics: TopicsData | null): Candidate[] {
  let out = [...list];
  const taken = new Set<string>();
  for (const it of items) {
    const links: CandidateLinks = { subplanId: it.subplanId, subplan: it.label };
    if (it.kind === "deliverable") {
      const id = `plan:${it.planId}:${it.subplanId}:deliverable`;
      if (taken.has(id)) continue;
      taken.add(id);
      out.push({
        id,
        kind: "plan_item",
        subject: it.area,
        estMinutes: EST_MINUTES.plan_item_deliverable,
        score: 90,
        reasons: [`el plan del mes (${it.label}) pide avanzar el entregable: ${it.title}`],
        links,
      });
      continue;
    }
    const folder = it.folder!;
    const t = topics?.topics.find((x) => x.folder === folder);
    if (!t || (t.status === "complete" && t.exam !== "required_pending")) continue; // enlace roto o ya hecho
    if (taken.has(folder)) continue;
    taken.add(folder);
    const base = out.find((c) => c.topicFolder === folder && c.id === `topic:${folder}`);
    out = out.filter((c) => c !== base);
    const wanted = it.skills?.length ? it.skills : base?.skills;
    out.push({
      id: `plan:${it.planId}:${it.subplanId}:${folder}`,
      kind: "plan_item",
      subject: t.subject,
      topicFolder: folder,
      ...(wanted?.length ? { skills: wanted } : {}),
      estMinutes: Math.min(60, Math.max(20, base?.estMinutes ?? it.estMinutes)),
      score: clamp100(Math.max(base?.score ?? 50, 50) + PLAN_BOOST + (it.overdue ? 5 : 0)),
      reasons: [
        `lo pide el plan del mes (${it.label}, semana ${it.targetWeek})${it.overdue ? " y va atrasado" : ""}`,
        ...(base?.reasons ?? [`tema a medias (${t.completenessPct}%)`]),
      ],
      links: { ...(base?.links ?? {}), topicFolder: folder, ...links },
    });
  }
  return out;
}

/** Descarta lo que no cabe; acorta los bloques divisibles hasta `available` si queda >= SPLIT_MIN. */
function fit(list: Candidate[], available: number): Candidate[] {
  const out: Candidate[] = [];
  for (const c of list) {
    if (c.estMinutes <= available) out.push(c);
    else if (SPLITTABLE.has(c.kind) && available >= SPLIT_MIN_MINUTES) out.push({ ...c, estMinutes: available });
  }
  return out;
}

function sortCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort(
    (a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id),
  );
}

function subjectKey(c: Candidate): string {
  return c.subject.trim().toLowerCase() || "(sin materia)";
}

/**
 * Reparte `availableMinutes` entre los candidatos (ya ordenados por puntuación) con un
 * presupuesto por materia: ninguna pasa de `maxShare` (60%) del total salvo que sea la
 * única con candidatos. Un bloque divisible se acorta para entrar en el presupuesto que
 * le queda (>= 10 min). Devuelve el subconjunto que cabe, mejor puntuados primero.
 */
export function allocate(candidates: readonly Candidate[], availableMinutes: number, opts: AllocateOptions = {}): Candidate[] {
  const total = Math.floor(availableMinutes);
  if (!(total > 0)) return [];
  const sorted = sortCandidates([...candidates]);
  const subjects = new Set(sorted.map(subjectKey));
  const share = opts.maxShare ?? 0.6;
  const budget = subjects.size <= 1 ? total : Math.max(1, Math.floor(total * share));

  const used = new Map<string, number>();
  const chosenSubjects: string[] = [];
  const picked: Candidate[] = [];
  let remaining = total;

  for (const c of sorted) {
    if (remaining <= 0) break;
    const key = subjectKey(c);
    if (opts.maxSubjects !== undefined && !chosenSubjects.includes(key) && chosenSubjects.length >= opts.maxSubjects) continue;
    const room = Math.min(remaining, budget - (used.get(key) ?? 0));
    let minutes = c.estMinutes;
    if (minutes > room) {
      if (!SPLITTABLE.has(c.kind) || room < SPLIT_MIN_MINUTES) continue;
      minutes = room;
    }
    picked.push(minutes === c.estMinutes ? c : { ...c, estMinutes: minutes });
    used.set(key, (used.get(key) ?? 0) + minutes);
    remaining -= minutes;
    if (!chosenSubjects.includes(key)) chosenSubjects.push(key);
  }
  return picked;
}

/** Bloques `planned` para guardar en el registro de sesiones a partir de candidatos elegidos. */
export function planBlocksFrom(candidates: readonly Candidate[]): PlanBlock[] {
  return candidates.map((c) => ({
    candidateId: c.id,
    kind: c.kind,
    subject: c.subject,
    ...(c.topicFolder ? { topicFolder: c.topicFolder } : {}),
    minutes: c.estMinutes,
    status: "planned" as const,
    ...(c.links.subplan ? { plan: c.links.subplan } : {}),
  }));
}
