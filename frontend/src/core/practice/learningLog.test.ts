import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  learningFile,
  learningPromptLines,
  learningStatus,
  readLearning,
  recordLearning,
  setLearningEnabled,
} from "./learningLog";
import { buildExerciseGenerationPrompt, buildTopicSession } from "./sessionBuilder";
import { buildSkillOptionsMessages, parseSkillOptions } from "./practicePlan";
import { catalogFor } from "./skillSelection";
import { createDefaultTopicManifest } from "./topic";

let root: string;
const FOLDER = "Matemáticas 1/1 Aritmética/1.2 Suma y resta";
const entry = (description: string, at = "2026-09-30T10:00:00Z") => ({
  at,
  exercise: "ej1",
  title: "Ej 1",
  score: 40,
  category: "signo",
  description,
  evidence: "-3 + 5 = -8",
  fix: "-3 + 5 = 2",
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_learn_"));
});

describe("learning record", () => {
  it("is private, one file per topic and competency, and only records while its box is on", () => {
    expect(recordLearning(root, FOLDER, "solve", [entry("x")])).toBe(0);
    expect(readLearning(root, FOLDER, "solve")).toBeNull();

    setLearningEnabled(root, FOLDER, "1.2 Suma y resta", "solve", true);
    const file = learningFile(root, FOLDER, "solve");
    expect(file).toContain(path.join(".notevault", "estudio", "aprendizaje"));
    expect(recordLearning(root, FOLDER, "solve", [entry("Se equivoca con el signo")])).toBe(1);
    expect(readLearning(root, FOLDER, "solve")!.entries).toHaveLength(1);
    expect(learningStatus(root, FOLDER)).toEqual({ solve: { enabled: true, entries: 1 } });

    // Another competency of the same topic has its own file and stays off.
    expect(recordLearning(root, FOLDER, "drill", [entry("y")])).toBe(0);

    setLearningEnabled(root, FOLDER, "1.2 Suma y resta", "solve", false);
    expect(recordLearning(root, FOLDER, "solve", [entry("z")])).toBe(0);
    expect(readLearning(root, FOLDER, "solve")!.entries).toHaveLength(1); // what was kept stays
    expect(learningPromptLines(root, FOLDER, "solve")).toEqual([]); // but it is not used while off
  });

  it("starts from what the error log already knew and hands the AI distinct, recent mistakes", () => {
    setLearningEnabled(root, FOLDER, "T", "solve", true, [entry("antiguo", "2026-09-01T00:00:00Z")]);
    recordLearning(root, FOLDER, "solve", [entry("Se equivoca con el signo"), entry("Se equivoca con el signo"), entry("Olvida llevar")]);
    const lines = learningPromptLines(root, FOLDER, "solve");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Olvida llevar");
    expect(lines.filter((l) => l.includes("signo"))).toHaveLength(1);
    expect(lines[0]).toContain("lo correcto");
  });
});

describe("session with a mistakes record", () => {
  const manifest = createDefaultTopicManifest(FOLDER, "1.2 Suma y resta", "mathematics", []);

  it("puts the errors in the prompt and asks for most exercises to be built around them", () => {
    const messages = buildExerciseGenerationPrompt(manifest, [], "solve", 2, "no_help", 5, ["Se equivoca con el signo"]);
    const user = messages[1]!.content;
    expect(user).toContain("REGISTRO DE ERRORES");
    expect(user).toContain("Se equivoca con el signo");
    expect(user).toContain("60 %");
    expect(buildExerciseGenerationPrompt(manifest, [], "solve", 2, "no_help", 5)[1]!.content).not.toContain("REGISTRO");
  });

  it("replaces most of the existing exercises with new focused ones when there is a record", async () => {
    const existing = Array.from({ length: 8 }, (_, i) => ({
      note_id: `e${i}`, rel: `${FOLDER}/Ejercicios/solve/e${i}.md`, path: `${FOLDER}/Ejercicios/solve/e${i}.md`,
      title: `E${i}`, mode: "solve", skill: "solve", difficulty: 2, subject: "mathematics",
    })) as never[];
    const asked: number[] = [];
    const ai = {
      async generateExercises(messages: Array<{ content: string }>) {
        asked.push(Number(/Generate (\d+) exercise/.exec(messages[1]!.content)?.[1]));
        return Array.from({ length: asked[0]! }, (_, i) => ({ title: `N${i}`, statement: "s", hints: [], solution: "x", rubric: [] }));
      },
    };
    const plain = await buildTopicSession(manifest, FOLDER, { skill: "solve", difficulty: 2, quantity: "6-10", assistance: "no_help" }, existing, [], ai);
    expect(plain.generatedCount).toBe(0);
    const focused = await buildTopicSession(manifest, FOLDER, { skill: "solve", difficulty: 2, quantity: "6-10", assistance: "no_help", learning: ["error"] }, existing, [], ai);
    expect(focused.targetCount).toBe(8);
    expect(focused.generatedCount).toBe(5); // ceil(8 * 0.6)
    expect(focused.existingCount + focused.generatedCount).toBeGreaterThanOrEqual(8);
  });
});

describe("competency checklist", () => {
  const catalog = catalogFor("mathematics");
  const reply = JSON.stringify({
    topic_type: "procedural",
    skills: [
      { skill: "drill", recommended: true, difficulties: { 1: 5, 2: 3, 3: 2 }, why: "Base del tema", how: "Sumar mentalmente" },
      { skill: "solve", recommended: true, difficulties: { 1: 2, 2: 4, 3: 3 }, why: "Aplica", how: "Problemas" },
      { skill: "prove", recommended: true, difficulties: { 1: 0, 2: 2, 3: 2 }, why: "?", how: "Demostrar" },
    ],
    summary: "Tema de cálculo.",
  });

  it("lists EVERY catalogue skill, recommends only the ones that suit, and warns about the rest", () => {
    const parsed = parseSkillOptions(reply, catalog, "procedural")!;
    expect(parsed.options).toHaveLength(catalog.length);
    const by = Object.fromEntries(parsed.options.map((o) => [o.skill, o]));
    expect(by.drill).toMatchObject({ recommended: true, levels: [5, 3, 2], how: "Sumar mentalmente", fits: true });
    expect(by.prove!.recommended).toBe(false); // a proof does not suit a procedural topic
    expect(by.prove!.why).toContain("No suele encajar");
    expect(by.process!.recommended).toBe(false); // not mentioned by the model
    expect(parseSkillOptions("no json", catalog)).toBeNull();
  });

  it("asks the AI for all skills, each with why and how", () => {
    const [system] = buildSkillOptionsMessages({ subject: "mathematics", title: "1.2", topicType: "procedural", catalog, theory: [] });
    expect(system!.content).toContain("list EVERY skill");
    expect(system!.content).toContain('"how"');
  });
});
