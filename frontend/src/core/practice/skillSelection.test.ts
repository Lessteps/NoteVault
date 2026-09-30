// Fase 1 · el catálogo decide qué se practica.
//
// La regla que pidió el usuario: un tema teórico (lógica, demostración) no se
// practica con cálculo rápido. Y el paso de selección vive detrás de una interfaz
// (`SkillSelector`) para que un modelo pueda sustituirlo sin tocar nada más.

import { describe, expect, it } from "vitest";
import {
  MAX_RECOMMENDED_SKILLS,
  catalogFor,
  catalogSkill,
  registerCustomSkills,
  recommendSkillsForTopic,
  skillsForTopicType,
  type SkillSelector,
} from "./skillSelection.js";
import { detectTopicType, topicTypeFromName } from "./topicType.js";

describe("catálogo de skills", () => {
  it("cada skill de matemáticas dice qué certifica y en qué tipo de tema encaja", () => {
    for (const skill of catalogFor("mathematics")) {
      expect(skill.competencies.length, skill.id).toBeGreaterThan(0);
      expect(skill.topicTypes.length, skill.id).toBeGreaterThan(0);
    }
  });

  it("«Cálculo rápido» es solo procedimental", () => {
    expect(catalogSkill("mathematics", "drill")!.topicTypes).toEqual(["procedural"]);
    expect(skillsForTopicType("mathematics", "theoretical")).not.toContain("drill");
  });
});

describe("recomendación por tipo de tema", () => {
  it("un tema teórico no ofrece cálculo rápido y sí demostrar/explicar", () => {
    const res = recommendSkillsForTopic({ subject: "mathematics", topicType: "theoretical", title: "1.1 Proposiciones y conectivos lógicos" });
    expect(res.skills).not.toContain("drill");
    expect(res.skills).toContain("prove");
    expect(res.skills).toContain("explain");
    expect(res.skills.every((id) => catalogSkill("mathematics", id)!.topicTypes.includes("theoretical"))).toBe(true);
  });

  it("un tema procedimental sí ofrece cálculo rápido y no demostración", () => {
    const res = recommendSkillsForTopic({ subject: "mathematics", topicType: "procedural", title: "1.2 Suma y resta de enteros" });
    expect(res.skills).toContain("drill");
    expect(res.skills).toContain("solve");
    expect(res.skills).not.toContain("prove");
  });

  it("un tema mixto ofrece de los dos, con tope", () => {
    const res = recommendSkillsForTopic({ subject: "mathematics", topicType: "mixed" });
    expect(res.skills.length).toBeLessThanOrEqual(MAX_RECOMMENDED_SKILLS);
    expect(res.skills).toContain("prove");
    expect(res.skills).toContain("solve");
  });

  it("si el tema declara sus skills, mandan las suyas", () => {
    const res = recommendSkillsForTopic({
      subject: "mathematics",
      topicType: "theoretical",
      declaredSkills: ["drill", "explain"],
    });
    expect(res.skills).toEqual(["drill", "explain"]);
    expect(res.source).toBe("declared");
  });
});

describe("skills propias del vault", () => {
  it("se pueden dar de alta y se ofrecen cuando el tema las pide", () => {
    registerCustomSkills("mathematics", [
      { id: "estimate", label: "Estimar", description: "Estimar un resultado antes de calcularlo.", competencies: ["Orden de magnitud"], topicTypes: ["procedural"] },
    ]);
    const custom = catalogSkill("mathematics", "estimate")!;
    expect(custom.custom).toBe(true);
    expect(catalogFor("mathematics").map((s) => s.id)).toContain("estimate");

    const res = recommendSkillsForTopic({ subject: "mathematics", topicType: "procedural", declaredSkills: ["estimate"] });
    expect(res.skills).toEqual(["estimate"]);
    expect(res.source).toBe("custom");
    registerCustomSkills("mathematics", []);
  });
});

describe("el paso de selección es sustituible", () => {
  it("un selector propio decide la lista sin tocar el resto", () => {
    const aiSelector: SkillSelector = {
      id: "ai-test",
      select: (request) => ({
        skills: ["explain"],
        topicType: request.topicType,
        source: "catalogue",
        notes: ["lo decidió el modelo"],
        entries: [catalogSkill(request.subject, "explain")!],
      }),
    };
    const res = recommendSkillsForTopic({ subject: "mathematics", topicType: "procedural" }, aiSelector);
    expect(res.skills).toEqual(["explain"]);
    expect(res.notes).toEqual(["lo decidió el modelo"]);
  });
});

describe("tipo de tema", () => {
  it("lo deduce del nombre cuando el tema aún no tiene ejercicios", () => {
    expect(topicTypeFromName("1.1 Proposiciones y conectivos lógicos")).toBe("theoretical");
    expect(topicTypeFromName("1.2 Suma y resta de enteros")).toBe("procedural");
    // «Teorema» es palabra de teoría; en el vault estos temas ya tienen ejercicios,
    // así que el nombre solo decide cuando todavía no hay ninguno.
    expect(topicTypeFromName("3.3 Teorema de Pitágoras")).toBe("theoretical");
    expect(topicTypeFromName("4.7 Tema raro")).toBeNull();
  });

  it("manda la mayoría de los modos de sus ejercicios", () => {
    const theoretical = detectTopicType({
      name: "1.1 Cualquiera",
      practiceModes: ["true_false", "prove", "counterexample", "solve"],
      theoreticalModes: ["prove", "counterexample", "true_false", "find_error", "explain"],
    });
    expect(theoretical.type).toBe("theoretical");
    expect(theoretical.source).toBe("exercises");

    const procedural = detectTopicType({
      name: "1.1 Cualquiera",
      practiceModes: ["solve", "drill", "solve"],
      theoreticalModes: ["prove", "true_false"],
    });
    expect(procedural.type).toBe("procedural");
  });

  it("sin ejercicios ni pistas en el nombre, mixto", () => {
    expect(detectTopicType({ name: "4.7 Tema raro" })).toEqual({
      type: "mixed",
      source: "default",
      why: "sin ejercicios ni pistas en el nombre",
    });
  });
});
