import { describe, expect, it } from "vitest";
import {
  ENGLISH_BRANCHES,
  ENGLISH_SKILL_IDS,
  ENGLISH_SKILL_SPECS,
  branchFromPath,
  englishSkillsForBranch,
  suggestBranch,
} from "../../lib/englishSkillData";
import { classifyTopic, domainOfSubject } from "./domain";
import { disciplineFor } from "./disciplineCatalog";
import { MODES, modeFor } from "./modes";
import { buildReevaluationMessages, buildSkillOptionsMessages, parsePracticePlan, parseSkillOptions } from "./practicePlan";
import { catalogFor, deterministicSkillSelector, skillsForBranch } from "./skillSelection";
import { skillsForSubject } from "./skills";
import { createDefaultTopicManifest, parseTopicManifest } from "./topic";
import { practiceFileText } from "./viewFiles";

describe("English skill catalogue", () => {
  it("has six areas (vocabulary is the sixth), each skill namespaced", () => {
    const count = (area: string) => ENGLISH_SKILL_SPECS.filter((s) => s.area === area).length;
    expect(ENGLISH_BRANCHES.map((b) => b.id)).toEqual(["grammar", "writing", "reading", "listening", "speaking", "vocabulary"]);
    expect([count("grammar"), count("writing"), count("reading"), count("listening"), count("speaking"), count("vocabulary")]).toEqual([8, 6, 8, 7, 12, 6]);
    const prefix: Record<string, string> = { grammar: "gr_", writing: "wr_", reading: "rd_", listening: "ls_", speaking: "sp_", vocabulary: "vc_" };
    for (const s of ENGLISH_SKILL_SPECS) expect(s.id.startsWith(prefix[s.area]!)).toBe(true);
  });

  it("shares no skill id with mathematics or programming, and every skill has its practice mode", () => {
    const others = new Set([...skillsForSubject("mathematics"), ...skillsForSubject("programming")].map((s) => s.id));
    for (const id of ENGLISH_SKILL_IDS) {
      expect(others.has(id)).toBe(false);
      expect(MODES[id]).toBeDefined();
      expect(MODES[id]!.subjects).toEqual(["english"]);
    }
    expect(skillsForSubject("english").map((s) => s.id)).toEqual([...ENGLISH_SKILL_IDS]);
    expect(skillsForSubject("mathematics").some((s) => ENGLISH_SKILL_IDS.includes(s.id))).toBe(false);
  });

  it("gives every skill its own competencies and lets vocabulary skills fit every branch", () => {
    const catalog = catalogFor("english");
    expect(catalog.every((s) => s.competencies.length >= 2)).toBe(true);
    const recall = catalog.find((s) => s.id === "vc_recall")!;
    expect(recall.branches).toEqual(ENGLISH_BRANCHES.map((b) => b.id));
    expect(catalog.find((s) => s.id === "gr_cloze")!.branches).toEqual(["grammar"]);
    expect(englishSkillsForBranch("reading").map((s) => s.area)).toEqual([...Array(8).fill("reading"), ...Array(6).fill("vocabulary")]);
  });

  it("session rules apply to English like maths: no beginner level where it needs a base, no help where it would give the answer away", () => {
    const by = Object.fromEntries(catalogFor("english").map((s) => [s.id, s]));
    expect(by.gr_correct!.allowedDifficulties).toEqual([2, 3]);
    expect(by.gr_cloze!.allowedDifficulties).toEqual([1, 2, 3]);
    expect(by.ls_dictation!.allowedAssistance).toEqual(["no_help"]);
    expect(by.vc_recall!.allowedAssistance).toEqual(["no_help"]);
    expect(by.gr_produce!.allowedAssistance).toEqual(["no_help", "helper"]);
  });
});

describe("branches", () => {
  it("reads a branch from the folders, with or without its number", () => {
    expect(branchFromPath("Inglés 1/3 Lectura/3.1 Skimming")).toBe("reading");
    expect(branchFromPath("Inglés/1 Gramática/1.2 Present perfect/1.2 Present perfect.md")).toBe("grammar");
    expect(branchFromPath("English/Speaking/Tema")).toBe("speaking");
    expect(branchFromPath("Inglés/6 Vocabulario/6.1 Common verbs")).toBe("vocabulary");
    expect(branchFromPath("Inglés/Vocabulario/Words")).toBe("vocabulary"); // the folder's old name
    expect(branchFromPath("Matemáticas/1 Aritmética/1.1 Números")).toBeNull();
  });

  it("only SUGGESTS a branch from a name", () => {
    expect(suggestBranch("Dictation of short phrases")).toBe("listening");
    expect(suggestBranch("Present perfect vs past simple")).toBe("grammar");
    expect(suggestBranch("Something unrelated")).toBeNull();
  });
});

describe("classification has no silent default for English", () => {
  it("mathematics classifies exactly as before (declared type, else from the name)", () => {
    expect(classifyTopic({ subject: "mathematics", name: "Inducción matemática" })).toMatchObject({ ok: true, value: { domain: "math", topicType: "theoretical", via: "name" } });
    expect(classifyTopic({ subject: "mathematics", name: "X", manifestType: "procedural" })).toMatchObject({ ok: true, value: { topicType: "procedural", via: "manifest" } });
    expect(domainOfSubject("programación")).toBe("programming");
    expect(domainOfSubject("Inglés")).toBe("english");
  });

  it("an English topic is classified by its declared branch or its folder", () => {
    expect(classifyTopic({ subject: "english", name: "T", manifestBranch: "listening" })).toMatchObject({ ok: true, value: { branch: "listening", via: "manifest" } });
    expect(classifyTopic({ subject: "english", name: "T", folderRel: "Inglés/2 Escritura/2.1 T" })).toMatchObject({ ok: true, value: { branch: "writing", via: "path" } });
  });

  it("an unclassified English topic is reported, with a suggestion, and never defaulted to mixed", () => {
    const r = classifyTopic({ subject: "english", name: "Dictation practice", folderRel: "Inglés/Suelto/Dictation practice" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.suggestion).toBe("listening");
      expect(r.reason).toContain("rama");
    }
    expect(classifyTopic({ subject: "english", name: "Zzz", folderRel: "Inglés/Zzz" })).toMatchObject({ ok: false, suggestion: null });
  });
});

