/**
 * Topic Practice Session Builder.
 * Honors user choices: Skill, Difficulty, Quantity, and Assistance.
 * Selects existing topic exercises matching criteria, and when insufficient,
 * requests specialized, concept-anchored AI exercises (never generic).
 */

import type { ExerciseRef } from "./exerciseIndex";
import { type AssistanceLevel, type DifficultyLevel, difficultyLabel } from "./skills";
import type { TopicManifest } from "./topic";

export type QuantityOption = "3-5" | "6-10" | "11+" | "all" | "auto";

export interface TheoryNoteContext {
  rel: string;
  title: string;
  content: string;
}

export interface SessionConfig {
  skill: string;
  difficulty: DifficultyLevel;
  quantity: QuantityOption;
  assistance: AssistanceLevel;
}

export interface PlannedExercise {
  id: string;
  title: string;
  path: string;
  isNew: boolean;
  content?: string;
}

export interface SessionPlanResult {
  skill: string;
  difficulty: DifficultyLevel;
  assistance: AssistanceLevel;
  targetCount: number;
  exercises: PlannedExercise[];
  existingCount: number;
  generatedCount: number;
}

export function resolveTargetQuantity(quantity: QuantityOption, availableCount: number): number {
  switch (quantity) {
    case "3-5":
      return 4;
    case "6-10":
      return 8;
    case "11+":
      return 12;
    case "all":
      return Math.max(1, availableCount);
    case "auto":
      return 5;
  }
}

/**
 * Filter exercises that belong to this topic and match the selected skill and difficulty.
 */
export function filterTopicExercises(
  allExercises: ExerciseRef[],
  topicFolder: string,
  skill: string,
  difficulty: DifficultyLevel,
): ExerciseRef[] {
  const normFolder = topicFolder.replace(/\\/g, "/").replace(/\/$/, "");
  const normSkill = skill.trim().toLowerCase();

  return allExercises.filter((e) => {
    const eRel = (e.rel || e.path).replace(/\\/g, "/");
    const inside = normFolder === "" || eRel.startsWith(normFolder + "/");
    if (!inside) return false;

    const matchesSkill =
      (e.mode || "").toLowerCase() === normSkill || (e.skill || "").toLowerCase() === normSkill;
    if (!matchesSkill) return false;

    const eDiff = Math.min(3, Math.max(1, e.difficulty)) as DifficultyLevel;
    return eDiff === difficulty;
  });
}

/**
 * Builds the AI prompt to produce exercises specialized to this topic and skill.
 */
