/**
 * Informe del estudiante para el Mentor.
 *
 * La IA SOLO ve este informe (nunca notas completas): por eso es COMPACTO y de
 * CONCLUSIONES (qué vence, qué va atrasado, qué se repite), no datos crudos.
 *
 * Arquitectura de proveedores intercambiables: cada `BriefProvider` mira una fuente
 * (metas, temas, repasos/errores, tareas, historial de sesiones) y devuelve una
 * `BriefSection` con `data` tipado (lo usa candidates.ts), `lines` en texto compacto
 * (lo usa `toPromptText`) y `signals` cortas que justifican la prioridad. Mañana se
 * enchufan hábitos/finanzas con `registerBriefProvider` sin tocar nada más.
 *
 * Todo es serializable (JSON) y determinista dado `ctx.today`.
 */

import { formatIsoDate } from "../dates.js";
import { FILTER_ACTIVE, ITEM_DONE, type GoalItem, type GoalManager } from "../goalManager.js";
import { P_ACTIVE, type ProjectManager } from "../projectManager.js";
import { parseTopicLink } from "../practice/topicLinks.js";
import type { StudyErrorManager } from "../studyErrorManager.js";
import type { StudySRSManager } from "../studySrsManager.js";
import { STATUS_DONE as TASK_DONE, type TaskManager } from "../taskManager.js";
import { adherence, type SessionRecord } from "./sessionLog.js";
import type { TopicSnap } from "./topics.js";

// ── Contexto ────────────────────────────────────────────────────────────

/** Resumen de una entrada del recomendador/cola diaria (study/recommender.ts), ya resumida. */
export interface QueueHint {
  kind: string;
  subject: string;
  title: string;
  reason: string;
  /** ruta relativa del ejercicio, si la hay */
  exercise?: string;
}

/** Todo lo que un proveedor puede leer. Cada fuente es opcional: sin ella, su sección sale vacía o se omite. */
export interface BriefContext {
  /** hoy, a medianoche local */
  today: Date;
  goals?: Pick<GoalManager, "goals" | "items" | "progress" | "itemProgress" | "topicProgress">;
  tasks?: Pick<TaskManager, "tasks">;
  projects?: Pick<ProjectManager, "projects" | "issues" | "progress">;
  srs?: Pick<StudySRSManager, "dueItems">;
  errors?: Pick<StudyErrorManager, "errors">;
  /** temas ya resumidos (ver topics.ts); el núcleo no escanea la vault */
  topics?: () => TopicSnap[];
  /** sesiones recientes (más nueva primero) */
  sessions?: () => SessionRecord[];
  /** cola del recomendador, para no duplicar su lógica */
  queue?: () => QueueHint[];
}

export interface BriefOptions {
  /** solo estos proveedores (por id) */
  only?: string[];
  /** proveedores a saltar (por id) */
  exclude?: string[];
  /** en vez del registro global */
  providers?: BriefProvider[];
}

// ── Tipos del informe ───────────────────────────────────────────────────

export interface BriefLine {
  text: string;
  /** 0..100: importancia dentro de su sección (decide qué se trunca primero) */
  weight: number;
}

export interface BriefSection<T = unknown> {
  id: string;
  title: string;
  /** menor = más importante; ordena la sección y decide qué se recorta primero */
  priority: number;
  /** una frase de conclusión */
  summary: string;
  /** motivos cortos que justifican la prioridad de la sección */
  signals: string[];
  lines: BriefLine[];
  data: T;
}

export interface BriefProvider {
  id: string;
  collect(ctx: BriefContext): BriefSection | null;
}

export interface StudentBrief {
  version: 1;
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  sections: BriefSection[];
  /** proveedores que fallaron (el informe sigue sin ellos) */
  skipped: string[];
}

// Datos tipados por proveedor ---------------------------------------------

export interface GoalTopicBrief {
  folder: string;
  title: string;
  /** skills pedidas por el enlace; vacío = todo el tema */
  skills: string[];
  /** null si no hay forma de derivarlo */
  pct: number | null;
  done: boolean;
  broken: boolean;
  /** skills (o `exam`) que faltan */
  missing: string[];
}

export interface GoalItemBrief {
  id: string;
  name: string;
  status: string;
  due: string | null;
  daysLeft: number | null;
  priority: number;
  progressPct: number;
  topics: GoalTopicBrief[];
  why: string[];
}

export interface GoalBrief {
  id: string;
  name: string;
  area: string;
  priority: number;
  deadline: string | null;
  daysLeft: number | null;
  overdue: boolean;
  progressPct: number;
  items: GoalItemBrief[];
  /** submetas abiertas que no caben en `items` */
  moreItems: number;
  why: string[];
}

export interface GoalsData {
  goals: GoalBrief[];
}

export interface TopicGoalLink {
  goalId: string;
  goalName: string;
  goalPriority: number;
  itemId: string;
  itemName: string;
  daysLeft: number | null;
  overdue: boolean;
}

