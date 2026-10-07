// Inferencia de ramas en el SERVIDOR (cuando las precondiciones no las traen: API directa, builds antiguos, chat) y plan automático por rama.

import { describe, expect, it } from "vitest";
import { sanitizePreconditions } from "../../lib/planTime.js";
import type { CatalogTopic } from "./goalDraft.js";
import { autoSeeds, inferBranches, resolveBranches, resolveScope } from "./planSpec.js";

const TODAY = "2026-10-06";
const t = (branch: string, n: number): CatalogTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(3, "0")}`, title: `T${i + 1}`, subject: "Programación", skills: [], completenessPct: 0, estMinutes: 60 }));
const ALL = [...t("1 Fundamentals", 75), ...t("2.1 Python", 10), ...t("3 Desktop Apps (Electron)", 18), ...t("4 Backend", 20), ...t("5 Frontend", 20), ...t("6 Databases", 12), ...t("7 Automation", 14), ...t("8 Mobile", 13), ...t("9 Tooling and Quality", 5)];
const pre = (over: Record<string, unknown> = {}) => sanitizePreconditions({ start: TODAY, end: "2027-04-04", minutesPerDay: 420, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", subjects: ["Programación"], levels: { Programación: "basico" }, deliverables: "ask", ...over }, TODAY);
const excluded = (p: ReturnType<typeof pre>) => resolveBranches(p, ALL, [], "").branchExcluded ?? [];

describe("inferBranches en el servidor", () => {
  it("«full stack» en el objetivo libre aplica el preset: excluye Desktop, Mobile y Automation, y lo deja anotado", () => {
    const r = resolveBranches(pre({ freeObjective: "Full stack web: backend, frontend y bases de datos" }), ALL, []);
    expect(r.branchPreset).toBe("fullstack");
    expect(r.branchExcluded).toEqual(["3 Desktop Apps (Electron)", "7 Automation", "8 Mobile"]);
    expect(r.branches!.Programación).toEqual(["1 Fundamentals", "2.1 Python", "4 Backend", "5 Frontend", "6 Databases", "9 Tooling and Quality"]);
  });

  it("lo detecta también en el nombre de las metas y en los comentarios, con variantes (fullstack, full-stack)", () => {
    expect(resolveBranches(pre(), ALL, ["Ser Full Stack developer"]).branchPreset).toBe("fullstack");
    expect(resolveBranches(pre({ notes: "me interesa el fullstack" }), ALL, []).branchPreset).toBe("fullstack");
    expect(resolveBranches(pre(), ALL, [], "pásalo a full-stack").branchPreset).toBe("fullstack");
  });

  it("metas Backend + Frontend sin mencionar full stack acotan las ramas (Desktop y Mobile fuera)", () => {
    const r = resolveBranches(pre(), ALL, ["Desarrollo Backend", "Desarrollo Frontend"]);
    expect(r.branchPreset).toBe("fullstack");
    expect(r.branchExcluded).toContain("8 Mobile");
    expect(r.branchExcluded).toContain("3 Desktop Apps (Electron)");
  });

  it("una meta solo Backend acota a Fundamentals + lenguajes + Backend + Databases + Tooling; solo Frontend, a Fundamentals + lenguajes + Frontend + Tooling", () => {
    const be = resolveBranches(pre(), ALL, ["Desarrollo Backend"]);
    expect(be.branchPreset).toBe("backend");
    expect(be.branches!.Programación).toEqual(["1 Fundamentals", "2.1 Python", "4 Backend", "6 Databases", "9 Tooling and Quality"]);
    const fe = resolveBranches(pre(), ALL, ["Desarrollo Frontend"]);
    expect(fe.branchPreset).toBe("frontend");
    expect(fe.branches!.Programación).toEqual(["1 Fundamentals", "2.1 Python", "5 Frontend", "9 Tooling and Quality"]);
  });

  it("mencionar móvil o escritorio de forma explícita las INCLUYE (el estudiante manda)", () => {
    const r = resolveBranches(pre({ freeObjective: "full stack con apps móviles" }), ALL, []);
    expect(r.branches!.Programación).toContain("8 Mobile");
    expect(r.branchExcluded).toEqual(["3 Desktop Apps (Electron)", "7 Automation"]);
    expect(resolveBranches(pre({ notes: "full stack y también Electron para escritorio" }), ALL, []).branches!.Programación).toContain("3 Desktop Apps (Electron)");
  });

  it("nunca pisa una elección explícita (ramas o preset, incluido «Todo») ni inventa nada sin mención", () => {
    const explicit = pre({ freeObjective: "full stack", branches: { Programación: ["4 Backend", "8 Mobile"] }, branchPreset: "backend" });
    expect(inferBranches(explicit, ALL, [])).toBe(explicit);
    const todo = pre({ freeObjective: "full stack", branchPreset: "all" });
    expect(todo.branchPreset).toBe("all");
    expect(inferBranches(todo, ALL, [])).toBe(todo);
    expect(excluded(pre({ freeObjective: "aprender de todo" }))).toEqual([]);
    expect(resolveBranches(pre({ subjects: ["Matemáticas"], freeObjective: "full stack" }), ALL, []).branches).toBeUndefined(); // otra materia sin ramas
  });
});

describe("plan automático POR ÁREAS: respeta las exclusiones y agrupa las ramas en áreas elementales", () => {
  const seedsFor = (p: ReturnType<typeof pre>) => autoSeeds(p, resolveScope(p, ALL, []));

  it("un subplan por ÁREA (no uno por rama ni un único «Avanzar en Programación (243)») y nada de las ramas excluidas", () => {
    const p = resolveBranches(pre({ freeObjective: "full stack" }), ALL, []);
    const seeds = seedsFor(p);
    expect(seeds.map((s) => s.area)).toEqual(["Backend", "Databases", "Frontend", "Tooling and Quality"]);
    expect(seeds.map((s) => s.areaId)).toEqual(["backend", "databases", "frontend", "tooling"]);
    expect(seeds.map((s) => s.objective)).toEqual(["Construir servicios y APIs sólidos y seguros", "Modelar, consultar y operar bases de datos", "Crear interfaces web accesibles y mantenibles", "Trabajar con Git, pruebas y calidad de código"]);
    expect(seeds.flatMap((s) => s.topics).some((x) => /Mobile|Desktop|Automation/.test(x.folder))).toBe(false);
    // Backend lleva Bases (Fundamentals) + Lenguaje (Python) + Conocimientos (4 Backend), en ese orden
    const backend = seeds[0]!;
    expect(backend.groups!.map((g) => g.title)).toEqual(["Bases", "Lenguaje: Python", "Conocimientos de backend"]);
    expect(backend.topics.map((t) => t.group).filter((g, i, l) => l.indexOf(g) === i)).toEqual(["bases", "lang-python", "core"]);
    // programming_practice (si existiera) no es un área
    expect(seeds.some((s) => /practice/i.test(s.area))).toBe(false);
  });

  it("Fundamentals (grupo «Bases») se limita a los realmente previos según el nivel declarado (básico 15; empezando o sin nivel, todos)", () => {
    const bases = (p: ReturnType<typeof pre>) => seedsFor(resolveBranches(p, ALL, [], "full stack")).find((s) => s.areaId === "backend")!.topics.filter((t) => t.group === "bases").length;
    expect(bases(pre({ levels: { Programación: "basico" } }))).toBe(15);
    expect(bases(pre({ levels: { Programación: "intermedio" } }))).toBe(8);
    expect(bases(pre({ levels: { Programación: "avanzado" } }))).toBe(4);
    expect(bases(pre({ levels: { Programación: "empezando" } }))).toBe(75);
    expect(bases(pre({ levels: {} }))).toBe(75);
  });

  it("una materia con una sola rama sigue siendo un solo subplan (su área)", () => {
    const only = ALL.filter((x) => x.folder.includes("4 Backend"));
    const p = pre();
    const seeds = autoSeeds(p, resolveScope(p, only, []));
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.area).toBe("Backend");
    expect(seeds[0]!.objective).toBe("Construir servicios y APIs sólidos y seguros");
  });
});
