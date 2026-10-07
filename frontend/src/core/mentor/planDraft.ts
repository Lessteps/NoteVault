/**
 * El Mentor propone el PLAN DEL MES con el estudiante (tercer tipo de respuesta de la conversación,
 * junto a `question` y `goal_draft`): la IA ELIGE y RAZONA; la app VALIDA y CALCULA.
 *
 * - Los temas salen SOLO del catálogo real (carpetas existentes; las inventadas se descartan y se avisa).
 * - Las metas requeridas SOLO de las existentes; un proyecto solo si existe (si no, el entregable queda
 *   como propuesta: nunca se crean proyectos automáticamente).
 * - El reparto semanal lo calcula `plan.ts`. Escribir el plan solo ocurre al aceptar (api/modules/mentor.ts).
 */

import type { ChatMessage } from "../aiClient.js";
import type { StudentBrief } from "./brief.js";
import {
  buildGoalMessages,
  parseGoalResponse,
  type CatalogTopic,
  type ChatTurn,
  type GoalParse,
  type GoalPromptExtras,
  type QuestionReply,
  type GoalDraftReply,
} from "./goalDraft.js";
import type { PlanPreconditions } from "../../lib/planTime.js";
import { PRACTICE_FOCUSES, type PracticeFocus, type PracticeSuggestions, type PracticeTrack } from "../../lib/practiceTrack.js";
import { buildPlan, MONTH_RE, type MonthlyPlan, type OpenQuestion, type RequiredGoal, type SubplanSeed, type Subplan } from "./plan.js";

// ── Contexto real: metas y proyectos existentes ──────────────────────────

export interface PlanGoalRef {
  id: string;
  name: string;
  items: Array<{ id: string; name: string }>;
}
export interface PlanProjectRef {
  id: string;
  name: string;
}
export interface PlanContext {
  /** AAAA-MM del plan */
  month: string;
  /** hoy, AAAA-MM-DD (el reparto empieza ahí si es el mes en curso) */
  today: string;
  goals: PlanGoalRef[];
  projects: PlanProjectRef[];
}

// ── Prompt ───────────────────────────────────────────────────────────────

export const PLAN_PROMPT_ADDENDUM = [
  "TAMBIÉN puedes proponer el PLAN cuando el estudiante lo pida: un plan por ÁREAS ELEMENTALES (Backend, Frontend, Databases, Automation, Tooling and Quality…).",
  "Un subplan = un área elemental con un objetivo corto (una línea), los temas del catálogo que hay que estudiar, las metas existentes que necesita cumplir y, solo si se pide, un ENTREGABLE (proyecto para demostrar el objetivo). La app agrupa los temas por área (Bases, Lenguaje, Conocimientos) y secuencia las áreas por fases: tú solo eliges y ordenas temas.",
  "Reglas del plan_draft:",
  "- Si no sabes las HORAS POR SEMANA, qué METAS priorizar o qué áreas quiere cubrir, PREGUNTA (type question).",
  "- Temas: SOLO `folder` exactos del catálogo. Metas (`goalId`, `itemId`): SOLO las de la lista METAS EXISTENTES. `projectId`: SOLO uno de PROYECTOS EXISTENTES si encaja; si no, omítelo (el entregable queda como propuesta; no se crean proyectos).",
  "- Cada entregable lleva `title`, `description` (una frase) y `criteria` (2-4 criterios comprobables).",
  "- No incluyas fechas ni minutos: la app reparte los temas por semanas. Ordena los temas de lo básico a lo avanzado.",
  "- Entregables: incluye `deliverable` SOLO si las precondiciones dicen que sí; si dicen «a discutir» o «no», no lo incluyas (la app pregunta después).",
  "- Programming practice: SOLO si las precondiciones la incluyen puedes añadir `programmingPractice` con un `theme` corto por semana (y un `focus` solo si el foco rota). No cambies minutos ni fases: los fija la app.",
  'Esquema: { "type": "plan_draft", "month"?: "AAAA-MM", "rationale": string, "hoursPerWeek": number, "subplans": [ { "area": string, "objective": string, "goalId"?: string, "topics": [ { "folder": string, "skills"?: string[], "why"?: string } ], "requiredGoals"?: [ { "goalId": string, "itemId"?: string, "note"?: string } ], "deliverable"?: { "title": string, "description": string, "criteria": string[], "projectId"?: string } } ], "programmingPractice"?: { "weeks": [ { "week": number, "theme": string, "focus"?: "backend"|"databases"|"frontend"|"desktop"|"mobile"|"automation" } ], "monthlyTheme"?: string } }',
].join("\n");

