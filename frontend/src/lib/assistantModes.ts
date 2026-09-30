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

export interface SplitReply {
  /** the reply without the action block (also hides a block still being streamed) */
  text: string;
  action: ParsedAction | null;
}

/** Separates the visible reply from the `nv-action` block the model ends it with. */
export function splitAction(content: string): SplitReply {
  const start = content.indexOf("```nv-action");
  if (start < 0) return { text: content, action: null };
  const text = content.slice(0, start).trimEnd();
  const close = content.indexOf("```", start + 12);
  if (close < 0) return { text, action: null };
  try {
    const parsed = JSON.parse(content.slice(start + 12, close).trim());
    if (parsed && typeof parsed.action === "string") {
      // Models sometimes put the fields beside `action` instead of inside `args`.
      const { action: name, args: inner, ...rest } = parsed as Record<string, unknown>;
      const args = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : rest;
      return { text, action: { action: String(name), args } };
    }
  } catch {
    /* a malformed block is not shown as an action */
  }
  return { text, action: null };
}
