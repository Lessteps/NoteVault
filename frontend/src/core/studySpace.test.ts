import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseProposal } from "../api/modules/studySpace";
import { buildAreaMapCanvas, buildSpaceMapCanvas } from "./areaMap";
import { DEFAULT_SKILLS, ensureDefaultSkills } from "./defaultSkills";

describe("area map (copied from the vault's own maps)", () => {
  const topics = ["1.10 Potencias", "1.2 Suma", "1.1 Números", "1.3 Producto"].map((name) => ({ name, file: `A/${name}/${name}.md` }));
  const deps = [
    { from: "1.1 Números", to: "1.2 Suma", label: "orden y signo en la recta" },
    { from: "1.2 Suma", to: "1.3 Producto", label: "suma repetida" },
    { from: "1.2 Suma", to: "1.10 Potencias", label: "producto repetido" },
    { from: "1.10 Potencias", to: "1.1 Números", label: "hacia atrás: se ignora" },
  ];
  const map = buildAreaMapCanvas("1 Aritmética", topics, deps);
  const file = (name: string) => map.nodes.find((n) => n.file?.endsWith(`${name}.md`))!;

  it("is one coloured group holding a file card per topic, in natural order", () => {
    const group = map.nodes[0]!;
    expect(group).toMatchObject({ type: "group", label: "1 Aritmética", color: "6", x: -24, y: -48 });
    expect(map.nodes.filter((n) => n.type === "file")).toHaveLength(4);
    expect(file("1.1 Números")).toMatchObject({ x: 0, y: 0, width: 300, height: 120 });
  });

  it("lays topics out in dependency columns, 640 px apart, 210 px per row", () => {
    expect(file("1.2 Suma").x).toBe(640);
    expect(file("1.3 Producto").x).toBe(1280);
    expect(file("1.10 Potencias").x).toBe(1280);
    expect(file("1.10 Potencias").y).toBe(210);
    const group = map.nodes[0]!;
    expect(group.width).toBe(1280 + 300 + 48);
  });

  it("draws right→left arrows with the reason as label and drops backwards dependencies", () => {
    expect(map.edges).toHaveLength(3);
    expect(map.edges.every((e) => e.fromSide === "right" && e.toSide === "left" && e.label.length > 0)).toBe(true);
    expect(map.edges.map((e) => e.label)).toContain("suma repetida");
  });

  it("chains the topics when no dependencies are known", () => {
    const chained = buildAreaMapCanvas("A", topics);
    expect(chained.edges.map((e) => e.label)).toEqual(["prepara para", "prepara para", "prepara para"]);
  });

  it("subject map: one group per block with linked topics, arrows say how many prerequisites", () => {
    const space = buildSpaceMapCanvas([
      { name: "1 Aritmética", topics: ["1.1 A", "1.2 B"] },
      { name: "2 Álgebra", topics: ["2.1 C"], prerequisites: 4 },
    ]);
    expect(space.nodes.filter((n) => n.type === "group").map((n) => n.label)).toEqual(["Bloque I — Aritmética", "Bloque II — Álgebra"]);
    expect(space.nodes.find((n) => n.id === "a1")!.text).toBe("## 1 Aritmética\n\n- [[1.1 A]]\n- [[1.2 B]]");
    expect(space.edges[0]!.label).toBe("4 prerrequisito(s)");
    expect(space.nodes.find((n) => n.id === "g2")!.x).toBe(680);
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
    // The built-in practice skill (with the type-fit table) wins over the sibling's thin one.
    expect(fs.readFileSync(path.join(root, "Matemáticas 1", "_skills", "practica_skill.md"), "utf-8")).toContain("matriz de competencias");

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

describe("generator helpers", () => {
  it("keeps only dependencies between known topics, with a short label", async () => {
    const { parseDependencies } = await import("../api/modules/studySpace");
    const reply = '{"dependencies":[{"from":"1.1 A","to":"1.2 B","label":"orden en la recta"},{"from":"1.1 A","to":"9.9 X","label":"no existe"},{"from":"1.2 B","to":"1.3 C","label":""}]}';
    expect(parseDependencies(reply, ["1.1 A", "1.2 B", "1.3 C"])).toEqual([{ from: "1.1 A", to: "1.2 B", label: "orden en la recta" }]);
  });

  it("drops prerequisite links to topics that do not exist", async () => {
    const { sanitizeRequires } = await import("../api/modules/studySpace");
    const body = "# 1.2 B\n\n## Requiere\n\n- [[1.1 A]] — base\n- [[7.7 Fantasma]] — no existe\n\n## Explicación\n\nx";
    const out = sanitizeRequires(body, new Set(["1.1 A"]));
    expect(out).toContain("[[1.1 A]]");
    expect(out).not.toContain("Fantasma");
    const none = sanitizeRequires("## Requiere\n\n- [[7.7 Fantasma]] — x\n\n## Explicación\n", new Set());
    expect(none).toContain("*Sin prerrequisitos.*");
  });
});

describe("generate one topic from its folder", () => {
  it("only accepts a Space/Area/Topic folder", async () => {
    const { studySpaceApi } = await import("../api/modules/studySpace");
    const { AppState } = await import("../api/appState");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_topic_"));
    fs.mkdirSync(path.join(root, "Mat 1", "1 Area", "1.1 Tema"), { recursive: true });
    const api = studySpaceApi(new AppState(root));
    expect(() => api.study_topic_generate("Mat 1/1 Area")).toThrow(/carpeta de un tema/);
    expect(() => api.study_topic_generate("Mat 1/1 Area/9.9 Nada")).toThrow(/no existe/);
  });
});