export type TopicStatus = "untreated" | "in_progress" | "complete";

export interface TopicBrief {
  folder: string;
  subject: string;
  title: string;
  status: TopicStatus;
  completenessPct: number;
  weakSkills: string[];
  notStartedSkills: string[];
  practicingSkills: string[];
  masteredSkills: number;
  totalSkills: number;
  exam: "required_pending" | "required_passed" | "optional" | "none";
  examScore: number | null;
  attempts: number;
  exercises: number;
  theoryNotes: number;
  lastAttemptDays: number | null;
  goalLinks: TopicGoalLink[];
  why: string[];
}

export interface TopicsData {
  topics: TopicBrief[];
}

export interface SrsSubjectBrief {
  subject: string;
  count: number;
  /** días de retraso del más antiguo */
  oldestOverdueDays: number;
  lapses: number;
}

export interface ErrorBrief {
  id: string;
  subject: string;
  topic: string;
  skill: string;
  category: string;
  repeatCount: number;
  lastSeenDays: number | null;
}

export interface StudyPendingData {
  srs: { dueTotal: number; bySubject: SrsSubjectBrief[] };
  errors: { unresolved: number; bySubject: Record<string, number>; repeaters: ErrorBrief[] };
  queue: QueueHint[];
}

export interface TaskBrief {
  id: string;
  name: string;
  /** materia de la tarea */
  subject: string;
  due: string | null;
  daysLeft: number | null;
  priority: number;
  status: string;
}

export interface IssueBrief {
  id: string;
  title: string;
  due: string | null;
  daysLeft: number | null;
  priority: number;
  estimateMin: number | null;
}

export interface ProjectBrief {
  id: string;
  name: string;
  area: string;
  deadline: string | null;
  daysLeft: number | null;
  progressPct: number;
  openIssues: number;
  dueSoon: IssueBrief[];
}

export interface TasksData {
  tasks: TaskBrief[];
  projects: ProjectBrief[];
  overdue: number;
  bySubject: Array<{ subject: string; count: number; overdue: number }>;
}

export interface HabitsActivityData {
  sessions: number;
  adherencePct: number | null;
  typicalSessionMinutes: number | null;
  skippedSubjects: string[];
  skippedKinds: Array<{ kind: string; pct: number }>;
  lastSessionDate: string | null;
}

/** Datos tipados de la sección `id` del informe, o null si no está. */
export function sectionData<T>(brief: StudentBrief, id: string): T | null {
  const s = brief.sections.find((x) => x.id === id);
  return s ? (s.data as T) : null;
}

// ── Utilidades ──────────────────────────────────────────────────────────

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DAY_MS = 86_400_000;
/** error sin resolver visto al menos 2 veces = reincidente (mismo umbral que recommender.ts) */
export const REPEAT_MIN = 2;
const WEAK_SCORE = 70;
const DUE_HORIZON_DAYS = 14;

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Días de `to` respecto a `from` (positivo = en el futuro), por fecha local. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

function daysUntil(d: Date | null | undefined, today: Date): number | null {
  return d ? daysBetween(today, d) : null;
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? formatIsoDate(d) : null;
}

