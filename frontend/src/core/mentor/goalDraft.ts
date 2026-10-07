/**
 * El Mentor crea metas con el estudiante: la IA ELIGE y ORDENA los temas; la app CALCULA.
 *
 * - `buildTopicCatalog`: catálogo compacto de temas REALES, filtrado por relevancia con las palabras del
 *   pedido (la IA nunca ve las notas ni los 300 temas: solo este catálogo y el informe).
 * - `buildGoalMessages`: el prompt. La IA responde SOLO JSON: una pregunta o un borrador.
 * - `parseGoalResponse`: estricta con el contenido (descarta carpetas que no están en el catálogo y
 *   lo reporta) y tolerante con el formato.
 * - `scheduleGoal`: calendario DETERMINISTA (temas en orden, minutos estimados, horas por semana).
 *
 * Todo es puro: la única escritura (crear la meta) la hace `api/modules/mentor.ts` al confirmar.
 */

import type { ChatMessage } from "../aiClient.js";
import { formatTopicLink } from "../practice/topicLinks.js";
import { toPromptText, type StudentBrief } from "./brief.js";
import type { TopicSnap } from "./topics.js";

// ── Catálogo ─────────────────────────────────────────────────────────────

export interface CatalogTopic {
  /** carpeta del tema (POSIX relativa a la vault): el id con el que la IA lo elige */
  folder: string;
  title: string;
  subject: string;
  skills: string[];
  completenessPct: number;
  /** minutos estimados para terminar el tema */
  estMinutes: number;
}

export const DEFAULT_CATALOG_MAX = 60;
/** Minutos por skill pendiente cuando el tema no trae plan, y por ejercicio con plan. */
export const MIN_PER_SKILL = 20;
export const MIN_PER_PLAN_EXERCISE = 8;
export const EXAM_MINUTES = 30;
export const MIN_TOPIC_MINUTES = 30;

const STOPWORDS = new Set([
  "para", "con", "los", "las", "una", "uno", "unos", "unas", "que", "del", "por", "como", "mas", "muy", "sobre",
  "quiero", "tengo", "necesito", "puedo", "meses", "mes", "semanas", "semana", "dias", "horas", "hora", "cada",
  "estudiar", "aprender", "enfocado", "enfocada", "este", "esta", "esto", "hacer", "meta", "plan", "mis", "sus",
  "the", "and", "for", "with", "have", "need", "want", "study", "learn",
]);

