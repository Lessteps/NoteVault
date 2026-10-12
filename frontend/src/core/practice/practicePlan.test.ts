import { describe, expect, it } from "vitest";
import {
  applyPlanToPractica,
  buildReevaluationMessages,
  parsePracticePlan,
  planCount,
  readPlanFromPractica,
} from "./practicePlan";
import { catalogFor } from "./skillSelection";
import { buildTopicSession, resolveTargetQuantity } from "./sessionBuilder";

const catalog = catalogFor("mathematics");

const REPLY = `Here you go:
\`\`\`json
{"skills":[
  {"skill":"solve","difficulties":{"1":3,"2":4,"3":2},"why":"Cálculo directo."},
  {"skill":"find_error","difficulties":{"1":0,"2":2,"3":2},"why":"Errores típicos."},
  {"skill":"not_a_skill","difficulties":{"1":9},"why":"x"},
  {"skill":"solve","difficulties":{"1":1},"why":"duplicate"}
],"summary":"Tema operativo."}
\`\`\``;

const PRACTICA = `---
type: practica
subject: mathematics
title: 1.1 Números
topic_type: mixed
skills: [solve, process, prove]
min_per_skill: 6
---

# Práctica — 1.1 Números

Texto del usuario.
`;

describe("practice plan", () => {
  it("parses the reply, drops unknown and duplicate skills and clamps counts", () => {
    const plan = parsePracticePlan(REPLY, catalog)!;
    expect(plan.skills.map((s) => s.skill)).toEqual(["solve", "find_error"]);
    expect(plan.skills[0]!.counts).toEqual({ 1: 3, 2: 4, 3: 2 });
    expect(plan.summary).toBe("Tema operativo.");
  });

  it("returns null for a reply with no usable JSON", () => {
    expect(parsePracticePlan("no json here", catalog)).toBeNull();
    expect(parsePracticePlan('{"skills":[]}', catalog)).toBeNull();
  });

  it("stores the plan in the practica file and reads it back, idempotently", () => {
    const plan = parsePracticePlan(REPLY, catalog)!;
    plan.topicType = "procedural";
    const once = applyPlanToPractica(PRACTICA, plan);
    const twice = applyPlanToPractica(once, plan);
    expect(twice).toBe(once);
    expect(once).toContain("skills: [solve, find_error]");
    expect(once).toContain("topic_type: procedural");
    expect(once).toContain("Texto del usuario.");
    expect(readPlanFromPractica(once)).toEqual(plan);
  });

  it("answers per skill and difficulty", () => {
    const plan = parsePracticePlan(REPLY, catalog)!;
    expect(planCount(plan, "solve", 2)).toBe(4);
    expect(planCount(plan, "find_error", 1)).toBeNull();
    expect(planCount(plan, "prove", 1)).toBeNull();
    expect(planCount(null, "solve", 1)).toBeNull();
  });

  it("lists valid skill ids in the prompt", () => {
    const messages = buildReevaluationMessages({
      subject: "mathematics",
      title: "1.1 Números",
      topicType: "mixed",
      catalog,
      theory: [{ title: "Teoría", content: "Los naturales..." }],
    });
    expect(messages[0]!.content).toContain("solve");
    expect(messages[1]!.content).toContain("Los naturales");
  });

  it('"ai" quantity uses the plan count and writes into Ejercicios/<skill>/', async () => {
    expect(resolveTargetQuantity("ai", 0, 7)).toBe(7);
    expect(resolveTargetQuantity("ai", 0, null)).toBe(3);
    const manifest = {
      type: "topic" as const,
      subject: "mathematics",
      title: "T",
      skills: ["solve"],
      mastery: { min_per_skill: 6, target_difficulty: 3 as const, exam: "required" as const },
    };
    const result = await buildTopicSession(
      manifest,
      "Mat/1.1 T",
      { skill: "solve", difficulty: 2, quantity: "ai", assistance: "no_help", planCount: 2 },
      [],
      [],
      {
        async generateExercises() {
          return [
            { title: "A", statement: "s", hints: [], solution: "x", rubric: [] },
            { title: "B", statement: "s", hints: [], solution: "x", rubric: [] },
          ];
        },
      },
    );
    expect(result.targetCount).toBe(2);
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0]!.path.startsWith("Mat/1.1 T/Ejercicios/solve/")).toBe(true);
  });
});

