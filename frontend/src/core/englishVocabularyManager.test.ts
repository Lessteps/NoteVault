import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnglishVocabularyManager } from "./englishVocabularyManager.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_vocab_"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("EnglishVocabularyManager", () => {
  it("adds, sanitises and lists words, and filters by level/topic", () => {
    const m = new EnglishVocabularyManager(dir);
    m.addWord("Ubiquitous", "omnipresente", { level: "c1", topic: "General", examples: ["It is ubiquitous."] });
    m.addWord("apple", "manzana", { level: "a1", topic: "food" });
    const all = m.allWords();
    expect(all.map((w) => w.word)).toEqual(["apple", "Ubiquitous"]);
    expect(all[1]!.level).toBe("C1");
    expect(all[1]!.topic).toBe("general");
    expect(all[1]!.id).toBe("ubiquitous");
    expect(m.allWords("A1").map((w) => w.word)).toEqual(["apple"]);
    expect(m.allWords(undefined, "food").map((w) => w.word)).toEqual(["apple"]);
  });

  it("persists across instances and generates a cloze exercise", () => {
    new EnglishVocabularyManager(dir).addWord("run", "correr", { examples: ["I run fast."] });
    const m2 = new EnglishVocabularyManager(dir);
    expect(m2.get("run")?.meaning).toBe("correr");
    const ex = m2.generatePracticeExercise("run", "cloze");
    expect(ex?.expected_solution).toBe("run");
    expect(ex?.prompt).toContain("_______");
  });
});
