/**
 * Planificador del Mentor: la IA PROPONE el plan del día y el usuario lo acepta o ajusta.
 *
 * La IA solo ve el informe (`toPromptText`) y la lista de candidatos; no lee notas. Su
 * respuesta se valida de forma estricta contra los candidatos: nunca puede introducir un
 * bloque que no esté en la lista, y si falla (sin configurar, error de red, JSON roto) se
 * cae al plan determinista (`allocate`). Todo lo demás es puro y testeable; la única
 * entrada/salida es `sendChat`, inyectable.
 */

import { AIConfig, sendChat, type ChatMessage, type SendOpts } from "../aiClient.js";
import { toPromptText, type StudentBrief } from "./brief.js";
import { allocate, type Candidate, type CandidateKind } from "./candidates.js";
import type { PlanBlock } from "./sessionLog.js";

export interface PlanRequest {
  availableMinutes: number;
  objective?: string;
  /** ajuste en lenguaje natural ("hoy no quiero mates"); la IA debe respetarlo */
  userNote?: string;
  /** materias a descartar de forma determinista, antes de llamar a la IA */
  excludeSubjects?: string[];
  /** candidatos concretos a descartar (el usuario pidió "otro") */
  excludeCandidateIds?: string[];
}

/** Un bloque del plan propuesto: lo elegido por la IA (o la regla) más los datos del candidato. */
export interface ProposedBlock {
  candidateId: string;
  minutes: number;
  /** una línea: por qué hoy */
  reason: string;
  kind: CandidateKind;
  subject: string;
  topicFolder?: string;
  skills?: string[];
  /** subplan del plan mensual del que viene el bloque */
  plan?: string;
}

export interface ProposedPlan {
  summary: string;
  blocks: ProposedBlock[];
  notes?: string;
}

export type ParseResult = { ok: true; plan: ProposedPlan } | { ok: false; error: string };

export interface ProposeResult {
  plan: ProposedPlan;
  source: "ai" | "fallback";
  /** candidatos tras aplicar las exclusiones: lo único que el plan puede contener */
  candidates: Candidate[];
  /** respuesta cruda de la IA, para depurar */
  raw?: string;
  /** por qué se usó el plan automático */
  error?: string;
}

/** Mínimo de minutos de un bloque. */
export const MIN_BLOCK_MINUTES = 5;
/** Un bloque puede pasar de lo estimado hasta esta proporción. */
export const MAX_OVERRUN = 1.5;

const norm = (s: string): string => s.trim().toLowerCase();

/** Candidatos sin las materias / ids excluidos (comparación sin mayúsculas). */
export function applyExclusions(candidates: readonly Candidate[], req: Pick<PlanRequest, "excludeSubjects" | "excludeCandidateIds">): Candidate[] {
  const subjects = new Set((req.excludeSubjects ?? []).map(norm).filter(Boolean));
  const ids = new Set(req.excludeCandidateIds ?? []);
  return candidates.filter((c) => !subjects.has(norm(c.subject)) && !ids.has(c.id));
}

// ── Prompt ──────────────────────────────────────────────────────────────

export const PLANNER_SYSTEM_PROMPT = [
  "Eres un profesor-guardián: ayudas a un estudiante a decidir QUÉ estudiar hoy y POR QUÉ.",
  "Solo ves el informe del estudiante y la lista de CANDIDATOS que te da la app; no tienes acceso a sus notas.",
  "Reglas:",
  "- Elige ÚNICAMENTE entre los candidatos dados, referenciándolos por su `id` exacto. No inventes tareas ni ids.",
  "- Reparte el tiempo disponible: la suma de `minutes` no puede pasar del total. Cada bloque dura entre 5 min y 1,5 veces su estimación.",
  "- Prioriza lo urgente (repasos vencidos, errores reincidentes, plazos) y no concentres todo en una sola materia.",
  "- Los candidatos de tipo plan_item vienen del PLAN MENSUAL del estudiante (lo que toca esta semana): dales preferencia salvo que haya algo más urgente. Si hay OBJETIVO DE LA SESIÓN, ordena para cumplirlo primero.",
  "- Los candidatos programming_practice_kata y programming_practice_project vienen de la pista Programming practice del plan (reto de lógica diario y sesión del proyecto semanal full stack): también tienen preferencia y no los sustituyas por estudio de temas salvo que algo sea más urgente. Programming practice es una práctica diaria enfocada en prepararse para entrevistas técnicas y en mejorar la lógica y la resolución de procesos (no es una rama de estudio).",
  "- El nivel declarado es una hipótesis: si un tema está sin tratar, propón su diagnóstico en vez de asumir dominio.",
  "- Cada bloque lleva `reason`: UNA línea, concreta, que cite el dato del informe que lo justifica.",
  "- Si el estudiante pide un ajuste (nota del usuario), respétalo: es una preferencia suya, no una pregunta.",
  "- Es una propuesta: el estudiante la acepta o la ajusta.",
  "Responde EXCLUSIVAMENTE con JSON válido, sin texto antes ni después, con este esquema:",
  '{ "summary": string, "blocks": [ { "candidateId": string, "minutes": number, "reason": string } ], "notes"?: string }',
].join("\n");