function parseDay(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function pct(x: number): number {
  return Math.round(Math.max(0, Math.min(1, x)) * 100);
}

function dueText(daysLeft: number | null): string {
  if (daysLeft === null) return "sin fecha";
  if (daysLeft < 0) return `vencida hace ${-daysLeft} d`;
  if (daysLeft === 0) return "vence hoy";
  return `en ${daysLeft} d`;
}

/** Urgencia 0..100 de una fecha límite, para ordenar y ponderar líneas. */
export function urgency(daysLeft: number | null, overdue = false): number {
  if (overdue || (daysLeft !== null && daysLeft < 0)) return 100;
  if (daysLeft === null) return 20;
  if (daysLeft <= 1) return 90;
  if (daysLeft <= 3) return 75;
  if (daysLeft <= 7) return 60;
  if (daysLeft <= 14) return 40;
  if (daysLeft <= 30) return 25;
  return 10;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

// ── Enlaces meta → tema (compartido por `goals` y `topics`) ─────────────

interface GoalLinkCollected {
  link: TopicGoalLink;
  skills: string[];
}

/** Para cada carpeta de tema enlazada desde una submeta abierta de una meta activa. */
function collectGoalLinks(ctx: BriefContext): Map<string, GoalLinkCollected[]> {
  const out = new Map<string, GoalLinkCollected[]>();
  if (!ctx.goals) return out;
  for (const goal of ctx.goals.goals(FILTER_ACTIVE)) {
    const goalDays = daysUntil(goal.end, ctx.today);
    for (const item of ctx.goals.items(goal.id)) {
      if (item.status === ITEM_DONE || !item.topic_links.length) continue;
      const itemDays = daysUntil(item.due, ctx.today);
      const days = [goalDays, itemDays].filter((d): d is number => d !== null);
      const daysLeft = days.length ? Math.min(...days) : null;
      for (const raw of item.topic_links) {
        const parsed = parseTopicLink(raw);
        if (!parsed) continue;
        const list = out.get(parsed.topic) ?? [];
        list.push({
          skills: parsed.skills,
          link: {
            goalId: goal.id,
            goalName: goal.name,
            goalPriority: goal.priority,
            itemId: item.id,
            itemName: item.name,
            daysLeft,
            overdue: daysLeft !== null && daysLeft < 0,
          },
        });
        out.set(parsed.topic, list);
      }
    }
  }
  return out;
}

// ── Proveedor: metas ────────────────────────────────────────────────────

const MAX_GOALS = 8;
const MAX_ITEMS_PER_GOAL = 5;

function topicLinkBriefs(ctx: BriefContext, item: GoalItem): GoalTopicBrief[] {
  const tp = ctx.goals!.topicProgress(item);
  if (!tp) {
    // Sin lookup de temas no hay avance derivado: se listan los enlaces tal cual.
    return item.topic_links.flatMap((raw: string) => {
      const p = parseTopicLink(raw);
      return p
        ? [{ folder: p.topic, title: p.topic.split("/").pop() ?? p.topic, skills: p.skills, pct: null, done: false, broken: false, missing: [] }]
        : [];
    });
  }
  return tp.links.map((l) => ({
    folder: l.topic,
    title: l.title,
    skills: l.skills,
    pct: l.pct,
    done: l.done,
    broken: l.broken,
    missing: tp.missing.filter((m) => m.topic === l.topic).map((m) => (m.skill === "*" ? (m.reason === "broken" ? "enlace roto" : "sin skills") : m.skill)),
  }));
}

export const goalsProvider: BriefProvider = {
  id: "goals",
  collect(ctx) {
    if (!ctx.goals) return null;
    const goals: GoalBrief[] = [];
    for (const goal of ctx.goals.goals(FILTER_ACTIVE)) {
      const daysLeft = daysUntil(goal.end, ctx.today);
      const overdue = daysLeft !== null && daysLeft < 0;
      const progressPct = pct(ctx.goals.progress(goal, ctx.today));
      const why: string[] = [];
      if (overdue) why.push(`plazo vencido hace ${-daysLeft!} d`);
      else if (daysLeft !== null && daysLeft <= 14) why.push(`vence ${dueText(daysLeft)}`);
      if (goal.priority >= 3) why.push("prioridad alta");
      if (goal.start && goal.end && !overdue) {
        const total = daysBetween(goal.start, goal.end);
        const elapsed = daysBetween(goal.start, ctx.today);
        if (total > 0 && elapsed > 0) {
          const planned = Math.min(100, Math.round((elapsed / total) * 100));
          if (progressPct + 15 < planned) why.push(`atrasada: ${progressPct}% de avance con ${planned}% del plazo gastado`);
        }
      }

      const open = ctx.goals
        .items(goal.id)
        .filter((i) => i.is_leaf && i.status !== ITEM_DONE && !i.repeating)
        .map((i) => {
          const itemDays = daysUntil(i.due, ctx.today);
          const topics = i.topic_links.length ? topicLinkBriefs(ctx, i) : [];
          const itemWhy: string[] = [];
          if (itemDays !== null && itemDays <= 14) itemWhy.push(`vence ${dueText(itemDays)}`);
          const broken = topics.filter((t) => t.broken);
          if (broken.length) itemWhy.push(`${plural(broken.length, "enlace roto", "enlaces rotos")}`);
          return {
            id: i.id,
            name: i.name,
            status: i.status,
            due: isoOrNull(i.due),
            daysLeft: itemDays,
            priority: i.priority,
            progressPct: pct(ctx.goals!.itemProgress(i, goal, ctx.today)),
            topics,
            why: itemWhy,
          } satisfies GoalItemBrief;
        })
        .sort(
          (a, b) =>
            (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) ||
            Number(b.topics.length > 0) - Number(a.topics.length > 0) ||
            b.priority - a.priority ||
            a.name.localeCompare(b.name),
        );

      goals.push({
        id: goal.id,
        name: goal.name,
        area: goal.area,
        priority: goal.priority,
        deadline: isoOrNull(goal.end),
        daysLeft,
        overdue,
        progressPct,
        items: open.slice(0, MAX_ITEMS_PER_GOAL),
        moreItems: Math.max(0, open.length - MAX_ITEMS_PER_GOAL),
        why,
      });
    }
    goals.sort(
      (a, b) =>
        urgency(b.daysLeft, b.overdue) - urgency(a.daysLeft, a.overdue) ||
        b.priority - a.priority ||
        a.name.localeCompare(b.name),
    );
    const shown = goals.slice(0, MAX_GOALS);

    const lines: BriefLine[] = [];
    for (const g of shown) {
      const gw = Math.max(urgency(g.daysLeft, g.overdue), g.priority * 15);
      lines.push({
        text: `Meta "${clip(g.name, 50)}" P${g.priority} avance ${g.progressPct}% ${g.deadline ? `plazo ${g.deadline} (${dueText(g.daysLeft)})` : "sin plazo"}${g.why.length ? ` — ${g.why.join("; ")}` : ""}`,
        weight: gw,
      });
      for (const it of g.items) {
        const topicText = it.topics
          .map((t) => `tema ${clip(t.title, 30)}${t.pct === null ? "" : ` ${t.pct}%`}${t.missing.length ? ` (faltan: ${t.missing.slice(0, 4).join(", ")})` : t.done ? " (cumplido)" : ""}`)
          .join("; ");
        lines.push({
          text: `  - "${clip(it.name, 50)}" ${it.progressPct}%${it.due ? ` ${dueText(it.daysLeft)}` : ""}${topicText ? ` · ${topicText}` : ""}`,
          weight: Math.max(10, gw - 15 + (it.topics.length ? 5 : 0)),
        });
      }
      if (g.moreItems) lines.push({ text: `  (+${g.moreItems} submetas abiertas)`, weight: 5 });
    }

    const soon = goals.filter((g) => g.overdue || (g.daysLeft !== null && g.daysLeft <= 14));
    const signals: string[] = [];
    if (soon.length) signals.push(`${plural(soon.length, "meta vence", "metas vencen")} en <=14 d o ya vencidas`);
    const broken = shown.reduce((n, g) => n + g.items.reduce((m, i) => m + i.topics.filter((t) => t.broken).length, 0), 0);
    if (broken) signals.push(`${plural(broken, "enlace a tema roto", "enlaces a temas rotos")}`);

    return {
      id: "goals",
      title: "Metas activas",
      priority: 2,
      summary: goals.length ? `${plural(goals.length, "meta activa", "metas activas")}${soon.length ? `, ${soon.length} con plazo cercano` : ""}` : "Sin metas activas",
      signals,
      lines,
      data: { goals: shown } satisfies GoalsData,
    };
  },
};

// ── Proveedor: temas ────────────────────────────────────────────────────

const MAX_TOPICS = 14;
const MAX_UNTREATED_EXTRA = 4;
const RECENT_TOPIC_DAYS = 21;

function topicBrief(t: TopicSnap, ctx: BriefContext, links: GoalLinkCollected[]): TopicBrief {
  const skills = Object.entries(t.progress.skills);
  const weak: string[] = [];
  const notStarted: string[] = [];
  const practicing: string[] = [];
  let mastered = 0;
  for (const [id, s] of skills) {
    if (s.mastered) mastered += 1;
    else if (s.totalAttempts === 0 || s.status === "not_started") notStarted.push(id);
    else if ((s.bestScore ?? 0) < WEAK_SCORE) weak.push(id);
    else practicing.push(id);
  }
  const lastDays = t.lastAttemptAt ? (() => { const d = parseDay(t.lastAttemptAt); return d ? daysBetween(d, ctx.today) : null; })() : null;
  const untreated = t.attemptCount === 0 && (t.exerciseCount > 0 || t.theoryNotes > 0);
  const completePct = Math.round(t.progress.completenessPct);
  const status: TopicStatus = untreated || t.attemptCount === 0 ? "untreated" : completePct >= 100 ? "complete" : "in_progress";
  const examMode = t.progress.topic.mastery.exam;
  const exam: TopicBrief["exam"] =
    examMode === "required" ? (t.progress.examPassed ? "required_passed" : "required_pending") : examMode === "optional" ? "optional" : "none";

  const why: string[] = [];
  if (status === "untreated") why.push("sin tratar: hay material pero 0 intentos, no se asume dominio");
  if (weak.length) why.push(`skills débiles: ${weak.slice(0, 4).join(", ")}`);
  if (status === "in_progress" && lastDays !== null && lastDays >= 7) why.push(`parado hace ${lastDays} d`);
  if (exam === "required_pending" && completePct >= 80) why.push("listo para el examen");
  const goalLinks = links.map((l) => l.link);
  const tight = goalLinks.filter((l) => l.overdue || (l.daysLeft !== null && l.daysLeft <= 14));
  if (tight.length) why.push(`lo pide la meta "${clip(tight[0]!.goalName, 40)}" (${dueText(tight[0]!.daysLeft)})`);

  return {
    folder: t.folder,
    subject: t.subject,
    title: t.title,
    status,
    completenessPct: completePct,
    weakSkills: weak,
    notStartedSkills: notStarted,
    practicingSkills: practicing,
    masteredSkills: mastered,
    totalSkills: skills.length,
    exam,
    examScore: t.progress.examScore,
    attempts: t.attemptCount,
    exercises: t.exerciseCount,
    theoryNotes: t.theoryNotes,
    lastAttemptDays: lastDays,
    goalLinks,
    why,
  };
}

export const topicsProvider: BriefProvider = {
  id: "topics",
  collect(ctx) {
    if (!ctx.topics) return null;
    const snaps = ctx.topics();
    const links = collectGoalLinks(ctx);

    const all = snaps.map((t) => topicBrief(t, ctx, links.get(t.folder) ?? []));
    const linked = all.filter((t) => t.goalLinks.length);
    const active = all.filter(
      (t) => !t.goalLinks.length && t.status !== "untreated" && (t.status === "in_progress" || (t.lastAttemptDays !== null && t.lastAttemptDays <= RECENT_TOPIC_DAYS)),
    );
    const untreated = all
      .filter((t) => !t.goalLinks.length && t.status === "untreated" && t.exercises + t.theoryNotes > 0)
      .sort((a, b) => b.exercises - a.exercises || a.folder.localeCompare(b.folder))
      .slice(0, MAX_UNTREATED_EXTRA);

    const rank = (t: TopicBrief) => (t.goalLinks.length ? 0 : t.status === "in_progress" ? 1 : t.status === "untreated" ? 2 : 3);
    const topics = [...linked, ...active, ...untreated]
      .sort((a, b) => rank(a) - rank(b) || (a.lastAttemptDays ?? 9999) - (b.lastAttemptDays ?? 9999) || a.folder.localeCompare(b.folder))
      .slice(0, MAX_TOPICS);

    const lines: BriefLine[] = topics.map((t) => {
      const parts = [`${clip(t.title, 40)} [${t.subject}] ${t.completenessPct}%`];
      if (t.status === "untreated") parts.push("SIN TRATAR");
      if (t.weakSkills.length) parts.push(`débiles: ${t.weakSkills.slice(0, 4).join(", ")}`);
      if (t.notStartedSkills.length) parts.push(`sin iniciar: ${t.notStartedSkills.slice(0, 4).join(", ")}`);
      if (t.exam === "required_pending") parts.push("examen pendiente");
      else if (t.exam === "required_passed") parts.push(`examen aprobado${t.examScore !== null ? ` (${t.examScore})` : ""}`);
      if (t.lastAttemptDays !== null) parts.push(`último intento hace ${t.lastAttemptDays} d`);
      const weight = (t.goalLinks.length ? 70 : 40) + Math.min(20, t.weakSkills.length * 5) + (t.status === "in_progress" ? 10 : 0);
      return { text: parts.join(" · "), weight: Math.min(100, weight) };
    });

    const signals: string[] = [];
    const nUntreated = all.filter((t) => t.status === "untreated").length;
    if (nUntreated) signals.push(`${plural(nUntreated, "tema sin tratar", "temas sin tratar")} (material sin ningún intento)`);
    const stalled = topics.filter((t) => t.status === "in_progress" && t.lastAttemptDays !== null && t.lastAttemptDays >= 7);
    if (stalled.length) signals.push(`${plural(stalled.length, "tema a medias parado", "temas a medias parados")} >=7 d`);

    return {
      id: "topics",
      title: "Temas de estudio",
      priority: 3,
      summary: `${all.length} temas: ${all.filter((t) => t.status === "in_progress").length} a medias, ${nUntreated} sin tratar, ${all.filter((t) => t.status === "complete").length} completos`,
      signals,
      lines,
      data: { topics } satisfies TopicsData,
    };
  },
};

// ── Proveedor: pendientes de estudio (repasos SRS + errores + cola) ─────

const MAX_REPEATERS = 6;
const MAX_QUEUE = 6;

export const studyPendingProvider: BriefProvider = {
  id: "study_pending",
  collect(ctx) {
    if (!ctx.srs && !ctx.errors && !ctx.queue) return null;

    const bySubjectSrs = new Map<string, SrsSubjectBrief>();
    let dueTotal = 0;
    for (const it of ctx.srs?.dueItems(ctx.today) ?? []) {
      dueTotal += 1;
      const subject = it.subject || "general";
      const nextReview = parseDay(it.next_review);
      const late = nextReview ? Math.max(0, daysBetween(nextReview, ctx.today)) : 0;
      const cur = bySubjectSrs.get(subject) ?? { subject, count: 0, oldestOverdueDays: 0, lapses: 0 };
      cur.count += 1;
      cur.oldestOverdueDays = Math.max(cur.oldestOverdueDays, late);
      cur.lapses += it.lapses;
      bySubjectSrs.set(subject, cur);
    }
    const srsSubjects = [...bySubjectSrs.values()].sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));

    const unresolved = ctx.errors?.errors(null, null, true) ?? [];
    const errBySubject: Record<string, number> = {};
    for (const e of unresolved) errBySubject[e.subject || "general"] = (errBySubject[e.subject || "general"] ?? 0) + 1;
    const repeaters: ErrorBrief[] = unresolved
      .filter((e) => e.repeat_count >= REPEAT_MIN)
      .sort((a, b) => b.repeat_count - a.repeat_count || (b.last_seen || b.occurred_at || "").localeCompare(a.last_seen || a.occurred_at || ""))
      .slice(0, MAX_REPEATERS)
      .map((e) => {
        const seen = parseDay(e.last_seen || e.occurred_at);
        return {
          id: e.id,
          subject: e.subject || "general",
          topic: e.topic,
          skill: e.skill || e.mode || "",
          category: e.category,
          repeatCount: e.repeat_count,
          lastSeenDays: seen ? daysBetween(seen, ctx.today) : null,
        };
      });

    let queue: QueueHint[] = [];
    try {
      queue = (ctx.queue?.() ?? []).slice(0, MAX_QUEUE);
    } catch {
      queue = [];
    }

    const lines: BriefLine[] = [];
    for (const s of srsSubjects) {
      lines.push({
        text: `Repasos vencidos ${s.subject}: ${s.count}${s.oldestOverdueDays ? `, el más viejo con ${s.oldestOverdueDays} d de retraso` : ""}${s.lapses ? `, ${s.lapses} fallos acumulados` : ""}`,
        weight: Math.min(100, 60 + s.oldestOverdueDays + s.count),
      });
    }
    for (const r of repeaters) {
      lines.push({
        text: `Error reincidente (${r.repeatCount}x) ${r.subject}/${clip(r.topic, 30)}${r.skill ? ` skill ${r.skill}` : ""} [${r.category}]${r.lastSeenDays !== null ? ` visto hace ${r.lastSeenDays} d` : ""}`,
        weight: Math.min(100, 70 + r.repeatCount * 5),
      });
    }
    const others = unresolved.length - repeaters.length;
    if (others > 0) lines.push({ text: `Otros errores sin resolver: ${others}`, weight: 30 });
    for (const q of queue) {
      lines.push({ text: `Recomendador: ${q.kind} ${q.subject} — ${clip(q.title, 40)}${q.reason ? ` (${clip(q.reason, 50)})` : ""}`, weight: 35 });
    }

    const signals: string[] = [];
    if (dueTotal) signals.push(`${plural(dueTotal, "repaso vencido", "repasos vencidos")}`);
    if (repeaters.length) signals.push(`${plural(repeaters.length, "error reincidente", "errores reincidentes")} sin resolver`);

    return {
      id: "study_pending",
      title: "Repasos y errores pendientes",
      priority: 1,
      summary: `${dueTotal} repasos vencidos, ${unresolved.length} errores sin resolver (${repeaters.length} reincidentes)`,
      signals,
      lines,
      data: {
        srs: { dueTotal, bySubject: srsSubjects },
        errors: { unresolved: unresolved.length, bySubject: errBySubject, repeaters },
        queue,
      } satisfies StudyPendingData,
    };
  },
};

