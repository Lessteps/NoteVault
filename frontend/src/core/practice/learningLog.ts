/**
 * The learning record of a competency inside a topic: what the student got wrong while
 * practising it, kept in the PRIVATE `.notevault/estudio/aprendizaje/<topic>/<skill>.json`
 * (one file per topic and skill, never in the vault's notes).
 *
 * It is opt-in per competency ("Activar registro de errores"): only when the box is on
 * are the mistakes of graded attempts written down, and only then do the next sessions
 * of that competency use them — the AI writes the exercises around those mistakes (its
 * main focus) while still training the whole competency and keeping the rest active.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { StudyErrorManager } from "../studyErrorManager.js";

export interface LearningEntry {
  at: string;
  exercise: string;
  title: string;
  score: number;
  category: string;
  description: string;
  evidence: string;
  fix: string;
}

export interface LearningRecord {
  version: 1;
  topic: string;
  folder: string;
  skill: string;
  enabled: boolean;
  since: string;
  entries: LearningEntry[];
}

const DIR = [".notevault", "estudio", "aprendizaje"];
const MAX_ENTRIES = 60;
const MAX_TEXT = 400;

export function topicSlug(folderRel: string): string {
  return folderRel
    .replace(/\\/g, "/")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 120);
}

const safeSkill = (skill: string): string => skill.toLowerCase().replace(/[^a-z0-9_-]/g, "");

export function learningFile(root: string, folderRel: string, skill: string): string {
  return path.join(root, ...DIR, topicSlug(folderRel), `${safeSkill(skill)}.json`);
}

export function readLearning(root: string, folderRel: string, skill: string): LearningRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(learningFile(root, folderRel, skill), "utf-8")) as LearningRecord;
    return parsed && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

function write(root: string, rec: LearningRecord): void {
  const file = learningFile(root, rec.folder, rec.skill);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf-8");
}

const cut = (s: unknown, n = MAX_TEXT): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Turns the box on or off. Turning it on for the first time keeps what was already known (`seed`). */
export function setLearningEnabled(
  root: string,
  folderRel: string,
  topic: string,
  skill: string,
  enabled: boolean,
  seed: LearningEntry[] = [],
): LearningRecord {
  const existing = readLearning(root, folderRel, skill);
  const rec: LearningRecord = existing ?? {
    version: 1,
    topic,
    folder: folderRel,
    skill: safeSkill(skill),
    enabled,
    since: new Date().toISOString(),
    entries: seed.slice(-MAX_ENTRIES),
  };
  rec.enabled = enabled;
  write(root, rec);
  return rec;
}

/** Writes mistakes down, but only for a competency whose record is switched on. */
export function recordLearning(root: string, folderRel: string, skill: string, entries: LearningEntry[]): number {
  const rec = readLearning(root, folderRel, skill);
  if (!rec?.enabled || !entries.length) return 0;
  for (const e of entries) {
    rec.entries.push({
      at: e.at,
      exercise: cut(e.exercise, 120),
      title: cut(e.title, 160),
      score: Math.round(e.score),
      category: cut(e.category, 60),
      description: cut(e.description),
      evidence: cut(e.evidence),
      fix: cut(e.fix),
    });
  }
  rec.entries = rec.entries.slice(-MAX_ENTRIES);
  write(root, rec);
  return entries.length;
}

/** `{ skill: { enabled, entries } }` for every competency of the topic that has a record. */
export function learningStatus(root: string, folderRel: string): Record<string, { enabled: boolean; entries: number }> {
  const dir = path.join(root, ...DIR, topicSlug(folderRel));
  const out: Record<string, { enabled: boolean; entries: number }> = {};
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    const skill = f.replace(/\.json$/, "");
    const rec = readLearning(root, folderRel, skill);
    if (rec) out[skill] = { enabled: rec.enabled, entries: rec.entries.length };
  }
  return out;
}

/**
 * The mistakes as prompt lines, most recent first, one per distinct description — what the
 * AI is told to write the next exercises around. Empty when the record is off or has none.
 */
export function learningPromptLines(root: string, folderRel: string, skill: string, max = 12): string[] {
  const rec = readLearning(root, folderRel, skill);
  if (!rec?.enabled) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of [...rec.entries].reverse()) {
    const key = (e.description || e.category).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const parts = [e.description || e.category];
    if (e.evidence) parts.push(`lo que escribió: «${e.evidence.slice(0, 160)}»`);
    if (e.fix) parts.push(`lo correcto: ${e.fix.slice(0, 160)}`);
    lines.push(parts.join(" — "));
    if (lines.length >= max) break;
  }
  return lines;
}

/** What the error log already knew about this competency of the topic, to start the record with. */
export function seedFromErrorLog(root: string, folderRel: string, subject: string, skill: string): LearningEntry[] {
  try {
    const prefix = folderRel.replace(/\\/g, "/").replace(/\/$/, "") + "/";
    return new StudyErrorManager(root)
      .errors(subject, null, true)
      .filter((e) => e.source_note.replace(/\\/g, "/").startsWith(prefix) && (e.mode === skill || e.skill === skill))
      .reverse()
      .map((e) => ({
        at: e.occurred_at,
        exercise: e.exercise_id || e.note_id,
        title: e.exercise_id || e.note_id,
        score: 0,
        category: e.category,
        description: e.explanation || e.description_en,
        evidence: e.wrong_answer,
        fix: e.expected || e.fix_en,
      }));
  } catch {
    return [];
  }
}
