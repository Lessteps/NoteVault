/**
 * English error log fed by graded attempts, and the post-grading pipeline.
 */

import * as path from "node:path";
import { formatIsoDatetime } from "../dates.js";
import * as store from "../store.js";
import { StudyError, StudyErrorManager } from "../studyErrorManager.js";
import { StudySRSManager } from "../studySrsManager.js";
import { LAYOUT } from "../vaultFormat.js";
import { PracticeAttemptStore } from "./attempts.js";
import { ExerciseNote } from "./exerciseNote.js";
import { GradeResult, qualityFrom } from "./grading.js";
import { countAttempt } from "./ledger.js";

export const SUBJECT_ORDER = ["mathematics", "programming", "english", "general"] as const;
const _EVIDENCE_MAX = 500;

function _relPath(vaultRoot: string, filePath?: string | null): string {
  if (!filePath) return "";
  try {
    return path.relative(path.resolve(vaultRoot), path.resolve(filePath)).replace(/\\/g, "/");
  } catch {
    return String(filePath);
  }
}

function _sentence(text: any): string {
  const clean = String(text ?? "").trim().split(/\s+/).join(" ");
  if (!clean) return "";
  if (/[.!?]$/.test(clean)) return clean;
  return clean + ".";
}

export function recordGradeErrors(
  vaultRoot: string,
  ex: ExerciseNote,
  result: GradeResult,
  answer: string
): StudyError[] {
  if (!result.errors || result.errors.length === 0) {
    return [];
  }
  const manager = new StudyErrorManager(vaultRoot);
  const source = _relPath(vaultRoot, ex.path);
  return result.errors.map((err) =>
    manager.recordError(
      err.category,
      ex.subject,
      ex.skill || ex.discipline,
      err.evidence || answer.slice(0, _EVIDENCE_MAX),
      err.fix,
      err.description,
      source,
      ex.note_id,
      {
        discipline: ex.discipline,
        skill: ex.skill,
        mode: ex.mode,
        anchor: err.anchor,
        description_en: err.description,
        fix_en: err.fix,
        note_id: ex.note_id,
      }
    )
  );
}

export const record_grade_errors = recordGradeErrors;

function _recency(err: Record<string, any>): string {
  return String(err.last_seen || err.occurred_at || "");
}

export function recentErrors(
  vaultRoot: string,
  subject: string,
  limit: number = 15
): StudyError[] {
  const errors = new StudyErrorManager(vaultRoot).errors(subject, null, true);
  errors.sort((a, b) => _recency(b).localeCompare(_recency(a)));
  return errors.slice(0, Math.max(0, limit));
}

export const recent_errors = recentErrors;

function _digestLine(err: Record<string, any>): string {
  const head = [`[x${err.repeat_count}] ${err.category}`];
  if (err.discipline) {
    head.push(err.discipline);
  }
  if (err.anchor) {
    head.push(`anchor: "${err.anchor}"`);
  }
  let line = "- " + head.join(" \u00b7 ");
  const description = err.description_en || err.explanation || "";
  if (description) {
    line += " \u2014 " + _sentence(description);
  }
  const fix = err.fix_en || err.expected || "";
  if (fix) {
    line += " Fix: " + _sentence(fix);
  }
  const seen = _recency(err).slice(0, 10);
  const where = err.note_id || err.exercise_id || err.topic || "";
  if (seen) {
    line += ` Last seen ${seen}${where ? ` in ${where}.` : "."}`;
  }
  return line;
}

export function writeErrorDigest(vaultRoot: string): string {
  const errors = new StudyErrorManager(vaultRoot).errors(null, null, true);
  const bySubject = new Map<string, Array<Record<string, any>>>();
  for (const err of errors) {
    const s = err.subject;
    if (!bySubject.has(s)) {
      bySubject.set(s, []);
    }
    bySubject.get(s)!.push(err);
  }

  const subjects: string[] = [];
  for (const s of SUBJECT_ORDER) {
    if (bySubject.has(s)) {
      subjects.push(s);
    }
  }
  for (const s of Array.from(bySubject.keys()).sort()) {
    if (!subjects.includes(s)) {
      subjects.push(s);
    }
  }

  const dt = formatIsoDatetime(new Date());
  const lines = [
    "# NoteVault learner error log",
    `Generated ${dt}. Unresolved errors, most repeated first.`,
  ];
  if (subjects.length === 0) {
    lines.push("", "No unresolved errors.");
  }
  for (const subject of subjects) {
    const items = [...(bySubject.get(subject) || [])];
    items.sort((a, b) => _recency(b).localeCompare(_recency(a)));
    items.sort((a, b) => b.repeat_count - a.repeat_count);
    lines.push("", `## ${subject}`, ...items.map(_digestLine));
  }

  const outPath = path.join(path.resolve(vaultRoot), LAYOUT.study_error_digest);
  store.writeText(outPath, lines.join("\n") + "\n");
  return outPath;
}

export const write_error_digest = writeErrorDigest;

export function applyResult(
  vaultRoot: string,
  ex: ExerciseNote,
  notePath: string,
  options: {
    answer: string;
    hints_used: number;
    seconds: number;
    solution_seen: boolean;
    transport: string;
    result: GradeResult;
    entity_type?: string;
    /** Se abandonó el ejercicio (fase 2: no cuenta). */
    gave_up?: boolean;
  }
): Record<string, any> {
  const quality = qualityFrom(options.result, options.hints_used, options.solution_seen);
  // Fase 2: el registro guarda si el intento cuenta y por qué, para que el progreso
  // y los repasos no se muevan con práctica hecha con ayuda.
  const counting = countAttempt({
    verdict: (options.result as unknown as { verdict?: unknown })?.verdict,
    score: (options.result as unknown as { score?: unknown })?.score,
    hints_used: options.hints_used,
    solution_seen: options.solution_seen,
    gave_up: options.gave_up,
  });
  const attempt = new PracticeAttemptStore(vaultRoot).record(ex, notePath, {
    answer: options.answer,
    hints_used: options.hints_used,
    seconds: options.seconds,
    solution_seen: options.solution_seen,
    transport: options.transport,
    result: options.result,
    quality,
    counted: counting.counted,
    ...(counting.counted ? {} : { no_count_reason: counting.reasons.join("; ") }),
  });
  recordGradeErrors(vaultRoot, ex, options.result, options.answer);
  writeErrorDigest(vaultRoot);
  const srs = new StudySRSManager(vaultRoot);
  const entityType = options.entity_type || "exercise";
  const item = srs.registerItem(
    ex.note_id,
    entityType,
    ex.subject,
    ex.skill || ex.discipline,
    notePath,
    ex.difficulty
  );
  // Solo se reprograma la revisión si el intento cuenta: con ayuda, el repaso
  // sigue donde estaba hasta que el ejercicio se rehaga sin ella.
  if (counting.counted) srs.review(item.id, quality);
  return attempt;
}

export const apply_result = applyResult;
