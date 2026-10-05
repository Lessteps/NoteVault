/**
 * Objetivo de la sesión de "Hoy": qué quiere lograr el estudiante en esta sesión.
 *
 * Es determinista: un objetivo da un empuje fuerte a los candidatos que lo cumplen y relega (sin
 * eliminarlos) a los demás, de modo que si no hay suficientes siguen apareciendo. El texto del objetivo
 * además viaja a la IA (planner.ts). Todo puro.
 */

import { sectionData, type GoalsData, type StudentBrief, type TopicsData } from "./brief.js";
import type { Candidate } from "./candidates.js";
import { fold, keywordsOf } from "./goalDraft.js";

export type SessionObjective =
  | { type: "none" }
  /** terminar todas las tareas / issues pendientes */
  | { type: "tasks" }
  /** repasar lo vencido (SRS y errores) */
  | { type: "review" }
  /** lo que el plan del mes dice que toca ahora */
  | { type: "plan" }
  | { type: "subject"; subject: string; label?: string }
  | { type: "goal"; goalId: string; itemIds?: string[]; label?: string }
  /** texto libre del estudiante; se intenta casar con una meta o materia por palabras clave */
  | { type: "custom"; text: string };

/** Nombre en español de las materias que conoce el sistema de estudio. */
export const SUBJECT_LABEL: Record<string, string> = {
  programming: "Programación",
  mathematics: "Matemáticas",
  english: "Inglés",
};

export const subjectLabel = (subject: string): string => SUBJECT_LABEL[subject] ?? subject;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valida un objetivo recibido de la UI; null si no es utilizable. */
export function sanitizeObjective(raw: unknown): SessionObjective | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "none":
    case "tasks":
    case "review":
    case "plan":
      return { type: o.type };
    case "subject": {
      const subject = str(o.subject, 80);
      return subject ? { type: "subject", subject, ...(str(o.label, 80) ? { label: str(o.label, 80) } : {}) } : null;
    }
    case "goal": {
      const goalId = str(o.goalId, 80);
      if (!goalId) return null;
      const itemIds = Array.isArray(o.itemIds) ? o.itemIds.map((x) => str(x, 80)).filter(Boolean).slice(0, 60) : [];
      return { type: "goal", goalId, ...(itemIds.length ? { itemIds } : {}), ...(str(o.label, 120) ? { label: str(o.label, 120) } : {}) };
    }
    case "custom": {
      const text = str(o.text, 200);
      return text ? { type: "custom", text } : null;
    }
    default:
      return null;
  }
}

/** Texto del objetivo para la IA y para el registro de la sesión; "" si no hay objetivo. */
export function objectiveText(o: SessionObjective | undefined | null, brief?: StudentBrief): string {
  if (!o) return "";
  switch (o.type) {
    case "none":
      return "";
    case "tasks":
      return "Terminar todas mis tareas pendientes";
    case "review":
      return "Repasar lo vencido (SRS y errores)";
    case "plan":
      return "Avanzar lo que toca del plan del mes";
    case "subject":
      return `Estudiar ${o.label || subjectLabel(o.subject)}`;
    case "goal": {
      const name = o.label || brief && sectionData<GoalsData>(brief, "goals")?.goals.find((g) => g.id === o.goalId)?.name || "";
      return name ? `Meta: ${name}` : "Cumplir una meta";
    }
    case "custom":
      return o.text;
  }
}

function subjectsOf(brief: StudentBrief): string[] {
  return [...new Set((sectionData<TopicsData>(brief, "topics")?.topics ?? []).map((t) => t.subject).filter(Boolean))];
}

/**
 * Un objetivo libre se casa por palabras clave con una meta (por su nombre) o una materia; si no encaja
 * con ninguna se queda como texto libre (solo influye en la IA y en candidatos que mencionen las palabras).
 */
export function resolveObjective(o: SessionObjective, brief: StudentBrief): SessionObjective {
  if (o.type !== "custom") return o;
  const kws = keywordsOf(o.text);
  if (!kws.length) return o;
  const need = Math.ceil(kws.length / 2);
  let bestGoal: { id: string; name: string; score: number } | null = null;
  for (const g of sectionData<GoalsData>(brief, "goals")?.goals ?? []) {
    const name = fold(g.name);
    const score = kws.filter((k) => name.includes(k)).length;
    if (score >= need && (!bestGoal || score > bestGoal.score)) bestGoal = { id: g.id, name: g.name, score };
  }
  if (bestGoal) return { type: "goal", goalId: bestGoal.id, label: bestGoal.name };
  for (const s of subjectsOf(brief)) {
    const names = [fold(s), fold(subjectLabel(s))];
    if (kws.some((k) => names.some((n) => n === k || (k.length >= 4 && n.startsWith(k.slice(0, Math.max(4, k.length - 1))))))) {
      return { type: "subject", subject: s, label: subjectLabel(s) };
    }
  }
  return o;
}

/** Predicado "este candidato cumple el objetivo"; null si el objetivo no filtra nada. */
export function objectiveMatcher(o: SessionObjective, brief: StudentBrief): ((c: Candidate) => boolean) | null {
  const r = resolveObjective(o, brief);
  switch (r.type) {
    case "none":
      return null;
    case "tasks":
      return (c) => c.kind === "task_deadline";
    case "review":
      return (c) => c.kind === "srs_review" || c.kind === "error_fix";
    case "plan":
      return (c) => c.kind === "plan_item";
    case "subject": {
      const key = fold(r.subject);
      return (c) => fold(c.subject) === key;
    }
    case "goal": {
      const g = sectionData<GoalsData>(brief, "goals")?.goals.find((x) => x.id === r.goalId);
      const items = g?.items.filter((i) => !r.itemIds?.length || r.itemIds.includes(i.id)) ?? [];
      const folders = new Set(items.flatMap((i) => i.topics.map((t) => t.folder)));
      const itemIds = r.itemIds?.length ? new Set(r.itemIds) : null;
      return (c) =>
        (c.links.goalId === r.goalId && (!itemIds || !c.links.itemId || itemIds.has(c.links.itemId))) ||
        c.id.startsWith(`goal:${r.goalId}:`) ||
        (!!c.topicFolder && folders.has(c.topicFolder));
    }
    case "custom": {
      const kws = keywordsOf(r.text);
      if (!kws.length) return null;
      return (c) => {
        const hay = fold([c.subject, c.topicFolder ?? "", c.reasons.join(" ")].join(" "));
        return kws.some((k) => hay.includes(k));
      };
    }
  }
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

/** Empuje fuerte a lo que cumple el objetivo y relega (sin quitar) al resto. */
export function applyObjective(candidates: readonly Candidate[], o: SessionObjective | undefined, brief: StudentBrief): Candidate[] {
  if (!o) return [...candidates];
  const match = objectiveMatcher(o, brief);
  if (!match) return [...candidates];
  const label = objectiveText(resolveObjective(o, brief), brief) || objectiveText(o, brief);
  return candidates.map((c) =>
    match(c)
      ? { ...c, score: clamp100(Math.max(c.score, 55) + 35), reasons: [`cumple el objetivo de la sesión (${label})`, ...c.reasons] }
      : { ...c, score: clamp100(c.score * 0.55) },
  );
}
