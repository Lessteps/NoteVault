// Ported from notevault_app/core/english_vocabulary_manager.py
// Structured vocabulary entities stored in .notevault/estudio/vocabulario/<id>.json.

import * as fs from "node:fs";
import * as path from "node:path";
import { loadJson, slug, writeJson } from "./store.js";
import { isSyncConflict } from "./vaultFormat.js";

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
}

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
