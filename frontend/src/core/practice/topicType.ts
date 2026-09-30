/**
 * Topic types: what kind of thing a topic is, which decides what it can be
 * practised with.
 *
 * A theory topic (propositions and connectives, induction, direct proof) cannot be
 * practised with quick-calculation drills, and an operational topic (adding
 * integers, percentages) is not served by writing proofs. The type is stored in the
 * topic manifest (`topic_type`, additive: manifests without it keep working and
 * their type is derived) and drives the skill recommendation in `skillSelection.ts`.
 *
 * Everything here is deterministic and pure: the same topic always gets the same
 * type, which is what makes the migration auditable.
 */

export type TopicType = "theoretical" | "procedural" | "mixed";

export const TOPIC_TYPES: readonly TopicType[] = ["theoretical", "procedural", "mixed"];

export const TOPIC_TYPE_LABELS: Record<TopicType, string> = {
  theoretical: "Teórico",
  procedural: "Procedimental",
  mixed: "Mixto",
};

export function isTopicType(value: unknown): value is TopicType {
  return typeof value === "string" && (TOPIC_TYPES as readonly string[]).includes(value.trim().toLowerCase());
}

export function normaliseTopicType(value: unknown): TopicType | null {
  if (!isTopicType(value)) return null;
  return String(value).trim().toLowerCase() as TopicType;
}

/** Words that mark a topic as theory. Matched case- and accent-insensitively. */
const THEORETICAL_WORDS = [
  "proposicion", "proposiciones", "conectivo", "conectivos", "logica", "cuantificador",
  "demostracion", "demostraciones", "induccion", "buen orden", "teorema", "teoria",
  "axioma", "postulado", "contraejemplo", "refutacion", "conjunto", "conjuntos",
  "sucesion", "limite", "derivada", "integral", "estructura", "algebra abstracta",
];

/** Words that mark a topic as operational. */
const PROCEDURAL_WORDS = [
  "suma", "resta", "multiplicacion", "division", "operacion", "operaciones", "jerarquia",
  "divisibilidad", "factor", "factores", "primos", "mcm", "mcd", "fraccion", "fracciones",
  "decimal", "decimales", "porcentaje", "porcentajes", "razon", "razones", "proporcion",
  "regla de tres", "potenciacion", "radicacion", "factorizacion", "ecuacion", "ecuaciones",
  "sistema", "sistemas", "desigualdad", "desigualdades", "inecuacion", "polinomio",
  "polinomios", "termino", "terminos", "angulo", "angulos", "perimetro", "area", "areas",
  "triangulo", "triangulos", "poligono", "poligonos", "conversion", "calculo",
];

/** Fold a name to compare it: lowercase, no accents, single spaces. */
export function foldName(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The topic's type guessed from its own name when it has no exercises yet.
 * Returns null when the name says nothing (the caller decides the default).
 */
export function topicTypeFromName(name: string): TopicType | null {
  const folded = foldName(name);
  if (!folded) return null;
  const hit = (words: readonly string[]) => words.some((w) => folded.includes(w));
  const theory = hit(THEORETICAL_WORDS);
  const practice = hit(PROCEDURAL_WORDS);
  if (theory && !practice) return "theoretical";
  if (practice && !theory) return "procedural";
  if (theory && practice) return "mixed";
  return null;
}

/** What the detection looks at. */
export interface TopicTypeEvidence {
  /** The topic folder's name (the title the manifest carries by default). */
  name: string;
  /** The `practice:` modes of the topic's own exercises, as written in the notes. */
  practiceModes?: readonly string[];
  /** Modes considered theory, per the skill catalogue. */
  theoreticalModes?: readonly string[];
}

export interface TopicTypeVerdict {
  type: TopicType;
  source: "exercises" | "name" | "default";
  /** Human-readable why, for the report and the migration log. */
  why: string;
}

/** How much of the exercises has to agree before the type comes from them. */
export const EXERCISE_MAJORITY = 0.6;

/**
 * The topic's type: from its own exercises when it has any (a majority of theory
 * modes makes it theoretical, a majority of operational ones procedural, the rest
 * mixed), otherwise from its name, otherwise mixed.
 */
export function detectTopicType(evidence: TopicTypeEvidence): TopicTypeVerdict {
  const modes = (evidence.practiceModes ?? []).map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  const theory = new Set((evidence.theoreticalModes ?? []).map((m) => m.toLowerCase()));
  if (modes.length && theory.size) {
    const theoretical = modes.filter((m) => theory.has(m)).length;
    const share = theoretical / modes.length;
    if (share >= EXERCISE_MAJORITY) {
      return { type: "theoretical", source: "exercises", why: `${theoretical}/${modes.length} ejercicios son de modo teórico` };
    }
    if (1 - share >= EXERCISE_MAJORITY) {
      return { type: "procedural", source: "exercises", why: `${modes.length - theoretical}/${modes.length} ejercicios son de modo operativo` };
    }
    return { type: "mixed", source: "exercises", why: `los ${modes.length} ejercicios mezclan ambos modos` };
  }
  const byName = topicTypeFromName(evidence.name);
  if (byName) return { type: byName, source: "name", why: `el nombre «${evidence.name}» lo dice` };
  return { type: "mixed", source: "default", why: "sin ejercicios ni pistas en el nombre" };
}
