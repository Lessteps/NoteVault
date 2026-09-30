// Ported from notevault_app/core/english_vocabulary_manager.py
// Structured vocabulary entities stored in .notevault/estudio/vocabulario/<id>.json.

import * as fs from "node:fs";
import * as path from "node:path";
import { loadJson, slug, writeJson } from "./store.js";
import { isSyncConflict } from "./vaultFormat.js";
import { wordClassOf, wordClassOfTopic, type WordClass } from "../lib/englishSkillData.js";

export const PRACTICE_MODES = [
  "en_to_meaning", "meaning_to_en", "sentence_to_word", "ipa_to_word", "word_to_sentence", "cloze",
] as const;
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface VocabItem {
  id: string;
  word: string;
  meaning: string;
  part_of_speech: string;
  pronunciation: string;
  examples: string[];
  collocations: string[];
  synonyms: string[];
  topic: string;
  level: string;
  mastery: number;
  source_note: string;
  /** spaced repetition: the day this word is due again (YYYY-MM-DD; empty = new, due now) */
  next_review: string;
  /** how many reviews in a row were passed (index into VOCAB_INTERVALS) */
  srs_level: number;
  last_review: string;
}

/** Days until the next review after each consecutive success. A failure sends the word back to tomorrow. */
export const VOCAB_INTERVALS = [1, 3, 7, 14, 30, 60] as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDaysIso = (iso: string, n: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

function asList(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}

export function sanitizeVocabItem(raw: unknown, fallbackWord = ""): VocabItem {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const word = String(r.word ?? fallbackWord ?? "").trim();
  const cleanId = slug(word) || "vocab_item";
  let level = String(r.level ?? "B1").toUpperCase().trim();
  if (!CEFR_LEVELS.includes(level)) level = "B1";
  let mastery = Number(r.mastery ?? 0) || 0;
  mastery = Math.round(Math.max(0, Math.min(1, mastery)) * 100) / 100;
  return {
    id: cleanId,
    word,
    meaning: String(r.meaning ?? "").trim(),
    part_of_speech: String(r.part_of_speech ?? "noun").trim().toLowerCase(),
    pronunciation: String(r.pronunciation ?? "").trim(),
    examples: asList(r.examples),
    collocations: asList(r.collocations),
    synonyms: asList(r.synonyms),
    topic: String(r.topic ?? "general").trim().toLowerCase(),
    level,
    mastery,
    source_note: String(r.source_note ?? ""),
    next_review: ISO_DAY.test(String(r.next_review ?? "")) ? String(r.next_review) : "",
    srs_level: Math.max(0, Math.min(VOCAB_INTERVALS.length, Math.trunc(Number(r.srs_level ?? 0)) || 0)),
    last_review: ISO_DAY.test(String(r.last_review ?? "")) ? String(r.last_review) : "",
  };
}

export class EnglishVocabularyManager {
  vaultRoot: string;
  dir: string;
  private _cache: Record<string, VocabItem> | null = null;
  private _stamp = "";

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
    this.dir = path.join(vaultRoot, ".notevault", "estudio", "vocabulario");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private _path(vocabId: string): string {
    return path.join(this.dir, `${vocabId}.json`);
  }

  private _dirStamp(): string {
    try {
      return fs.readdirSync(this.dir)
        .filter((n) => n.endsWith(".json"))
        .sort()
        .map((n) => `${n}:${fs.statSync(path.join(this.dir, n)).mtimeMs}`)
        .join("|");
    } catch {
      return "";
    }
  }

  allWords(level?: string, topic?: string): VocabItem[] {
    const stamp = this._dirStamp();
    if (this._cache === null || stamp !== this._stamp) {
      const out: Record<string, VocabItem> = {};
      for (const name of fs.existsSync(this.dir) ? fs.readdirSync(this.dir) : []) {
        if (!name.endsWith(".json") || isSyncConflict(name)) continue;
        const data = loadJson<Record<string, unknown>>(path.join(this.dir, name));
        if (data && typeof data === "object") {
          const clean = sanitizeVocabItem(data, path.parse(name).name);
          out[clean.id] = clean;
        }
      }
      this._cache = out;
      this._stamp = stamp;
    }
    let items = Object.values(this._cache);
    if (level) {
      const lUp = level.toUpperCase();
      items = items.filter((w) => w.level === lUp);
    }
    if (topic) {
      const tLow = topic.toLowerCase();
      items = items.filter((w) => w.topic === tLow);
    }
    items.sort((a, b) => (a.word.toLowerCase() < b.word.toLowerCase() ? -1 : a.word.toLowerCase() > b.word.toLowerCase() ? 1 : 0));
    return items.map((w) => ({ ...w }));
  }

  get(wordId: string): VocabItem | null {
    this.allWords();
    return this._cache?.[slug(wordId)] ?? null;
  }

  /** Words due on `today` or before (new words count as due), most overdue first. */
  dueWords(today: string): VocabItem[] {
    return this.allWords()
      .filter((w) => !w.next_review || w.next_review <= today)
      .sort((a, b) => (a.next_review || "0000").localeCompare(b.next_review || "0000") || a.mastery - b.mastery);
  }

  /**
   * The words a vocabulary session is built around: the ones due first (lowest mastery first inside), and among
   * equals the ones that belong to the topic (`topicHint` matches the word's topic or its source note).
   */
  sessionWords(topicHint: string, limit: number, today: string, wordClass?: WordClass | null): VocabItem[] {
    const hint = topicHint.toLowerCase();
    const near = (w: VocabItem): number => (hint && (w.topic.includes(hint) || w.source_note.toLowerCase().includes(hint)) ? 0 : 1);
    const ranked = this.allWords()
      .map((w) => ({ w, due: !w.next_review || w.next_review <= today ? 0 : 1 }))
      .sort((a, b) => a.due - b.due || near(a.w) - near(b.w) || a.w.mastery - b.w.mastery);
    // A session works on ONE class of words (verbs with verbs, adjectives with adjectives…): the class asked for
    // (or the topic's), otherwise the class with the most words due. If the bank has none of that class, the session falls back to the whole bank.
    const classOf = (w: VocabItem): WordClass => wordClassOf(w.part_of_speech, w.word);
    let cls: WordClass | null = wordClass ?? wordClassOfTopic(topicHint);
    if (!cls && ranked.length) {
      const counts = new Map<WordClass, number>();
      for (const x of ranked) if (x.due === 0) counts.set(classOf(x.w), (counts.get(classOf(x.w)) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      cls = best ? best[0] : classOf(ranked[0]!.w);
    }
    const same = cls ? ranked.filter((x) => classOf(x.w) === cls) : ranked;
    return (same.length ? same : ranked)
      .slice(0, Math.max(0, limit))
      .map((x) => x.w);
  }

  /** Records the result of practising a word: passing climbs the ladder, failing brings it back tomorrow. */
  recordReview(wordId: string, correct: boolean, today: string): VocabItem | null {
    const item = this.get(wordId);
    if (!item) return null;
    const level = correct ? Math.min(item.srs_level + 1, VOCAB_INTERVALS.length) : 0;
    const next: VocabItem = {
      ...item,
      srs_level: level,
      last_review: today,
      next_review: addDaysIso(today, correct ? VOCAB_INTERVALS[level - 1]! : 1),
      mastery: Math.round(Math.max(0, Math.min(1, item.mastery + (correct ? 0.15 : -0.1))) * 100) / 100,
    };
    writeJson(this._path(next.id), next);
    this._cache = null;
    return next;
  }

  /** Moves the next review of a word to another day (the calendar's drag and date box). */
  setNextReview(wordId: string, date: string): VocabItem | null {
    const item = this.get(wordId);
    if (!item || !ISO_DAY.test(date)) return null;
    const next = { ...item, next_review: date };
    writeJson(this._path(next.id), next);
    this._cache = null;
    return next;
  }

  addWord(word: string, meaning: string, opts: Partial<Omit<VocabItem, "id" | "word" | "meaning" | "mastery">> = {}): VocabItem {
    const clean = sanitizeVocabItem({
      word, meaning, mastery: 0,
      part_of_speech: opts.part_of_speech ?? "noun",
      level: opts.level ?? "B1",
      topic: opts.topic ?? "general",
      pronunciation: opts.pronunciation ?? "",
      examples: opts.examples ?? [],
      collocations: opts.collocations ?? [],
      synonyms: opts.synonyms ?? [],
      source_note: opts.source_note ?? "",
      next_review: opts.next_review ?? "",
      srs_level: opts.srs_level ?? 0,
      last_review: opts.last_review ?? "",
    }, word);
    writeJson(this._path(clean.id), clean);
    this._cache = null;
    return clean;
  }

  generatePracticeExercise(wordId: string, mode = "en_to_meaning"): Record<string, string> | null {
    const item = this.get(wordId);
    if (!item) return null;
    if (mode === "en_to_meaning") {
      return { type: "short_answer", subject: "english", topic: "vocabulary",
        prompt: `¿Cuál es el significado o traducción de la palabra '${item.word}' (${item.part_of_speech})?`,
        expected_solution: item.meaning };
    }
    if (mode === "meaning_to_en") {
      return { type: "short_answer", subject: "english", topic: "vocabulary",
        prompt: `¿Qué palabra en inglés corresponde a: '${item.meaning}'?`,
        expected_solution: item.word };
    }
    if (mode === "cloze" && item.examples.length) {
      const cap = item.word.charAt(0).toUpperCase() + item.word.slice(1);
      const blanked = item.examples[0]!.split(item.word).join("_______").split(cap).join("_______");
      return { type: "short_answer", subject: "english", topic: "cloze",
        prompt: `Completa la oración con la palabra adecuada:\n\n"${blanked}"`,
        expected_solution: item.word };
    }
    return { type: "recall", subject: "english", topic: "vocabulary",
      prompt: `Define y utiliza la palabra '${item.word}' en una oración en inglés.`,
      expected_solution: item.meaning };
  }

  // snake_case aliases for the API layer
  all_words = this.allWords.bind(this);
}
