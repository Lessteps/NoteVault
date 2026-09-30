import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../appConfig.js", () => ({
  AppConfig: { get_ai_config: () => ({}), get_conversations_dir: () => os.tmpdir() },
  APP_DATA_DIR: os.tmpdir(),
}));

import { AppState } from "../appState";
import { applyAssistantAction, planAssistantAction } from "../../core/assistantActions";
import { DEFAULT_SKILLS, ensureDefaultSkills } from "../../core/defaultSkills";
import { ENGLISH_DEFAULT_SKILLS } from "../../core/englishDefaultSkills";
import { parseTopicManifest } from "../../core/practice/topic";
import { branchesInScope, ensureVocabularyHome, parseBranchTopics } from "./studySpace";
import { studyApi } from "./study";

let root: string;
const read = (rel: string) => fs.readFileSync(path.join(root, ...rel.split("/")), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(root, ...rel.split("/")));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_en_"));
});

describe("default skills per domain", () => {
  it("an English space gets the English notes and none of the mathematics ones", () => {
    const created = ensureDefaultSkills(root, "Inglés", [], "english");
    for (const name of Object.keys(ENGLISH_DEFAULT_SKILLS)) expect(created).toContain(`Inglés/_skills/${name}.md`);
    const practica = read("Inglés/_skills/practica_skill.md");
    expect(practica).toContain("gr_cloze");
    expect(practica).toContain("`ls_dictation`");
    expect(practica).not.toContain("counterexample");
    expect(read("Inglés/_skills/resumen_teorico_skill.md")).toContain("branch: grammar");
    expect(read("Inglés/_skills/resumen_teorico_skill.md")).not.toContain("subject: mathematics");
  });

  it("mathematics keeps its own set, and neither domain inherits the other's skill notes", () => {
    fs.mkdirSync(path.join(root, "Matemáticas", "_skills"), { recursive: true });
    fs.writeFileSync(path.join(root, "Matemáticas", "_skills", "canvas_skill.md"), "CANVAS DE MATES", "utf-8");
    fs.writeFileSync(path.join(root, "Matemáticas", "Matemáticas.resumen.md"), "---\nsubject: mathematics\n---\n", "utf-8");
    fs.mkdirSync(path.join(root, "Inglés", "_skills"), { recursive: true });
    fs.writeFileSync(path.join(root, "Inglés", "_skills", "canvas_skill.md"), "CANVAS DE INGLES", "utf-8");
    fs.writeFileSync(path.join(root, "Inglés", "Inglés.resumen.md"), "---\nsubject: english\n---\n", "utf-8");

    ensureDefaultSkills(root, "Inglés 1", [], "english");
    expect(read("Inglés 1/_skills/canvas_skill.md")).toBe("CANVAS DE INGLES"); // English sibling only
    ensureDefaultSkills(root, "Matemáticas 1", [], "mathematics");
    expect(read("Matemáticas 1/_skills/canvas_skill.md")).toBe("CANVAS DE MATES"); // never the English one
    expect(read("Matemáticas 1/_skills/practica_skill.md")).toBe(DEFAULT_SKILLS.practica_skill);
  });
});

describe("branch syllabi", () => {
  it("names the branches asked for in the scope, or all six", () => {
    expect(branchesInScope("solo lectura y escucha")).toEqual(["reading", "listening"]);
    expect(branchesInScope("Grammar y speaking")).toEqual(["grammar", "speaking"]);
    expect(branchesInScope("")).toHaveLength(6);
    expect(branchesInScope("solo vocabulario")).toEqual(["vocabulary"]);
  });

  it("renumbers the model's topics itself and drops repeats", () => {
    const reply = '{"topics":[{"name":"7.9 Present simple"},"Present continuous",{"name":"present simple"},{"name":"Past simple"}]}';
    expect(parseBranchTopics(reply, 1).map((t) => t.name)).toEqual(["1.1 Present simple", "1.2 Present continuous", "1.3 Past simple"]);
    expect(parseBranchTopics('{"topics":["A"]}', 4)[0]!.name).toBe("4.1 A");
    expect(() => parseBranchTopics('{"topics":[]}', 1)).toThrow();
  });
});