// ── Proveedor: tareas y proyectos ───────────────────────────────────────

const MAX_TASKS = 10;
const MAX_PROJECTS = 6;
const MAX_ISSUES_PER_PROJECT = 3;

export const tasksProvider: BriefProvider = {
  id: "tasks",
  collect(ctx) {
    if (!ctx.tasks && !ctx.projects) return null;

    const allPending: TaskBrief[] = (ctx.tasks?.tasks() ?? [])
      .filter((t) => t.status !== TASK_DONE)
      .map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject || "",
        due: isoOrNull(t.due),
        daysLeft: daysUntil(t.due, ctx.today),
        priority: t.priority,
        status: t.status,
      }));
    const overdue = allPending.filter((t) => t.daysLeft !== null && t.daysLeft < 0).length;
    const relevant = allPending
      .filter((t) => (t.daysLeft !== null ? t.daysLeft <= DUE_HORIZON_DAYS : t.priority >= 3))
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || b.priority - a.priority || a.name.localeCompare(b.name))
      .slice(0, MAX_TASKS);

    const subjMap = new Map<string, { subject: string; count: number; overdue: number }>();
    for (const t of allPending) {
      const key = t.subject || "(sin materia)";
      const cur = subjMap.get(key) ?? { subject: key, count: 0, overdue: 0 };
      cur.count += 1;
      if (t.daysLeft !== null && t.daysLeft < 0) cur.overdue += 1;
      subjMap.set(key, cur);
    }
    const bySubject = [...subjMap.values()].sort((a, b) => b.overdue - a.overdue || b.count - a.count || a.subject.localeCompare(b.subject));

    const projects: ProjectBrief[] = [];
    if (ctx.projects) {
      for (const p of ctx.projects.projects().filter((x) => x.status === P_ACTIVE)) {
        const open = ctx.projects.issues(p.id).filter((i) => !i.is_done);
        const dueSoon = open
          .filter((i) => i.due && daysBetween(ctx.today, i.due) <= DUE_HORIZON_DAYS)
          .sort((a, b) => a.due!.getTime() - b.due!.getTime() || b.priority - a.priority)
          .slice(0, MAX_ISSUES_PER_PROJECT)
          .map((i) => ({
            id: i.id,
            title: i.title,
            due: isoOrNull(i.due),
            daysLeft: daysUntil(i.due, ctx.today),
            priority: i.priority,
            estimateMin: i.estimate_min,
          }));
        projects.push({
          id: p.id,
          name: p.name,
          area: p.area,
          deadline: isoOrNull(p.deadline),
          daysLeft: daysUntil(p.deadline, ctx.today),
          progressPct: pct(ctx.projects.progress(p)),
          openIssues: open.length,
          dueSoon,
        });
      }
      projects.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name));
    }
    const shownProjects = projects.slice(0, MAX_PROJECTS);

    const lines: BriefLine[] = relevant.map((t) => ({
      text: `Tarea "${clip(t.name, 50)}"${t.subject ? ` [${t.subject}]` : ""} P${t.priority} ${dueText(t.daysLeft)}`,
      weight: Math.min(100, urgency(t.daysLeft) + t.priority * 3),
    }));
    for (const p of shownProjects) {
      lines.push({
        text: `Proyecto "${clip(p.name, 40)}" avance ${p.progressPct}%, ${plural(p.openIssues, "issue abierto", "issues abiertos")}${p.deadline ? `, plazo ${p.deadline} (${dueText(p.daysLeft)})` : ""}`,
        weight: Math.max(20, urgency(p.daysLeft) - 10),
      });
      for (const i of p.dueSoon) {
        lines.push({ text: `  - "${clip(i.title, 50)}" ${dueText(i.daysLeft)}${i.estimateMin ? ` (~${i.estimateMin} min)` : ""}`, weight: Math.min(100, urgency(i.daysLeft) - 5) });
      }
    }

    const signals: string[] = [];
    if (overdue) signals.push(`${plural(overdue, "tarea vencida", "tareas vencidas")}`);
    const soon = allPending.filter((t) => t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 3).length;
    if (soon) signals.push(`${plural(soon, "tarea vence", "tareas vencen")} en <=3 d`);

    return {
      id: "tasks",
      title: "Tareas y proyectos",
      priority: 4,
      summary: `${plural(allPending.length, "tarea pendiente", "tareas pendientes")} (${overdue} vencidas), ${plural(projects.length, "proyecto activo", "proyectos activos")}`,
      signals,
      lines,
      data: { tasks: relevant, projects: shownProjects, overdue, bySubject } satisfies TasksData,
    };
  },
};

