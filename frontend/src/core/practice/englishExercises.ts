/**
 * Generating ENGLISH exercises: the prompt and the exercise note. Mathematics keeps its own (in
 * sessionBuilder.ts, frozen by mathGolden.test.ts); everything here follows the framing of the exercise's
 * branch (grammar, writing, reading, listening, speaking, or the vocabulary layer).
 */

import { cefrForTopic, englishSkillSpec, type EnglishSkillSpec } from "../../lib/englishSkillData.js";
import { disciplineFor } from "./disciplineCatalog.js";
import type { AssistanceLevel, DifficultyLevel } from "./skills.js";
import type { TopicManifest } from "./topic.js";

/** Difficulty 1 / 2 / 3 is the CEFR level of the exercise. */
export const cefrOf = (difficulty: DifficultyLevel, topicLevel?: string): string => cefrForTopic(difficulty, topicLevel);
const cefrText = (difficulty: DifficultyLevel, topicLevel?: string): string => cefrOf(difficulty, topicLevel);

export interface EnglishExerciseFields {
  title: string;
  statement: string;
  hints: string[];
  solution: string;
  rubric: string[];
  /** listening: the text the app plays aloud; it is never shown before grading */
  audio_text?: string;
  /** vocabulary: ids of the bank words the exercise is built around (their reviews follow the grade) */
  words?: string[];
}

function skillSpecOf(skill: string): EnglishSkillSpec {
  const spec = englishSkillSpec(skill);
  if (!spec) throw new Error(`«${skill}» no es una competencia de inglés.`);
  return spec;
}

/** The messages that ask the AI for exercises of ONE English skill in ONE topic. */
export function buildEnglishExercisePrompt(
  manifest: TopicManifest,
  theory: ReadonlyArray<{ title: string; content: string }>,
  skill: string,
  difficulty: DifficultyLevel,
  assistance: AssistanceLevel,
  count: number,
  learning: readonly string[] = [],
  words: readonly string[] = [],
): Array<{ role: "system" | "user"; content: string }> {
  const spec = skillSpecOf(skill);
  const discipline = disciplineFor({ subject: "english", mode: skill });
  const level = cefrText(difficulty, manifest.level);
  const helper = assistance === "helper" && !spec.noHelper;

  const system = [
    "You are NoteVault's expert exercise creator for ENGLISH. The learner is a native Spanish speaker (a beginner-to-intermediate learner: A1 to B1 today).",
    `Topic: "${manifest.title}"${manifest.branch ? ` (branch: ${manifest.branch})` : ""}.`,
    `Skill to train: ${spec.id} — ${spec.label}. Target CEFR level: ${level}.`,
    `Discipline framing: ${discipline.framing}`,
    `What this skill asks of the learner: ${spec.act}`,
    "CRITICAL RULES:",
    "1. Every exercise must be about the specific points of THIS topic, never generic filler.",
    "2. Write the exercise material (sentences, texts, options) in English at the target level; write the instructions and hints in Spanish.",
    helper
      ? "3. Assistance is HELPER: hints give progressive, step-by-step guidance on what to notice and why, never the full answer."
      : "3. Assistance is NO HELP: hints are minimal or absent (only name the general thing to watch out for).",
    "4. Target the mistakes a Spanish speaker really makes here (transfer from Spanish); use realistic contexts: work emails and meetings in a tech/automation job, travel, daily life.",
    spec.audio
      ? '5. This is an AUDIO exercise: the app plays "audio_text" aloud and it is hidden from the learner. The statement must NOT contain the audio text; it only gives the instructions and the questions. Put in "solution" exactly what the learner should end up writing or answering.'
      : "5. The statement is self-contained: it contains everything the learner needs to answer.",
    spec.area === "speaking"
      ? "6. There is NO speech recognition: the learner speaks aloud and then TYPES what they said (or a short report). Write the statement so that the typed text can be judged."
      : "6. The answer must be verifiable from what the learner types.",
    "7. Output a valid JSON array of exercise objects and nothing else. Each object has:",
    '   "title": string (short, in Spanish), "statement": string, "hints": array of strings (Spanish), "solution": string (the model answer),',
    `   "rubric": array of 3 to 5 checklist criteria${spec.audio ? ', "audio_text": string (the text to play aloud, at the target level)' : ""}.`,
  ].join("\n");

  const theorySummary = theory
    .slice(0, 5)
    .map((t) => `### ${t.title}\n${t.content.slice(0, 1000).trim()}`)
    .join("\n\n");

  const user = [
    `Generate ${count} exercise${count > 1 ? "s" : ""} for the topic "${manifest.title}".`,
    theorySummary ? `\nTheory of the topic:\n${theorySummary}\n` : "",
    `Skill: ${spec.id} (${spec.label}). CEFR level: ${level}. Assistance: ${helper ? "helper" : "no help"}.`,
    words.length
      ? [
          "",
          "WORD BANK: build the exercises around these words the learner is still learning (use each at least once, in natural contexts):",
          ...words.map((w) => `- ${w}`),
        ].join("\n")
      : "",
    learning.length
      ? [
          "",
          "REGISTRO DE ERRORES del estudiante en esta competencia (más recientes primero):",
          ...learning.map((l) => `- ${l}`),
          "Escribe alrededor del 60 % de los ejercicios para atacar EXACTAMENTE estos errores (el mismo tipo de fallo, otro contexto, sin repetir enunciados) y el resto para entrenar toda la competencia.",
        ].join("\n")
      : "",
    "",
    "Return ONLY the JSON array of exercises.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** The exercise note of an English exercise: with its discipline and CEFR level, and the hidden audio text when it has one. */
export function formatEnglishExerciseNote(
  manifest: TopicManifest,
  skill: string,
  difficulty: DifficultyLevel,
  assistance: AssistanceLevel,
  ex: EnglishExerciseFields,
): string {
  const spec = skillSpecOf(skill);
  const discipline = disciplineFor({ subject: "english", mode: skill });
  const hints = ex.hints.map((h) => `- ${h.trim()}`).join("\n");
  const rubric = ex.rubric.map((r) => `- [ ] ${r.trim()}`).join("\n");
  const noHelp = assistance === "no_help" || spec.noHelper;
  return `---
type: exercise
subject: english
title: "${ex.title.replace(/"/g, '\\"')}"
mode: ${skill}
discipline: ${discipline.id}
${manifest.branch ? `branch: ${manifest.branch}\n` : ""}${ex.words?.length ? `words: [${ex.words.join(", ")}]\n` : ""}difficulty: ${difficulty}
level: ${cefrOf(difficulty, manifest.level)}
assistance: ${noHelp ? "nohelp" : "helper"}
topic: "${manifest.title.replace(/"/g, '\\"')}"
---

# ${ex.title}

## Enunciado
${ex.statement.trim()}
${spec.audio && ex.audio_text?.trim() ? `\n## Texto del audio\n${ex.audio_text.trim()}\n` : ""}
## Pistas
${hints || "- (Sin pistas para este ejercicio.)"}

## Solución
${ex.solution.trim()}

## Rúbrica
${rubric || "- [ ] Respuesta correcta y adecuada al nivel."}
`;
}