function candidateLine(c: Candidate): string {
  const extra = [c.skills?.length ? `skills: ${c.skills.join(", ")}` : "", c.topicFolder ? `tema: ${c.topicFolder}` : ""].filter(Boolean).join("; ");
  return `- id=${c.id} | ${c.kind} | materia: ${c.subject} | est: ${c.estMinutes} min | prioridad: ${Math.round(c.score)} | ${c.reasons.join("; ")}${extra ? ` | ${extra}` : ""}`;
}

/** Mensajes (system + user) para pedir el plan. El usuario solo aporta tiempo, objetivo y nota. */
export function buildPlanMessages(brief: StudentBrief, candidates: readonly Candidate[], req: PlanRequest): ChatMessage[] {
  const total = Math.floor(req.availableMinutes);
  const parts = [
    toPromptText(brief),
    `TIEMPO DISPONIBLE HOY: ${total} minutos.`,
    req.objective?.trim() ? `OBJETIVO DE LA SESIÓN: ${req.objective.trim()}` : "",
    req.userNote?.trim() ? `AJUSTE DEL ESTUDIANTE (respétalo): ${req.userNote.trim()}` : "",
    req.excludeSubjects?.length ? `MATERIAS EXCLUIDAS HOY (ya retiradas de la lista): ${req.excludeSubjects.join(", ")}` : "",
    candidates.length ? `CANDIDATOS (elige solo de aquí):\n${candidates.map(candidateLine).join("\n")}` : "CANDIDATOS: ninguno. Devuelve blocks vacío y explícalo en summary.",
    `Propón el plan de hoy en JSON (la suma de minutes <= ${total}).`,
  ];
  return [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    { role: "user", content: parts.filter(Boolean).join("\n\n") },
  ];
}

// ── Parseo ──────────────────────────────────────────────────────────────

/** Objetos JSON candidatos dentro del texto: bloques ```json primero, luego llaves balanceadas. */
function jsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) out.push(m[1]!.trim());
  out.push(text.trim());
  // llaves balanceadas (respeta cadenas) desde cada `{`
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
        out.push(text.slice(i, j + 1));
        i = j;
        break;
      }
    }
  }
  return out;
}

function parseObject(text: string): Record<string, unknown> | null {
  for (const raw of jsonCandidates(text)) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as Record<string, unknown>).blocks)) return v as Record<string, unknown>;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function oneLine(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function toBlock(c: Candidate, minutes: number, reason: string): ProposedBlock {
  return {
    candidateId: c.id,
    minutes,
    reason: reason || c.reasons[0] || "",
    kind: c.kind,
    subject: c.subject,
    ...(c.topicFolder ? { topicFolder: c.topicFolder } : {}),
    ...(c.skills?.length ? { skills: c.skills } : {}),
    ...(c.links.subplan ? { plan: c.links.subplan } : {}),
  };
}

/**
 * Valida la respuesta de la IA contra los candidatos. Tolerante con el formato (bloque
 * ```json, texto alrededor) y estricta con el contenido: ids inexistentes, minutos no
 * numéricos y duplicados se descartan; los minutos se recortan a [5, est*1.5]; si la suma
 * pasa del tiempo, se recorta por orden. Sin ningún bloque válido devuelve `ok: false`.
 */
export function parsePlanResponse(text: string, candidates: readonly Candidate[], availableMinutes: number): ParseResult {
  const obj = parseObject(String(text ?? ""));
  if (!obj) return { ok: false, error: "La respuesta de la IA no contiene un JSON con `blocks`." };
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const total = Math.floor(availableMinutes);
  const seen = new Set<string>();
  const blocks: ProposedBlock[] = [];
  let remaining = total;
  let dropped = 0;

  for (const raw of obj.blocks as unknown[]) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = typeof r.candidateId === "string" ? r.candidateId.trim() : "";
    const c = byId.get(id);
    const minutesRaw = typeof r.minutes === "number" ? r.minutes : NaN;
    if (!c || seen.has(id) || !Number.isFinite(minutesRaw)) {
      dropped++;
      continue;
    }
    const cap = Math.max(MIN_BLOCK_MINUTES, Math.round(c.estMinutes * MAX_OVERRUN));
    let minutes = Math.min(cap, Math.max(MIN_BLOCK_MINUTES, Math.round(minutesRaw)));
    if (minutes > remaining) minutes = remaining;
    if (minutes < MIN_BLOCK_MINUTES) {
      dropped++;
      continue;
    }
    seen.add(id);
    remaining -= minutes;
    blocks.push(toBlock(c, minutes, oneLine(r.reason, 240)));
  }

  if (!blocks.length) return { ok: false, error: `La IA no propuso ningún bloque válido${dropped ? ` (${dropped} descartados)` : ""}.` };
  const notes = oneLine(obj.notes, 400);
  const summary = oneLine(obj.summary, 300) || `${blocks.length} bloques, ${total - remaining} min.`;
  return { ok: true, plan: { summary, blocks, ...(notes ? { notes } : {}) } };
}