describe("English topic manifests and skill selection", () => {
  it("a topic inside a branch folder gets that branch's skills and a `branch:` (no topic type)", () => {
    const m = createDefaultTopicManifest("Inglés/3 Lectura/3.1 Skimming", "3.1 Skimming", "english", []);
    expect(m.branch).toBe("reading");
    expect(m.topic_type).toBeUndefined();
    expect(m.skills).toEqual(skillsForBranch("english", "reading"));
    const parsed = parseTopicManifest(practiceFileText(m), "3.1 Skimming");
    expect(parsed?.branch).toBe("reading");
    expect(parsed?.skills).toEqual(m.skills);
  });

  it("outside a branch folder it stays unclassified: no branch and no skills", () => {
    const m = createDefaultTopicManifest("Inglés/Suelto/Tema", "Tema", "english", []);
    expect(m.branch).toBeUndefined();
    expect(m.skills).toEqual([]);
  });

  it("the selector needs a branch for English and offers only that branch's skills", () => {
    expect(() => deterministicSkillSelector.select({ subject: "english", topicType: "mixed" })).toThrow(/rama/);
    const r = deterministicSkillSelector.select({ subject: "english", branch: "listening" });
    expect(r.skills).toEqual(["ls_dictation", "ls_gist", "ls_detail", "ls_gap", "ls_variation", "ls_podcast"]); // capped at MAX_RECOMMENDED_SKILLS
  });
});

describe("English plans", () => {
  const catalog = catalogFor("english");
  const reply = JSON.stringify({
    topic_type: "theoretical", // an English reply must never decide the type
    skills: [
      { skill: "gr_cloze", recommended: true, difficulties: { 1: 3, 2: 3, 3: 2 }, why: "forma" },
      { skill: "vc_collocations", recommended: true, difficulties: { 1: 2, 2: 2, 3: 0 }, why: "palabras del tema" },
      { skill: "wr_free", recommended: true, difficulties: { 1: 1, 2: 2, 3: 2 }, why: "otra rama" },
      { skill: "prove", difficulties: { 1: 1, 2: 1, 3: 1 }, why: "de matemáticas" },
    ],
    summary: "Present perfect.",
  });

  it("keeps the branch's skills and the vocabulary ones, drops other branches and maths, and records the branch", () => {
    const plan = parsePracticePlan(reply, catalog, "grammar")!;
    expect(plan.skills.map((s) => s.skill)).toEqual(["gr_cloze", "vc_collocations"]);
    expect(plan.branch).toBe("grammar");
    expect(plan.topicType).toBeUndefined();
  });

  it("a skill the user ticks from another branch is kept when they force it", () => {
    expect(parsePracticePlan(reply, catalog, "grammar", true)!.skills.map((s) => s.skill)).toContain("wr_free");
  });

  it("the checklist lists every English skill and warns about the ones of other branches", () => {
    const parsed = parseSkillOptions(reply, catalog, "grammar")!;
    expect(parsed.options).toHaveLength(ENGLISH_SKILL_IDS.length);
    const by = Object.fromEntries(parsed.options.map((o) => [o.skill, o]));
    expect(by.gr_cloze!.recommended).toBe(true);
    expect(by.wr_free!.recommended).toBe(false);
    expect(by.wr_free!.why).toContain("rama");
  });

  it("the prompts carry the branch and never talk about topic types or maths", () => {
    const input = { subject: "english", title: "1.2 Present perfect", branch: "grammar" as const, catalog, theory: [] };
    const [system] = buildReevaluationMessages(input);
    expect(system!.content).toContain('branch "grammar"');
    expect(system!.content).not.toContain("theoretical");
    // no maths skill is offered: the catalogue lines are "- <id>: ..."
    expect(system!.content).not.toContain("- drill:");
    expect(system!.content).not.toContain("- solve:");
    expect(system!.content).toContain("- gr_cloze:");
    expect(buildSkillOptionsMessages(input)[0]!.content).toContain("EVERY skill");
  });
});

describe("modes and disciplines", () => {
  it("an English exercise never falls back to the maths mode; maths still does", () => {
    expect(() => modeFor({ subject: "english", mode: "solve" })).toThrow(/inglés/);
    expect(() => modeFor({ subject: "english" })).toThrow(/inglés/);
    expect(modeFor({ subject: "english", mode: "gr_cloze" }).id).toBe("gr_cloze");
    expect(modeFor({ subject: "mathematics", mode: "nope" }).id).toBe("solve");
  });

  it("the discipline follows the skill's branch", () => {
    const d = (mode: string) => disciplineFor({ subject: "english", mode }).id;
    expect([d("gr_cloze"), d("wr_free"), d("rd_inference"), d("ls_dictation"), d("sp_guided"), d("vc_recall")]).toEqual([
      "english_grammar", "english_writing", "english_reading", "english_listening", "english_speaking", "english_vocabulary",
    ]);
  });
});
