// Carpetas de proyectos con una vault temporal: la estructura por ruta y área, la plantilla de cada proyecto y que NUNCA se sobrescribe nada.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { mentorProjectsApi } from "./mentorProjects.js";

let dir: string;
let id = "";
const read = (rel: string) => fs.readFileSync(path.join(dir, ...rel.split("/")), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(dir, ...rel.split("/")));
const list = (rel: string) => fs.readdirSync(path.join(dir, ...rel.split("/"))).sort();
const api = () => mentorProjectsApi(new AppState(dir));
const BASE = "Programación/Mentor/Ruta Full Stack Junior";

const daily = {
  kind: "daily", title: "Feature del día", description: "Una feature pequeña.", minutes: 60, date: "2026-10-19", topics: ["4.1 Uno"],
  sections: [{ areaId: "backend", what: "Un endpoint", how: ["Define la ruta", "Escribe una prueba"], result: "Un curl devuelve 2xx" }],
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_proj_"));
  const start = "2026-10-06";
  const end = addDays(start, 100);
  const seeds = ["Backend", "Databases", "Frontend"].map((area, i) => ({ area, objective: area, topics: [{ folder: `Programación/${i + 1} ${area}/${i + 1}.1 Uno`, title: `${i + 1}.1 Uno`, estMinutes: 60, targetWeek: 1 }] }));
  const built = buildPlan(seeds, { id: `${start}_${end}`, start, end, minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", from: start, preconditions: { start, end, minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no" } as never, name: "Full Stack Junior" }).plan;
  new PlanStore(dir).save({ ...built, structure: "areas", subplans: built.subplans.map((s, i) => ({ ...s, areaId: ["backend", "databases", "frontend"][i]!, area: ["Backend", "Databases", "Frontend"][i]! })) });
  id = built.id;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("estructura de la ruta", () => {
  it("sin proyecto crea una carpeta por área con sus tres tipos de proyecto y los README; no escribe nada más", () => {
    const r = api().mentor_projects_scaffold({ id });
    expect(r.route).toBe(BASE);
    expect(list(BASE)).toEqual(["1. Backend", "2. Frontend", "3. Databases", "README.md"]);
    expect(list(`${BASE}/1. Backend`)).toEqual(["1.1 Proyectos diarios", "1.2 Proyectos semanales", "1.3 Proyectos mensuales", "README.md"]);
    expect(list(`${BASE}/2. Frontend`)).toEqual(["2.1 Proyectos diarios", "2.2 Proyectos semanales", "2.3 Proyectos mensuales", "README.md"]);
    expect(r.skeleton).toHaveLength(9);
    expect(r.projects).toEqual([]);
    expect(read(`${BASE}/README.md`)).toContain("**1. Backend**");
    expect(list(`${BASE}/1. Backend/1.1 Proyectos diarios`)).toEqual([]);
  });

  it("repetirlo no cambia nada y no pisa un README que la persona editó", () => {
    api().mentor_projects_scaffold({ id });
    fs.writeFileSync(path.join(dir, ...`${BASE}/README.md`.split("/")), "MI README", "utf-8");
    const again = api().mentor_projects_scaffold({ id });
    expect(again.skeleton).toEqual([]);
    expect(again.created).toEqual([]);
    expect(read(`${BASE}/README.md`)).toBe("MI README");
  });
});

