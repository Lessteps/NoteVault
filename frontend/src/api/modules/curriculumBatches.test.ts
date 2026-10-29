// «Crear TODAS las tareas por lotes»: reparto puro y escritura de una tarea por lote contra el catálogo real.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { curriculumAreas } from "../../core/curriculum/catalog.js";
import { computeAreaCoverage } from "../../core/curriculum/coverage.js";
import { planBatches } from "../../lib/curriculum.js";
import { AppState } from "../appState.js";
import { curriculumHandoffApi, MAX_ENTRIES_PER_TASK } from "./curriculumHandoff.js";

describe("planBatches", () => {
  const css = curriculumAreas().find((a) => a.id === "css")!;
  const rows = computeAreaCoverage(css, []).rows;

  it("cada lote respeta el tamaño y no se pierde ni se repite ningún tema", () => {
    const batches = planBatches(rows, 25);
    expect(batches.every((b) => b.length > 0 && b.length <= 25)).toBe(true);
    const flat = batches.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(rows.length);
  });

  it("el grupo y sus piezas viajan juntos cuando caben en un lote", () => {
    const batches = planBatches(rows, 25);
    const at = (id: string) => batches.findIndex((b) => b.includes(id));
    const flex = rows.filter((r) => r.entry.parentId === "css.flex-container").map((r) => r.entry.id);
    expect(flex.length).toBeGreaterThan(2);
    expect(new Set([at("css.flex-container"), ...flex.map(at)]).size).toBe(1);
  });

  it("solo lo esencial deja fuera lo recomendado y lo opcional", () => {
    const ess = planBatches(rows, 25, "esencial").flat();
    const byId = new Map(rows.map((r) => [r.entry.id, r.entry.importance]));
    expect(ess.length).toBeGreaterThan(50);
    expect(ess.every((id) => byId.get(id) === "esencial")).toBe(true);
  });

  it("lo ya cubierto no entra", () => {
    const covered = computeAreaCoverage(css, [{ folder: "Programación/5 Frontend/CSS/5.19.1 Basic selectors - type, class, id and universal", title: "Basic selectors - type, class, id and universal", curriculumId: "css.basic-selectors" }]).rows;
    expect(planBatches(covered, 25).flat()).not.toContain("css.basic-selectors");
  });
});

describe("study_curriculum_handoff_batches", () => {
  let dir: string;
  let app: AppState;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_batches_"));
    fs.mkdirSync(path.join(dir, "Programación"), { recursive: true });
    app = new AppState(dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("escribe una tarea por lote, ninguna pasa del máximo y las carpetas de piezas cuelgan de su grupo", async () => {
    const api = curriculumHandoffApi(app, { now: () => new Date("2026-10-29T10:00:00Z") });
    const list = await api.study_curriculum_handoff_batches({ areaId: "css", importance: "esencial", confirm: true });
    expect(list.length).toBeGreaterThan(5);
    for (const h of list) {
      expect(h.entries.length).toBeLessThanOrEqual(MAX_ENTRIES_PER_TASK);
      expect(fs.existsSync(path.join(dir, h.taskPath))).toBe(true);
    }
    const folders = list.flatMap((h) => h.entries.map((e) => e.folder));
    expect(new Set(folders).size).toBe(folders.length);
    expect(folders.some((f) => /\/5\.19\.\d+\.\d+ flex-wrap$/.test(f))).toBe(true);
  });

  it("pide confirmación y avisa cuando no falta nada", async () => {
    const api = curriculumHandoffApi(app);
    await expect(api.study_curriculum_handoff_batches({ areaId: "css" })).rejects.toThrow(/confirmación/);
    await expect(api.study_curriculum_handoff_batches({ areaId: "nada", confirm: true })).rejects.toThrow(/no está en el currículo/);
  });
});
