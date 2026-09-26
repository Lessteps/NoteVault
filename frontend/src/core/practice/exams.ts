/**
 * Exam system: Topic certification and grouped exams at target difficulty.
 * Assembles timed, no-assistance exam sessions covering declared skills,
 * aggregates AI-graded results into per-skill verdicts and overall pass/fail,
 * and records certification under .notevault/estudio/exams/<slug>.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExerciseRef } from "./exerciseIndex";
import { buildExerciseGenerationPrompt, type SessionAIClient, type TheoryNoteContext } from "./sessionBuilder";
import type { DifficultyLevel } from "./skills";
import type { TopicManifest } from "./topic";

export interface ExamSkillVerdict {
  passed: boolean;
  score: number;
  totalQuestions?: number;
}

export interface ExamRecord {
  id: string;
  topic_or_group: string;
  passed: boolean;
  score: number;
  skills: Record<string, ExamSkillVerdict>;
  created_at: string;
  duration_seconds: number;
  topicsCovered?: string[];
}

export interface ExamExerciseItem {
  id: string;
  title: string;
  topicTitle: string;
  skill: string;
  difficulty: DifficultyLevel;
  statement: string;
  filePath?: string;
  isNew?: boolean;
}

export interface ExamSession {
  id: string;
  title: string;
  topicOrGroup: string;
  isGrouped: boolean;
  targetDifficulty: DifficultyLevel;
  topics: TopicManifest[];
  items: ExamExerciseItem[];
  timeLimitMinutes: number;
  assistance: "no_help";
}

export interface ExamItemSubmission {
  itemId: string;
  answerText: string;
}

export interface ExamItemGradingResult {
  itemId: string;
  skill: string;
  score: number; // 0..100
  passed: boolean;
  feedback: string;
}

export type ExamGrader = (
  item: ExamExerciseItem,
  answerText: string,
) => Promise<{ score: number; passed: boolean; feedback: string }>;

export interface ExamAssemblyOptions {
  targetDifficulty?: DifficultyLevel;
  timeLimitMinutesPerItem?: number;
  aiClient?: SessionAIClient;
  theoryNotesContext?: TheoryNoteContext[];
}

// ── Storage Primitives ──────────────────────────────────────────────────────

export function examSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function examDir(vaultRoot: string): string {
  return path.join(vaultRoot, ".notevault", "estudio", "exams");
}

export function saveExamRecord(vaultRoot: string, record: ExamRecord): void {
  const dir = examDir(vaultRoot);
  fs.mkdirSync(dir, { recursive: true });
  const slug = examSlug(record.topic_or_group);
  const filePath = path.join(dir, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
}

export function loadExamRecord(vaultRoot: string, topicOrGroup: string): ExamRecord | null {
  const slug = examSlug(topicOrGroup);
  const filePath = path.join(examDir(vaultRoot), `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ExamRecord;
  } catch {
    return null;
  }
}

export function listExamRecords(vaultRoot: string): ExamRecord[] {
  const dir = examDir(vaultRoot);
  if (!fs.existsSync(dir)) return [];
  const results: ExamRecord[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith(".json")) {
        try {
          const raw = fs.readFileSync(path.join(dir, ent.name), "utf-8");
          results.push(JSON.parse(raw) as ExamRecord);
        } catch {
          // ignore corrupted files
        }
      }
    }
  } catch {
    return [];
  }
  return results;
}

export function isExamPassed(vaultRoot: string, topicOrGroup: string): boolean {
  const rec = loadExamRecord(vaultRoot, topicOrGroup);
  return Boolean(rec && rec.passed);
}

/**
 * Loads exam record for a topic, checking both the topic title and its exam_group.
 * If either passed, prefers the passed one.
 */
export function loadExamRecordForTopic(
  vaultRoot: string,
  topic: TopicManifest,
): ExamRecord | null {
  const byTitle = loadExamRecord(vaultRoot, topic.title);
  if (byTitle?.passed) return byTitle;

  if (topic.exam_group) {
    const byGroup = loadExamRecord(vaultRoot, topic.exam_group);
    if (byGroup?.passed) return byGroup;
    if (byGroup && !byTitle) return byGroup;
  }

  return byTitle;
}

export function isTopicExamPassed(vaultRoot: string, topic: TopicManifest): boolean {
  const rec = loadExamRecordForTopic(vaultRoot, topic);
  return Boolean(rec && rec.passed);
}

// ── Exam Assembly ───────────────────────────────────────────────────────────

/**
 * Filters topic exercises matching a skill and returns the best candidate for an exam,
 * prioritizing targetDifficulty, then highest difficulty available.
 */
