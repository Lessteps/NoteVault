/**
 * NoteVault Topic Model and Topic Mastery Framework.
 * Discovered by tags and manifests (_tema.md).
 * Computes skill x difficulty progress matrices and completeness rules.
 */

import { parseFrontmatter } from "../frontmatter";
import type { ExerciseRef } from "./exerciseIndex";
import { attemptPassed } from "./ledger";
import {
  type DifficultyLevel,
  skillsForSubject,
} from "./skills";

export interface TopicMasteryConfig {
  min_per_skill: number;
  target_difficulty: DifficultyLevel;
  exam: "required" | "optional" | "none";
}

export interface TopicManifest {
  type: "topic";
  subject: string;
  title: string;
  skills: string[];
  mastery: TopicMasteryConfig;
  exam_group?: string;
  path?: string;
  folder?: string;
}

export interface TopicCellProgress {
  skill: string;
  difficulty: DifficultyLevel;
  attempts: number;
  passes: number;
  bestScore: number | null;
}

export interface TopicSkillProgress {
  skill: string;
  label: string;
  status: "not_started" | "practicing" | "consolidated";
  totalAttempts: number;
  totalPasses: number;
  bestScore: number | null;
  highestPassedDifficulty: DifficultyLevel | 0;
  cells: Record<DifficultyLevel, TopicCellProgress>;
  consolidated: boolean;
  mastered: boolean;
}

export interface TopicProgress {
  topic: TopicManifest;
  skills: Record<string, TopicSkillProgress>;
  examPassed: boolean;
  examScore: number | null;
  isComplete: boolean;
  completenessPct: number; // 0..100
  theoryNotesCount: number;
  exerciseNotesCount: number;
}

export const DEFAULT_MASTERY_CONFIG: TopicMasteryConfig = {
  min_per_skill: 6,
  target_difficulty: 3,
  exam: "required",
};

const THEORETICAL_SKILLS = new Set(["prove", "explain", "true_false", "counterexample"]);

export function isTheoreticalTopic(manifest: TopicManifest): boolean {
  if (!manifest.skills || manifest.skills.length === 0) return false;
  let theoreticalCount = 0;
  for (const s of manifest.skills) {
    if (THEORETICAL_SKILLS.has(s.toLowerCase())) theoreticalCount++;
  }
  return theoreticalCount >= manifest.skills.length / 2;
}

/**
 * Parse frontmatter string or object into a structured TopicManifest.
 */