// ── Proveedor: hábitos de estudio (a partir del registro de sesiones) ───

export const habitsActivityProvider: BriefProvider = {
  id: "habits_activity",
  collect(ctx) {
    const sessions = ctx.sessions?.() ?? [];
    const adh = adherence(sessions);
    const skippedKinds = Object.entries(adh.byKind)
      .filter(([, c]) => c.done + c.partial + c.skipped >= 2 && c.pct !== null && c.pct <= 50)
      .map(([kind, c]) => ({ kind, pct: c.pct! }))
      .sort((a, b) => a.pct - b.pct || a.kind.localeCompare(b.kind));
    const data: HabitsActivityData = {
      sessions: sessions.length,
      adherencePct: adh.overall.pct,
      typicalSessionMinutes: adh.typicalSessionMinutes,
      skippedSubjects: adh.skippedSubjects,
      skippedKinds,
      lastSessionDate: sessions[0]?.date ?? null,
    };

    if (!sessions.length) {
      return { id: "habits_activity", title: "Hábitos de estudio", priority: 5, summary: "Sin sesiones registradas aún", signals: [], lines: [], data };
    }

    const lines: BriefLine[] = [];
    lines.push({
      text: `Últimas ${plural(sessions.length, "sesión", "sesiones")}: cumplimiento ${adh.overall.pct === null ? "s/d" : adh.overall.pct + "%"}${adh.typicalSessionMinutes !== null ? `, sesión típica ~${adh.typicalSessionMinutes} min reales` : ""}`,
      weight: 70,
    });
    if (adh.skippedSubjects.length) lines.push({ text: `Se salta: ${adh.skippedSubjects.join(", ")}`, weight: 90 });
    if (skippedKinds.length) lines.push({ text: `Tipos que suele saltarse: ${skippedKinds.map((k) => `${k.kind} (${k.pct}%)`).join(", ")}`, weight: 60 });

    const signals: string[] = [];
    if (adh.skippedSubjects.length) signals.push(`salta ${adh.skippedSubjects.join(", ")}`);
    if (adh.overall.pct !== null && adh.overall.pct < 50) signals.push(`cumplimiento bajo (${adh.overall.pct}%): conviene un plan corto`);

    return {
      id: "habits_activity",
      title: "Hábitos de estudio",
      priority: 5,
      summary: `${plural(sessions.length, "sesión registrada", "sesiones registradas")}, cumplimiento ${adh.overall.pct === null ? "s/d" : adh.overall.pct + "%"}`,
      signals,
      lines,
      data,
    };
  },
};