export interface ChatPromptExtras extends GoalPromptExtras {
  plan?: PlanContext;
  /** el estudiante abrió la conversación desde "Generar plan del mes" */
  planMode?: boolean;
}

/** Los mismos mensajes que `buildGoalMessages` más lo necesario para responder con un `plan_draft`. */
export function buildChatMessages(
  request: string,
  brief: StudentBrief,
  catalog: readonly CatalogTopic[],
  history: readonly ChatTurn[] = [],
  extras: ChatPromptExtras = {},
): ChatMessage[] {
  const messages = buildGoalMessages(request, brief, catalog, history, extras);
  const p = extras.plan;
  const extra = [
    PLAN_PROMPT_ADDENDUM,
    p ? `MES DEL PLAN: ${p.month}.` : "",
    extras.planMode ? "El estudiante quiere el PLAN DEL MES: responde con plan_draft (o pregunta lo que falte), no con goal_draft." : "",
    p?.goals.length
      ? `METAS EXISTENTES (para requiredGoals/goalId):\n${p.goals.map((g) => `- goalId=${g.id} | ${g.name}${g.items.length ? ` | submetas: ${g.items.slice(0, 8).map((i) => `${i.id}="${i.name}"`).join("; ")}` : ""}`).join("\n")}`
      : "METAS EXISTENTES: ninguna.",
    p?.projects.length ? `PROYECTOS EXISTENTES (para deliverable.projectId):\n${p.projects.map((x) => `- projectId=${x.id} | ${x.name}`).join("\n")}` : "PROYECTOS EXISTENTES: ninguno (el entregable será solo una propuesta).",
  ]
    .filter(Boolean)
    .join("\n\n");
  messages[0] = { ...messages[0]!, content: `${messages[0]!.content}\n\n${extra}` };
  return messages;
}

// ── Parseo ───────────────────────────────────────────────────────────────

export interface PlanReplySubplan {
  area: string;
  objective: string;
  goalId?: string;
  topics: Array<{ folder: string; skills: string[]; why: string }>;
  requiredGoals: RequiredGoal[];
  deliverable?: { title: string; description: string; criteria: string[]; projectId?: string };
}

export interface PlanDraftReply {
  type: "plan_draft";
  month?: string;
  rationale: string;
  hoursPerWeek: number | null;
  subplans: PlanReplySubplan[];
  /** carpetas / metas / proyectos pedidos por la IA que no existen (no se usan) */
  discarded: string[];
  /** temas (y focos) que la IA sugiere para la pista Programming practice; la app los valida y nunca cambia minutos ni fases */
  practice?: PracticeSuggestions;
}

export type ChatParse = { ok: true; reply: QuestionReply | GoalDraftReply | PlanDraftReply } | { ok: false; error: string; discarded?: string[] };