export function parseTopicManifest(
  rawTextOrFm: string | Record<string, any>,
  defaultTitle = "Tema sin título",
): TopicManifest | null {
  let fm: Record<string, any>;
  if (typeof rawTextOrFm === "string") {
    const [parsed] = parseFrontmatter(rawTextOrFm);
    if (!parsed || typeof parsed !== "object") return null;
    fm = parsed;
  } else {
    fm = rawTextOrFm;
  }

  const type = String(fm.type || "").trim().toLowerCase();
  const tag = String(fm.tag || "").trim().toLowerCase();
  const tags = Array.isArray(fm.tags)
    ? fm.tags.map((t: any) => String(t).trim().toLowerCase().replace(/^#/, ""))
    : typeof fm.tags === "string"
      ? fm.tags.split(/[,\s]+/).map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      : [];

  const isTopic =
    type === "topic" ||
    tag === "tema" ||
    tag === "topic" ||
    tags.includes("tema") ||
    tags.includes("topic");

  if (!isTopic) return null;

  const subject = String(fm.subject || "mathematics").trim().toLowerCase();
  const title = String(fm.title || defaultTitle).trim();

  // Validate declared skills against subject catalogue
  const subjectSkills = skillsForSubject(subject);
  const knownSkillIds = new Set(subjectSkills.map((s) => s.id));

  let rawSkills: string[] = [];
  if (Array.isArray(fm.skills)) {
    rawSkills = fm.skills.map((s: any) => String(s).trim().toLowerCase());
  } else if (typeof fm.skills === "string") {
    rawSkills = fm.skills.split(/[,\s]+/).map((s) => s.trim().toLowerCase());
  }

  const validSkills = rawSkills.filter((s) => knownSkillIds.has(s));
  const skills = validSkills.length > 0 ? validSkills : subjectSkills.map((s) => s.id);

  // Mastery config: supports nested object or flat/indented keys from parseFrontmatter
  const rawMastery = fm.mastery && typeof fm.mastery === "object" ? fm.mastery : {};
  const rawMin = rawMastery.min_per_skill ?? fm.min_per_skill ?? DEFAULT_MASTERY_CONFIG.min_per_skill;
  const minPerSkill = Math.max(1, parseInt(String(rawMin), 10) || 6);

  const rawDiff = rawMastery.target_difficulty ?? fm.target_difficulty ?? DEFAULT_MASTERY_CONFIG.target_difficulty;
  const rawTargetDiff = parseInt(String(rawDiff), 10);
  const targetDiff = (rawTargetDiff >= 1 && rawTargetDiff <= 3 ? rawTargetDiff : 3) as DifficultyLevel;

  const rawExam = rawMastery.exam ?? fm.exam ?? "required";
  const examSetting = String(rawExam).toLowerCase();
  const exam: "required" | "optional" | "none" =
    examSetting === "none" ? "none" : examSetting === "optional" ? "optional" : "required";

  const manifest: TopicManifest = {
    type: "topic",
    subject,
    title,
    skills,
    mastery: {
      min_per_skill: minPerSkill,
      target_difficulty: targetDiff,
      exam,
    },
  };

  if (fm.exam_group) {
    manifest.exam_group = String(fm.exam_group).trim();
  }

  return manifest;
}

/**
 * Serializes a TopicManifest to markdown file text with YAML frontmatter.
 */
export function serializeTopicManifest(manifest: TopicManifest): string {
  const lines = [
    "---",
    `type: topic`,
    `subject: ${manifest.subject}`,
    `title: "${manifest.title.replace(/"/g, '\\"')}"`,
    `skills: [${manifest.skills.join(", ")}]`,
    `mastery:`,
    `  min_per_skill: ${manifest.mastery.min_per_skill}`,
    `  target_difficulty: ${manifest.mastery.target_difficulty}`,
    `  exam: ${manifest.mastery.exam}`,
  ];

  if (manifest.exam_group) {
    lines.push(`exam_group: "${manifest.exam_group.replace(/"/g, '\\"')}"`);
  }

  lines.push("---");
  lines.push("");
  lines.push(`# ${manifest.title}`);
  lines.push("");
  lines.push("Nota de tema: define los objetivos y competencias requeridas para el dominio de este tema.");
  lines.push("");
  return lines.join("\n");
}

/**
 * Create a sensible default manifest for a folder.
 */
export function createDefaultTopicManifest(
  folder: string,
  folderName: string,
  subject = "mathematics",
  existingExercises: ExerciseRef[] = [],
  examGroup?: string,
): TopicManifest {
  const normSubject = subject.toLowerCase();
  const availableSkills = skillsForSubject(normSubject);

  // If there are existing exercises, gather which skills are already represented
  const presentSkills = new Set<string>();
  for (const ex of existingExercises) {
    if (ex.mode) presentSkills.add(ex.mode.toLowerCase());
  }

  // Include represented skills first, then rest of available skills
  const orderedSkills: string[] = [];
  for (const s of availableSkills) {
    if (presentSkills.has(s.id)) orderedSkills.push(s.id);
  }
  for (const s of availableSkills) {
    if (!orderedSkills.includes(s.id)) orderedSkills.push(s.id);
  }

  return {
    type: "topic",
    subject: normSubject,
    title: folderName,
    skills: orderedSkills,
    mastery: { ...DEFAULT_MASTERY_CONFIG },
    exam_group: examGroup,
    folder,
  };
}

/**
 * Calculates the skill x difficulty progress matrix and completeness for a topic.
 */
export function computeTopicProgress(
  topic: TopicManifest,
  exercises: ExerciseRef[],
  attempts: Record<string, any>,
  examRecord?: { passed: boolean; score?: number } | null,
  theoryNotesCount = 0,
): TopicProgress {
  const subjectSkills = skillsForSubject(topic.subject);
  const skillLabelMap = new Map(subjectSkills.map((s) => [s.id, s.label]));

  const skillsProgress: Record<string, TopicSkillProgress> = {};

  for (const skillId of topic.skills) {
    const cells: Record<DifficultyLevel, TopicCellProgress> = {
      1: { skill: skillId, difficulty: 1, attempts: 0, passes: 0, bestScore: null },
      2: { skill: skillId, difficulty: 2, attempts: 0, passes: 0, bestScore: null },
      3: { skill: skillId, difficulty: 3, attempts: 0, passes: 0, bestScore: null },
    };

    let totalAttempts = 0;
    let totalPasses = 0;
    let bestScore: number | null = null;
    let highestPassedDiff: DifficultyLevel | 0 = 0;

    // Filter exercises that train this skill
    const matchingExercises = exercises.filter(
      (e) => (e.mode || "").toLowerCase() === skillId || (e.skill || "").toLowerCase() === skillId,
    );

    for (const ex of matchingExercises) {
      const diff = Math.min(3, Math.max(1, ex.difficulty)) as DifficultyLevel;
      const cell = cells[diff];
      const exAttempts = attempts[ex.note_id]?.attempts || [];

      for (const a of exAttempts) {
        totalAttempts++;
        cell.attempts++;

        const passed = attemptPassed(a);
        if (passed) {
          totalPasses++;
          cell.passes++;
          if (diff > highestPassedDiff) {
            highestPassedDiff = diff;
          }
        }

        const score = typeof a.score === "number" ? a.score : parseInt(String(a.score || 0), 10);
        if (!Number.isNaN(score)) {
          if (cell.bestScore === null || score > cell.bestScore) {
            cell.bestScore = score;
          }
          if (bestScore === null || score > bestScore) {
            bestScore = score;
          }
        }
      }
    }

    // Consolidated: >= min_per_skill passes and passed at least once at target or intermediate
    const consolidated =
      totalPasses >= topic.mastery.min_per_skill &&
      (highestPassedDiff >= Math.min(2, topic.mastery.target_difficulty) ||
        (bestScore !== null && bestScore >= 75));

    // Mastered: consolidated AND reached target_difficulty
    const mastered = consolidated && highestPassedDiff >= topic.mastery.target_difficulty;

    const status: "not_started" | "practicing" | "consolidated" =
      totalAttempts === 0 ? "not_started" : consolidated ? "consolidated" : "practicing";

    skillsProgress[skillId] = {
      skill: skillId,
      label: skillLabelMap.get(skillId) ?? skillId,
      status,
      totalAttempts,
      totalPasses,
      bestScore,
      highestPassedDifficulty: highestPassedDiff,
      cells,
      consolidated,
      mastered,
    };
  }

  const examPassed = Boolean(examRecord?.passed);
  const examScore = examRecord?.score ?? null;

  // Completeness calculation
  const totalSkills = topic.skills.length;
  let masteredSkillsCount = 0;
  for (const s of topic.skills) {
    if (skillsProgress[s]?.mastered) masteredSkillsCount++;
  }

  const examRequired = topic.mastery.exam === "required";
  const examWeight = examRequired ? 1 : 0;
  const totalUnits = totalSkills + examWeight;
  const completedUnits = masteredSkillsCount + (examRequired && examPassed ? 1 : 0);

  const completenessPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
  const isComplete = masteredSkillsCount === totalSkills && (!examRequired || examPassed);

  return {
    topic,
    skills: skillsProgress,
    examPassed,
    examScore,
    isComplete,
    completenessPct,
    theoryNotesCount,
    exerciseNotesCount: exercises.length,
  };
}
