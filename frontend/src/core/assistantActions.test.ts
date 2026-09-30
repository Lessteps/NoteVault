import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { applyAssistantAction, planAssistantAction, safeRel, subjectIdOf } from "./assistantActions";
import { parseTopicManifest } from "./practice/topic";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_actions_"));
});

const read = (rel: string) => fs.readFileSync(path.join(root, ...rel.split("/")), "utf-8");

describe("safeRel", () => {
  it("keeps normal names and refuses anything that could escape or hide", () => {
    expect(safeRel("Matemáticas/1 Área/1.1 Tema.md")).toBe("Matemáticas/1 Área/1.1 Tema.md");
    for (const bad of ["../fuera.md", "/abs.md", "C:/x.md", ".notevault/x.md", "a/../b.md", "a/.git/c", ""]) {
      expect(() => safeRel(bad), bad).toThrow();
    }
  });
});

describe("create_syllabus", () => {
  const action = {
    action: "create_syllabus",
    args: {
      subject: "JavaScript",
      subject_id: "programming",
      areas: [
        { name: "1 Fundamentos", folder: "1 Fundamentos", topics: [{ name: "1.1 Variables y tipos" }, { name: "1.2 Funciones" }] },
        { name: "2 Asincronía", topics: [{ name: "2.1 Promesas" }] },
      ],
    },
  };

  it("plans without writing, then creates areas, overviews and topic practice files", () => {
    const plan = planAssistantAction(root, action);
    expect(plan.ops.filter((o) => o.kind === "write").length).toBe(8);
    expect(fs.existsSync(path.join(root, "JavaScript"))).toBe(false);

    const res = applyAssistantAction(root, action);
    expect(res.written).toContain("JavaScript/1 Fundamentos/1 Fundamentos.resumen.md");
    expect(res.written).toContain("JavaScript/JavaScript.resumen.md");
    // Each grouping area gets its map, with every arrow labelled.
    const map = JSON.parse(read("JavaScript/1 Fundamentos/00 Mapa — 1 Fundamentos.canvas"));
    expect(map.nodes).toHaveLength(3);
    expect(map.edges.every((e: { label: string }) => e.label)).toBe(true);
    const practica = read("JavaScript/1 Fundamentos/1.1 Variables y tipos/1.1 Variables y tipos.practica.md");
    const manifest = parseTopicManifest(practica)!;
    expect(manifest.subject).toBe("programming");
    expect(manifest.skills.length).toBeGreaterThan(0);
  });

  it("never replaces what already exists", () => {
    applyAssistantAction(root, action);
    const file = "JavaScript/1 Fundamentos/1 Fundamentos.resumen.md";
    fs.writeFileSync(path.join(root, ...file.split("/")), "MINE", "utf-8");
    const again = applyAssistantAction(root, action);
    expect(again.skipped).toContain(file);
    expect(read(file)).toBe("MINE");
  });
});

describe("create_topic", () => {
  it("writes a typed theory note and a practice view inside an existing area", () => {
    fs.mkdirSync(path.join(root, "Matemáticas", "1 Aritmética"), { recursive: true });
    const res = applyAssistantAction(root, {
      action: "create_topic",
      args: { area: "Matemáticas/1 Aritmética", topic: { name: "1.13 Conjuntos" }, theory: "# Conjuntos\n\nUn conjunto es…" },
    });
    expect(res.open).toBe("Matemáticas/1 Aritmética/1.13 Conjuntos/1.13 Conjuntos.md");
    expect(read(res.open!)).toContain("type: teorica");
    expect(read("Matemáticas/1 Aritmética/1.13 Conjuntos/1.13 Conjuntos.practica.md")).toContain("type: practica");
  });

  it("refuses an area that does not exist", () => {
    expect(() =>
      planAssistantAction(root, { action: "create_topic", args: { area: "Nada/Aqui", topic: { name: "x" }, theory: "t" } }),
    ).toThrow(/no existe/);
  });
});