// ── Registro de proveedores ─────────────────────────────────────────────

const registry: BriefProvider[] = [studyPendingProvider, goalsProvider, topicsProvider, tasksProvider, habitsActivityProvider];

/** Añade (o sustituye por id) un proveedor: así se enchufan hábitos/finanzas sin tocar el resto. */
export function registerBriefProvider(provider: BriefProvider): void {
  const i = registry.findIndex((p) => p.id === provider.id);
  if (i >= 0) registry[i] = provider;
  else registry.push(provider);
}

export function unregisterBriefProvider(id: string): void {
  const i = registry.findIndex((p) => p.id === id);
  if (i >= 0) registry.splice(i, 1);
}

export function briefProviders(): BriefProvider[] {
  return [...registry];
}

export function buildStudentBrief(ctx: BriefContext, opts: BriefOptions = {}): StudentBrief {
  const today = midnight(ctx.today);
  const c: BriefContext = { ...ctx, today };
  const sections: BriefSection[] = [];
  const skipped: string[] = [];
  for (const p of opts.providers ?? registry) {
    if (opts.only && !opts.only.includes(p.id)) continue;
    if (opts.exclude?.includes(p.id)) continue;
    try {
      const s = p.collect(c);
      if (s) sections.push(s);
    } catch {
      skipped.push(p.id);
    }
  }
  sections.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { version: 1, date: formatIsoDate(today), weekday: WEEKDAYS[today.getDay()]!, sections, skipped };
}