describe("creating the English structure", () => {
  const syllabus = {
    action: "create_syllabus",
    args: {
      subject: "Inglés 1",
      subject_id: "english",
      areas: [
        { name: "1 Gramática", topics: [{ name: "1.1 Present simple" }] },
        { name: "3 Lectura", topics: [{ name: "3.1 Skimming and scanning" }] },
      ],
    },
  };

  it("each topic gets its branch's competencies and its `branch:`, never a topic type", () => {
    applyAssistantAction(root, syllabus);
    const grammar = parseTopicManifest(read("Inglés 1/1 Gramática/1.1 Present simple/1.1 Present simple.practica.md"), "1.1");
    const reading = parseTopicManifest(read("Inglés 1/3 Lectura/3.1 Skimming and scanning/3.1 Skimming and scanning.practica.md"), "3.1");
    expect(grammar).toMatchObject({ branch: "grammar", subject: "english" });
    expect(grammar!.topic_type).toBeUndefined();
    expect(grammar!.skills).toEqual(["gr_explain_rule", "gr_recognize", "gr_cloze", "gr_transform", "gr_correct", "gr_produce", "gr_syntax", "gr_expressions"]);
    expect(reading!.skills.every((s) => s.startsWith("rd_"))).toBe(true);
  });

  it("the space map and the outline list every area, vocabulary included", () => {
    applyAssistantAction(root, syllabus);
    ensureVocabularyHome(root, "Inglés 1");
    expect(exists("Inglés 1/6 Vocabulario/00 Banco de palabras.md")).toBe(true);
    // adding another branch later redraws the indexes from what is on disk
    applyAssistantAction(root, { action: "create_syllabus", args: { subject: "Inglés 1", subject_id: "english", areas: [{ name: "4 Escucha", topics: [{ name: "4.1 Weak forms" }] }, { name: "6 Vocabulario", topics: [{ name: "6.1 Common verbs", level: "A1" }] }] } });
    const temario = read("Inglés 1/00 Temario.md");
    expect(temario).toContain("## 1 Gramática");
    expect(temario).toContain("## 4 Escucha");
    expect(temario).toContain("## 6 Vocabulario");
    const verbs = read("Inglés 1/6 Vocabulario/6.1 Common verbs/6.1 Common verbs.practica.md");
    expect(verbs).toContain("branch: vocabulary");
    expect(verbs).toContain("level: A1");
    expect(parseTopicManifest(verbs, "6.1")!.skills.every((s) => s.startsWith("vc_"))).toBe(true);
    const map = JSON.parse(read("Inglés 1/00 Mapa de Inglés 1.canvas"));
    expect(map.nodes.filter((n: { type: string }) => n.type === "group")).toHaveLength(4);
  });

  it("moves the old Vocabulario folder to 6 Vocabulario once, keeping its files", () => {
    applyAssistantAction(root, syllabus);
    fs.mkdirSync(path.join(root, "Inglés 1", "Vocabulario"), { recursive: true });
    fs.writeFileSync(path.join(root, "Inglés 1", "Vocabulario", "mis-notas.md"), "hola", "utf-8");
    ensureVocabularyHome(root, "Inglés 1");
    expect(exists("Inglés 1/Vocabulario")).toBe(false);
    expect(read("Inglés 1/6 Vocabulario/mis-notas.md")).toBe("hola");
  });

  it("draws the verb-tense map under grammar and the word-family map under vocabulary, without overwriting edits", () => {
    applyAssistantAction(root, syllabus);
    ensureVocabularyHome(root, "Inglés 1");
    const tenses = "Inglés 1/1 Gramática/00 Mapa de tiempos verbales.canvas";
    const families = "Inglés 1/6 Vocabulario/00 Mapa de familias de palabras.canvas";
    expect(JSON.parse(read(tenses)).nodes.length).toBeGreaterThan(9);
    expect(JSON.parse(read(families)).edges.every((e: { label: string }) => e.label.length > 0)).toBe(true);
    fs.writeFileSync(path.join(root, tenses), '{"nodes":[],"edges":[]}', "utf-8");
    ensureVocabularyHome(root, "Inglés 1");
    expect(read(tenses)).toBe('{"nodes":[],"edges":[]}');
  });

  it("a topic outside any branch folder is created UNCLASSIFIED (no branch, no skills), never defaulted", () => {
    const plan = planAssistantAction(root, { action: "create_syllabus", args: { subject: "Inglés 1", subject_id: "english", areas: [{ name: "Suelto", topics: [{ name: "Tema" }] }] } });
    const practica = plan.ops.find((o) => o.rel.endsWith(".practica.md"))!;
    const m = parseTopicManifest(practica.content!, "Tema");
    expect(m?.branch).toBeUndefined();
    expect(m?.skills).toEqual([]);
  });
});

describe("classifying explicitly", () => {
  it("a topic with no branch is reported, and one call with a branch resolves it", () => {
    fs.mkdirSync(path.join(root, ".notevault"), { recursive: true });
    applyAssistantAction(root, { action: "create_syllabus", args: { subject: "Inglés 1", subject_id: "english", areas: [{ name: "Suelto", topics: [{ name: "Dictation practice" }] }] } });
    const api = studyApi(new AppState(root));
    const folder = "Inglés 1/Suelto/Dictation practice";
    const before = api.study_topic_classification(folder);
    expect(before).toMatchObject({ ok: false, suggestion: "listening" });
    expect(() => api.study_topic_classify(folder, "nonsense")).toThrow(/rama/);
    api.study_topic_classify(folder, "listening");
    expect(api.study_topic_classification(folder)).toMatchObject({ ok: true, branch: "listening", via: "manifest" });
    expect(read(`${folder}/Dictation practice.practica.md`)).toContain("branch: listening");
  });
});
