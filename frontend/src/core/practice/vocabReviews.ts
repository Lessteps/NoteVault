/**
 * Scheduled reviews of the English word bank, shaped like topic reviews so the Repaso calendar shows both.
 *
 * Every word with a `next_review` is one review item (`vocab:<id>`); its projection follows the vocabulary
 * ladder (1, 3, 7, 14, 30, 60 days). Reminders do not fire once per word: the notifier gets ONE group item
 * ("Vocabulario: N palabras") per day.
 *
 * Scope note: the review system started as a mathematics pilot (topic reviews). Vocabulary reviews widen it to
 * English words; the topic reviews of any subject are unchanged.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { EnglishVocabularyManager, VOCAB_INTERVALS, type VocabItem } from "../englishVocabularyManager.js";
import type { ReviewItem } from "./reviewFiles.js";
import { addDays, daysUntil, type PlannedReview } from "./reviewSchedule.js";

const bankDir = (root: string): string => path.join(root, ".notevault", "estudio", "vocabulario");

/** The bank, or null when the vault has never had one (opening it would create its folder). */
function bank(root: string): EnglishVocabularyManager | null {
  return fs.existsSync(bankDir(root)) ? new EnglishVocabularyManager(root) : null;
}

/** The days a word comes back if every review is passed on time: its pending date, then up the ladder. */
export function projectVocab(next: string, level: number, count = 4): PlannedReview[] {
  if (!next) return [];
  const step = (l: number): number => VOCAB_INTERVALS[Math.min(Math.max(l, 1), VOCAB_INTERVALS.length) - 1]!;
  const out: PlannedReview[] = [{ date: next, interval: step(level), level }];
  let date = next;
  for (let k = 1; k < count; k += 1) {
    date = addDays(date, step(level + k));
    out.push({ date, interval: step(level + k), level: level + k });
  }
  return out;
}

function toItem(w: VocabItem, today: string): ReviewItem {
  return {
    path: `vocab:${w.id}`,
    topic: w.meaning ? `${w.word} — ${w.meaning}` : w.word,
    topicPath: "",
    subject: "english",
    subjectFolder: "",
    next: w.next_review,
    last: w.last_review,
    level: w.srs_level,
    inDays: daysUntil(w.next_review, today),
    skills: [],
    practicedDays: w.srs_level,
    upcoming: projectVocab(w.next_review, w.srs_level, 4),
    kind: "vocab",
  };
}

/** Every scheduled word of the bank, soonest first. */
export function listVocabReviews(root: string, today: string): ReviewItem[] {
  const b = bank(root);
  if (!b) return [];
  return b
    .allWords()
    .filter((w) => w.next_review)
    .map((w) => toItem(w, today))
    .sort((a, b2) => a.next.localeCompare(b2.next) || a.topic.localeCompare(b2.topic));
}

/** One item that stands for all the words due today or earlier (what the reminder announces); null when none. */
export function vocabDueGroup(root: string, today: string): ReviewItem | null {
  const due = listVocabReviews(root, today).filter((i) => i.inDays <= 0);
  if (!due.length) return null;
  return {
    path: "vocab:group",
    topic: `Vocabulario: ${due.length} palabra${due.length === 1 ? "" : "s"}`,
    topicPath: "",
    subject: "english",
    subjectFolder: "",
    next: today,
    last: "",
    level: 0,
    inDays: 0,
    skills: [],
    practicedDays: 0,
    upcoming: [],
    kind: "vocab",
  };
}

/** Moves the next review of one word (`vocab:<id>`) to another day. */
export function rescheduleVocab(root: string, path_: string, date: string, today: string): ReviewItem | null {
  const id = path_.replace(/^vocab:/, "");
  const b = bank(root);
  const moved = b?.setNextReview(id, date);
  return moved ? toItem(moved, today) : null;
}