// ── Texto para el LLM ───────────────────────────────────────────────────

/**
 * Renderiza el informe en texto compacto de a lo sumo `maxChars` caracteres.
 *
 * Recorte por prioridad: primero se garantiza el esqueleto (cabecera + título/resumen de
 * cada sección; si ni así cabe, caen las secciones menos prioritarias); luego se añaden
 * líneas por (prioridad de sección, peso de la línea) hasta llenar el presupuesto, y lo
 * que no cabe se omite y se indica. El orden final del texto es el del informe.
 */
export function toPromptText(brief: StudentBrief, maxChars = 6000): string {
  const header = `INFORME DEL ESTUDIANTE ${brief.date} (${brief.weekday})`;
  const sectionHead = (s: BriefSection) => `## ${s.title}: ${s.summary}`;

  // Esqueleto: se quitan secciones desde la menos prioritaria hasta que quepa.
  let kept = [...brief.sections];
  const skeletonLen = (list: BriefSection[]) => header.length + list.reduce((n, s) => n + sectionHead(s).length + 1, 0) + 1;
  while (kept.length > 1 && skeletonLen(kept) > maxChars) kept.pop();
  const dropped = brief.sections.length - kept.length;

  interface Cand {
    s: number;
    order: number;
    text: string;
    weight: number;
  }
  const cands: Cand[] = [];
  kept.forEach((s, si) => {
    let order = 0;
    for (const sig of s.signals) cands.push({ s: si, order: order++, text: `! ${sig}`, weight: 95 });
    for (const l of s.lines) cands.push({ s: si, order: order++, text: l.text, weight: l.weight });
  });

  const byPriority = [...cands].sort(
    (a, b) => kept[a.s]!.priority - kept[b.s]!.priority || b.weight - a.weight || a.s - b.s || a.order - b.order,
  );
  const picked = new Set<Cand>();
  let used = skeletonLen(kept) + (dropped ? 40 : 0);
  for (const c of byPriority) {
    const cost = c.text.length + 1;
    if (used + cost > maxChars) continue;
    picked.add(c);
    used += cost;
  }

  const render = (): string => {
    const out: string[] = [header];
    kept.forEach((s, si) => {
      out.push(sectionHead(s));
      const mine = cands.filter((c) => c.s === si);
      for (const c of mine) if (picked.has(c)) out.push(c.text);
      const omitted = mine.filter((c) => !picked.has(c)).length;
      if (omitted) out.push(`(+${omitted} omitidas)`);
    });
    if (dropped) out.push(`(+${dropped} secciones omitidas por espacio)`);
    return out.join("\n");
  };
  // Las marcas de omisión también ocupan: si ahora se pasa, se suelta lo menos prioritario.
  let text = render();
  for (let i = byPriority.length - 1; i >= 0 && text.length > maxChars; i--) {
    if (picked.delete(byPriority[i]!)) text = render();
  }
  return text.length > maxChars ? text.slice(0, Math.max(0, maxChars - 1)) + "…" : text;
}