function findBestExerciseForSkill(
  exercises: ExerciseRef[],
  skill: string,
  targetDiff: DifficultyLevel,
): ExerciseRef | undefined {
  const matching = exercises.filter(
    (ex) => (ex.mode || "").toLowerCase() === skill.toLowerCase(),
  );
  if (matching.length === 0) return undefined;

  // Exact target difficulty match
  const exact = matching.find((ex) => ex.difficulty === targetDiff);
  if (exact) return exact;

  // Highest difficulty fallback
  return matching.reduce((best, curr) =>
    (curr.difficulty || 1) > (best.difficulty || 1) ? curr : best,
  );
}

/**
 * Assembles an exam for a single topic covering each declared skill at targetDifficulty.
 */
export async function assembleTopicExam(
  topic: TopicManifest,
  exercises: ExerciseRef[],
  options?: ExamAssemblyOptions,
): Promise<ExamSession> {
  const targetDiff = (options?.targetDifficulty ?? topic.mastery.target_difficulty ?? 3) as DifficultyLevel;
  const items: ExamExerciseItem[] = [];

  for (const skill of topic.skills) {
    const candidate = findBestExerciseForSkill(exercises, skill, targetDiff);

    if (candidate) {
      items.push({
        id: candidate.note_id,
        title: candidate.title,
        topicTitle: topic.title,
        skill,
        difficulty: (candidate.difficulty || targetDiff) as DifficultyLevel,
        statement: candidate.title,
        filePath: candidate.rel || candidate.path,
        isNew: false,
      });
    } else if (options?.aiClient) {
      // Concept-specialized generation for missing skill
      const messages = buildExerciseGenerationPrompt(
        topic,
        options.theoryNotesContext || [],
        skill,
        targetDiff,
        "no_help",
        1,
      );
      try {
        const generated = await options.aiClient.generateExercises(messages);
        const g = generated[0];
        if (g) {
          items.push({
            id: `gen-${skill}-${Date.now()}`,
            title: g.title,
            topicTitle: topic.title,
            skill,
            difficulty: targetDiff,
            statement: g.statement,
            isNew: true,
          });
          continue;
        }
      } catch {
        // Fall back to synthetic prompt
      }
      // Synthetic fallback item
      items.push({
        id: `synth-${skill}-${Date.now()}`,
        title: `Evaluación: ${skill.toUpperCase()} — ${topic.title}`,
        topicTitle: topic.title,
        skill,
        difficulty: targetDiff,
        statement: `Desarrolla de forma completa y sin asistencia el ejercicio para evaluar la habilidad "${skill}" en el contexto de "${topic.title}".`,
        isNew: true,
      });
    } else {
      // Synthetic placeholder item without AI
      items.push({
        id: `synth-${skill}-${Date.now()}`,
        title: `Evaluación: ${skill.toUpperCase()} — ${topic.title}`,
        topicTitle: topic.title,
        skill,
        difficulty: targetDiff,
        statement: `Desarrolla de forma completa y sin asistencia el ejercicio para evaluar la habilidad "${skill}" en el contexto de "${topic.title}".`,
        isNew: true,
      });
    }
  }

  const minutesPerItem = options?.timeLimitMinutesPerItem ?? 8;
  const timeLimitMinutes = Math.max(10, items.length * minutesPerItem);

  return {
    id: `exam-${examSlug(topic.title)}-${Date.now()}`,
    title: `Examen: ${topic.title}`,
    topicOrGroup: topic.title,
    isGrouped: false,
    targetDifficulty: targetDiff,
    topics: [topic],
    items,
    timeLimitMinutes,
    assistance: "no_help",
  };
}

/**
 * Assembles a grouped exam spanning all topics that share an exam_group.
 */
