import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isHeavyNote, MAX_EXPLANATION_WORDS, MAX_NOTE_WORDS, noteWeight, titleConceptsOf, titleTooBroad } from "./noteWeight";

const words = (n: number): string => Array.from({ length: n }, () => "word").join(" ");
const note = (title: string, explanation: number, examples = 100, requires = "*No prerequisites.*", fm = ""): string =>
  `---\ntitle: "${title}"\n${fm}---\n\n# 1.1 ${title}\n\n## Requires\n${requires}\n\n## Explanation\n\n### What it is\n${words(explanation)}\n\n## Examples\n${words(examples)}\n\n## Common mistakes\nx\n`;

describe("peso de una nota: una nota se aprende de una vez", () => {
  it("cuenta títulos con varios conceptos", () => {
    expect(titleConceptsOf("2.1.4 Functions")).toBe(1);
    expect(titleConceptsOf("Tuples, sets and records")).toBe(3);
    expect(titleConceptsOf("Project structure, virtual environments and imports")).toBe(3);
  });

  it("una nota corta y de una idea cabe", () => {
    expect(isHeavyNote(note("Functions", 200))).toBe(false);
  });

  it("la explicación larga marca la nota aunque el total quepa (la 2.1.1: demasiado para leer antes de un ejemplo)", () => {
    const w = noteWeight(note("Project structure, virtual environments and imports", MAX_EXPLANATION_WORDS + 100));
    expect(w.reasons.join(" ")).toMatch(/explicación/);
    expect(titleTooBroad(w)).toBe(true);
  });

  it("la nota entera larga también", () => {
    expect(isHeavyNote(note("Functions", 200, MAX_NOTE_WORDS))).toBe(true);
  });

  it("un título largo en una nota ligera no se marca", () => {
    expect(titleTooBroad(noteWeight(note("Tuples, sets and records", 200)))).toBe(false);
  });

  it("detecta «No prerequisites» cuando el frontmatter lista prerrequisitos", () => {
    expect(noteWeight(note("X", 100, 50, "*No prerequisites.*", 'prerequisites: ["1.6 A"]\n')).requiresMismatch).toBe(true);
    expect(noteWeight(note("X", 100, 50, "- [[1.6 A]] — why", 'prerequisites: ["1.6 A"]\n')).requiresMismatch).toBe(false);
  });

  it("los mismos límites que usa la herramienta check_format.mjs (si cambias uno, cambia el otro)", () => {
    const tool = fs.readFileSync(`${__dirname}/../../tools/programming_kb/check_format.mjs`, "utf8");
    expect(tool).toContain(`MAX_EXPLANATION_WORDS = ${MAX_EXPLANATION_WORDS}`);
    expect(tool).toContain(`MAX_NOTE_WORDS = ${MAX_NOTE_WORDS}`);
  });
});
