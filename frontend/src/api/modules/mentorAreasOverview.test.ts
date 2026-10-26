// mentor_areas_overview: filas compactas por nivel (espacios, áreas, temas), sin plan alguno y sin escribir en la vault.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AppState } from "../appState.js";
import { mentorAreasOverviewApi } from "./mentorAreasOverview.js";
import { clearStudySnapshotCache, setWarmApp, warmStudyIndex } from "./study.js";

const manifest = (title: string) => `---\ntype: topic\nsubject: mathematics\ntitle: "${title}"\nskills: [solve]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 2\n---\n`;
const EXERCISE = `---\ntype: exercise\ntitle: "Sumar"\nskill: solve\ndifficulty: 2\n---\n#### Enunciado\nCalcula $1+1$.\n`;

describe("mentor_areas_overview", () => {
  let tmp: string;
  let api: ReturnType<typeof mentorAreasOverviewApi>;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_areas_"));
    const mk = (rel: string, title: string, exercise = false) => {
      const dir = path.join(tmp, ...rel.split("/"));
      fs.mkdirSync(path.join(dir, "Ejercicios"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".practica.md"), manifest(title), "utf-8");
      if (exercise) fs.writeFileSync(path.join(dir, "Ejercicios", "e1.md"), EXERCISE, "utf-8");
    };
    mk("Matemáticas/1 Aritmética/1.1 Números", "1.1 Números", true);
    mk("Matemáticas/1 Aritmética/1.2 Fracciones", "1.2 Fracciones");
    mk("Matemáticas/2 Álgebra/2.1 Ecuaciones", "2.1 Ecuaciones");
    mk("Inglés/1 Gramática/1.1 Presente", "1.1 Presente");
    clearStudySnapshotCache();
    const app = new AppState(tmp) as never;
    api = mentorAreasOverviewApi(app);
    setWarmApp(app);
    await warmStudyIndex();
  });

  it("espacios: una fila por espacio con áreas, temas y cuentas", async () => {
    const r = await api.mentor_areas_overview();
    expect(r.level).toBe("spaces");
    const rows = r.rows as unknown as Array<Record<string, unknown>>;
    expect(rows.map((x) => x.space)).toEqual(["Inglés", "Matemáticas"]);
    expect(rows[1]).toMatchObject({ areas: 2, topics: 3, completed: 0, started: 0, reviewsDue: 0, pct: 0 });
  });

  it("áreas de un espacio y temas de un área, con código y título", async () => {
    const a = await api.mentor_areas_overview({ level: "areas", space: "Matemáticas" });
    expect((a.rows as unknown as Array<Record<string, unknown>>).map((x) => [x.name, x.topics, x.state])).toEqual([["1 Aritmética", 2, "sin_tratar"], ["2 Álgebra", 1, "sin_tratar"]]);
    const area = (a.rows as unknown as Array<{ area: string }>)[0]!.area;
    expect(area).toBe("Matemáticas/1 Aritmética");
    const t = await api.mentor_areas_overview({ level: "topics", space: "Matemáticas", area });
    const rows = t.rows as unknown as Array<Record<string, unknown>>;
    expect(rows.map((x) => [x.code, x.title])).toEqual([["1.1", "Números"], ["1.2", "Fracciones"]]);
    expect(rows[0]).toMatchObject({ folder: "Matemáticas/1 Aritmética/1.1 Números", state: "sin_tratar", reviewDue: false });
    expect(Object.keys(rows[0]!).sort()).toEqual(["area", "code", "exercisesDone", "exercisesTotal", "folder", "lastActivity", "nextReview", "pct", "reviewDue", "space", "state", "title"]);
  });

  it("un espacio o un área inexistentes devuelven filas vacías", async () => {
    expect((await api.mentor_areas_overview({ level: "areas", space: "Nada" })).rows).toEqual([]);
    expect((await api.mentor_areas_overview({ level: "topics", space: "Nada", area: "x" })).rows).toEqual([]);
  });
});
