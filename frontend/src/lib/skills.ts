/**
 * Client-facing skill catalogue, difficulty levels, and assistance rules.
 * Pure definitions safe to import in React UI components.
 */

export type DifficultyLevel = 1 | 2 | 3;
export type DifficultyId = "beginner" | "intermediate" | "advanced";
export type AssistanceLevel = "no_help" | "helper";
export type QuantityOption = "3-5" | "6-10" | "11+" | "all" | "auto";

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

export const MATHEMATICS_SKILLS: readonly SkillDefinition[] = [
  {
    id: "solve",
    label: "Problema",
    act: "Resolver problemas y justificar el procedimiento.",
    subject: "mathematics",
    description: "Resolución de problemas contextualizados y aplicados.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "process",
    label: "Procedimiento guiado",
    act: "Desarrollo paso a paso aplicando la técnica o método adecuado.",
    subject: "mathematics",
    description: "Scaffolding paso a paso para consolidar la base.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
    assistanceProtocol: "Pistas que señalan el siguiente paso o la técnica requerida, jamás el resultado directo.",
  },
  {
    id: "prove",
    label: "Demostración",
    act: "Demostración completa justificando cada paso.",
    subject: "mathematics",
    description: "Rigor matemático, proporciones formales y álgebra.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "counterexample",
    label: "Contraejemplo",
    act: "Refutar una afirmación general con un contraejemplo concreto.",
    subject: "mathematics",
    description: "Identificación de casos límite y refutación de hipótesis.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "true_false",
    label: "Verdadero o falso",
    act: "Decidir veracidad o falsedad justificando con prueba o contraejemplo.",
    subject: "mathematics",
    description: "Discernimiento rápido de postulados y propiedades.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "find_error",
    label: "Encontrar el error",
    act: "Localizar el error en el razonamiento, explicarlo y corregirlo.",
    subject: "mathematics",
    description: "Detección analítica de falacias y pasos fallidos.",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 2,
    defaultAssistance: "no_help",
    beginnerAllowed: false,
  },
  {
    id: "drill",
    label: "Cálculo rápido",
    act: "Serie de cálculos cortos contrarreloj.",
    subject: "mathematics",
    description: "Agilidad aritmética, simplificación y estimación de porcentajes.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: ["no_help"],
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "explain",
    label: "Explicar (Feynman)",
    act: "Explicar el concepto con palabras llanas y un ejemplo.",
    subject: "mathematics",
    description: "Explicar conceptos complejos con tus propias palabras.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
];

export const PROGRAMMING_SKILLS: readonly SkillDefinition[] = [
  {
    id: "implement",
    label: "Implementar",
    act: "Escribir código que resuelve la tarea desde cero.",
    subject: "programming",
    description: "Escribir código desde cero que cumple la especificación y maneja casos de borde.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "debug",
    label: "Depurar",
    act: "Diagnosticar la causa raíz y corregir los fallos.",
    subject: "programming",
    description: "Diagnosticar la causa raíz de un fallo y corregirlo sin parches superficiales.",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 2,
    defaultAssistance: "no_help",
    beginnerAllowed: false,
    assistanceProtocol: "Señala qué tipo de fallo existe sin revelar la línea exacta ni el arreglo directo.",
  },
  {
    id: "refactor",
    label: "Refactorizar",
    act: "Mejorar el código funcional sin alterar su comportamiento.",
    subject: "programming",
    description: "Mejorar la estructura, legibilidad y diseño manteniendo el comportamiento intacto.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "design",
    label: "Diseño (esquema/arquitectura)",
    act: "Diseñar esquemas, tipos y arquitecturas justificando decisiones.",
    subject: "programming",
    description: "Diseñar esquemas, tipos y arquitecturas justificando compromisos de diseño.",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 2,
    defaultAssistance: "no_help",
    beginnerAllowed: false,
  },
  {
    id: "commands",
    label: "Secuencia de comandos",
    act: "Escribir comandos seguros de terminal para alcanzar el estado.",
    subject: "programming",
    description: "Componer comandos seguros de terminal o consola para alcanzar el estado objetivo.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "explain",
    label: "Explicar (Feynman)",
    act: "Explicar el funcionamiento y las decisiones de diseño.",
    subject: "programming",
    description: "Explicar el funcionamiento y las decisiones de diseño en lenguaje claro.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "cloze",
    label: "Completar código",
    act: "Completar fragmentos clave en código funcional.",
    subject: "programming",
    description: "Completar fragmentos clave en código funcional respetando tipos y sintaxis.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "find_error",
    label: "Encontrar el error",
    act: "Identificar y justificar dónde falla el código dado.",
    subject: "programming",
    description: "Identificar y justificar dónde falla el código dado y cómo solventarlo.",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 2,
    defaultAssistance: "no_help",
    beginnerAllowed: false,
  },
];

export const ENGLISH_SKILLS: readonly SkillDefinition[] = [
  {
    id: "writing",
    label: "Redacción libre",
    act: "Escribir un texto original adecuado al nivel MCER.",
    subject: "english",
    description: "Redactar textos originales con precisión gramatical y adecuación al nivel MCER.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "rewrite",
    label: "Reescribir / corregir",
    act: "Reescribir oraciones usando estructuras objetivo y corrigiendo errores.",
    subject: "english",
    description: "Transformar oraciones usando estructuras objetivo y corrigiendo errores.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "translate",
    label: "Traducir",
    act: "Traducir fielmente preservando el sentido.",
    subject: "english",
    description: "Traducir fielmente preservando el sentido y evitando calcos literales.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "cloze",
    label: "Completar huecos",
    act: "Completar palabras y colocaciones según contexto.",
    subject: "english",
    description: "Completar palabras y colocaciones según contexto y registro gramatical.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "true_false",
    label: "Verdadero o falso",
    act: "Comprobar afirmaciones de comprensión lectora o reglas.",
    subject: "english",
    description: "Comprobar afirmaciones de comprensión lectora o reglas gramaticales.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "explain",
    label: "Explicar uso",
    act: "Explicar la diferencia de uso o matiz gramatical.",
    subject: "english",
    description: "Explicar la diferencia de uso o matiz gramatical en inglés cotidiano.",
    allowedDifficulties: ALL_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 1,
    defaultAssistance: "no_help",
    beginnerAllowed: true,
  },
  {
    id: "find_error",
    label: "Encontrar el error",
    act: "Detectar incorrecciones gramaticales o léxicas.",
    subject: "english",
    description: "Detectar incorrecciones gramaticales o léxicas y proponer la forma natural.",
    allowedDifficulties: NO_BEGINNER_DIFFICULTIES,
    allowedAssistance: DEFAULT_ASSISTANCE,
    defaultDifficulty: 2,
    defaultAssistance: "no_help",
    beginnerAllowed: false,
  },
];

const SKILLS_BY_SUBJECT: Record<string, readonly SkillDefinition[]> = {
  mathematics: MATHEMATICS_SKILLS,
  matematicas: MATHEMATICS_SKILLS,
  matemáticas: MATHEMATICS_SKILLS,
  programming: PROGRAMMING_SKILLS,
  programacion: PROGRAMMING_SKILLS,
  programación: PROGRAMMING_SKILLS,
  english: ENGLISH_SKILLS,
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

const THEORETICAL_SKILLS = new Set(["prove", "explain", "true_false", "counterexample"]);

export function isTheoreticalTopic(skills: string[]): boolean {
  if (!skills || skills.length === 0) return false;
  let theoreticalCount = 0;
  for (const s of skills) {
    if (THEORETICAL_SKILLS.has(s.toLowerCase())) theoreticalCount++;
  }
  return theoreticalCount >= skills.length / 2;
}
