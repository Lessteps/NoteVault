// The renderer's half of the chat's vault modes (the prompts live in
// `core/assistantModes.ts`, which the UI project cannot import). A test keeps the
// ids in step.

export const VAULT_MODE_IDS = ["temario", "canvas", "tema", "matriz"] as const;
export type VaultModeId = (typeof VAULT_MODE_IDS)[number];

export interface VaultModeInfo {
  id: VaultModeId;
  label: string;
  hint: string;
  placeholder: string;
  /** What the assistant shows when the mode is switched on. */
  opener: string;
}

export const VAULT_MODES: readonly VaultModeInfo[] = [
  {
    id: "temario",
    label: "Generar temario",
    hint: "Área, objetivo, diagnóstico y extensiones",
    placeholder: "¿Sobre qué área quieres el temario? (p. ej. JavaScript, Cálculo diferencial)",
    opener:
      "Modo «Generar temario»: te haré unas pocas preguntas (objetivo, punto de partida, foco y extensiones) " +
      "y al final te propondré el temario completo. Nada se crea hasta que lo aceptes. ¿Sobre qué área?",
  },
  {
    id: "canvas",
    label: "Generar canvas",
    hint: "Sigue la skill de canvas; usa un canvas de ejemplo como plantilla",
    placeholder: "¿De qué tema quieres el canvas? Puedes adjuntar uno de ejemplo como plantilla.",
    opener:
      "Modo «Generar canvas»: seguiré la skill de canvas del vault. Dime el tema; si tienes un canvas de ejemplo, " +
      "ábrelo o adjunta su contenido y lo usaré de plantilla. También puedo ajustar la skill si me lo pides.",
  },
  {
    id: "matriz",
    label: "Ajustar matriz de competencias",
    hint: "Cambia las skills y cantidades del tema abierto",
    placeholder: "¿Qué quieres cambiar de la matriz de este tema? (p. ej. quita «Cálculo rápido»)",
    opener:
      "Modo «Matriz de competencias»: veo las skills y las cantidades del tema abierto. Dime qué cambiar " +
      "(quitar una skill, añadir otra, más ejercicios en una dificultad…) y lo aplicaré solo a este tema cuando lo aceptes.",
  },
  {
    id: "tema",
    label: "Nuevo tema en un área",
    hint: "Crea la teoría y la vista de práctica de un tema que falta",
    placeholder: "¿Qué tema falta en esta área?",
    opener:
      "Modo «Nuevo tema»: dime qué tema falta en el área de la nota abierta y crearé su teoría y su vista de práctica " +
      "(nada se escribe hasta que lo aceptes).",
  },
];

export function vaultMode(id: string): VaultModeInfo | undefined {
  return VAULT_MODES.find((m) => m.id === id);
}

export interface ParsedAction {
  action: string;
  args: Record<string, unknown>;
}

/** A question the assistant asks with buttons instead of guessing (an `nv-ask` block). */
export interface ParsedAsk {
  question: string;
  options: Array<{ label: string; value: string }>;
  /** several answers can be ticked before sending */
  multiple: boolean;
}

/** A checklist of competencies (an `nv-skills` block): the user ticks, accepts, and it is applied. */
export interface ParsedSkills {
  /** topic folder the matrix belongs to */
  topic: string;
  title: string;
  topicType?: string;
  summary?: string;
  skills: Array<{
    skill: string;
    label: string;
    recommended: boolean;
    /** exercises for easy / medium / hard */
    levels: [number, number, number];
    /** why it is (or is not) recommended for THIS topic */
    why: string;
    /** how this topic would probably be practised with this competency */
    how: string;
  }>;
}

export interface SplitReply {
  /** the reply without its blocks (also hides a block still being streamed) */
  text: string;
  action: ParsedAction | null;
  ask: ParsedAsk | null;
  skills: ParsedSkills | null;
}

const BLOCK = /```(nv-action|nv-ask|nv-skills)[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * Separates the visible reply from the fenced blocks the model (or the app) puts in it:
 * `nv-action` (files to create or change), `nv-ask` (a question with options) and
 * `nv-skills` (the competency checklist).
 */
export function splitAction(content: string): SplitReply {
  let action: ParsedAction | null = null;
  let ask: ParsedAsk | null = null;
  let skills: ParsedSkills | null = null;
  let text = content.replace(BLOCK, (_all, kind: string, body: string) => {
    try {
      const parsed = JSON.parse(body.trim());
      if (kind === "nv-action" && parsed && typeof parsed.action === "string") {
        // Models sometimes put the fields beside `action` instead of inside `args`.
        const { action: name, args: inner, ...rest } = parsed as Record<string, unknown>;
        const args = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : rest;
        action = { action: String(name), args };
      } else if (kind === "nv-ask" && parsed && typeof parsed.question === "string" && Array.isArray(parsed.options)) {
        const options = (parsed.options as unknown[])
          .map((o) => (typeof o === "string" ? { label: o, value: o } : { label: String((o as any)?.label ?? ""), value: String((o as any)?.value ?? (o as any)?.label ?? "") }))
          .filter((o) => o.label);
        if (options.length) ask = { question: parsed.question, options, multiple: parsed.multiple === true };
      } else if (kind === "nv-skills" && parsed && Array.isArray(parsed.skills)) {
        skills = parsed as ParsedSkills;
      }
    } catch {
      /* a malformed block is not shown */
    }
    return "";
  });
  // A block still being streamed (opened, not closed yet) is hidden too.
  const open = text.search(/```nv-(action|ask|skills)/);
  if (open >= 0) text = text.slice(0, open);
  return { text: text.trimEnd(), action, ask, skills };
}
