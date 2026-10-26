// study_curriculum_coverage: cobertura del currículo de referencia sobre una vault temporal (solo lectura).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { clearVaultScanCache } from "../vaultScan.js";
import { curriculumCoverageApi, curriculumGapsPrompt } from "./curriculumCoverage.js";

const manifest = (title: string, extra = "") =>
  `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 2\n${extra}---\n`;

describe("study_curriculum_coverage", () => {
  let tmp: string;
  let app: AppState;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_curr_"));
    const mk = (rel: string, title: string, extra = "") => {
      const dir = path.join(tmp, ...rel.split("/"));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, ".practica.md"), manifest(title, extra), "utf-8");
    };
    mk("Programación/5 Frontend/5.2 CSS", "5.2 CSS");
    mk("Programación/5 Frontend/5.1 The browser as a runtime and semantic HTML", "5.1 The browser as a runtime and semantic HTML");
    mk("Programación/12 CSS/12.4 Whatever name", "Whatever name", 'curriculum_id: css.flex-container\n');
    mk("Matemáticas/1 Aritmética/1.1 Números", "1.1 Números");
    clearVaultScanCache();
    app = new AppState(tmp) as never;
  });

  afterEach(() => {
    clearVaultScanCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("devuelve las cuatro áreas con cubierto exacto por curriculum_id y parciales por el repaso 5.2 CSS", () => {
    const cov = curriculumCoverageApi(app).study_curriculum_coverage();
    expect(cov.areas.map((a) => a.areaId)).toEqual(["html", "css", "js-reference", "java"]);
    const css = cov.areas.find((a) => a.areaId === "css")!;
    expect(css.rows.find((r) => r.entry.id === "css.flex-container")).toMatchObject({ status: "cubierto" });
    expect(css.rows.find((r) => r.entry.id === "css.grid-container")).toMatchObject({ status: "parcial" });
    expect(css.level).toBe("critico");
    // 12.4 ya está usado: las propuestas lo saltan
    expect(css.rows.some((r) => r.suggestedFolder.includes("/12.4 "))).toBe(false);
    expect(cov.areas.find((a) => a.areaId === "java")).toMatchObject({ covered: 0, level: "critico" });
  });

  it("filtra por espacio y reutiliza el resultado mientras el escaneo es el mismo", () => {
    const api = curriculumCoverageApi(app);
    expect(api.study_curriculum_coverage({ space: "Matemáticas" }).areas).toEqual([]);
    expect(api.study_curriculum_coverage({ space: "Programación" }).areas).toHaveLength(4);
    expect(api.study_curriculum_coverage()).toBe(api.study_curriculum_coverage());
  });

  it("el texto de huecos para el temario menciona las áreas de referencia y no escribe en la vault", () => {
    const before = fs.readdirSync(path.join(tmp, "Programación")).sort();
    const text = curriculumGapsPrompt(app, 5, "Programación");
    expect(text).toContain("«14 Java»");
    expect(text).toContain("«12 CSS»");
    expect(curriculumGapsPrompt(app, 5, "Matemáticas")).toBe("");
    expect(fs.readdirSync(path.join(tmp, "Programación")).sort()).toEqual(before);
  });
});
