// Area B of FIX_VIEWS, core side: the per-topic progress the views render must
// carry each skill's Spanish description, and the catalogue must never hand the
// English judging focus to the UI.

import { describe, expect, it } from "vitest";
import { MODES } from "./modes";
import { MATHEMATICS_SKILLS, PROGRAMMING_SKILLS, skillsForSubject } from "./skills";
import { computeTopicProgress, createDefaultTopicManifest } from "./topic";

const MATH_DESCRIPTIONS: Record<string, string> = {
  solve: "Resolución de problemas contextualizados y aplicados.",
  process: "Scaffolding paso a paso para consolidar la base.",
  prove: "Rigor matemático, proporciones formales y álgebra.",
  counterexample: "Identificación de casos límite y refutación de hipótesis.",
  true_false: "Discernimiento rápido de postulados y propiedades.",
  find_error: "Detección analítica de falacias y pasos fallidos.",
  explain: "Explicar conceptos complejos con tus propias palabras.",
  drill: "Agilidad aritmética, simplificación y estimación de porcentajes.",
};

describe("skill descriptions", () => {
  it("are exactly the ones the design asks for, for every mathematics skill", () => {
    expect([...MATHEMATICS_SKILLS.map((s) => s.id)].sort()).toEqual(Object.keys(MATH_DESCRIPTIONS).sort());
    for (const skill of MATHEMATICS_SKILLS) {
      expect(skill.description).toBe(MATH_DESCRIPTIONS[skill.id]);
    }
  });

  it("exist for the other subjects' skills as well", () => {
    for (const skills of [PROGRAMMING_SKILLS, skillsForSubject("english")]) {
      for (const skill of skills) {
        expect(skill.description.trim(), `${skill.id} has no description`).not.toBe("");
        expect(skill.description).not.toBe(MODES[skill.id]?.judge_focus);
      }
    }
  });

  it("reach the topic progress the views render", () => {
    const manifest = createDefaultTopicManifest("mathematics", "1.1 Números", "1 Aritmética");
    const progress = computeTopicProgress(manifest, [], {}, null, 0);
    for (const [id, description] of Object.entries(MATH_DESCRIPTIONS)) {
      expect(progress.skills[id]?.description, `${id} lost its description`).toBe(description);
    }
    expect(progress.skills.solve?.label).toBe("Problema");
  });
});
