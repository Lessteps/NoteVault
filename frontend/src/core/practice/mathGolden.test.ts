// Mathematics must behave EXACTLY as before English became a second domain. This test freezes what
// the math side produces today (skill catalogue, topic types, every prompt, the default skill notes)
// in `mathGolden.json` and compares against it. Regenerate the file only for a deliberate change to
// mathematics: `NV_WRITE_GOLDEN=1 npx vitest run src/core/practice/mathGolden.test.ts`.

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SKILLS } from "../defaultSkills";
import { buildReevaluationMessages, buildSkillOptionsMessages, parsePracticePlan, parseSkillOptions } from "./practicePlan";
import { buildExerciseGenerationPrompt, formatExerciseNote } from "./sessionBuilder";
import { catalogFor, deterministicSkillSelector } from "./skillSelection";
import { skillsForSubject } from "./skills";
import { createDefaultTopicManifest } from "./topic";
import { detectTopicType, topicTypeFromName } from "./topicType";

const FILE = path.join(__dirname, "mathGolden.json");

const NAMES = [
  "1.1 Números naturales y enteros orden, valor absoluto y recta numérica",
  "1.2 Suma y resta de números naturales y enteros",
  "1.7 Máximo común divisor y mínimo común múltiplo",
  "Lógica proposicional y conectivos",
  "Inducción matemática",
  "Porcentajes",
  "Derivadas",
  "Conjuntos y notación",
  "Ecuaciones lineales",
  "Tema sin pistas de tipo",
];

function snapshot(): Record<string, unknown> {
  const catalog = catalogFor("mathematics");
  const manifest = createDefaultTopicManifest("M/1 A/1.2 Suma", "1.2 Suma y resta", "mathematics", []);
  const input = {
    subject: "mathematics",
    title: "1.2 Suma y resta",
    topicType: "procedural" as const,
    catalog,
    theory: [{ title: "Teoría", content: "Suma con signo. Ejemplos: -3 + 5 = 2." }],
    currentSkills: ["solve", "process"],
  };
  const reply = JSON.stringify({
    topic_type: "procedural",
    skills: [
      { skill: "solve", difficulties: { 1: 3, 2: 4, 3: 2 }, why: "aplica" },
      { skill: "drill", difficulties: { 1: 5, 2: 3, 3: 2 }, why: "agilidad" },
      { skill: "prove", difficulties: { 1: 0, 2: 2, 3: 2 }, why: "no encaja" },
    ],
    summary: "Tema de cálculo.",
  });
  return {
    skillIds: skillsForSubject("mathematics").map((s) => s.id),
    catalog: catalog.map((s) => ({ id: s.id, label: s.label, topicTypes: s.topicTypes, competencies: s.competencies, d: s.allowedDifficulties, a: s.allowedAssistance })),
    topicTypes: NAMES.map((n) => [n, detectTopicType({ name: n }).type, topicTypeFromName(n)]),
    reevaluation: buildReevaluationMessages(input),
    skillOptions: buildSkillOptionsMessages(input),
    plan: (["procedural", "theoretical", "mixed"] as const).map((t) => parsePracticePlan(reply, catalog, t)),
    options: parseSkillOptions(reply, catalog, "procedural"),
    selector: (["procedural", "theoretical", "mixed"] as const).map((t) => deterministicSkillSelector.select({ subject: "mathematics", topicType: t, title: "T" })),
    exercisePrompt: [
      buildExerciseGenerationPrompt(manifest, [{ rel: "a", title: "Teoría", content: "Contenido" }], "solve", 2, "no_help", 3),
      buildExerciseGenerationPrompt(manifest, [], "prove", 3, "helper", 2, ["Error de signo"]),
    ],
    exerciseNote: formatExerciseNote(manifest, "solve", 2, "no_help", { title: "Ej", statement: "Calcula.", hints: ["Pista"], solution: "2", rubric: ["Correcto"] }),
    defaultSkills: Object.fromEntries(Object.entries(DEFAULT_SKILLS).map(([k, v]) => [k, v])),
  };
}

describe("mathematics is unchanged", () => {
  it("produces the same catalogue, topic types, prompts and skill notes as before the English domain", () => {
    const now = JSON.parse(JSON.stringify(snapshot()));
    if (process.env.NV_WRITE_GOLDEN === "1") {
      fs.writeFileSync(FILE, JSON.stringify(now, null, 1) + "\n", "utf-8");
      return;
    }
    const golden = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    expect(now).toEqual(golden);
  });
});
