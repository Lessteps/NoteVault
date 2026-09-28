/**
 * First-class, subject-agnostic skill catalogue with difficulty and assistance rules.
 * Extends and groups practice modes per subject for topic-level mastery.
 */

import { EN, MATH, MODES, PROG, type PracticeMode } from "./modes";

export type DifficultyLevel = 1 | 2 | 3;
export type DifficultyId = "beginner" | "intermediate" | "advanced";
export type AssistanceLevel = "no_help" | "helper";

export interface DifficultySpec {
  readonly level: DifficultyLevel;
  readonly id: DifficultyId;
  readonly label: string;
  readonly description: string;
}

export const DIFFICULTY_LEVELS: readonly DifficultySpec[] = [
  {
    level: 1,
    id: "beginner",
    label: "Principiante",
    description: "Fundamentos y conceptos directos.",
  },
  {
    level: 2,
    id: "intermediate",
    label: "Intermedio",
    description: "Casos combinados y razonamiento estándar.",
  },
  {
    level: 3,
    id: "advanced",
    label: "Avanzado",
    description: "Casos límite, integración no trivial y rigor completo.",
  },
];

export interface AssistanceSpec {
  readonly id: AssistanceLevel;
  readonly label: string;
  readonly description: string;
  readonly hintRule: string;
}

export const ASSISTANCE_LEVELS: readonly AssistanceSpec[] = [
  {
    id: "no_help",
    label: "Sin ayuda (No Help)",
    description: "El evaluador señala qué principios o errores existen, nunca su ubicación ni la solución.",
    hintRule: "Lista qué malas prácticas o errores existen a nivel general, sin indicar dónde ni cómo corregirlos.",
  },
  {
    id: "helper",
    label: "Asistente (Helper)",
    description: "Pistas progresivas paso a paso (qué hacer, por qué y cómo) sin entregar la solución completa.",
    hintRule: "Explica qué hacer, por qué y cómo mediante pistas paso a paso, nunca emitiendo una solución completa.",
  },
];

export interface SkillDefinition {
  readonly id: string;
  readonly label: string;
  readonly act: string;
  readonly subject: string;
  readonly description: string;
  readonly allowedDifficulties: readonly DifficultyLevel[];
  readonly allowedAssistance: readonly AssistanceLevel[];
  readonly defaultDifficulty: DifficultyLevel;
  readonly defaultAssistance: AssistanceLevel;
  readonly beginnerAllowed: boolean;
  readonly assistanceProtocol?: string;
}

const DEFAULT_ASSISTANCE: readonly AssistanceLevel[] = ["no_help", "helper"];
const ALL_DIFFICULTIES: readonly DifficultyLevel[] = [1, 2, 3];
const NO_BEGINNER_DIFFICULTIES: readonly DifficultyLevel[] = [2, 3];

function createSkill(
  subject: string,
  modeId: string,
  opts?: {
    labelOverride?: string;
    description?: string;
    allowedDifficulties?: readonly DifficultyLevel[];
    allowedAssistance?: readonly AssistanceLevel[];
    assistanceProtocol?: string;
    defaultDifficulty?: DifficultyLevel;
  },
): SkillDefinition {
  const mode: PracticeMode | undefined = MODES[modeId];
  if (!mode) {
    throw new Error(`Mode "${modeId}" not found in modes catalogue`);
  }
  const difficulties = opts?.allowedDifficulties ?? ALL_DIFFICULTIES;
  const assistance = opts?.allowedAssistance ?? DEFAULT_ASSISTANCE;
  const beginnerOk = difficulties.includes(1);

  return {
    id: modeId,
    label: opts?.labelOverride ?? mode.label,
    act: mode.act,
    subject,
    description: opts?.description ?? mode.description,
    allowedDifficulties: difficulties,
    allowedAssistance: assistance,
    defaultDifficulty: opts?.defaultDifficulty ?? (beginnerOk ? 1 : 2),
    defaultAssistance: "no_help",
    beginnerAllowed: beginnerOk,
    assistanceProtocol: opts?.assistanceProtocol ?? mode.assistance_protocol,
  };
}

// ── Ordered skills per subject ─────────────────────────────────────────────

export const MATHEMATICS_SKILLS: readonly SkillDefinition[] = [
  createSkill(MATH, "solve", {
    description: "Resolución de problemas contextualizados y aplicados.",
  }),
  createSkill(MATH, "process", {
    labelOverride: "Procedimiento guiado",
    description: "Scaffolding paso a paso para consolidar la base.",
    assistanceProtocol: "Pistas que señalan el siguiente paso o la técnica requerida, jamás el resultado directo.",
  }),
  createSkill(MATH, "prove", {
    description: "Rigor matemático, proporciones formales y álgebra.",
  }),
  createSkill(MATH, "counterexample", {
    description: "Identificación de casos límite y refutación de hipótesis.",
  }),
  createSkill(MATH, "true_false", {
    description: "Discernimiento rápido de postulados y propiedades.",
  }),
  createSkill(MATH, "find_error", {
    labelOverride: "Encontrar el error",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES, // Beginner not allowed
    description: "Detección analítica de falacias y pasos fallidos.",
  }),
  createSkill(MATH, "drill", {
    labelOverride: "Cálculo rápido",
    allowedAssistance: ["no_help"], // Speed calculation without hints
    description: "Agilidad aritmética, simplificación y estimación de porcentajes.",
  }),
  createSkill(MATH, "explain", {
    labelOverride: "Explicar (Feynman)",
    description: "Explicar conceptos complejos con tus propias palabras.",
  }),
];