/** minúsculas sin acentos */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function keywordsOf(request: string): string[] {
  const out: string[] = [];
  for (const w of fold(request).split(/[^a-z0-9#+]+/)) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out;
}

/** Minutos para terminar un tema: plan del tema si lo hay, si no skills pendientes; más el examen. */
export function estimateTopicMinutes(t: TopicSnap): number {
  const skills = Object.values(t.progress.skills);
  const pending = skills.filter((s) => !s.mastered).length;
  const left = Math.max(0, 1 - t.progress.completenessPct / 100);
  let minutes: number;
  if (t.planExercises && t.planExercises > 0) minutes = t.planExercises * MIN_PER_PLAN_EXERCISE * Math.max(left, pending ? 0.15 : 0);
  else minutes = pending * MIN_PER_SKILL;
  if (t.progress.topic.mastery.exam === "required" && !t.progress.examPassed) minutes += EXAM_MINUTES;
  return Math.max(MIN_TOPIC_MINUTES, Math.round(minutes / 5) * 5);
}

function relevance(t: TopicSnap, kws: string[]): number {
  if (!kws.length) return 0;
  const title = fold(t.title);
  const folder = fold(t.folder);
  const subject = fold(t.subject);
  const skills = Object.keys(t.progress.skills).map(fold);
  let score = 0;
  for (const k of kws) {
    // coincidencia por palabra o por prefijo largo ("backend" ~ "backends")
    const hit = (hay: string) => hay.includes(k) || (k.length >= 5 && hay.split(/[^a-z0-9#+]+/).some((w) => w.length >= 4 && k.startsWith(w)));
    if (hit(title)) score += 3;
    if (hit(folder)) score += 2;
    if (hit(subject)) score += 2;
    if (skills.some((s) => s.includes(k))) score += 1;
  }
  return score;
}

/**
 * Hasta `max` temas: primero los que coinciden con las palabras del pedido (mejor primero), luego
 * se rellena con el resto (a medias y sin tratar antes que completos) para que la IA siempre vea algo.
 */
export function buildTopicCatalog(topics: readonly TopicSnap[], request: string, opts: { max?: number } = {}): CatalogTopic[] {
  const max = Math.max(1, Math.floor(opts.max ?? DEFAULT_CATALOG_MAX));
  const kws = keywordsOf(request);
  const rows = topics.map((t) => ({ t, score: relevance(t, kws) }));
  const open = (t: TopicSnap) => (t.progress.completenessPct >= 100 ? 1 : 0);
  rows.sort((a, b) => b.score - a.score || open(a.t) - open(b.t) || a.t.folder.localeCompare(b.t.folder));
  return rows.slice(0, max).map(({ t }) => ({
    folder: t.folder,
    title: t.title,
    subject: t.subject,
    skills: Object.keys(t.progress.skills),
    completenessPct: Math.round(t.progress.completenessPct),
    estMinutes: estimateTopicMinutes(t),
  }));
}

// ── Prompt ───────────────────────────────────────────────────────────────

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const GOAL_SYSTEM_PROMPT = [
  "Eres un profesor-guardián que ayuda a un estudiante a convertir un objetivo de estudio en una META con un calendario.",
  "Solo ves el informe del estudiante y un CATÁLOGO de temas reales de su sistema de notas; no tienes acceso a sus notas.",
  "Tu trabajo: entender el objetivo, preguntar lo que falte y ELEGIR y ORDENAR temas del catálogo. La app calcula las fechas.",
  "Reglas:",
  "- Si no sabes cuántas HORAS POR SEMANA tiene disponibles, o la DURACIÓN (o fecha límite), o su nivel actual, PREGUNTA (una sola pregunta clara con todo lo que falte).",
  "- Elige ÚNICAMENTE temas del catálogo, por su `folder` EXACTO. No inventes carpetas. Ordénalos de lo básico a lo avanzado.",
  "- Opcionalmente restringe a `skills` del tema (solo las listadas en el catálogo); si omites `skills`, se pide el tema entero.",
  "- Si el catálogo no cubre lo que pide, dilo con una pregunta (type question) en vez de forzar temas que no encajan.",
  "- Cada tema lleva `why`: UNA línea concreta.",
  "- Si el estudiante pide un ajuste sobre un borrador previo (más tiempo, quitar un tema...), devuelve el borrador completo actualizado.",
  "- No incluyas fechas ni minutos por tema: los calcula la app. Sí `hoursPerWeek` y `durationWeeks` (o `end` AAAA-MM-DD).",
  "Responde EXCLUSIVAMENTE con JSON válido, sin texto antes ni después, con UNO de estos esquemas:",
  '{ "type": "question", "text": string }',
  '{ "type": "goal_draft", "name": string, "area"?: string, "rationale": string, "hoursPerWeek": number, "durationWeeks": number, "topics": [ { "folder": string, "skills"?: string[], "why": string } ], "milestones"?: string[] }',
].join("\n");


function catalogLine(t: CatalogTopic): string {
  return `- folder=${t.folder} | ${t.estMinutes}m | ${t.skills.map((k) => k.slice(0, 5)).join(",") || "-"}`;
}

export interface GoalPromptExtras {
  /** hoy, AAAA-MM-DD */
  today?: string;
  areas?: string[];
}

/** system (reglas + informe + catálogo) + el historial + el mensaje nuevo del estudiante. */
export function buildGoalMessages(
  request: string,
  brief: StudentBrief,
  catalog: readonly CatalogTopic[],
  history: readonly ChatTurn[] = [],
  extras: GoalPromptExtras = {},
): ChatMessage[] {
  const context = [
    GOAL_SYSTEM_PROMPT,
    extras.today ? `HOY: ${extras.today}.` : "",
    extras.areas?.length ? `ÁREAS DE VIDA (campo \`area\`, opcional): ${extras.areas.join(", ")}` : "",
    toPromptText(brief, 3500),
    catalog.length ? `CATÁLOGO DE TEMAS (elige solo de aquí):\n${catalog.map(catalogLine).join("\n")}` : "CATÁLOGO DE TEMAS: vacío. Pregunta o explica que no hay temas que cubran el objetivo.",
  ];
  return [
    { role: "system", content: context.filter(Boolean).join("\n\n") },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: request },
  ];
}

// ── Parseo ───────────────────────────────────────────────────────────────

export interface DraftTopic {
  folder: string;
  skills: string[];
  why: string;
}

export interface GoalDraftReply {
  type: "goal_draft";
  name: string;
  area?: string;
  rationale: string;
  /** null si la IA no los dio (la app entonces pregunta) */
  hoursPerWeek: number | null;
  durationWeeks: number | null;
  /** AAAA-MM-DD si la IA dio fecha límite */
  end?: string;
  topics: DraftTopic[];
  milestones: string[];
  /** carpetas pedidas por la IA que no existen en el catálogo (no se enlazan) */
  discarded: string[];
}

export interface QuestionReply {
  type: "question";
  text: string;
}

export type GoalParse = { ok: true; reply: QuestionReply | GoalDraftReply } | { ok: false; error: string; discarded?: string[] };

function jsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) out.push(m[1]!.trim());
  out.push(text.trim());
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

const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function asReply(obj: Record<string, unknown>): "question" | "draft" | null {
  const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
  if (type === "question" || type === "pregunta") return typeof obj.text === "string" && obj.text.trim() ? "question" : null;
  if (type === "goal_draft" || type === "draft") return Array.isArray(obj.topics) ? "draft" : null;
  if (!type) {
    if (Array.isArray(obj.topics)) return "draft";
    if (typeof obj.text === "string" && obj.text.trim()) return "question";
  }
  return null;
}

export function parseGoalResponse(text: string, catalog: readonly CatalogTopic[]): GoalParse {
  let obj: Record<string, unknown> | null = null;
  let kind: "question" | "draft" | null = null;
  for (const raw of jsonCandidates(String(text ?? ""))) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        kind = asReply(v as Record<string, unknown>);
        if (kind) {
          obj = v as Record<string, unknown>;
          break;
        }
      }
    } catch {
      /* siguiente candidato */
    }
  }
  if (!obj || !kind) return { ok: false, error: "La respuesta de la IA no es un JSON de pregunta o de borrador de meta." };
  if (kind === "question") return { ok: true, reply: { type: "question", text: oneLine(obj.text, 800) } };

  const byFolder = new Map(catalog.map((t) => [t.folder, t]));
  const seen = new Set<string>();
  const discarded: string[] = [];
  const topics: DraftTopic[] = [];
  for (const raw of obj.topics as unknown[]) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const folder = typeof r.folder === "string" ? r.folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : "";
    const known = byFolder.get(folder);
    if (!known) {
      if (folder && !discarded.includes(folder)) discarded.push(folder);
      continue;
    }
    if (seen.has(folder)) continue;
    seen.add(folder);
    const valid = new Set(known.skills);
    const skills = Array.isArray(r.skills) ? [...new Set(r.skills.map((s) => String(s).trim().toLowerCase()).filter((s) => valid.has(s)))] : [];
    topics.push({ folder, skills: skills.length === known.skills.length ? [] : skills, why: oneLine(r.why, 240) });
  }
  if (!topics.length) {
    return { ok: false, error: `La IA no eligió ningún tema que exista en tu sistema${discarded.length ? ` (descartados: ${discarded.join(", ")})` : ""}.`, discarded };
  }
  const end = typeof obj.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.end.trim()) ? obj.end.trim() : undefined;
  const milestones = Array.isArray(obj.milestones) ? obj.milestones.map((m) => oneLine(m, 160)).filter(Boolean).slice(0, 8) : [];
  const area = oneLine(obj.area, 60);
  return {
    ok: true,
    reply: {
      type: "goal_draft",
      name: oneLine(obj.name, 120) || "Nueva meta de estudio",
      ...(area ? { area } : {}),
      rationale: oneLine(obj.rationale, 600),
      hoursPerWeek: num(obj.hoursPerWeek ?? obj.hours_per_week),
      durationWeeks: num(obj.durationWeeks ?? obj.duration_weeks),
      ...(end ? { end } : {}),
      topics,
      milestones,
      discarded,
    },
  };
}