describe("create_canvas / write_skill / create_note", () => {
  const node = { id: "a", type: "text", text: "Hola", x: 0, y: 0, width: 200, height: 80 };

  it("validates a canvas before writing it", () => {
    expect(() => planAssistantAction(root, { action: "create_canvas", args: { path: "c", canvas: { nodes: [] } } })).toThrow();
    expect(() =>
      planAssistantAction(root, {
        action: "create_canvas",
        args: { path: "c", canvas: { nodes: [node], edges: [{ id: "e", fromNode: "a", toNode: "zzz" }] } },
      }),
    ).toThrow(/inexistente/);
    const res = applyAssistantAction(root, { action: "create_canvas", args: { path: "Mapa/uno", canvas: { nodes: [node], edges: [] } } });
    expect(res.written).toEqual(["Mapa/uno.canvas"]);
    expect(JSON.parse(read("Mapa/uno.canvas")).nodes).toHaveLength(1);
  });

  it("replaces a skill on purpose but not a note", () => {
    applyAssistantAction(root, { action: "write_skill", args: { name: "canvas_skill", content: "v1" } });
    const plan = planAssistantAction(root, { action: "write_skill", args: { name: "canvas_skill", content: "v2" } });
    expect(plan.warnings.length).toBe(1);
    applyAssistantAction(root, { action: "write_skill", args: { name: "canvas_skill", content: "v2" } });
    expect(read("_skills/canvas_skill.md")).toBe("v2\n");

    applyAssistantAction(root, { action: "create_note", args: { path: "N", content: "uno" } });
    const second = applyAssistantAction(root, { action: "create_note", args: { path: "N", content: "dos" } });
    expect(second.skipped).toEqual(["N.md"]);
    expect(read("N.md")).toBe("uno\n");
  });

  it("rejects unknown actions and paths outside the vault", () => {
    expect(() => planAssistantAction(root, { action: "rm_rf", args: {} })).toThrow(/desconocida/);
    expect(() => planAssistantAction(root, { action: "create_note", args: { path: "../x", content: "y" } })).toThrow();
  });
});

describe("subjectIdOf", () => {
  it("trusts a valid subject id and otherwise guesses from the name", () => {
    expect(subjectIdOf("Lo que sea", "english")).toBe("english");
    expect(subjectIdOf("Backend Development")).toBe("programming");
    expect(subjectIdOf("Inglés técnico")).toBe("english");
    expect(subjectIdOf("Cálculo diferencial")).toBe("mathematics");
  });
});

describe("set_practice_plan", () => {
  it("rewrites one topic's matrix and drops skills that do not suit it", () => {
    const topic = path.join(root, "Matemáticas", "1 A", "1.1 Números");
    fs.mkdirSync(topic, { recursive: true });
    fs.writeFileSync(path.join(topic, "1.1 Números.practica.md"), "---\ntype: practica\nsubject: mathematics\ntitle: 1.1 Números\nskills: [solve, drill]\n---\n\n# Práctica\n", "utf-8");

    const action = {
      action: "set_practice_plan",
      args: {
        topic: "Matemáticas/1 A/1.1 Números",
        topic_type: "theoretical",
        skills: [
          { skill: "explain", difficulties: { 1: 2, 2: 2, 3: 1 }, why: "conceptos" },
          { skill: "drill", difficulties: { 1: 3, 2: 3, 3: 0 }, why: "cálculo" },
        ],
      },
    };
    const plan = planAssistantAction(root, action);
    expect(plan.warnings[0]).toContain("drill");
    applyAssistantAction(root, action);
    const text = read("Matemáticas/1 A/1.1 Números/1.1 Números.practica.md");
    expect(text).toContain('plan: "explain=2/2/1"');
    expect(text).toContain("skills: [explain]");
    expect(parseTopicManifest(text)!.plan).toEqual({ explain: [2, 2, 1] });
  });
});
