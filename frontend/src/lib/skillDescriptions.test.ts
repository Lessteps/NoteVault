// Area B of FIX_VIEWS: in mathematics every skill carries a short Spanish
// description, and it reaches the UI (the matrix rows and the skill picker).
//
// The UI project cannot import `core/`, so the catalogue exists twice; this file
// is compiled by no tsconfig project, which makes it the right place to assert
// the two copies stay in step.

import { describe, expect, it } from "vitest";
import { MATHEMATICS_SKILLS, PROGRAMMING_SKILLS, ENGLISH_SKILLS, skillsForSubject } from "./skills";
import { MATHEMATICS_SKILLS as CORE_MATHS } from "../core/practice/skills";
import { MODES } from "../core/practice/modes";

/** A description that is empty, a repeat of the label, or English, is a bug. */
function checkDescription(label: string, description: string, label_id: string) {
  expect(description.trim(), `${label_id} has no description`).not.toBe("");
  expect(description.trim(), `${label_id} describes itself with its label`).not.toBe(label);
  expect(description.length, `${label_id}'s description is too long to read`).toBeLessThan(120);
}

describe("math skill descriptions", () => {
  it("exist for every mathematics skill in the renderer catalogue", () => {
    expect(MATHEMATICS_SKILLS).toHaveLength(8);
    for (const skill of MATHEMATICS_SKILLS) {
      checkDescription(skill.label, skill.description, skill.id);
    }
  });

  it("exist for every skill of every subject", () => {
    for (const subject of ["mathematics", "programming", "english"]) {
      const skills = skillsForSubject(subject);
      expect(skills.length, `${subject} has no skills`).toBeGreaterThan(0);
      for (const skill of skills) checkDescription(skill.label, skill.description, `${subject}/${skill.id}`);
    }
  });

  it("are the same in the core catalogue and in the renderer copy", () => {
    const core = new Map(CORE_MATHS.map((s) => [s.id, s.description]));
    expect(MATHEMATICS_SKILLS.map((s) => s.id).sort()).toEqual([...core.keys()].sort());
    for (const skill of MATHEMATICS_SKILLS) {
      expect(skill.description, `${skill.id} differs between catalogues`).toBe(core.get(skill.id));
    }
  });

  it("are the same in the practice modes catalogue", () => {
    for (const skill of MATHEMATICS_SKILLS) {
      const mode = MODES[skill.id];
      expect(mode, `mode ${skill.id} is missing`).toBeTruthy();
      expect(mode!.description, `mode ${skill.id} has no Spanish description`).toBe(skill.description);
    }
  });

  it("never falls back to the English judging focus", () => {
    for (const subject of ["mathematics", "programming", "english"]) {
      for (const skill of skillsForSubject(subject)) {
        const mode = MODES[skill.id];
        if (!mode) continue;
        expect(skill.description).not.toBe(mode.judge_focus);
        expect(skill.description).not.toMatch(/\b(the|and|with|which|must|not)\b/i);
      }
    }
  });

  it("covers the programming and english catalogues too", () => {
    expect(PROGRAMMING_SKILLS.length).toBeGreaterThan(0);
    expect(ENGLISH_SKILLS.length).toBeGreaterThan(0);
  });
});
