/**
 * The review notes on disk: `<Subject>/Repaso/<topic>.md`, one per practised topic.
 * Every graded attempt inside a topic updates its note (see reviewSchedule.ts for
 * the rules); the notifier and the Repaso panel read them back.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { findAncestorTopicManifest } from "./topic.js";
import {
  addPractice,
  daysUntil,
  isIsoDate,
  isoDate,
  moveReview,
  newReview,
  parseReview,
  projectSchedule,
  serializeReview,
  type PlannedReview,
  type ReviewState,
} from "./reviewSchedule.js";
import { ApiError } from "../errors.js";
import { rescheduleVocab } from "./vocabReviews.js";

export const REVIEW_FOLDER = "Repaso";

export interface ReviewItem {
  /** vault-relative path of the review note */
  path: string;
  topic: string;
  topicPath: string;
  subject: string;
  /** the vault folder the subject lives in (its first path segment) */
  subjectFolder: string;
  next: string;
  last: string;
  level: number;
  /** days until the review (negative = overdue) */
  inDays: number;
  /** distinct skills practised over the topic's history, most recent first */
  skills: string[];
  /** how many different days the topic has been practised */
  practicedDays: number;
  /** the pending review and the ones after it, if each is done on its date */
  upcoming: PlannedReview[];
  /** `vocab` for a word of the English word bank; absent (= topic) for topic reviews */
  kind?: "topic" | "vocab";
}

function toItem(rootAbs: string, abs: string, subjectFolder: string, state: ReviewState, today: string): ReviewItem {
  const skills: string[] = [];
  for (const d of [...state.days].reverse()) for (const k of d.skills) if (!skills.includes(k)) skills.push(k);
  return {
    path: posix(path.relative(rootAbs, abs)),
    topic: state.topic,
    topicPath: state.topicPath,
    subject: state.subject,
    subjectFolder,
    next: state.next,
    last: state.days[state.days.length - 1]?.date ?? "",
    level: state.level,
    inDays: daysUntil(state.next, today),
    skills,
    practicedDays: state.days.length,
    upcoming: projectSchedule(state.next, state.level, 4),
  };
}

/**
 * Moves the pending review of a topic to another day (what the calendar's drag and drop and date
 * boxes do). Only a review note (`<Subject>/Repaso/<topic>.md`) inside the vault can be moved.
 */
export function rescheduleReview(rootAbs: string, relPath: string, date: string, today: string = isoDate(new Date())): ReviewItem {
  if (!isIsoDate(date)) throw new ApiError("La fecha no es válida.");
  if (relPath.startsWith("vocab:")) {
    const word = rescheduleVocab(rootAbs, relPath, date, today);
    if (!word) throw new ApiError("Esa palabra ya no está en el banco.");
    return word;
  }
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length !== 3 || parts[1] !== REVIEW_FOLDER || !parts[2]!.toLowerCase().endsWith(".md") || parts[0]!.startsWith(".") || parts.includes("..")) {
    throw new ApiError("Ese archivo no es una nota de repaso.");
  }
  const abs = path.join(rootAbs, ...parts);
  let state: ReviewState | null = null;
  try {
    state = parseReview(fs.readFileSync(abs, "utf-8"));
  } catch {
    state = null;
  }
  if (!state) throw new ApiError("No se pudo leer esa nota de repaso.");
  const moved = moveReview(state, date);
  fs.writeFileSync(abs, serializeReview(moved, today), "utf-8");
  return toItem(rootAbs, abs, parts[0]!, moved, today);
}

const posix = (p: string) => p.split(path.sep).join("/");
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

/** Registers a graded attempt of an exercise; returns the review note it updated, or null outside a topic. */
export function recordTopicPractice(
  rootAbs: string,
  exerciseAbs: string,
  info: { skill: string; passed: boolean; now?: Date },
): string | null {
  const found = findAncestorTopicManifest(exerciseAbs, rootAbs);
  if (!found) return null;
  const topicRel = posix(path.relative(rootAbs, found.topicFolder));
  const subjectFolder = topicRel.split("/")[0];
  if (!subjectFolder || subjectFolder.startsWith(".") || topicRel === subjectFolder) return null;
  const now = info.now ?? new Date();
  const topicName = path.basename(found.topicFolder);
  const file = path.join(rootAbs, subjectFolder, REVIEW_FOLDER, `${fileSafe(topicName)}.md`);

  let state: ReviewState | null = null;
  try {
    state = parseReview(fs.readFileSync(file, "utf-8"));
  } catch {
    state = null;
  }
  const base = state ?? newReview(found.manifest.title || topicName, topicRel, found.manifest.subject || "mathematics");
  const next = addPractice(base, { date: isoDate(now), skill: info.skill, passed: info.passed });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeReview(next, isoDate(now)), "utf-8");
  return posix(path.relative(rootAbs, file));
}

/** Every review note in the vault, soonest first. */
export function listReviews(rootAbs: string, today: string = isoDate(new Date())): ReviewItem[] {
  const out: ReviewItem[] = [];
  let subjects: fs.Dirent[] = [];
  try {
    subjects = fs.readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const s of subjects) {
    if (!s.isDirectory() || s.name.startsWith(".")) continue;
    const dir = path.join(rootAbs, s.name, REVIEW_FOLDER);
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
    } catch {
      continue;
    }
    for (const f of files) {
      const abs = path.join(dir, f);
      let state: ReviewState | null = null;
      try {
        state = parseReview(fs.readFileSync(abs, "utf-8"));
      } catch {
        state = null;
      }
      if (!state || !state.next) continue;
      out.push(toItem(rootAbs, abs, s.name, state, today));
    }
  }
  return out.sort((a, b) => a.next.localeCompare(b.next) || a.topic.localeCompare(b.topic, "es", { numeric: true }));
}