export const PROGRAMMING_SKILLS: readonly SkillDefinition[] = [
  createSkill(PROG, "implement", {
    labelOverride: "Implementar",
    description: "Escribir código desde cero que cumple la especificación y maneja casos de borde.",
  }),
  createSkill(PROG, "debug", {
    labelOverride: "Depurar",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES, // Beginner not allowed (Intermediate/Advanced only)
    description: "Diagnosticar la causa raíz de un fallo y corregirlo sin parches superficiales.",
    assistanceProtocol: "Señala qué tipo de fallo existe sin revelar la línea exacta ni el arreglo directo.",
  }),
  createSkill(PROG, "refactor", {
    labelOverride: "Refactorizar",
    description: "Mejorar la estructura, legibilidad y diseño manteniendo el comportamiento intacto.",
    assistanceProtocol: "Indica criterios de mejora arquitectónica o code smells sin redactar el código.",
  }),
  createSkill(PROG, "design", {
    labelOverride: "Diseño (esquema/arquitectura)",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    description: "Diseñar esquemas, tipos y arquitecturas justificando compromisos de diseño.",
  }),
  createSkill(PROG, "commands", {
    labelOverride: "Secuencia de comandos",
    description: "Componer comandos seguros de terminal o consola para alcanzar el estado objetivo.",
  }),
  createSkill(PROG, "explain", {
    labelOverride: "Explicar (Feynman)",
    description: "Explicar el funcionamiento y las decisiones de diseño en lenguaje claro.",
  }),
  createSkill(PROG, "cloze", {
    labelOverride: "Completar código",
    description: "Completar fragmentos clave en código funcional respetando tipos y sintaxis.",
  }),
  createSkill(PROG, "find_error", {
    labelOverride: "Encontrar el error",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    description: "Identificar y justificar dónde falla el código dado y cómo solventarlo.",
  }),
];

export const ENGLISH_SKILLS: readonly SkillDefinition[] = [
  createSkill(EN, "writing", {
    labelOverride: "Redacción libre",
    description: "Redactar textos originales con precisión gramatical y adecuación al nivel MCER.",
  }),
  createSkill(EN, "rewrite", {
    labelOverride: "Reescribir / corregir",
    description: "Transformar oraciones usando estructuras objetivo y corrigiendo errores.",
  }),
  createSkill(EN, "translate", {
    labelOverride: "Traducir",
    description: "Traducir fielmente preservando el sentido y evitando calcos literales.",
  }),
  createSkill(EN, "cloze", {
    labelOverride: "Completar huecos",
    description: "Completar palabras y colocaciones según contexto y registro gramatical.",
  }),
  createSkill(EN, "true_false", {
    labelOverride: "Verdadero o falso",
    description: "Comprobar afirmaciones de comprensión lectora o reglas gramaticales.",
  }),
  createSkill(EN, "explain", {
    labelOverride: "Explicar uso",
    description: "Explicar la diferencia de uso o matiz gramatical en inglés cotidiano.",
  }),
  createSkill(EN, "find_error", {
    labelOverride: "Encontrar el error",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    description: "Detectar incorrecciones gramaticales o léxicas y proponer la forma natural.",
  }),
];

const SKILLS_BY_SUBJECT: Record<string, readonly SkillDefinition[]> = {
  [MATH]: MATHEMATICS_SKILLS,
  matematicas: MATHEMATICS_SKILLS,
  matemáticas: MATHEMATICS_SKILLS,
  [PROG]: PROGRAMMING_SKILLS,
  programacion: PROGRAMMING_SKILLS,
  programación: PROGRAMMING_SKILLS,
  [EN]: ENGLISH_SKILLS,
  ingles: ENGLISH_SKILLS,
  inglés: ENGLISH_SKILLS,
};

export function skillsForSubject(subject: string): readonly SkillDefinition[] {
  const norm = String(subject || "").trim().toLowerCase();
  return SKILLS_BY_SUBJECT[norm] ?? MATHEMATICS_SKILLS;
}

export function skillDefinition(subject: string, skillId: string): SkillDefinition | undefined {
  const skills = skillsForSubject(subject);
  return skills.find((s) => s.id === skillId.trim().toLowerCase());
}

export function isDifficultyAllowed(
  subject: string,
  skillId: string,
  difficulty: DifficultyLevel,
): boolean {
  const def = skillDefinition(subject, skillId);
  if (!def) return false;
  return def.allowedDifficulties.includes(difficulty);
}

export function isAssistanceAllowed(
  subject: string,
  skillId: string,
  assistance: AssistanceLevel,
): boolean {
  const def = skillDefinition(subject, skillId);
  if (!def) return false;
  return def.allowedAssistance.includes(assistance);
}

export function difficultyLabel(level: DifficultyLevel): string {
  const d = DIFFICULTY_LEVELS.find((s) => s.level === level);
  return d ? d.label : `Nivel ${level}`;
}

export function assistanceLabel(id: AssistanceLevel): string {
  const a = ASSISTANCE_LEVELS.find((s) => s.id === id);
  return a ? a.label : id;
}

export function defaultSkillForSubject(subject: string): SkillDefinition {
  const skills = skillsForSubject(subject);
  return skills[0]!;
}