export function buildExerciseGenerationPrompt(
  manifest: TopicManifest,
  theoryNotes: TheoryNoteContext[],
  skill: string,
  difficulty: DifficultyLevel,
  assistance: AssistanceLevel,
  countToGenerate: number,
): Array<{ role: "system" | "user"; content: string }> {
  const diffName = difficultyLabel(difficulty);
  const isHelper = assistance === "helper";

  const theorySummary = theoryNotes
    .slice(0, 5)
    .map((t) => `### ${t.title}\n${t.content.slice(0, 1000).trim()}`)
    .join("\n\n");

  const system = [
    "You are NoteVault's expert exercise creator. You specialize in generating deep, pedagogically rigorous exercises.",
    `Subject: ${manifest.subject}. Topic title: "${manifest.title}".`,
    `Cognitive skill to train: "${skill}". Difficulty level: ${difficulty} (${diffName}).`,
    "CRITICAL RULES:",
    "1. Exercises MUST be specialized to the specific concepts, definitions, and theorems of this topic.",
    "2. Never produce generic textbook filler or boilerplate problems.",
    isHelper
      ? "3. Assistance mode is HELPER: hints MUST give progressive, step-by-step guidance on what technique to use and why, NEVER revealing the full final solution."
      : "3. Assistance mode is NO HELP: hints must be minimal or absent (naming only the general failure mode to watch out for).",
    "4. Output format: You must return a valid JSON array of exercise objects. No other markdown commentary.",
    "Each object must have:",
    `  "title": string (concise descriptive title in Spanish)`,
    `  "statement": string (clear exercise statement in Spanish with LaTeX $...$ or code where appropriate)`,
    `  "hints": array of strings (progressive hints in Spanish)`,
    `  "solution": string (complete worked model solution in Spanish)`,
    `  "rubric": array of strings (3 to 5 clear checklist verification criteria)`,
  ].join("\n");

  const user = [
    `Generate ${countToGenerate} exercise${countToGenerate > 1 ? "s" : ""} for topic "${manifest.title}".`,
    theorySummary ? `\nTheory context from the topic's notes:\n${theorySummary}\n` : "",
    `Required skill: ${skill}`,
    `Difficulty: ${difficulty} (${diffName})`,
    `Assistance: ${assistance}`,
    "",
    "Return ONLY the JSON array of exercises.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Format a generated exercise JSON object into a complete NoteVault exercise note (.md).
 */
export function formatExerciseNote(
  manifest: TopicManifest,
  skill: string,
  difficulty: DifficultyLevel,
  assistance: AssistanceLevel,
  ex: {
    title: string;
    statement: string;
    hints: string[];
    solution: string;
    rubric: string[];
  },
): string {
  const astFm = assistance === "no_help" ? "nohelp" : "helper";
  const hintsList = ex.hints.map((h) => `- ${h.trim()}`).join("\n");
  const rubricList = ex.rubric.map((r) => `- [ ] ${r.trim()}`).join("\n");

  return `---
type: exercise
subject: ${manifest.subject}
title: "${ex.title.replace(/"/g, '\\"')}"
mode: ${skill}
difficulty: ${difficulty}
assistance: ${astFm}
topic: "${manifest.title.replace(/"/g, '\\"')}"
---

# ${ex.title}

## Enunciado
${ex.statement.trim()}

## Pistas
${hintsList || "- (Sin pistas para este ejercicio.)"}

## Solución
${ex.solution.trim()}

## Rúbrica
${rubricList || "- [ ] Procedimiento y resultado correctos."}
`;
}

export interface SessionAIClient {
  generateExercises(
    messages: Array<{ role: "system" | "user"; content: string }>,
  ): Promise<
    Array<{
      title: string;
      statement: string;
      hints: string[];
      solution: string;
      rubric: string[];
    }>
  >;
}

/**
 * Builds a practice session plan: selects matching existing exercises,
 * and if needed, calls the AI client to generate concept-specialized exercises.
 */
export async function buildTopicSession(
  manifest: TopicManifest,
  topicFolder: string,
  config: SessionConfig,
  allExercises: ExerciseRef[],
  theoryNotes: TheoryNoteContext[] = [],
  aiClient?: SessionAIClient,
): Promise<SessionPlanResult> {
  const matching = filterTopicExercises(allExercises, topicFolder, config.skill, config.difficulty);
  const targetCount = resolveTargetQuantity(config.quantity, matching.length);

  const planned: PlannedExercise[] = matching.slice(0, targetCount).map((ex) => ({
    id: ex.note_id,
    title: ex.title,
    path: ex.rel || ex.path,
    isNew: false,
  }));

  const needed = Math.max(0, targetCount - planned.length);

  if (needed > 0 && aiClient) {
    const messages = buildExerciseGenerationPrompt(
      manifest,
      theoryNotes,
      config.skill,
      config.difficulty,
      config.assistance,
      needed,
    );
    try {
      const generated = await aiClient.generateExercises(messages);
      let count = 1;
      for (const item of generated.slice(0, needed)) {
        const title = item.title || `Ejercicio ${config.skill} ${count}`;
        const filename = `ej_${config.skill}_d${config.difficulty}_${Date.now()}_${count}.md`;
        const folder = topicFolder ? topicFolder.replace(/\/$/, "") : "";
        const relPath = folder ? `${folder}/ejercicios/${filename}` : `ejercicios/${filename}`;
        const content = formatExerciseNote(
          manifest,
          config.skill,
          config.difficulty,
          config.assistance,
          item,
        );

        planned.push({
          id: filename.replace(/\.md$/, ""),
          title,
          path: relPath,
          isNew: true,
          content,
        });
        count++;
      }
    } catch {
      // In case of AI error, proceed with existing exercises
    }
  }

  return {
    skill: config.skill,
    difficulty: config.difficulty,
    assistance: config.assistance,
    targetCount,
    exercises: planned,
    existingCount: matching.length,
    generatedCount: planned.filter((p) => p.isNew).length,
  };
}
