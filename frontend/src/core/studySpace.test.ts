import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseProposal } from "../api/modules/studySpace";
import { buildAreaMapCanvas } from "./areaMap";
import { DEFAULT_SKILLS, ensureDefaultSkills } from "./defaultSkills";

describe("area map", () => {
  const map = buildAreaMapCanvas("1 Aritmética", ["1.10 Potencias", "1.2 Suma", "1.1 Números"]);

  it("orders topics naturally and labels every arrow", () => {
    expect(map.nodes.map((n) => n.text)).toEqual([
      expect.stringContaining("1 Aritmética"),
      "## 1.1 Números",
      "## 1.2 Suma",
      "## 1.10 Potencias",
    ]);
    expect(map.edges).toHaveLength(3);
    expect(map.edges.every((e) => e.label.length > 0)).toBe(true);
    expect(map.edges[0]).toMatchObject({ fromNode: "area", toNode: "t1" });
  });

  it("snakes rows so consecutive topics are neighbours", () => {
    const big = buildAreaMapCanvas("A", Array.from({ length: 6 }, (_, i) => `1.${i + 1} T`));
    const byId = Object.fromEntries(big.nodes.map((n) => [n.id, n]));
    expect(byId.t5!.x).toBe(byId.t4!.x); // the first of row 2 sits under the last of row 1
    expect(byId.t5!.y).toBeGreaterThan(byId.t4!.y);
  });
});

describe("default skills", () => {
  it("installs the built-in skills and never overwrites the user's", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_skills_"));
    fs.mkdirSync(path.join(root, "Matemáticas", "_skills"), { recursive: true });
    fs.writeFileSync(path.join(root, "Matemáticas", "_skills", "canvas_skill.md"), "MI CANVAS", "utf-8");
    fs.writeFileSync(path.join(root, "Matemáticas", "_skills", "practica_skill.md"), "MI PRACTICA", "utf-8");

    const created = ensureDefaultSkills(root, "Matemáticas 1");
    for (const name of Object.keys(DEFAULT_SKILLS)) expect(created).toContain(`Matemáticas 1/_skills/${name}.md`);
    // Files the built-ins do not cover come from the sibling subject.
    expect(fs.readFileSync(path.join(root, "Matemáticas 1", "_skills", "canvas_skill.md"), "utf-8")).toBe("MI CANVAS");
    expect(fs.readFileSync(path.join(root, "Matemáticas 1", "_skills", "practica_skill.md"), "utf-8")).toBe("MI PRACTICA");

    fs.writeFileSync(path.join(root, "Matemáticas 1", "_skills", "mapa_skill.md"), "EDITADA", "utf-8");
    expect(ensureDefaultSkills(root, "Matemáticas 1")).toEqual([]);
    expect(fs.readFileSync(path.join(root, "Matemáticas 1", "_skills", "mapa_skill.md"), "utf-8")).toBe("EDITADA");
  });
});

describe("syllabus proposal", () => {
  it("cleans names and drops empty areas", () => {
    const reply = '```json\n{"areas":[{"name":"1 Base/Algo","topics":[{"name":"1.1 Uno: a"},"1.2 Dos",{"name":"1.1 Uno: a"}]},{"name":"2 Vacía","topics":[]}]}\n```';
    expect(parseProposal(reply)).toEqual([{ name: "1 Base Algo", topics: [{ name: "1.1 Uno a" }, { name: "1.2 Dos" }] }]);
    expect(() => parseProposal("nada")).toThrow();
  });
});