// ── Calendario ───────────────────────────────────────────────────────────

export interface ScheduleTopic {
  folder: string;
  title: string;
  skills?: string[];
  estMinutes: number;
  why?: string;
}

export interface ScheduledItem {
  /** nombre de la submeta (el tema, o "A + B" si se agrupan) */
  name: string;
  folders: string[];
  /** cadenas listas para `topic_links` de GoalItem */
  topic_links: string[];
  minutes: number;
  /** AAAA-MM-DD */
  start: string;
  due: string;
  /** semana (1..) en que empieza y en que termina */
  weekFrom: number;
  weekTo: number;
}

export interface GoalSchedule {
  start: string;
  end: string;
  weeks: number;
  hoursPerWeek: number;
  totalMinutes: number;
  /** minutos disponibles entre start y end a ese ritmo */
  availableMinutes: number;
  fits: boolean;
  /** h/semana necesarias para que quepa en el plazo */
  requiredHoursPerWeek: number;
  items: ScheduledItem[];
  warnings: string[];
}

const DAY_MS = 86400000;
const parseIso = (s: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Fecha inválida: ${s}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDaysIso = (iso: string, days: number): string => toIso(parseIso(iso) + days * DAY_MS);
export const daysBetweenIso = (a: string, b: string): number => Math.round((parseIso(b) - parseIso(a)) / DAY_MS);

export const MAX_SCHEDULE_ITEMS = 12;

const r1 = (n: number): number => Math.round(n * 10) / 10;

export interface ScheduleInput {
  topics: readonly ScheduleTopic[];
  start: string;
  end: string;
  hoursPerWeek: number;
  /** máximo de submetas: si hay más temas se agrupan los consecutivos */
  maxItems?: number;
}

/**
 * Reparte los temas EN ORDEN a lo largo del plazo según sus minutos y el ritmo semanal. Cada submeta
 * (un tema, o un bloque de temas consecutivos) vence cuando se acumulan sus minutos. Si no caben, las
 * fechas se comprimen proporcionalmente para terminar en `end` y se avisa de lo que haría falta.
 */
export function scheduleGoal(input: ScheduleInput): GoalSchedule {
  const { start, end } = input;
  if (!(input.hoursPerWeek > 0)) throw new Error("Las horas por semana deben ser mayores que 0.");
  const span = daysBetweenIso(start, end);
  if (span < 1) throw new Error("La fecha final debe ser posterior a la inicial.");
  const topics = input.topics.filter((t) => t.estMinutes > 0);
  const maxItems = Math.max(1, Math.floor(input.maxItems ?? MAX_SCHEDULE_ITEMS));

  // agrupa consecutivos si hay demasiados
  const per = Math.ceil(topics.length / maxItems) || 1;
  const groups: ScheduleTopic[][] = [];
  for (let i = 0; i < topics.length; i += per) groups.push(topics.slice(i, i + per));

  const perDay = (input.hoursPerWeek * 60) / 7;
  const weeks = Math.max(1, Math.ceil(span / 7));
  const availableMinutes = Math.round(perDay * span);
  const totalMinutes = groups.reduce((n, g) => n + g.reduce((m, t) => m + t.estMinutes, 0), 0);
  const fits = totalMinutes <= availableMinutes;
  const requiredHoursPerWeek = r1((totalMinutes / span) * 7 / 60);
  // días de calendario por minuto de estudio: el ritmo del usuario, o más apretado si no cabe
  const daysPerMinute = fits ? 1 / perDay : span / Math.max(1, totalMinutes);

  const items: ScheduledItem[] = [];
  let cum = 0;
  let prevDue = start;
  groups.forEach((g, idx) => {
    const minutes = g.reduce((n, t) => n + t.estMinutes, 0);
    const itemStart = idx === 0 ? start : prevDue;
    cum += minutes;
    let offset = Math.ceil(cum * daysPerMinute);
    if (idx === groups.length - 1 && !fits) offset = span;
    offset = Math.min(span, Math.max(1, offset));
    const due = addDaysIso(start, offset);
    const names = g.map((t) => t.title);
    items.push({
      name: names.length <= 2 ? names.join(" + ") : `${names[0]} + ${names.length - 1} más`,
      folders: g.map((t) => t.folder),
      topic_links: g.map((t) => formatTopicLink({ topic: t.folder, skills: t.skills ?? [] })),
      minutes,
      start: itemStart,
      due,
      weekFrom: Math.floor(daysBetweenIso(start, itemStart) / 7) + 1,
      weekTo: Math.floor((Math.max(1, daysBetweenIso(start, due)) - 1) / 7) + 1,
    });
    prevDue = due;
  });

  const warnings: string[] = [];
  if (!topics.length) warnings.push("No hay temas con trabajo pendiente que repartir.");
  if (!fits) {
    warnings.push(
      `No cabe en el plazo: necesitas unas ${requiredHoursPerWeek} h/semana (tienes ${r1(input.hoursPerWeek)}) o acortar el alcance. Los plazos de abajo ya están comprimidos para terminar en la fecha final.`,
    );
  } else if (totalMinutes > 0 && totalMinutes < availableMinutes * 0.5) {
    warnings.push(`Te sobra tiempo: a ${r1(input.hoursPerWeek)} h/semana terminas hacia el ${items[items.length - 1]!.due}, antes de la fecha final (${end}).`);
  }
  return { start, end, weeks, hoursPerWeek: input.hoursPerWeek, totalMinutes, availableMinutes, fits, requiredHoursPerWeek, items, warnings };
}

// ── Borrador completo ────────────────────────────────────────────────────

export interface GoalDraft {
  name: string;
  /** id de área ya resuelto contra las áreas reales ("" = sin área) */
  area: string;
  description: string;
  topics: Array<{ folder: string; title: string; subject: string; skills: string[]; why: string; estMinutes: number }>;
  schedule: GoalSchedule;
  discarded: string[];
}

/** Fecha final: la de la IA si es válida y posterior; si no, `start` + semanas. */
export function resolveEnd(start: string, reply: Pick<GoalDraftReply, "end" | "durationWeeks">): string | null {
  if (reply.end && daysBetweenIso(start, reply.end) >= 1) return reply.end;
  if (reply.durationWeeks) return addDaysIso(start, Math.max(1, Math.round(reply.durationWeeks * 7)));
  return null;
}

/** Une la respuesta de la IA con el catálogo real y calcula el calendario. */
export function composeDraft(reply: GoalDraftReply, catalog: readonly CatalogTopic[], start: string, area = ""): GoalDraft | { missing: string } {
  const end = resolveEnd(start, reply);
  const missing: string[] = [];
  if (!reply.hoursPerWeek) missing.push("las horas por semana que puedes dedicar");
  if (!end) missing.push("el plazo (cuántas semanas o meses, o la fecha límite)");
  if (missing.length || !end || !reply.hoursPerWeek) return { missing: missing.join(" y ") };
  const byFolder = new Map(catalog.map((t) => [t.folder, t]));
  const topics = reply.topics.map((t) => {
    const c = byFolder.get(t.folder)!;
    return { folder: c.folder, title: c.title, subject: c.subject, skills: t.skills, why: t.why, estMinutes: c.estMinutes };
  });
  const schedule = scheduleGoal({ topics, start, end, hoursPerWeek: reply.hoursPerWeek });
  const description = [reply.rationale, ...(reply.milestones.length ? ["", "Hitos:", ...reply.milestones.map((m) => `- ${m}`)] : [])].join("\n").trim();
  return { name: reply.name, area, description, topics, schedule, discarded: reply.discarded };
}
