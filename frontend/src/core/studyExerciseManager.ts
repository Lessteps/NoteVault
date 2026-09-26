/**
 * NoteVault Study Exercise Manager
 * Manages academic and practical exercises for Mathematics, Programming, English, and General.
 * Stores individual exercises in .notevault/estudio/ejercicios/<exercise_id>.json.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatIsoDatetime } from "./dates.js";
import * as store from "./store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "./vaultFormat.js";

export const EXERCISE_TYPES = [
  "recall",
  "short_answer",
  "multiple_choice",
  "problem_solving",
  "coding",
  "debugging",
  "translation",
  "listening",
  "reading",
  "writing",
  "project_task",
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const;

export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];

export interface StudyExerciseAttempt {
  timestamp: string;
  user_answer: string;
  is_correct: boolean;
  score: number;
  error_category: string;
  feedback: string;
}

export interface StudyExerciseItem {
  id: string;
  type: string;
  subject: string;
  topic: string;
  skill: string;
  difficulty: number;
  goal_level: number;
  source_note: string;
  prompt: string;
  expected_solution: string;
  options: string[];
  correct_option_index: number | null;
  code_starter: string;
  tests: any[];
  audio_script: string;
  hints: string[];
  status: string;
  created_at: string;
  last_attempt_at: string | null;
  success_rate: number;
  attempts_count: number;
  history: StudyExerciseAttempt[];
}

export function generateExerciseId(
  subject: string,
  topic: string,
  prompt: string
): string {
  const raw = `${subject}:${topic}:${prompt}:${Date.now()}:${process.hrtime.bigint()}`;
  const h = crypto.createHash("sha256").update(raw, "utf-8").digest("hex").slice(0, 12);
  return `ex_${h}`;
}

export const generate_exercise_id = generateExerciseId;

export function sanitizeExercise(
  raw: Record<string, any>,
  fallbackId: string = ""
): StudyExerciseItem {
  const data = raw && typeof raw === "object" ? raw : {};
  let exId = String(data.id || fallbackId || "").trim();
  if (!exId) {
    const rawVal = `${Date.now()}:${process.hrtime.bigint()}`;
    const h = crypto.createHash("sha256").update(rawVal, "utf-8").digest("hex").slice(0, 12);
    exId = `ex_${h}`;
  }

  let exType = String(data.type || "recall").toLowerCase();
  if (!EXERCISE_TYPES.includes(exType as any)) {
    exType = "recall";
  }

  let status = String(data.status || "pending").toLowerCase();
  if (!EXERCISE_STATUSES.includes(status as any)) {
    status = "pending";
  }

  const diff = parseInt(String(data.difficulty), 10);
  const difficulty = Math.max(1, Math.min(5, Number.isNaN(diff) ? 1 : diff));

  const gl = parseInt(String(data.goal_level), 10);
  const goalLevel = Math.max(1, Math.min(4, Number.isNaN(gl) ? 1 : gl));

  const options = Array.isArray(data.options) ? data.options.map(String) : [];
  const tests = Array.isArray(data.tests) ? data.tests : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const hints = Array.isArray(data.hints)
    ? data.hints.filter((h) => typeof h === "string").map(String)
    : [];

  let correctIndex: number | null = null;
  if (data.correct_option_index !== undefined && data.correct_option_index !== null) {
    const idx = parseInt(String(data.correct_option_index), 10);
    if (!Number.isNaN(idx)) correctIndex = idx;
  }

  const successRate = parseFloat(String(data.success_rate));
  const attemptsCount = parseInt(String(data.attempts_count), 10);

  return {
    id: exId,
    type: exType,
    subject: String(data.subject || "general").toLowerCase(),
    topic: String(data.topic || "").trim(),
    skill: String(data.skill || "").trim(),
    difficulty,
    goal_level: goalLevel,
    source_note: String(data.source_note || ""),
    prompt: String(data.prompt || "").trim(),
    expected_solution: String(data.expected_solution || "").trim(),
    options,
    correct_option_index: correctIndex,
    code_starter: String(data.code_starter || ""),
    tests,
    audio_script: String(data.audio_script || ""),
    hints,
    status,
    created_at: String(data.created_at || formatIsoDatetime(new Date())),
    last_attempt_at: data.last_attempt_at ? String(data.last_attempt_at) : null,
    success_rate: Number.isNaN(successRate) ? 0.0 : successRate,
    attempts_count: Number.isNaN(attemptsCount) ? 0 : Math.max(0, attemptsCount),
    history,
  };
}

export const sanitize_exercise = sanitizeExercise;

export class StudyExerciseManager {
  readonly vaultRoot: string;
  readonly dir: string;
  private _cache: Map<string, StudyExerciseItem> | null = null;
  private _stamp: string | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.study_exercises_dir);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private _path(exId: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.study_exercise, { id: exId }));
  }

  private _dirStamp(): { files: string[]; stampStr: string } {
    try {
      if (!fs.existsSync(this.dir)) return { files: [], stampStr: "" };
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).sort();
      const parts: string[] = [];
      for (const f of files) {
        try {
          const st = fs.statSync(path.join(this.dir, f));
          parts.push(`${f}:${st.mtimeMs}:${st.size}`);
        } catch {
          // ignore
        }
      }
      return { files, stampStr: parts.join(";") };
    } catch {
      return { files: [], stampStr: "" };
    }
  }

  private _loadAll(): Map<string, StudyExerciseItem> {
    const { files, stampStr } = this._dirStamp();
    if (this._cache === null || stampStr !== this._stamp) {
      const out = new Map<string, StudyExerciseItem>();
      for (const name of files) {
        if (isSyncConflict(name)) continue;
        const filePath = path.join(this.dir, name);
        const data = store.loadJson<Record<string, any>>(filePath);
        if (data && typeof data === "object") {
          const clean = sanitizeExercise(data, path.basename(name, ".json"));
          out.set(clean.id, clean);
        }
      }
      this._cache = out;
      this._stamp = stampStr;
    }
    return this._cache;
  }

  exercises(
    subject?: string | null,
    topic?: string | null,
    status?: string | null
  ): StudyExerciseItem[] {
    let items = Array.from(this._loadAll().values());
    if (subject) {
      const sLow = subject.toLowerCase();
      items = items.filter((e) => e.subject === sLow);
    }
    if (topic) {
      const tLow = topic.toLowerCase();
      items = items.filter((e) => e.topic.toLowerCase().includes(tLow));
    }
    if (status) {
      items = items.filter((e) => e.status === status);
    }
    items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return items.map((e) => ({ ...e }));
  }

  get(exerciseId: string): StudyExerciseItem | null {
    const ex = this._loadAll().get(exerciseId);
    return ex ? { ...ex } : null;
  }

  create(
    exerciseType: string,
    subject: string,
    topic: string,
    prompt: string,
    expectedSolution: string = "",
    difficulty: number = 1,
    goalLevel: number = 1,
    skill: string = "",
    sourceNote: string = "",
    extra: Record<string, any> = {}
  ): StudyExerciseItem {
    const exId = generateExerciseId(subject, topic, prompt);
    const data: Record<string, any> = {
      id: exId,
      type: exerciseType,
      subject,
      topic,
      prompt,
      expected_solution: expectedSolution,
      difficulty,
      goal_level: goalLevel,
      skill,
      source_note: sourceNote,
      ...extra,
    };
    const clean = sanitizeExercise(data, exId);
    store.writeJson(this._path(clean.id), clean);
    this._cache = null;
    return clean;
  }

  save(exerciseData: Record<string, any>): StudyExerciseItem {
    const clean = sanitizeExercise(exerciseData);
    store.writeJson(this._path(clean.id), clean);
    this._cache = null;
    return clean;
  }

  delete(exerciseId: string): boolean {
    const p = this._path(exerciseId);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      this._cache = null;
      return true;
    }
    return false;
  }

  recordAttempt(
    exerciseId: string,
    userAnswer: string,
    isCorrect: boolean,
    score: number = 1.0,
    errorCategory?: string | null,
    feedback: string = ""
  ): StudyExerciseItem | null {
    const ex = this.get(exerciseId);
    if (!ex) return null;

    const attempts = ex.attempts_count + 1;
    const prevSuccesses = Math.round(ex.success_rate * ex.attempts_count);
    const newSuccesses = prevSuccesses + (isCorrect ? 1 : 0);
    const newRate = Math.round((newSuccesses / attempts) * 100) / 100;

    const attemptRecord: StudyExerciseAttempt = {
      timestamp: formatIsoDatetime(new Date()),
      user_answer: userAnswer,
      is_correct: isCorrect,
      score: Math.round(Math.max(0.0, Math.min(1.0, score)) * 100) / 100,
      error_category: errorCategory || "",
      feedback,
    };

    ex.attempts_count = attempts;
    ex.success_rate = newRate;
    ex.status = isCorrect ? "completed" : "failed";
    ex.last_attempt_at = attemptRecord.timestamp;
    ex.history.push(attemptRecord);

    return this.save(ex);
  }

  record_attempt(
    exerciseId: string,
    userAnswer: string,
    isCorrect: boolean,
    score: number = 1.0,
    errorCategory?: string | null,
    feedback: string = ""
  ): StudyExerciseItem | null {
    return this.recordAttempt(exerciseId, userAnswer, isCorrect, score, errorCategory, feedback);
  }
}