describe("carpeta de un proyecto", () => {
  it("el diario crea su carpeta DENTRO del área y del tipo, con la plantilla de archivos", () => {
    const r = api().mentor_projects_scaffold({ id, areaKeys: ["backend"], project: daily });
    const p = r.projects[0]!;
    expect(p.dir).toBe(`${BASE}/1. Backend/1.1 Proyectos diarios/2026-10-19 Feature del día`);
    expect(list(p.dir)).toEqual(["01 Especificación.md", "02 Plan de trabajo.md", "03 Bitácora.md", "04 Entrega.md", "Código", "README.md"]);
    expect(list(`${p.dir}/Código`)).toEqual(["LEEME.md"]);
    const md = read(p.readme);
    expect(md).toContain("area: \"Backend\"");
    expect(md).toContain("- Un endpoint");
    expect(md).toContain("2. Escribe una prueba");
    expect(md).toContain("- [[4.1 Uno]]");
    expect(p.existed).toEqual([]);
    expect(p.created).toHaveLength(6);
    // las demás áreas no reciben nada
    expect(list(`${BASE}/3. Databases/3.1 Proyectos diarios`)).toEqual([]);
  });

  it("volver a crearlo NO sobrescribe lo que la persona ya escribió y solo repone lo que falta", () => {
    const first = api().mentor_projects_scaffold({ id, areaKeys: ["backend"], project: daily }).projects[0]!;
    fs.writeFileSync(path.join(dir, ...`${first.dir}/03 Bitácora.md`.split("/")), "MI BITÁCORA", "utf-8");
    fs.rmSync(path.join(dir, ...`${first.dir}/04 Entrega.md`.split("/")));
    const again = api().mentor_projects_scaffold({ id, areaKeys: ["backend"], project: daily }).projects[0]!;
    expect(read(`${first.dir}/03 Bitácora.md`)).toBe("MI BITÁCORA");
    expect(again.created).toEqual([`${first.dir}/04 Entrega.md`]);
    expect(again.existed).toHaveLength(5);
  });

  it("un proyecto de varias áreas deja en CADA área su carpeta con SOLO la parte de esa área", () => {
    const weekly = {
      kind: "weekly", title: "Vertical completa", description: "Todo junto.", week: 2, topics: [],
      sections: [
        { areaId: "backend", what: "El endpoint de reservas", how: ["Ruta y validación"], result: "curl 2xx" },
        { areaId: "databases", what: "La tabla de reservas", how: ["Migración"], result: "Consulta con EXPLAIN" },
        { areaId: "frontend", what: "La pantalla de reservas", how: ["Componente"], result: "Se ve en el navegador" },
      ],
    };
    const r = api().mentor_projects_scaffold({ id, areaKeys: ["backend", "databases", "frontend"], project: weekly });
    expect(r.projects.map((p) => p.dir)).toEqual([
      `${BASE}/1. Backend/1.2 Proyectos semanales/Semana 02 - Vertical completa`,
      `${BASE}/3. Databases/3.2 Proyectos semanales/Semana 02 - Vertical completa`,
      `${BASE}/2. Frontend/2.2 Proyectos semanales/Semana 02 - Vertical completa`,
    ]);
    expect(read(r.projects[0]!.readme)).toContain("El endpoint de reservas");
    expect(read(r.projects[0]!.readme)).not.toContain("La tabla de reservas");
    expect(read(r.projects[1]!.readme)).toContain("La tabla de reservas");
    expect(exists(`${r.projects[2]!.dir}/05 Defensa y postmortem.md`)).toBe(true);
  });

  it("rechaza un proyecto inválido o un área que ya no está en el plan, y un plan inexistente", () => {
    expect(() => api().mentor_projects_scaffold({ id, areaKeys: ["backend"], project: { ...daily, title: "" } })).toThrow(/no es válido/);
    expect(() => api().mentor_projects_scaffold({ id, areaKeys: ["mobile"], project: daily })).toThrow(/ya no está en el plan/);
    expect(() => api().mentor_projects_scaffold({ id: "../x" })).toThrow(/Plan inválido/);
    expect(() => api().mentor_projects_scaffold({ id: "2020-01-01_2020-02-01" })).toThrow(/ya no existe/);
  });

  it("el nombre del plan decide la carpeta de la ruta y no deja escapar de la vault", () => {
    const ps = new PlanStore(dir);
    ps.save({ ...ps.load(id)!, name: "../../Evil: <ruta>" });
    const r = api().mentor_projects_scaffold({ id });
    expect(r.route.startsWith("Programación/Mentor/Ruta ")).toBe(true);
    expect(r.route.split("/")).not.toContain("..");
    expect(exists(`${r.route}/README.md`)).toBe(true);
  });
});

describe("listado de proyectos", () => {
  it("sin carpeta de ruta dice que no existe y no crea nada", () => {
    const r = api().mentor_projects_list({ id });
    expect(r.exists).toBe(false);
    expect(r.areas.map((a) => a.area)).toEqual(["Backend", "Frontend", "Databases"]);
    expect(exists(BASE)).toBe(false);
  });

  it("lista los proyectos por área y tipo con su avance según las casillas marcadas", () => {
    const p = api().mentor_projects_scaffold({ id, areaKeys: ["backend"], project: daily }).projects[0]!;
    const before = api().mentor_projects_list({ id });
    const proj = before.areas[0]!.kinds[0]!.projects[0]!;
    expect(before.exists).toBe(true);
    expect(proj).toMatchObject({ name: "2026-10-19 Feature del día", dir: p.dir, status: "new", done: 0 });
    expect(proj.total).toBeGreaterThan(0);
    expect(proj.files[0]).toBe("01 Especificación.md");
    // marcar una casilla pone el proyecto «en curso»
    const spec = path.join(dir, ...`${p.dir}/02 Plan de trabajo.md`.split("/"));
    fs.writeFileSync(spec, fs.readFileSync(spec, "utf-8").replace("- [ ]", "- [x]"), "utf-8");
    const after = api().mentor_projects_list({ id }).areas[0]!.kinds[0]!.projects[0]!;
    expect(after.done).toBe(1);
    expect(after.status).toBe("doing");
    // otras áreas y tipos siguen vacíos
    expect(api().mentor_projects_list({ id }).areas[1]!.kinds.every((k) => k.projects.length === 0)).toBe(true);
  });
});