export function objectsIn(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const tryParse = (raw: string) => {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as Record<string, unknown>);
    } catch {
      /* siguiente candidato */
    }
  };
  for (const m of text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) tryParse(m[1]!.trim());
  tryParse(text.trim());
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j]!;
      if (inStr) {
        if (ch === "\\") j++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        tryParse(text.slice(i, j + 1));
        i = j;
        break;
      }
    }
  }
  return out;
}

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function parsePlanObject(obj: Record<string, unknown>, catalog: readonly CatalogTopic[], ctx: PlanContext): ChatParse {
  const byFolder = new Map(catalog.map((t) => [t.folder, t]));
  const goalById = new Map(ctx.goals.map((g) => [g.id, g]));
  const projectIds = new Set(ctx.projects.map((p) => p.id));
  const discarded: string[] = [];
  const drop = (what: string) => {
    if (what && !discarded.includes(what)) discarded.push(what);
  };

  const subplans: PlanReplySubplan[] = [];
  for (const raw of Array.isArray(obj.subplans) ? obj.subplans : []) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const seen = new Set<string>();
    const topics: PlanReplySubplan["topics"] = [];
    for (const rt of Array.isArray(r.topics) ? r.topics : []) {
      const t = (rt && typeof rt === "object" ? rt : {}) as Record<string, unknown>;
      const folder = typeof t.folder === "string" ? t.folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : "";
      const known = byFolder.get(folder);
      if (!known) {
        drop(folder);
        continue;
      }
      if (seen.has(folder)) continue;
      seen.add(folder);
      const valid = new Set(known.skills);
      const skills = Array.isArray(t.skills) ? [...new Set(t.skills.map((s) => String(s).trim().toLowerCase()).filter((s) => valid.has(s)))] : [];
      topics.push({ folder, skills: skills.length === known.skills.length ? [] : skills, why: oneLine(t.why, 240) });
    }

    const requiredGoals: RequiredGoal[] = [];
    for (const rg of Array.isArray(r.requiredGoals) ? r.requiredGoals : []) {
      const g = (rg && typeof rg === "object" ? rg : {}) as Record<string, unknown>;
      const goalId = typeof g.goalId === "string" ? g.goalId.trim() : "";
      const goal = goalById.get(goalId);
      if (!goal) {
        drop(goalId ? `meta ${goalId}` : "");
        continue;
      }
      const itemId = typeof g.itemId === "string" ? g.itemId.trim() : "";
      const item = goal.items.some((i) => i.id === itemId) ? itemId : "";
      if (itemId && !item) drop(`submeta ${itemId}`);
      requiredGoals.push({ goalId, ...(item ? { itemId: item } : {}), note: oneLine(g.note, 200) });
    }

    let goalId = typeof r.goalId === "string" ? r.goalId.trim() : "";
    if (goalId && !goalById.has(goalId)) {
      drop(`meta ${goalId}`);
      goalId = "";
    }

    let deliverable: PlanReplySubplan["deliverable"];
    const d = r.deliverable && typeof r.deliverable === "object" ? (r.deliverable as Record<string, unknown>) : null;
    if (d && oneLine(d.title, 140)) {
      let projectId = typeof d.projectId === "string" ? d.projectId.trim() : "";
      if (projectId && !projectIds.has(projectId)) {
        drop(`proyecto ${projectId}`);
        projectId = "";
      }
      deliverable = {
        title: oneLine(d.title, 140),
        description: oneLine(d.description, 600),
        criteria: (Array.isArray(d.criteria) ? d.criteria : []).map((c) => oneLine(c, 200)).filter(Boolean).slice(0, 8),
        ...(projectId ? { projectId } : {}),
      };
    }
    if (!topics.length && !deliverable) continue;
    subplans.push({
      area: oneLine(r.area, 80) || "General",
      objective: oneLine(r.objective, 200),
      ...(goalId ? { goalId } : {}),
      topics,
      requiredGoals,
      ...(deliverable ? { deliverable } : {}),
    });
  }

  if (!subplans.length) {
    return { ok: false, error: `La IA no propuso ningún subplan con temas que existan en tu sistema${discarded.length ? ` (descartados: ${discarded.join(", ")})` : ""}.`, discarded };
  }
  const month = typeof obj.month === "string" && MONTH_RE.test(obj.month.trim()) ? obj.month.trim() : undefined;
  const practice = parsePracticeSuggestions(obj.programmingPractice ?? obj.programming_practice);
  return {
    ok: true,
    reply: {
      type: "plan_draft",
      ...(month ? { month } : {}),
      rationale: oneLine(obj.rationale, 600),
      hoursPerWeek: num(obj.hoursPerWeek ?? obj.hours_per_week),
      subplans,
      discarded,
      ...(practice ? { practice } : {}),
    },
  };
}

