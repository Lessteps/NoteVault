/**
 * NoteVault Study Daily Queue Manager
 * Orchestrates the daily execution queue across Mathematics, Programming, and English.
 * Applies active recall, interleaving, error remediation, and Spaced Repetition (SRS) prioritization.
 */

import * as path from "node:path";
import { formatIsoDate, parseIsoDate } from "./dates.js";
import { StudyErrorManager } from "./studyErrorManager.js";
import { StudyExerciseManager } from "./studyExerciseManager.js";
import { StudySRSManager } from "./studySrsManager.js";

export const SUBJECTS = ["mathematics", "programming", "english", "general"] as const;

export interface DailyQueueTask {
  task_type: string;
  id: string;
  subject: string;
  title: string;
  topic: string;
  difficulty: number;
  mastery?: number;
  data: Record<string, any>;
}

export interface UnifiedDailyQueue {
  date: string;
  by_subject: Record<string, DailyQueueTask[]>;
  interleaved: DailyQueueTask[];
  total_tasks: number;
  srs_due_count: number;
  unresolved_errors_count: number;
}

export class StudyDailyQueueManager {
  readonly vaultRoot: string;
  readonly exMgr: StudyExerciseManager;
  readonly srsMgr: StudySRSManager;
  readonly errMgr: StudyErrorManager;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.exMgr = new StudyExerciseManager(this.vaultRoot);
    this.srsMgr = new StudySRSManager(this.vaultRoot);
    this.errMgr = new StudyErrorManager(this.vaultRoot);
  }

  getQueue(
    targetDate?: Date | string | null,
    limitPerSubject: number = 5
  ): UnifiedDailyQueue {
    let today: Date;
    if (typeof targetDate === "string") {
      today = parseIsoDate(targetDate) || new Date();
    } else {
      today = targetDate || new Date();
    }
    const todayStr = formatIsoDate(today);

    // 1. Gather due SRS items
    const dueSrs = this.srsMgr.dueItems(today);

    // 2. Gather active exercises
    const pendingExercises = this.exMgr.exercises(null, null, "pending");

    // 3. Gather unresolved errors
    const unresolvedErrors = this.errMgr.errors(null, null, true);

    // Group items by subject
    const grouped: Record<string, DailyQueueTask[]> = {
      mathematics: [],
      programming: [],
      english: [],
      general: [],
    };

    // Add SRS reviews to queue
    for (const srs of dueSrs) {
      const s = srs.subject || "general";
      if (s in grouped) {
        grouped[s]!.push({
          task_type: "srs_review",
          id: srs.id,
          subject: s,
          title: `Repaso: ${srs.entity_id || srs.topic}`,
          topic: srs.topic || "",
          difficulty: srs.difficulty || 1,
          mastery: srs.mastery || 0.0,
          data: srs,
        });
      }
    }

    // Add unresolved errors for remediation
    for (const err of unresolvedErrors) {
      const s = err.subject || "general";
      if (s in grouped) {
        grouped[s]!.push({
          task_type: "error_remediation",
          id: err.id,
          subject: s,
          title: `Corregir error [${err.category}]: ${err.topic}`,
          topic: err.topic || "",
          difficulty: 3,
          data: err,
        });
      }
    }

    // Add pending exercises
    for (const ex of pendingExercises) {
      const s = ex.subject || "general";
      if (s in grouped) {
        const titleSnippet = ex.topic || ex.prompt.slice(0, 30);
        grouped[s]!.push({
          task_type: "exercise",
          id: ex.id,
          subject: s,
          title: `Ejercicio [${ex.type}]: ${titleSnippet}`,
          topic: ex.topic || "",
          difficulty: ex.difficulty || 1,
          data: ex,
        });
      }
    }

    // Limit per subject
    for (const s of SUBJECTS) {
      grouped[s] = grouped[s]!.slice(0, limitPerSubject);
    }

    // 4. Interleaving algorithm: alternate tasks across subjects
    const interleaved: DailyQueueTask[] = [];
    const maxLen = Math.max(...SUBJECTS.map((s) => grouped[s]!.length), 0);

    for (let step = 0; step < maxLen; step++) {
      for (const s of SUBJECTS) {
        if (step < grouped[s]!.length) {
          interleaved.push(grouped[s]![step]!);
        }
      }
    }

    return {
      date: todayStr,
      by_subject: grouped,
      interleaved,
      total_tasks: interleaved.length,
      srs_due_count: dueSrs.length,
      unresolved_errors_count: unresolvedErrors.length,
    };
  }

  get_queue(
    targetDate?: Date | string | null,
    limitPerSubject: number = 5
  ): UnifiedDailyQueue {
    return this.getQueue(targetDate, limitPerSubject);
  }
}
