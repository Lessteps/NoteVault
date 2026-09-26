/**
 * Per-exercise attempt history and answer draft, in .notevault/estudio/intentos/.
 * Ported from notevault_app/core/practice/attempts.py.
 */

import * as crypto from "node:crypto";
import * as path from "node:path";
import { nowLocalIso } from "../dates";
import { loadJson, writeJson } from "../store";
import { formatLayout, LAYOUT } from "../vaultFormat";
import { ExerciseNote } from "./exerciseNote";
import { GradeResult } from "./grading";

export function attemptKey(noteId: string): string {
  const hash = crypto.createHash("sha256").update(String(noteId)).digest("hex").slice(0, 12);
  return `att_${hash}`;
}
export const attempt_key = attemptKey;

export class PracticeAttemptStore {
  vaultRoot: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
  }

  _path(noteId: string): string {
    const rel = formatLayout(LAYOUT.study_attempt, { id: attemptKey(noteId) });
    return path.join(this.vaultRoot, rel);
  }

  load(noteId: string): {
    note_id: string;
    note_path: string;
    draft: string;
    attempts: Record<string, any>[];
  } {
    const filePath = this._path(noteId);
    const data = loadJson<Record<string, any>>(filePath, {}) || {};
    const attempts = Array.isArray(data.attempts) ? data.attempts : [];
    return {
      note_id: String(data.note_id || noteId),
      note_path: String(data.note_path || ""),
      draft: String(data.draft || ""),
      attempts: attempts.filter((a) => typeof a === "object" && a !== null),
    };
  }

  attempts(noteId: string): Record<string, any>[] {
    return this.load(noteId).attempts;
  }

  draft(noteId: string): string {
    return this.load(noteId).draft;
  }

  saveDraft(noteId: string, notePath: string, text: string): void {
    const data = this.load(noteId);
    if (data.draft === text && data.note_path === notePath) {
      return;
    }
    data.draft = text;
    data.note_path = notePath;
    writeJson(this._path(noteId), data);
  }
  save_draft(noteId: string, notePath: string, text: string): void {
    this.saveDraft(noteId, notePath, text);
  }

  record(
    ex: ExerciseNote,
    notePath: string,
    options: {
      answer: string;
      hints_used: number;
      seconds: number;
      solution_seen: boolean;
      transport: string;
      result: GradeResult | null;
      quality: number;
    },
  ): Record<string, any> {
    const res = options.result;
    const attempt: Record<string, any> = {
      at: nowLocalIso(),
      mode: ex.mode,
      discipline: ex.discipline,
      skill: ex.skill,
      subject: ex.subject,
      answer: options.answer,
      hints_used: Math.trunc(options.hints_used),
      seconds: Math.trunc(options.seconds),
      solution_seen: Boolean(options.solution_seen),
      transport: options.transport,
      score: res ? res.score : 0,
      quality: Math.trunc(options.quality),
      verdict: res ? res.verdict : "ungraded",
      rubric: res ? [...res.rubric] : [],
      errors: res
        ? res.errors.map((e) => ({
            category: e.category,
            anchor: e.anchor,
            description: e.description,
            evidence: e.evidence,
            fix: e.fix,
          }))
        : [],
      feedback: res ? res.feedback : "",
      next_step: res ? res.next_step : "",
      example: res ? res.example : "",
    };

    const data = this.load(ex.note_id);
    data.note_path = notePath;
    data.draft = "";
    data.attempts.push(attempt);
    writeJson(this._path(ex.note_id), data);
    return attempt;
  }
}
