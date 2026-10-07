// Constructor guiado del plan del Mentor: tipos y utilidades PURAS compartidas (núcleo, API y panel).
//
// El plan se arma por etapas; en cada una la app puede hacer UNA pregunta cuando hay una decisión real. Aquí viven
// las etapas, la forma de las preguntas y respuestas y la interpretación de un texto libre como una de las opciones
// (el motor está en `core/mentor/planBuild.ts`). Sin node:* ni DOM.

export const BUILD_STAGES = ["alcance", "esqueleto", "temas", "capacidad", "practica", "entregables", "revision"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];
export const STAGE_LABEL: Record<BuildStage, string> = {
  alcance: "Alcance",
  esqueleto: "Esqueleto",
  temas: "Temas",
  capacidad: "Capacidad",
  practica: "Práctica",
  entregables: "Entregables",
  revision: "Revisión",
};
export const stageIndex = (s: BuildStage): number => BUILD_STAGES.indexOf(s);
export const isBuildStage = (v: unknown): v is BuildStage => (BUILD_STAGES as readonly string[]).includes(String(v));

export const BUILD_QUESTION_KINDS = ["level", "priority", "skeleton", "weight", "capacity", "practice", "deliverable", "ai"] as const;
export type BuildQuestionKind = (typeof BUILD_QUESTION_KINDS)[number];

/** Tope de preguntas de un plan en construcción (lo demás se decide con valores por defecto). */
export const MAX_BUILD_QUESTIONS = 6;

export interface BuildOption {
  id: string;
  label: string;
  /** una línea que aclara el efecto (p. ej. «cabe: sobran 2 h») */
  hint?: string;
}

export interface BuildQuestion {
  /** estable: lleva el tipo y, si procede, el área o subplan (`level:Programación`, `capacity:1`, `deliverable:<clave>`) */
  id: string;
  stage: BuildStage;
  kind: BuildQuestionKind;
  text: string;
  /** el porqué, en una línea */
  why: string;
  options: BuildOption[];
  /** el texto libre es una respuesta válida (preguntas de la IA); en las demás se interpreta como una opción */
  allowText: boolean;
  /** lo que se elige con «Saltar» */
  defaultChoice: string;
  /** lo que se elige con «Que decida el Mentor» */
  mentorChoice: string;
  /** cómo se redactó: la app (reglas) o la IA */
  by?: "rules" | "ai";
}

export interface BuildAnswer {
  questionId: string;
  stage: BuildStage;
  kind: BuildQuestionKind;
  /** la pregunta tal como se vio (para el historial) */
  question: string;
  /** id de la opción elegida (o `text` en una pregunta libre de la IA) */
  choice: string;
  /** texto de la opción elegida, para el historial */
  label: string;
  /** texto libre, si lo escribió */
  text?: string;
  skipped?: "skip" | "mentor";
  at: string;
}

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

const SYNONYMS: Record<string, string[]> = {
  empezando: ["cero", "desde cero", "empiezo", "principiante", "novato", "nada"],
  basico: ["basic", "poco", "algo"],
  intermedio: ["medio", "normal"],
  avanzado: ["experto", "mucho", "alto"],
  no_se: ["no se", "ni idea", "no lo se", "no estoy seguro", "diagnostico"],
  yes: ["si", "claro", "ok", "vale", "quiero", "dale", "por supuesto", "añadir", "anadir"],
  no: ["no quiero", "ninguno", "nada de eso", "no gracias"],
  later: ["despues", "luego", "mas tarde", "otro dia", "ya veremos", "ahora no"],
  ok: ["esta bien", "bien", "asi", "asi esta bien", "dejalo", "perfecto", "de acuerdo"],
  equal: ["iguales", "partes iguales", "igual", "todas", "parejo"],
  light: ["ligero", "mas ligero", "menos", "liviano", "suave", "pesado", "demasiado"],
  intense: ["intenso", "mas intenso", "compacto", "terminar antes", "rapido"],
  keep: ["dejalo", "dejarlo", "dejarlo asi", "como esta", "nada"],
};

/**
 * Interpreta un texto libre como UNA de las opciones de la pregunta; `null` si no es claro (ninguna o varias coinciden).
 * Solo se acepta lo inequívoco: coincidencia exacta con el texto o el id de una opción, una sinonimia conocida o una opción
 * cuyo texto contiene (o está contenido en) lo escrito, cuando es la única.
 */
export function matchOption(q: Pick<BuildQuestion, "options">, text: string): string | null {
  const t = fold(text);
  if (!t || t.length > 120) return null;
  const opts = q.options.map((o) => ({ id: o.id, label: fold(o.label), idf: fold(o.id) }));
  const exact = opts.filter((o) => o.label === t || o.idf === t);
  if (exact.length === 1) return exact[0]!.id;
  const bySyn = opts.filter((o) => (SYNONYMS[o.id] ?? []).some((s) => fold(s) === t));
  if (bySyn.length === 1) return bySyn[0]!.id;
  if (t.length >= 3) {
    const part = opts.filter((o) => o.label.includes(t) || (o.label.length >= 3 && t.split(" ").length <= 3 && t.includes(o.label)));
    if (part.length === 1) return part[0]!.id;
  }
  return null;
}

export const BUILD_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Id de un plan en construcción: `b<AAAAMMDDhhmmss>-<aleatorio>` (lo puede generar el cliente para seguir el progreso). */
export function newBuildId(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `b${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Tamaño de un bloque de temas por llamada a la IA en la etapa Temas (los subplanes grandes se piden por bloques). */
export const TOPIC_BLOCK = 60;

export interface ChangeDeltaLike {
  added: number;
  removed: number;
  moved: number;
  /** entregables: + añadidos, − quitados */
  deliverables: number;
}

/** «+5 temas, −3 temas, 1 movido, +1 entregable»: el resumen de un cambio pedido al plan. */
export function deltaText(d: ChangeDeltaLike): string {
  const parts = [
    d.added ? `+${d.added} ${d.added === 1 ? "tema" : "temas"}` : "",
    d.removed ? `−${d.removed} ${d.removed === 1 ? "tema" : "temas"}` : "",
    d.moved ? `${d.moved} ${d.moved === 1 ? "movido" : "movidos"}` : "",
    d.deliverables ? `${d.deliverables > 0 ? "+" : "−"}${Math.abs(d.deliverables)} ${Math.abs(d.deliverables) === 1 ? "entregable" : "entregables"}` : "",
  ].filter(Boolean);
  return parts.join(", ") || "sin cambios en los temas";
}