/** Sugerencias de la IA para la práctica: solo semanas válidas, temas cortos y focos del esquema. */
function parsePracticeSuggestions(raw: unknown): PracticeSuggestions | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const weeks: NonNullable<PracticeSuggestions["weeks"]> = [];
  for (const w of Array.isArray(o.weeks) ? o.weeks : []) {
    const r = (w && typeof w === "object" ? w : {}) as Record<string, unknown>;
    const week = Math.round(Number(r.week));
    if (!Number.isFinite(week) || week < 1 || week > 80 || weeks.some((x) => x.week === week)) continue;
    const theme = oneLine(r.theme, 80);
    const focus = String(r.focus ?? "").trim().toLowerCase();
    weeks.push({ week, ...(theme ? { theme } : {}), ...((PRACTICE_FOCUSES as readonly string[]).includes(focus) ? { focus: focus as PracticeFocus } : {}) });
  }
  const monthlyTheme = oneLine(o.monthlyTheme, 80);
  return weeks.length || monthlyTheme ? { ...(weeks.length ? { weeks } : {}), ...(monthlyTheme ? { monthlyTheme } : {}) } : undefined;
}

/** Respuesta de la IA: `plan_draft` si lo es; si no, lo de siempre (pregunta o `goal_draft`). */
export function parseChatResponse(text: string, catalog: readonly CatalogTopic[], ctx: PlanContext): ChatParse {
  for (const obj of objectsIn(String(text ?? ""))) {
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    if ((type === "plan_draft" || type === "plan") && Array.isArray(obj.subplans)) return parsePlanObject(obj, catalog, ctx);
  }
  const g: GoalParse = parseGoalResponse(text, catalog);
  return g;
}

// ── Borrador completo ────────────────────────────────────────────────────

export interface PlanDraft {
  /** id del plan que se escribirá al aceptar: `AAAA-MM` (borrador mensual) o `<inicio>_<fin>` (con precondiciones) */
  id?: string;
  /** periodo del plan (AAAA-MM-DD, ambos incluidos) */
  start?: string;
  end?: string;
  /** AAAA-MM del inicio */
  month: string;
  hoursPerWeek: number;
  rationale: string;
  subplans: Subplan[];
  warnings: string[];
  fits: boolean;
  totalMinutes: number;
  availableMinutes: number;
  requiredHoursPerWeek: number | null;
  /** primer día del reparto (hoy si es el mes en curso) */
  from: string;
  discarded: string[];
  /** por qué hace falta cada tema (la razón de la IA), por carpeta */
  why: Record<string, string>;
  /** presente cuando el borrador sale del formulario de precondiciones: hechos fijos del plan */
  preconditions?: PlanPreconditions;
  /** plan automático determinista (sin IA) */
  auto?: boolean;
  /** "lo elegido necesita ~X h y tienes Y h: sobra/falta" */
  coverage?: string;
  /** por qué se usó el plan automático teniendo IA configurada */
  fallbackReason?: string;
  /** pista Programming practice (kata diario + proyecto semanal full stack): ver `lib/practiceTrack.ts` */
  programmingPractice?: PracticeTrack;
  /** decisiones pendientes (hoy: entregables «a discutir»); se responden con `mentor_plan_draft_answer` */
  openQuestions?: OpenQuestion[];
  /** pesos del reparto de capacidad por subplan (id → peso): los fija el constructor guiado y la aceptación los respeta */
  weights?: Record<string, number>;
  /** reparto compacto (llena primero las primeras semanas): lo elige el constructor guiado con «más intenso» */
  compact?: boolean;
  /** «areas» = el borrador es un plan por áreas elementales (cada subplan es un área con grupos y fase) */
  structure?: "areas";
}