describe("parseExerciseArray", () => {
  const good = (t: string) => `{"title":"${t}","statement":"Calcula $|-3|$","hints":["h"],"solution":"3","rubric":["ok"]}`;

  it("parses a fenced array", async () => {
    const { parseExerciseArray } = await import("./sessionBuilder");
    expect(parseExerciseArray("```json\n[" + good("A") + "," + good("B") + "]\n```")).toHaveLength(2);
  });

  it("salvages the good objects when one is broken", async () => {
    const { parseExerciseArray } = await import("./sessionBuilder");
    const broken = `{"title":"X","statement":"oops" "hints":[]}`;
    const list = parseExerciseArray(`[${good("A")},${broken},${good("C")}]`);
    expect(list.map((e) => e.title)).toEqual(["A", "C"]);
  });

  it("returns nothing for an empty or unusable reply", async () => {
    const { parseExerciseArray } = await import("./sessionBuilder");
    expect(parseExerciseArray("")).toEqual([]);
    expect(parseExerciseArray("lo siento, no puedo")).toEqual([]);
  });
});

describe("plan drives the competency matrix", () => {
  const reply = (type: string) =>
    JSON.stringify({
      topic_type: type,
      skills: [
        { skill: "drill", difficulties: { 1: 3, 2: 3, 3: 0 }, why: "x" },
        { skill: "explain", difficulties: { 1: 2, 2: 2, 3: 1 }, why: "y" },
        { skill: "true_false", difficulties: { 1: 3, 2: 2, 3: 0 }, why: "z" },
      ],
      summary: "s",
    });

  it("never keeps quick calculation on a theoretical topic", async () => {
    const plan = parsePracticePlan(reply("theoretical"), catalog)!;
    expect(plan.skills.map((s) => s.skill)).toEqual(["explain", "true_false"]);
    expect(plan.topicType).toBe("theoretical");
    expect(parsePracticePlan(reply("procedural"), catalog)!.skills.map((s) => s.skill)).toEqual(["drill"]);
  });

  it("is read back as the topic's manifest and sets each matrix cell's requirement", async () => {
    const { parseTopicManifest, computeTopicProgress } = await import("./topic");
    const plan = parsePracticePlan(reply("theoretical"), catalog)!;
    const text = applyPlanToPractica(PRACTICA, plan);
    expect(text).toContain('plan: "explain=2/2/1, true_false=3/2/0"');

    const manifest = parseTopicManifest(text)!;
    expect(manifest.skills).toEqual(["explain", "true_false"]);
    expect(manifest.plan).toEqual({ explain: [2, 2, 1], true_false: [3, 2, 0] });

    const progress = computeTopicProgress(manifest, [], {});
    expect(progress.skills.explain!.cells[1].required).toBe(2);
    expect(progress.skills.true_false!.cells[3].required).toBe(0);
    expect(progress.skills.explain!.mastered).toBe(false);
  });
});

describe("parseExerciseArray: enunciados con bloques de código", () => {
  const withCode = (title: string) =>
    JSON.stringify({
      title,
      statement: "Find the bug in this snippet:\n```python\nfor i in range(3):\nprint(i)\n```\nSay what is wrong.",
      hints: ["Look at the indentation."],
      solution: "The body of the loop is not indented:\n```python\nfor i in range(3):\n    print(i)\n```",
      rubric: ["Names the indentation error"],
    });

  it("un array JSON sin cerco cuyo texto trae bloques ``` dentro no se rompe", async () => {
    const { parseExerciseArray } = await import("./sessionBuilder");
    const list = parseExerciseArray("[" + withCode("A") + "," + withCode("B") + "]");
    expect(list.map((e) => e.title)).toEqual(["A", "B"]);
    expect(list[0]!.statement).toContain("```python");
  });

  it("un array dentro de un cerco ```json con bloques de código en sus cadenas tampoco", async () => {
    const { parseExerciseArray } = await import("./sessionBuilder");
    const list = parseExerciseArray("Aquí tienes:\n```json\n[" + withCode("A") + "," + withCode("B") + "]\n```\nEspero que sirva.");
    expect(list).toHaveLength(2);
    expect(list[1]!.solution).toContain("print(i)");
  });

  it("un cerco normal con texto alrededor sigue funcionando", async () => {
    const { parseExerciseArray } = await import("./sessionBuilder");
    const plain = JSON.stringify({ title: "P", statement: "S", hints: [], solution: "x", rubric: ["r"] });
    expect(parseExerciseArray("Claro:\n```json\n[" + plain + "]\n```")).toHaveLength(1);
  });
});
