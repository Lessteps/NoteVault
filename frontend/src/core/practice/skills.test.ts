import { describe, expect, it } from "vitest";
import {
  ASSISTANCE_LEVELS,
  DIFFICULTY_LEVELS,
  MATHEMATICS_SKILLS,
  PROGRAMMING_SKILLS,
  assistanceLabel,
  defaultSkillForSubject,
  difficultyLabel,
  isAssistanceAllowed,
  isDifficultyAllowed,
  skillDefinition,
  skillsForSubject,
} from "./skills";
import { MODES } from "./modes";

describe("Skills catalogue", () => {
  it("includes process mode in modes catalogue", () => {
    const processMode = MODES["process"];
    expect(processMode).toBeDefined();
    expect(processMode?.label).toBe("Procedimiento guiado");
    expect(processMode?.subjects).toContain("mathematics");
    expect(processMode?.judge_focus).toContain("Grade the procedure");
    expect(processMode?.assistance_protocol).toBeDefined();
  });

  it("exposes process in mathematics skills in the right order", () => {
    const mathSkills = skillsForSubject("mathematics");
    const ids = mathSkills.map((s) => s.id);
    expect(ids).toEqual([
      "solve",
      "process",
      "prove",
      "counterexample",
      "true_false",
      "find_error",
      "drill",
      "explain",
    ]);

    const proc = mathSkills.find((s) => s.id === "process");
    expect(proc).toBeDefined();
    expect(proc?.label).toBe("Procedimiento guiado");
    expect(proc?.allowedDifficulties).toEqual([1, 2, 3]);
    expect(proc?.allowedAssistance).toEqual(["no_help", "helper"]);
    expect(proc?.assistanceProtocol).toContain("Pistas que señalan el siguiente paso");
  });

  it("enforces beginner disallow rule on debug and find_error skills", () => {
    // Mathematics find_error
    expect(isDifficultyAllowed("mathematics", "find_error", 1)).toBe(false);
    expect(isDifficultyAllowed("mathematics", "find_error", 2)).toBe(true);
    expect(isDifficultyAllowed("mathematics", "find_error", 3)).toBe(true);

    const mathFindErr = skillDefinition("mathematics", "find_error");
    expect(mathFindErr?.beginnerAllowed).toBe(false);
    expect(mathFindErr?.allowedDifficulties).toEqual([2, 3]);
    expect(mathFindErr?.defaultDifficulty).toBe(2);

    // Programming debug
    expect(isDifficultyAllowed("programming", "debug", 1)).toBe(false);
    expect(isDifficultyAllowed("programming", "debug", 2)).toBe(true);
    expect(isDifficultyAllowed("programming", "debug", 3)).toBe(true);

    const progDebug = skillDefinition("programming", "debug");
    expect(progDebug?.beginnerAllowed).toBe(false);
    expect(progDebug?.allowedDifficulties).toEqual([2, 3]);
    expect(progDebug?.defaultDifficulty).toBe(2);
  });

  it("enforces assistance rules (drill has no helper, process and others do)", () => {
    // Math drill only supports no_help
    expect(isAssistanceAllowed("mathematics", "drill", "no_help")).toBe(true);
    expect(isAssistanceAllowed("mathematics", "drill", "helper")).toBe(false);

    const drill = skillDefinition("mathematics", "drill");
    expect(drill?.allowedAssistance).toEqual(["no_help"]);

    // Math process supports both
    expect(isAssistanceAllowed("mathematics", "process", "no_help")).toBe(true);
    expect(isAssistanceAllowed("mathematics", "process", "helper")).toBe(true);

    // Programming implement supports both
    expect(isAssistanceAllowed("programming", "implement", "no_help")).toBe(true);
    expect(isAssistanceAllowed("programming", "implement", "helper")).toBe(true);
  });

  it("handles subject name aliases properly", () => {
    expect(skillsForSubject("matemáticas")).toBe(MATHEMATICS_SKILLS);
    expect(skillsForSubject("matematicas")).toBe(MATHEMATICS_SKILLS);
    expect(skillsForSubject("programming")).toBe(PROGRAMMING_SKILLS);
    expect(skillsForSubject("programación")).toBe(PROGRAMMING_SKILLS);
  });

  it("provides human-readable labels for difficulty and assistance", () => {
    expect(difficultyLabel(1)).toBe("Principiante");
    expect(difficultyLabel(2)).toBe("Intermedio");
    expect(difficultyLabel(3)).toBe("Avanzado");

    expect(assistanceLabel("no_help")).toContain("Sin ayuda");
    expect(assistanceLabel("helper")).toContain("Asistente");

    expect(DIFFICULTY_LEVELS.length).toBe(3);
    expect(ASSISTANCE_LEVELS.length).toBe(2);
  });

  it("returns default skill for a subject", () => {
    expect(defaultSkillForSubject("mathematics").id).toBe("solve");
    expect(defaultSkillForSubject("programming").id).toBe("implement");
    expect(defaultSkillForSubject("english").id).toBe("writing");
  });
});