/** Mes (AAAA-MM) y primer día del reparto: el mes en curso reparte desde hoy; uno futuro, desde el día 1. */
export function planWindow(requested: string | undefined, today: string): { month: string; from: string } {
  const month = requested && MONTH_RE.test(requested) && requested >= today.slice(0, 7) ? requested : today.slice(0, 7);
  return { month, from: month === today.slice(0, 7) ? today : `${month}-01` };
}

/** Une la respuesta de la IA con el catálogo real y calcula el reparto semanal. */
export function composePlanDraft(reply: PlanDraftReply, catalog: readonly CatalogTopic[], ctx: PlanContext): PlanDraft | { missing: string } {
  if (!reply.hoursPerWeek) return { missing: "las horas por semana que puedes dedicar este mes" };
  const { month, from } = planWindow(reply.month ?? ctx.month, ctx.today);
  const byFolder = new Map(catalog.map((t) => [t.folder, t]));
  const goalName = new Map(ctx.goals.map((g) => [g.id, g.name]));
  const why: Record<string, string> = {};
  const seeds: SubplanSeed[] = reply.subplans.map((s) => ({
    area: s.area,
    objective: s.objective || (s.goalId ? (goalName.get(s.goalId) ?? "") : ""),
    ...(s.goalId ? { goalId: s.goalId } : {}),
    topics: s.topics.map((t) => {
      const c = byFolder.get(t.folder)!;
      if (t.why) why[t.folder] = t.why;
      return { folder: c.folder, title: c.title, ...(t.skills.length ? { skills: t.skills } : {}), estMinutes: c.estMinutes };
    }),
    requiredGoals: s.requiredGoals,
    ...(s.deliverable ? { deliverable: { ...s.deliverable, status: "idea" as const } } : {}),
  }));
  const built = buildPlan(seeds, { month, hoursPerWeek: reply.hoursPerWeek, from });
  return {
    id: built.plan.id,
    start: built.plan.start,
    end: built.plan.end,
    month,
    hoursPerWeek: reply.hoursPerWeek,
    rationale: reply.rationale,
    subplans: built.plan.subplans,
    warnings: built.warnings,
    fits: built.fits,
    totalMinutes: built.totalMinutes,
    availableMinutes: built.availableMinutes,
    requiredHoursPerWeek: built.requiredHoursPerWeek,
    from,
    discarded: reply.discarded,
    why,
  };
}

/** Resumen compacto de un borrador para el historial que ve la IA. */
export function planDraftSummary(d: PlanDraft): string {
  return JSON.stringify({
    type: "plan_draft",
    month: d.month,
    ...(d.preconditions
      ? {
          start: d.start,
          end: d.end,
          minutesPerDay: d.preconditions.minutesPerDay,
          studyDays: d.preconditions.studyDays,
          pace: d.preconditions.pace,
          goalIds: d.preconditions.goalIds,
          subjects: d.preconditions.subjects,
          deliverables: d.preconditions.deliverables,
          ...(d.preconditions.practice ? { programmingPractice: d.preconditions.practice } : {}),
          ...(d.openQuestions?.length ? { openQuestionsPending: d.openQuestions.map((q) => q.subplanId ?? q.id) } : {}),
          note: "Las precondiciones son hechos fijos del plan.",
        }
      : {}),
    hoursPerWeek: d.hoursPerWeek,
    subplans: d.subplans.map((s) => ({
      area: s.area,
      objective: s.objective,
      topics: s.topics.map((t) => t.folder),
      deliverable: s.deliverable?.title,
    })),
  });
}

export type { MonthlyPlan };