export async function assembleGroupedExam(
  groupName: string,
  topics: TopicManifest[],
  topicExercisesMap: Map<string, ExerciseRef[]>,
  options?: ExamAssemblyOptions,
): Promise<ExamSession> {
  const normGroup = examSlug(groupName);
  const groupTopics = topics.filter(
    (t) => examSlug(t.exam_group || "") === normGroup || examSlug(t.title) === normGroup,
  );

  const selectedTopics = groupTopics.length > 0 ? groupTopics : topics;
  const targetDiff = (options?.targetDifficulty ?? 3) as DifficultyLevel;
  const items: ExamExerciseItem[] = [];

  for (const topic of selectedTopics) {
    const exs = topicExercisesMap.get(topic.title) || [];
    // For grouped exams, select 1 best exercise for each skill declared in this topic
    for (const skill of topic.skills) {
      const candidate = findBestExerciseForSkill(exs, skill, targetDiff);
      if (candidate) {
        items.push({
          id: candidate.note_id,
          title: candidate.title,
          topicTitle: topic.title,
          skill,
          difficulty: (candidate.difficulty || targetDiff) as DifficultyLevel,
          statement: candidate.title,
          filePath: candidate.rel || candidate.path,
          isNew: false,
        });
      } else {
        items.push({
          id: `synth-${examSlug(topic.title)}-${skill}-${Date.now()}`,
          title: `Evaluación (${topic.title}): ${skill.toUpperCase()}`,
          topicTitle: topic.title,
          skill,
          difficulty: targetDiff,
          statement: `Desarrolla el ejercicio para la habilidad "${skill}" aplicada al tema "${topic.title}".`,
          isNew: true,
        });
      }
    }
  }

  const minutesPerItem = options?.timeLimitMinutesPerItem ?? 7;
  const timeLimitMinutes = Math.max(15, items.length * minutesPerItem);

  return {
    id: `exam-group-${normGroup}-${Date.now()}`,
    title: `Examen grupal: ${groupName}`,
    topicOrGroup: groupName,
    isGrouped: true,
    targetDifficulty: targetDiff,
    topics: selectedTopics,
    items,
    timeLimitMinutes,
    assistance: "no_help",
  };
}

// ── Exam Grading and Aggregation ────────────────────────────────────────────

/**
 * Grades all submissions in an ExamSession using the supplied grader,
 * computes per-skill verdicts and overall pass/fail, and optionally persists
 * the ExamRecord to the vault root.
 */
export async function gradeAndAggregateExam(
  session: ExamSession,
  submissions: ExamItemSubmission[],
  grader: ExamGrader,
  vaultRoot?: string,
): Promise<{ record: ExamRecord; itemResults: ExamItemGradingResult[] }> {
  const submissionMap = new Map<string, string>();
  for (const sub of submissions) {
    submissionMap.set(sub.itemId, sub.answerText);
  }

  const itemResults: ExamItemGradingResult[] = [];

  for (const item of session.items) {
    const answer = submissionMap.get(item.id) || "";
    try {
      const grade = await grader(item, answer);
      itemResults.push({
        itemId: item.id,
        skill: item.skill,
        score: Math.max(0, Math.min(100, Math.round(grade.score))),
        passed: Boolean(grade.passed),
        feedback: grade.feedback || "",
      });
    } catch (err: any) {
      itemResults.push({
        itemId: item.id,
        skill: item.skill,
        score: 0,
        passed: false,
        feedback: `Error al evaluar: ${err?.message || String(err)}`,
      });
    }
  }

  // Aggregate results by skill
  const skillScores = new Map<string, number[]>();
  for (const res of itemResults) {
    const list = skillScores.get(res.skill) || [];
    list.push(res.score);
    skillScores.set(res.skill, list);
  }

  const skillsRecord: Record<string, ExamSkillVerdict> = {};
  for (const [skill, scores] of skillScores.entries()) {
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / (scores.length || 1);
    const passed = avgScore >= 70;
    skillsRecord[skill] = {
      passed,
      score: Math.round(avgScore),
      totalQuestions: scores.length,
    };
  }

  // Overall calculations
  const totalItemScores = itemResults.reduce((sum, r) => sum + r.score, 0);
  const overallScore = Math.round(totalItemScores / (itemResults.length || 1));

  // Passing criteria:
  // 1. Overall score >= 70
  // 2. All evaluated skills must have passed (avg >= 70)
  const allSkillsPassed = Object.values(skillsRecord).length > 0 &&
    Object.values(skillsRecord).every((s) => s.passed);
  const passed = overallScore >= 70 && allSkillsPassed;

  const record: ExamRecord = {
    id: session.id,
    topic_or_group: session.topicOrGroup,
    passed,
    score: overallScore,
    skills: skillsRecord,
    created_at: new Date().toISOString(),
    duration_seconds: session.timeLimitMinutes * 60,
    topicsCovered: session.topics.map((t) => t.title),
  };

  if (vaultRoot) {
    // Save record for the exam target
    saveExamRecord(vaultRoot, record);

    // If it was a grouped exam, also propagate passing records to each constituent topic
    if (session.isGrouped && passed) {
      for (const topic of session.topics) {
        const topicRecord: ExamRecord = {
          ...record,
          id: `${record.id}-${examSlug(topic.title)}`,
          topic_or_group: topic.title,
        };
        saveExamRecord(vaultRoot, topicRecord);
      }
    }
  }

  return { record, itemResults };
}
