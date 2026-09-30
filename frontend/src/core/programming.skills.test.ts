import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { PROGRAMMING_SKILLS } from "./practice/skills";
import { defaultSkillsFor, ensureDefaultSkills } from "./defaultSkills";
import { PROGRAMMING_DEFAULT_SKILLS } from "./programmingDefaultSkills";

describe("programming default skills", () => {
  it("has the five notes, none of them talking maths or English", () => {
    expect(Object.keys(PROGRAMMING_DEFAULT_SKILLS).sort()).toEqual(["mapa_skill", "practica_skill", "resumen_teorico_skill", "subtemas_skill", "temario_skill"]);
    expect(defaultSkillsFor("programming")).toBe(PROGRAMMING_DEFAULT_SKILLS);
    for (const text of Object.values(PROGRAMMING_DEFAULT_SKILLS)) {
      expect(text).toContain("domain: programming");
      expect(text).not.toMatch(/LaTeX between|\$\.\.\.\$|CEFR|MCER/);
    }
  });

  it("the theory skill keeps the contract the topic map parses", () => {
    const t = PROGRAMMING_DEFAULT_SKILLS.resumen_teorico_skill!;
    for (const heading of ["## Requires", "### What it is", "### Mental model", "## Examples", "## Common mistakes", "## Connections", "## Cards"]) expect(t).toContain(heading);
    for (const field of ["**Context:**", "**Case:**", "**Expected result:**", "**Why it works:**", "**Mistake:**", "**Symptom:**", "**Cause:**", "**Fix:**"]) expect(t).toContain(field);
  });

  it("the practice skill lists every competency of the catalogue and names every area", () => {
    const p = PROGRAMMING_DEFAULT_SKILLS.practica_skill!;
    for (const s of PROGRAMMING_SKILLS) expect(p, s.id).toContain(`\`${s.id}\``);
    const t = PROGRAMMING_DEFAULT_SKILLS.temario_skill!;
    for (const area of ["1 Fundamentals", "2.1 Python", "2.2 JavaScript", "2.3 TypeScript", "3 Desktop Apps (Electron)", "4 Backend", "5 Frontend", "6 Databases", "7 Automation", "8 Mobile", "9 Tooling and Quality"]) expect(t, area).toContain(area);
  });

  it("installs them in a programming space and only lends from a space of the same domain", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_progskills_"));
    const space = (name: string, subject: string) => {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, `${name}.resumen.md`), `---\nsubject: ${subject}\n---\n`, "utf-8");
    };
    space("Matemáticas", "mathematics");
    fs.mkdirSync(path.join(root, "Matemáticas", "_skills"), { recursive: true });
    fs.writeFileSync(path.join(root, "Matemáticas", "_skills", "canvas_skill.md"), "SOLO MATEMÁTICAS", "utf-8");
    space("Programación", "programming");
    const created = ensureDefaultSkills(root, "Programación", [], "programming");
    expect(created).toHaveLength(5);
    expect(fs.existsSync(path.join(root, "Programación", "_skills", "canvas_skill.md"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "Programación", "_skills", "temario_skill.md"), "utf-8")).toContain("Windows apps");
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("everything in the programming skills is English", () => {
  it("the notes and the exercise prompt carry no Spanish instructions", () => {
    for (const [name, text] of Object.entries(PROGRAMMING_DEFAULT_SKILLS)) {
      expect(text, name).not.toMatch(/\b(Requiere|Explicación|Ejemplos|Errores comunes|Tarjetas|Sin prerrequisitos|competencias)\b/);
    }
  });
});