// ── Plan determinista y propuesta ───────────────────────────────────────

/** El plan de reglas (`allocate`) con la misma forma que el de la IA. */
export function fallbackPlan(candidates: readonly Candidate[], availableMinutes: number, note?: string): ProposedPlan {
  const picked = allocate(candidates, availableMinutes, { maxSubjects: 3 });
  const minutes = picked.reduce((n, c) => n + c.estMinutes, 0);
  return {
    summary: picked.length
      ? `Plan automático por prioridad: ${picked.length} ${picked.length === 1 ? "bloque" : "bloques"}, ${minutes} min.`
      : "No hay nada pendiente que proponer con este tiempo.",
    blocks: picked.map((c) => toBlock(c, c.estMinutes, c.reasons.join("; "))),
    ...(note ? { notes: note } : {}),
  };
}

/** Por qué no se puede llamar a la IA con esta configuración; null si se puede. */
export function aiUnavailableReason(cfg: AIConfig): string | null {
  if (cfg.is_bridge) return "El proveedor de IA actual es un puente (sin API): el Mentor necesita un modelo conectado.";
  if (cfg.info.needs_key && !cfg.api_key) return "La IA no está configurada (falta la API key).";
  if (!cfg.model) return "La IA no está configurada (falta el modelo).";
  return null;
}

export type SendFn = (cfg: AIConfig, messages: ChatMessage[], opts?: SendOpts) => Promise<string>;

/**
 * Pide el plan a la IA, con exclusiones deterministas previas y plan automático si la IA
 * no está configurada, falla o responde algo inválido. Nunca lanza por culpa de la IA.
 */
export async function proposePlan(
  cfg: AIConfig,
  args: PlanRequest & { brief: StudentBrief; candidates: readonly Candidate[] },
  send: SendFn = sendChat,
): Promise<ProposeResult> {
  const candidates = applyExclusions(args.candidates, args);
  const fallback = (error: string, raw?: string): ProposeResult => ({
    plan: fallbackPlan(candidates, args.availableMinutes, args.userNote?.trim() ? "El plan automático no puede interpretar tu ajuste en texto; usa «quitar» o «pedir otro» en los bloques." : undefined),
    source: "fallback",
    candidates,
    error,
    ...(raw !== undefined ? { raw } : {}),
  });

  if (!candidates.length) return fallback("No hay candidatos que cumplan el tiempo y los filtros.");
  const unavailable = aiUnavailableReason(cfg);
  if (unavailable) return fallback(unavailable);

  let raw = "";
  try {
    raw = await send(cfg, buildPlanMessages(args.brief, candidates, args));
  } catch (e) {
    return fallback(`La IA falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400));
  }
  const parsed = parsePlanResponse(raw, candidates, args.availableMinutes);
  if (!parsed.ok) return fallback(parsed.error, raw);
  return { plan: parsed.plan, source: "ai", candidates, raw };
}

/** Bloques `planned` listos para guardar en el registro de sesiones. */
export function planToBlocks(plan: Pick<ProposedPlan, "blocks">): PlanBlock[] {
  return plan.blocks.map((b) => ({
    candidateId: b.candidateId,
    kind: b.kind,
    subject: b.subject,
    ...(b.topicFolder ? { topicFolder: b.topicFolder } : {}),
    minutes: b.minutes,
    status: "planned" as const,
    ...(b.reason ? { reason: b.reason } : {}),
    ...(b.plan ? { plan: b.plan } : {}),
  }));
}
