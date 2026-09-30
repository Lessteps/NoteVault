import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/appConfig.js", () => ({
  AppConfig: { get_ai_config: () => ({}), get_conversations_dir: () => os.tmpdir() },
  APP_DATA_DIR: os.tmpdir(),
}));

import { AppState } from "../../api/appState";
import { studyApi } from "../../api/modules/study";
import { cefrForTopic, wordClassOf, wordClassOfTopic } from "../../lib/englishSkillData";
import { EnglishVocabularyManager, VOCAB_INTERVALS } from "../englishVocabularyManager";
import { parseExercise } from "./exerciseNote";
import { rescheduleReview } from "./reviewFiles";
import { DEFAULT_REMINDERS, reviewsToAnnounce } from "./reviewReminders";
import { buildTopicSession } from "./sessionBuilder";
import { createDefaultTopicManifest } from "./topic";
import { listVocabReviews, projectVocab, vocabDueGroup } from "./vocabReviews";

let root: string;
let bank: EnglishVocabularyManager;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_vocab_"));
  bank = new EnglishVocabularyManager(root);
});

describe("word bank reviews", () => {
  it("climbs the ladder on success and comes back tomorrow on failure", () => {
    bank.addWord("reliable", "fiable");
    const up = (today: string) => bank.recordReview("reliable", true, today)!;
    expect(VOCAB_INTERVALS).toEqual([1, 3, 7, 14, 30, 60]);
    expect(up("2026-10-01")).toMatchObject({ srs_level: 1, next_review: "2026-10-02", mastery: 0.15 });
    expect(up("2026-10-02")).toMatchObject({ srs_level: 2, next_review: "2026-10-05" });
    expect(up("2026-10-05")).toMatchObject({ srs_level: 3, next_review: "2026-10-12" });
    expect(bank.recordReview("reliable", false, "2026-10-12")).toMatchObject({ srs_level: 0, next_review: "2026-10-13" });
    for (let i = 0; i < 9; i += 1) up("2027-01-01");
    expect(bank.get("reliable")!.srs_level).toBe(6); // stays on the last rung
    expect(bank.recordReview("nope", true, "2026-10-01")).toBeNull();
  });

  it("reads words saved before the reviews existed", () => {
    fs.writeFileSync(path.join(bank.dir, "old.json"), JSON.stringify({ word: "old", meaning: "viejo", level: "B1" }), "utf-8");
    expect(bank.get("old")).toMatchObject({ next_review: "", srs_level: 0, last_review: "" });
  });

  it("builds a session from the due words first, the topic's own among equals", () => {
    bank.addWord("alpha", "a", { topic: "general", next_review: "2026-12-01" });
    bank.addWord("beta", "b", { topic: "general" }); // new: due now
    bank.addWord("gamma", "c", { topic: "meetings" }); // new, and it is this topic's
    bank.addWord("delta", "d", { topic: "general", next_review: "2026-09-01" }); // overdue
    const ids = bank.sessionWords("meetings", 3, "2026-10-01").map((w) => w.id);
    expect(ids[0]).toBe("gamma");
    expect(ids).toContain("beta");
    expect(ids).toContain("delta");
    expect(ids).not.toContain("alpha");
    expect(bank.dueWords("2026-10-01").map((w) => w.id)).toEqual(expect.arrayContaining(["beta", "gamma", "delta"]));
  });
});

describe("word reviews in the calendar", () => {
  it("lists each scheduled word with its own projection along the vocabulary ladder", () => {
    bank.addWord("reliable", "fiable", { next_review: "2026-10-05" });
    bank.addWord("unscheduled", "x");
    const items = listVocabReviews(root, "2026-10-01");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ path: "vocab:reliable", kind: "vocab", subject: "english", next: "2026-10-05", inDays: 4 });
    expect(items[0]!.topic).toContain("reliable");
    expect(projectVocab("2026-10-05", 0, 3).map((p) => p.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-09"]);
  });

  it("moves a word like any review, and refuses one that is not there", () => {
    bank.addWord("reliable", "fiable", { next_review: "2026-10-05" });
    expect(rescheduleReview(root, "vocab:reliable", "2026-10-20", "2026-10-01")).toMatchObject({ next: "2026-10-20", kind: "vocab" });
    expect(bank.get("reliable")!.next_review).toBe("2026-10-20");
    expect(() => rescheduleReview(root, "vocab:ghost", "2026-10-20", "2026-10-01")).toThrow(/banco/);
  });

  it("announces the due words as ONE reminder per day, not one per word", () => {
    bank.addWord("a", "", { next_review: "2026-09-30" });
    bank.addWord("b", "", { next_review: "2026-10-01" });
    bank.addWord("c", "", { next_review: "2026-11-01" });
    const group = vocabDueGroup(root, "2026-10-01")!;
    expect(group.topic).toBe("Vocabulario: 2 palabras");
    const at = new Date(2026, 9, 1, 10, 0, 0);
    expect(reviewsToAnnounce([group], {}, DEFAULT_REMINDERS, at)).toHaveLength(1);
    expect(reviewsToAnnounce([group], { "vocab:group": "2026-10-01" }, DEFAULT_REMINDERS, at)).toEqual([]);
    expect(vocabDueGroup(root, "2026-08-01")).toBeNull();
  });

  it("a vault that never had a bank shows no words and creates no folder", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "nv_nobank_"));
    expect(listVocabReviews(empty, "2026-10-01")).toEqual([]);
    expect(fs.existsSync(path.join(empty, ".notevault"))).toBe(false);
  });
});

