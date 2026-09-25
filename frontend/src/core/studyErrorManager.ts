/**
 * NoteVault Study Error Manager
 * Manages learning errors across Mathematics, Programming, English, and General subjects.
 * Classifies errors under 11 strict categories and links them to the SRS engine for remediation.
 * Stores individual errors in .notevault/estudio/errores/<error_id>.json.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatIsoDatetime } from "./dates.js";
import * as store from "./store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "./vaultFormat.js";

export const ERROR_CATEGORIES = [
  "conceptual",
  "logical",
  "procedural",
  "calculation",
  "syntax",
  "implementation",
  "grammar",
  "vocabulary",
  "listening",
  "reading",
  "pronunciation",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export interface StudyError {
  id: string;
  category: string;
  subject: string;
  topic: string;
  source_note: string;
  exercise_id: string;
  wrong_answer: string;
  expected: string;
  explanation: string;
  occurred_at: string;
  resolved: boolean;
  repeat_count: number;
  discipline: string;
  skill: string;
  mode: string;
  anchor: string;
  description_en: string;
  fix_en: string;
  note_id: string;
  last_seen: string;
}

export function generateErrorId(subject: string, topic: string, category: string): string {
  const raw = `${subject}:${topic}:${category}:${Date.now()}:${process.hrtime.bigint()}`;
  const h = crypto.createHash("sha256").update(raw, "utf-8").digest("hex").slice(0, 12);
  return `err_${h}`;
}

export const generate_error_id = generateErrorId;

export function sanitizeError(raw: Record<string, any>, fallbackId: string = ""): StudyError {
  const data = raw && typeof raw === "object" ? raw : {};
  let errId = String(data.id || fallbackId || "").trim();
  if (!errId) {
    const rawVal = `${Date.now()}:${process.hrtime.bigint()}`;
    const h = crypto.createHash("sha256").update(rawVal, "utf-8").digest("hex").slice(0, 12);
    errId = `err_${h}`;
  }

  let category = String(data.category || "conceptual").toLowerCase();
  if (!ERROR_CATEGORIES.includes(category as any)) {
    category = "conceptual";
  }

  const occurredAt = String(data.occurred_at || formatIsoDatetime(new Date()));
  const repeatCount = parseInt(String(data.repeat_count), 10);

  return {
    id: errId,
    category,
    subject: String(data.subject || "general").toLowerCase(),
    topic: String(data.topic || "").trim(),
    source_note: String(data.source_note || ""),
    exercise_id: String(data.exercise_id || ""),
    wrong_answer: String(data.wrong_answer || "").trim(),
    expected: String(data.expected || "").trim(),
    explanation: String(data.explanation || "").trim(),
    occurred_at: occurredAt,
    resolved: Boolean(data.resolved),
    repeat_count: Math.max(1, Number.isNaN(repeatCount) ? 1 : repeatCount),
    discipline: String(data.discipline || "").trim(),
    skill: String(data.skill || "").trim(),
    mode: String(data.mode || "").trim(),
    anchor: String(data.anchor || "").trim(),
    description_en: String(data.description_en || "").trim(),
    fix_en: String(data.fix_en || "").trim(),
    note_id: String(data.note_id || "").trim(),
    last_seen: String(data.last_seen || occurredAt),
  };
}

export const sanitize_error = sanitizeError;

export function repeatKey(err: Record<string, any>): string {
  const anchorVal = String(err.anchor || "").trim().toLowerCase();
  const categoryVal = String(err.category || "conceptual").toLowerCase();
  return [
    String(err.subject || "").toLowerCase(),
    String(err.topic || "").trim(),
    String(err.discipline || "").trim(),
    String(err.skill || "").trim(),
    anchorVal || categoryVal,
  ].join(":::");
}

export const repeat_key = repeatKey;

export class StudyErrorManager {
  readonly vaultRoot: string;
  readonly dir: string;
  private _cache: Map<string, StudyError> | null = null;
  private _stamp: string | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.study_errors_dir);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private _path(errId: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.study_error, { id: errId }));
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

  private _loadAll(): Map<string, StudyError> {
    const { files, stampStr } = this._dirStamp();
    if (this._cache === null || stampStr !== this._stamp) {
      const out = new Map<string, StudyError>();
      for (const name of files) {
        if (isSyncConflict(name)) continue;
        const filePath = path.join(this.dir, name);
        const data = store.loadJson<Record<string, any>>(filePath);
        if (data && typeof data === "object") {
          const clean = sanitizeError(data, path.basename(name, ".json"));
          out.set(clean.id, clean);
        }
      }
      this._cache = out;
      this._stamp = stampStr;
    }
    return this._cache;
  }

  errors(
    subject?: string | null,
    category?: string | null,
    unresolvedOnly: boolean = false
  ): StudyError[] {
    let items = Array.from(this._loadAll().values());
    if (subject) {
      const sLow = subject.toLowerCase();
      items = items.filter((e) => e.subject === sLow);
    }
    if (category) {
      const cLow = category.toLowerCase();
      items = items.filter((e) => e.category === cLow);
    }
    if (unresolvedOnly) {
      items = items.filter((e) => !e.resolved);
    }
    items.sort((a, b) => (b.occurred_at || "").localeCompare(a.occurred_at || ""));
    return items.map((e) => ({ ...e }));
  }

  get(errorId: string): StudyError | null {
    const err = this._loadAll().get(errorId);
    return err ? { ...err } : null;
  }

  recordError(
    category: string,
    subject: string,
    topic: string,
    wrongAnswer: string,
    expectedOrOptions:
      | string
      | {
          expected?: string;
          explanation?: string;
          source_note?: string;
          exercise_id?: string;
          discipline?: string;
          skill?: string;
          mode?: string;
          anchor?: string;
          description_en?: string;
          fix_en?: string;
          note_id?: string;
        } = "",
    explanation: string = "",
    sourceNote: string = "",
    exerciseId: string = "",
    options?: {
      discipline?: string;
      skill?: string;
      mode?: string;
      anchor?: string;
      description_en?: string;
      fix_en?: string;
      note_id?: string;
    }
  ): StudyError {
    let exp = "";
    let expl = explanation;
    let src = sourceNote;
    let exId = exerciseId;
    let opts = options;

    if (typeof expectedOrOptions === "object" && expectedOrOptions !== null) {
      exp = expectedOrOptions.expected || "";
      expl = expectedOrOptions.explanation || "";
      src = expectedOrOptions.source_note || "";
      exId = expectedOrOptions.exercise_id || "";
      opts = { ...expectedOrOptions, ...options };
    } else {
      exp = String(expectedOrOptions || "");
    }

    const now = formatIsoDatetime(new Date());
    const data: Record<string, any> = {
      category,
      subject,
      topic,
      wrong_answer: wrongAnswer,
      expected: exp,
      explanation: expl,
      source_note: src,
      exercise_id: exId,
      occurred_at: now,
      resolved: false,
      repeat_count: 1,
      discipline: opts?.discipline || "",
      skill: opts?.skill || "",
      mode: opts?.mode || "",
      anchor: opts?.anchor || "",
      description_en: opts?.description_en || "",
      fix_en: opts?.fix_en || "",
      note_id: opts?.note_id || "",
      last_seen: now,
    };

    let clean = sanitizeError(data, generateErrorId(subject, topic, category));
    const key = repeatKey(clean);

    let previous: StudyError | null = null;
    for (const e of this._loadAll().values()) {
      if (!e.resolved && repeatKey(e) === key) {
        previous = e;
        break;
      }
    }

    if (previous) {
      const latest: Record<string, any> = {};
      for (const [k, v] of Object.entries(clean)) {
        if (k !== "id" && k !== "occurred_at" && k !== "repeat_count" && v !== "") {
          latest[k] = v;
        }
      }
      clean = sanitizeError({
        ...previous,
        ...latest,
        repeat_count: previous.repeat_count + 1,
      });
    }

    store.writeJson(this._path(clean.id), clean);
    this._cache = null;
    return clean;
  }

  record_error(
    category: string,
    subject: string,
    topic: string,
    wrongAnswer: string,
    expectedOrOptions:
      | string
      | {
          expected?: string;
          explanation?: string;
          source_note?: string;
          exercise_id?: string;
          discipline?: string;
          skill?: string;
          mode?: string;
          anchor?: string;
          description_en?: string;
          fix_en?: string;
          note_id?: string;
        } = "",
    explanation: string = "",
    sourceNote: string = "",
    exerciseId: string = "",
    options?: {
      discipline?: string;
      skill?: string;
      mode?: string;
      anchor?: string;
      description_en?: string;
      fix_en?: string;
      note_id?: string;
    }
  ): StudyError {
    return this.recordError(
      category,
      subject,
      topic,
      wrongAnswer,
      expectedOrOptions,
      explanation,
      sourceNote,
      exerciseId,
      options
    );
  }

  markResolved(errorId: string, resolved: boolean = true): StudyError | null {
    const err = this.get(errorId);
    if (!err) return null;
    err.resolved = resolved;
    const sanitized = sanitizeError(err);
    store.writeJson(this._path(errorId), sanitized);
    this._cache = null;
    return sanitized;
  }

  mark_resolved(errorId: string, resolved: boolean = true): StudyError | null {
    return this.markResolved(errorId, resolved);
  }

  categoryBreakdown(subject?: string | null): Record<string, number> {
    const allErrs = this.errors(subject);
    const breakdown: Record<string, number> = {};
    for (const cat of ERROR_CATEGORIES) {
      breakdown[cat] = 0;
    }
    for (const e of allErrs) {
      const cat = e.category || "conceptual";
      if (cat in breakdown) {
        breakdown[cat] = (breakdown[cat] || 0) + 1;
      }
    }
    return breakdown;
  }

  category_breakdown(subject?: string | null): Record<string, number> {
    return this.categoryBreakdown(subject);
  }
}
