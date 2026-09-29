// Area C: `study_view_ensure` — the view file of a folder, created on demand.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { studyApi } from "./study.js";

const MANIFEST = `---
type: topic
subject: mathematics
title: "1.1 X"
skills: [solve, prove]
mastery:
  min_per_skill: 6
  target_difficulty: 3
  exam: required
---
`;

const posix = (p: string) => p.split(path.sep).join("/");

describe("study_view_ensure", () => {
  let tmp: string;
  let app: AppState;
  let api: ReturnType<typeof studyApi>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_view_"));
    const topic = path.join(tmp, "Matemáticas", "1 Aritmética", "1.1 X");
    fs.mkdirSync(topic, { recursive: true });
    fs.writeFileSync(path.join(topic, "_tema.md"), MANIFEST, "utf-8");
    fs.writeFileSync(path.join(topic, "1.1 X.md"), "---\ntype: concept\n---\n# X\n", "utf-8");
    fs.mkdirSync(path.join(tmp, "Suelta"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "Suelta", "nota.md"), "# nota\n", "utf-8");

    app = new AppState(tmp);
    api = studyApi(app);
  });

  it("creates and returns the practice view of a topic folder", () => {
    const res = api.study_view_ensure("Matemáticas/1 Aritmética/1.1 X");
    expect(res.kind).toBe("practica");
    expect(res.ok).toBe(true);
    expect(posix(res.path)).toBe("Matemáticas/1 Aritmética/1.1 X/1.1 X.practica.md");
    expect(res.created.map(posix).sort()).toEqual([
      "Matemáticas/1 Aritmética/1.1 X/1.1 X.practica.md",

    ]);
    expect(fs.existsSync(path.join(tmp, res.path))).toBe(true);

    // Idempotent: the second call finds them.
    const again = api.study_view_ensure("Matemáticas/1 Aritmética/1.1 X");
    expect((res.tagged ?? []).map(posix)).toEqual(["Matemáticas/1 Aritmética/1.1 X/1.1 X.md"]);
    expect(fs.readFileSync(path.join(tmp, "Matemáticas/1 Aritmética/1.1 X/1.1 X.md"), "utf-8")).toContain("type: teorica");
    expect(again.created).toEqual([]);
    expect(again.tagged).toEqual([]);
    expect(posix(again.path)).toBe("Matemáticas/1 Aritmética/1.1 X/1.1 X.practica.md");
  });

  it("gives the subject root only an overview, never practice or theory views", () => {
    const res = api.study_view_ensure("Matemáticas");

    expect(res.kind).toBe("resumen");
    expect(posix(res.path)).toBe("Matemáticas/Matemáticas.resumen.md");
    expect(fs.existsSync(path.join(tmp, "Matemáticas", "Matemáticas.practica.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "Matemáticas", "Matemáticas.teorica.md"))).toBe(false);
  });

  it("creates the overview of a grouping folder", () => {
    const res = api.study_view_ensure("Matemáticas/1 Aritmética");
    expect(res.kind).toBe("resumen");
    expect(res.ok).toBe(true);
    expect(posix(res.path)).toBe("Matemáticas/1 Aritmética/1 Aritmética.resumen.md");
    expect(fs.existsSync(path.join(tmp, res.path))).toBe(true);
  });

  it("creates the overview of the subject root", () => {
    const res = api.study_view_ensure("Matemáticas");
    expect(res.kind).toBe("resumen");
    expect(posix(res.path)).toBe("Matemáticas/Matemáticas.resumen.md");
  });

  it("refuses a plain folder: no view file is written just for clicking", () => {
    const res = api.study_view_ensure("Suelta");
    expect(res).toMatchObject({ ok: false, kind: "none", path: "" });
    expect(fs.existsSync(path.join(tmp, "Suelta", "Suelta.resumen.md"))).toBe(false);
  });

  it("accepts a file path and uses its folder", () => {
    const res = api.study_view_ensure("Matemáticas/1 Aritmética/1.1 X/1.1 X.md");
    expect(res.kind).toBe("practica");
    expect(posix(res.path)).toContain("1.1 X.practica.md");
  });
  it("opens an exercise folder as an exercises view, without touching the topic", () => {
    const dir = path.join(tmp, "Matemáticas", "1 Aritmética", "1.1 X", "Ejercicios", "solve");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ej1.md"), "---\ntype: exercise\n---\n# uno\n", "utf-8");
    const res = api.study_view_ensure("Matemáticas/1 Aritmética/1.1 X/Ejercicios/solve");
    expect(res.kind).toBe("ejercicios");
    expect(posix(res.path)).toBe("Matemáticas/1 Aritmética/1.1 X/Ejercicios/solve/solve.ejercicios.md");
    expect(fs.readFileSync(path.join(dir, "solve.ejercicios.md"), "utf-8")).toContain("type: ejercicios");
    // A second click reuses the file.
    expect(api.study_view_ensure("Matemáticas/1 Aritmética/1.1 X/Ejercicios/solve").created).toEqual([]);
  });
});
