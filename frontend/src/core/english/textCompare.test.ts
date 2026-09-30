import { describe, expect, it } from "vitest";
import { gradeDictation } from "./dictationGrade";
import { classify, compareTexts, tokenize } from "./textCompare";

describe("tokenize", () => {
  it("lower-cases, straightens quotes and strips punctuation but keeps contractions", () => {
    expect(tokenize("Hello, World! It’s “fine”.")).toEqual(["hello", "world", "it's", "fine"]);
    expect(tokenize("  ")).toEqual([]);
  });
});

describe("compareTexts", () => {
  it("is 100 for the same text, whatever its punctuation and case", () => {
    const c = compareTexts("The next train leaves at ten to six.", "the next TRAIN leaves at ten to six");
    expect(c.score).toBe(100);
    expect(c.ops.every((o) => o.kind === "match")).toBe(true);
  });

  it("names the missing, extra, wrong and misspelled words", () => {
    const c = compareTexts("I will see you next Monday at noon", "I see you next Mondey at the noon");
    expect(c.ops.filter((o) => o.kind === "missing").map((o) => o.ref)).toEqual(["will"]);
    expect(c.ops.filter((o) => o.kind === "extra").map((o) => o.got)).toEqual(["the"]);
    expect(c.ops.filter((o) => o.kind === "spelling").map((o) => [o.ref, o.got])).toEqual([["monday", "mondey"]]);
    expect(c.missing).toBe(1);
    expect(c.score).toBeLessThan(90);
    const w = compareTexts("thirteen platforms", "thirty platforms");
    expect(w.ops[0]).toMatchObject({ kind: "wrong", ref: "thirteen", got: "thirty" }); // a different word, and a number slip
    expect(compareTexts("the cat sat", "a dog ran").wrong).toBe(3);
  });

  it("handles empty texts", () => {
    expect(compareTexts("", "").score).toBe(100);
    expect(compareTexts("hello there", "").score).toBe(0);
    expect(compareTexts("", "something").score).toBe(0);
  });

  it("classifies the kind of listening mistake", () => {
    expect(classify({ kind: "missing", ref: "to" })).toBe("weak_forms");
    expect(classify({ kind: "missing", ref: "it's" })).toBe("weak_forms");
    expect(classify({ kind: "wrong", ref: "thirteen", got: "banana" })).toBe("numbers");
    expect(classify({ kind: "spelling", ref: "worked", got: "work" })).toBe("endings");
    expect(classify({ kind: "wrong", ref: "platform", got: "plate" })).toBe("misheard");
    expect(classify({ kind: "extra", got: "the" })).toBe("extra_words");
    expect(classify({ kind: "match", ref: "a", got: "a" })).toBeNull();
  });
});

describe("gradeDictation", () => {
  it("passes an exact dictation and feeds no errors", () => {
    const g = gradeDictation("How are you?", "how are you", 3);
    expect(g).toMatchObject({ score: 100, verdict: "correct", errors: [] });
    expect(g.rubric).toEqual([true, true, true]);
  });

  it("explains what was missing in Spanish and records the mistakes by kind", () => {
    const g = gradeDictation("I want to go to the shops tomorrow", "I want go the shop tomorrow", 3);
    expect(g.verdict).not.toBe("correct");
    expect(g.feedback).toContain("Te faltaron: «to», «to»");
    expect(g.errors.some((e) => e.category === "Formas débiles y contracciones")).toBe(true);
    expect(g.rubric[0]).toBe(false);
    expect(g.example).toBe("I want to go to the shops tomorrow");
    expect(g.next_step).toContain("palabras pequeñas");
  });
});