describe("vocabulary sessions", () => {
  const manifest = createDefaultTopicManifest("Inglés 1/1 Gramática/1.1 Tema", "1.1 Tema", "english", []);
  const generated = { title: "Recuerda", statement: "Translate.", hints: [], solution: "reliable", rubric: ["Bien"] };

  it("builds exercises around the bank words and writes their ids into each exercise", async () => {
    const seen: string[] = [];
    const ai = { async generateExercises(messages: Array<{ content: string }>) { seen.push(messages[1]!.content); return [generated, generated]; } };
    const plan = await buildTopicSession(
      manifest,
      "Inglés 1/1 Gramática/1.1 Tema",
      { skill: "vc_recall", difficulty: 2, quantity: "3-5", assistance: "helper", words: ["reliable — fiable"], wordIds: ["reliable"] },
      [],
      [],
      ai,
    );
    expect(seen[0]).toContain("WORD BANK");
    expect(seen[0]).toContain("reliable — fiable");
    const ex = parseExercise(plan.exercises[0]!.content!, "/x.md");
    expect(ex).toMatchObject({ mode: "vc_recall", discipline: "english_vocabulary", assistance: "nohelp" });
    expect(ex.frontmatter.words).toEqual(["reliable"]);
  });

  it("the standalone vocabulary session needs a vocabulary skill, an English space and words", async () => {
    const api = studyApi(new AppState(root));
    await expect(api.study_vocab_session("gr_cloze")).rejects.toThrow(/vocabulario/);
    await expect(api.study_vocab_session("vc_recall")).rejects.toThrow(/espacio de inglés/);
    fs.mkdirSync(path.join(root, "Inglés 1"), { recursive: true });
    fs.writeFileSync(path.join(root, "Inglés 1", "Inglés 1.resumen.md"), "---\nsubject: english\n---\n", "utf-8");
    await expect(api.study_vocab_session("vc_recall")).rejects.toThrow(/banco de palabras está vacío/);
  });
});

describe("vocabulary by word class", () => {
  it("normalises a part of speech into a class and reads the class of a topic from its name", () => {
    expect(wordClassOf("noun")).toBe("noun");
    expect(wordClassOf("verb", "give up")).toBe("phrasal verb");
    expect(wordClassOf("verb", "borrow")).toBe("verb");
    expect(wordClassOf("adjective")).toBe("adjective");
    expect(wordClassOf("idiom", "break the ice")).toBe("expression");
    expect(wordClassOf("", "a lot of")).toBe("expression");
    expect(wordClassOfTopic("6.1 Common verbs")).toBe("verb");
    expect(wordClassOfTopic("6.5 Phrasal verbs")).toBe("phrasal verb");
    expect(wordClassOfTopic("6.6 Collocations")).toBe("expression");
    expect(wordClassOfTopic("Something else")).toBeNull();
  });

  it("a session takes words of ONE class: the topic's, or the class with most words due", () => {
    for (const w of ["borrow", "lend", "carry", "invite"]) bank.addWord(w, w, { part_of_speech: "verb" });
    for (const w of ["shy", "polite"]) bank.addWord(w, w, { part_of_speech: "adjective" });
    bank.addWord("bill", "cuenta", { part_of_speech: "noun" });
    const today = "2026-09-30";
    expect(bank.sessionWords("6.2 Adjectives to describe people", 5, today).map((w) => w.word).sort()).toEqual(["polite", "shy"]);
    const auto = bank.sessionWords("", 10, today);
    expect(new Set(auto.map((w) => w.part_of_speech))).toEqual(new Set(["verb"]));
    expect(auto).toHaveLength(4);
    // a class the bank does not have does not leave the session empty
    expect(bank.sessionWords("", 3, today, "adverb").length).toBeGreaterThan(0);
  });
});

describe("CEFR of an exercise is relative to its topic", () => {
  it("the topic's level is the middle difficulty, never below A1", () => {
    expect([1, 2, 3].map((d) => cefrForTopic(d as 1 | 2 | 3, "B1"))).toEqual(["A2", "B1", "B2"]);
    expect([1, 2, 3].map((d) => cefrForTopic(d as 1 | 2 | 3, "A1"))).toEqual(["A1", "A1", "A2"]);
    expect([1, 2, 3].map((d) => cefrForTopic(d as 1 | 2 | 3))).toEqual(["A2", "B1", "B2"]);
  });
});
