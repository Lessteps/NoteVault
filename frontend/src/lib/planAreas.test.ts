// Áreas ELEMENTALES del plan: tabla rama → área + grupo, secuencia por fases (máx. 2 en paralelo), nombre del plan, saneado de textos.

import { describe, expect, it } from "vitest";
import {
  areasPlanName,
  areasTitle,
  bucketByArea,
  isAutoPlanName,
  isPracticeBranch,
  maxOverlap,
  PARALLEL_GROUP,
  placeBranches,
  planAreaPhases,
  sanitizeGroups,
  sanitizePhase,
  sanitizePlanDeliverables,
  sanitizePurposes,
  sortByGroupOrder,
  splitNotes,
  tidyNotes,
} from "./planAreas";

const BRANCHES = ["1 Fundamentals", "2.1 Python", "2.2 JavaScript", "2.3 TypeScript", "3 Desktop Apps (Electron)", "4 Backend", "5 Frontend", "6 Databases", "7 Automation", "8 Mobile", "9 Tooling and Quality", "programming_practice"];
const view = (names: string[]) => Object.fromEntries([...placeBranches(names)].map(([k, v]) => [k, v ? `${v.areaId}/${v.group.id}` : null]));

describe("tabla rama de carpeta → área elemental + grupo interno", () => {
  it("las ramas del vault real: Fundamentals → Bases del primer área; Python → Backend; JS/TS → Frontend; el resto, a su área; programming_practice fuera", () => {
    expect(view(BRANCHES)).toEqual({
      "1 Fundamentals": "backend/bases",
      "2.1 Python": "backend/lang-python",
      "2.2 JavaScript": "frontend/lang-javascript",
      "2.3 TypeScript": "frontend/lang-typescript",
      "3 Desktop Apps (Electron)": "desktop/core",
      "4 Backend": "backend/core",
      "5 Frontend": "frontend/core",
      "6 Databases": "databases/core",
      "7 Automation": "automation/core",
      "8 Mobile": "mobile/core",
      "9 Tooling and Quality": "tooling/core",
      programming_practice: null,
    });
    expect(isPracticeBranch("programming_practice")).toBe(true);
    expect(isPracticeBranch("4 Backend")).toBe(false);
  });

  it("Python va a Automation si Backend no está en el alcance y sí Automation; si no hay ninguno, a Backend", () => {
    expect(view(["2.1 Python", "7 Automation"])["2.1 Python"]).toBe("automation/lang-python");
    expect(view(["2.1 Python", "5 Frontend"])["2.1 Python"]).toBe("frontend/lang-python"); // sin Backend ni Automation: el primer área del alcance
    expect(view(["2.1 Python"])["2.1 Python"]).toBe("backend/lang-python");
    expect(view(["2.1 Python", "4 Backend", "7 Automation"])["2.1 Python"]).toBe("backend/lang-python");
  });

  it("JavaScript y TypeScript van a Frontend; sin Frontend, a Backend", () => {
    expect(view(["2.2 JavaScript", "2.3 TypeScript", "4 Backend"])).toMatchObject({ "2.2 JavaScript": "backend/lang-javascript", "2.3 TypeScript": "backend/lang-typescript" });
    expect(view(["2.2 JavaScript", "5 Frontend", "4 Backend"])["2.2 JavaScript"]).toBe("frontend/lang-javascript");
  });

  it("Fundamentals es el grupo «Bases» del PRIMER área en el orden del plan (Backend, Databases, Frontend…)", () => {
    expect(view(["1 Fundamentals", "5 Frontend", "6 Databases"])["1 Fundamentals"]).toBe("databases/bases"); // Backend no está: el primero es Databases
    expect(view(["1 Fundamentals", "5 Frontend"])["1 Fundamentals"]).toBe("frontend/bases");
    expect(view(["1 Fundamentals", "4 Backend", "5 Frontend"])["1 Fundamentals"]).toBe("backend/bases");
  });

  it("Desktop y Mobile solo existen si sus ramas están en el alcance", () => {
    const names = ["1 Fundamentals", "4 Backend", "5 Frontend"];
    expect(Object.values(view(names)).join()).not.toMatch(/desktop|mobile/);
  });

  it("los grupos llevan título legible: Bases · Lenguaje: Python · Conocimientos de backend", () => {
    const p = placeBranches(["1 Fundamentals", "2.1 Python", "4 Backend"]);
    expect(["1 Fundamentals", "2.1 Python", "4 Backend"].map((b) => p.get(b)!.group.title)).toEqual(["Bases", "Lenguaje: Python", "Conocimientos de backend"]);
    expect(p.get("4 Backend")!.areaName).toBe("Backend");
  });

  it("bucketByArea reparte los temas: las materias que no son de programación forman su propia área; programming_practice no es un área", () => {
    const t = (f: string) => ({ folder: f });
    const out = bucketByArea([
      t("Programación/1 Fundamentals/a"), t("Programación/4 Backend/b"), t("Programación/programming_practice/kata"), t("Programación/2.1 Python/p"),
      t("Inglés/Listening/l1"), t("Inglés/Reading/r1"),
    ]);
    expect(out.map((b) => b.name)).toEqual(["Backend", "Inglés"]);
    const be = out[0]!;
    expect(be.groups.map((g) => g.id)).toEqual(["bases", "lang-python", "core"]);
    expect(be.topics.map((x) => `${x.group}:${x.folder.split("/").pop()}`)).toEqual(["bases:a", "lang-python:p", "core:b"]);
    expect(out[1]!.groups.map((g) => g.title)).toEqual(["Listening", "Reading"]);
    expect(out.flatMap((b) => b.topics).some((x) => /programming_practice/.test(x.folder))).toBe(false);
  });

  it("sortByGroupOrder deja a la IA ordenar DENTRO de cada grupo pero mantiene el orden de los grupos", () => {
    const groups = sanitizeGroups([{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "core", title: "Conocimientos", kind: "knowledge", order: 100 }]);
    const out = sortByGroupOrder([{ n: 1, group: "core" }, { n: 2, group: "bases" }, { n: 3, group: "core" }, { n: 4, group: "bases" }], groups);
    expect(out.map((x) => x.n)).toEqual([2, 4, 1, 3]);
  });
});

describe("secuencia por fases (máximo 2 áreas en paralelo)", () => {
  const caps = (n: number, c = 100) => Array.from({ length: n }, () => c);

  it("no todas las áreas ocupan las 26 semanas: rangos distintos, con Bases/Backend y Databases primero", () => {
    const ph = planAreaPhases([{ key: "backend", weight: 80 }, { key: "databases", weight: 20 }, { key: "frontend", weight: 40 }, { key: "automation", weight: 14 }, { key: "tooling", weight: 15 }], caps(26));
    expect(Object.values(ph).every((p) => !(p.fromWeek === 1 && p.toWeek === 26))).toBe(true);
    expect(ph.backend!.fromWeek).toBe(1);
    expect(ph.databases!.fromWeek).toBe(1);
    expect(ph.frontend!.fromWeek).toBeGreaterThan(1);
    expect(ph.tooling!.fromWeek).toBeGreaterThan(ph.frontend!.fromWeek - 1);
    expect(Math.max(...Object.values(ph).map((p) => p.toWeek))).toBeLessThanOrEqual(26);
    expect(maxOverlap(ph)).toBeLessThanOrEqual(2);
  });

  it("fases por defecto: Backend ‖ Databases → Frontend → Automation ‖ Tooling (cada fase con su rango de semanas, 2 en paralelo como máximo)", () => {
    const ids = ["backend", "databases", "frontend", "automation", "tooling"];
    const ph = planAreaPhases(ids.map((k, i) => ({ key: k, weight: [115, 17, 50, 14, 15][i]!, group: PARALLEL_GROUP[k] })), caps(26));
    expect(ph.backend).toEqual(ph.databases);
    expect(ph.automation).toEqual(ph.tooling);
    expect(ph.backend!.fromWeek).toBe(1);
    expect(ph.frontend!.fromWeek).toBe(ph.backend!.toWeek + 1);
    expect(ph.automation!.fromWeek).toBe(ph.frontend!.toWeek + 1);
    expect(ph.tooling!.toWeek).toBe(26);
    // ninguna fase queda reducida a una semana suelta ni ocupa el plan entero
    expect(ph.tooling!.toWeek - ph.tooling!.fromWeek).toBeGreaterThanOrEqual(2);
    expect(maxOverlap(ph)).toBe(2);
    // la IA puede reordenar: «Databases antes que Backend» sigue emparejándolos; Frontend primero va sola
    const re = planAreaPhases(["frontend", "databases", "backend", "automation", "tooling"].map((k) => ({ key: k, weight: 20, group: PARALLEL_GROUP[k] })), caps(26));
    expect(re.frontend!.fromWeek).toBe(1);
    expect(re.databases).toEqual(re.backend);
    expect(re.databases!.fromWeek).toBe(re.frontend!.toWeek + 1);
  });

  it("con muchas áreas nunca hay más de 2 en una misma semana", () => {
    for (const n of [3, 5, 7]) {
      const ph = planAreaPhases(Array.from({ length: n }, (_, i) => ({ key: `a${i}`, weight: 10 + i * 7 })), caps(30));
      expect(maxOverlap(ph), `n=${n}`).toBeLessThanOrEqual(2);
      expect(Object.keys(ph)).toHaveLength(n);
    }
  });

  it("es determinista y respeta el orden de la lista (el que propone la IA) y los pesos", () => {
    const a = planAreaPhases([{ key: "x", weight: 10 }, { key: "y", weight: 10 }, { key: "z", weight: 10 }], caps(12));
    expect(planAreaPhases([{ key: "x", weight: 10 }, { key: "y", weight: 10 }, { key: "z", weight: 10 }], caps(12))).toEqual(a);
    expect(a.z!.fromWeek).toBeGreaterThanOrEqual(a.x!.toWeek); // el tercero espera a que quede un hueco
    // un área mucho más pesada dura más
    const b = planAreaPhases([{ key: "grande", weight: 90 }, { key: "pequena", weight: 10 }, { key: "otra", weight: 10 }], caps(20));
    expect(b.grande!.toWeek - b.grande!.fromWeek).toBeGreaterThan(b.otra!.toWeek - b.otra!.fromWeek);
  });

  it("una sola área ocupa todo el periodo; sin capacidad no revienta", () => {
    expect(planAreaPhases([{ key: "a", weight: 5 }], caps(8))).toEqual({ a: { fromWeek: 1, toWeek: 8 } });
    expect(Object.keys(planAreaPhases([{ key: "a", weight: 5 }, { key: "b", weight: 5 }], caps(4, 0)))).toEqual(["a", "b"]);
  });

  it("sanitizePhase valida lo que llegue de fuera", () => {
    expect(sanitizePhase({ fromWeek: 3, toWeek: 99 }, 26)).toEqual({ fromWeek: 3, toWeek: 26 });
    expect(sanitizePhase({ fromWeek: 0, toWeek: 5 }, 26)).toBeUndefined();
    expect(sanitizePhase({ fromWeek: 9, toWeek: 2 }, 26)).toEqual({ fromWeek: 9, toWeek: 9 });
    expect(sanitizePhase("x", 26)).toBeUndefined();
  });
});

describe("nombre del plan a partir de las áreas", () => {
  const a = (...ids: string[]) => ids.map((id) => ({ areaId: id, area: { backend: "Backend", frontend: "Frontend", databases: "Databases", automation: "Automation" }[id] ?? id }));

  it("«Full stack web · 6 oct–5 abr»: sin sufijos «+9» ni el periodo repetido", () => {
    const name = areasPlanName(a("backend", "databases", "frontend", "automation"), "2026-10-06", "2027-04-05");
    expect(name).toBe("Full stack web · 6 oct–5 abr");
    expect(name).not.toMatch(/\+\d/);
    expect(name.match(/oct/g)).toHaveLength(1);
  });

  it("un área da su nombre; varias sin full stack, hasta tres con « + »", () => {
    expect(areasTitle(a("backend"))).toBe("Backend");
    expect(areasTitle(a("backend", "databases"))).toBe("Backend + Databases");
    expect(areasTitle(a("databases", "automation", "backend", "frontend").slice(0, 2))).toBe("Databases + Automation");
  });

  it("solo se regeneran los nombres autogenerados antiguos («… +9 · 6 oct–5 abr»), no los editados a mano", () => {
    expect(isAutoPlanName("Reforzar bases de programación necesaria +9 · 6 oct–5 abr")).toBe(true);
    expect(isAutoPlanName("Backend · 6 oct–5 nov")).toBe(false);
    expect(isAutoPlanName("Mi plan para entrevistas")).toBe(false);
    expect(isAutoPlanName(undefined)).toBe(true);
  });
});

describe("textos saneados", () => {
  it("tidyNotes normaliza espacios y separa las palabras pegadas («incluirdesktop»)", () => {
    expect(tidyNotes("Rotativo   pero centrado en backend  no incluirdesktop y mobile")).toBe("Rotativo pero centrado en backend no incluir desktop y mobile");
    expect(tidyNotes("  hola \n\n\n mundo ")).toBe("Hola\n\nmundo");
    expect(tidyNotes("")).toBe("");
  });

  it("splitNotes separa el aviso interno «sin la selección de la IA» de la nota real", () => {
    expect(splitNotes("Temas en el orden natural de la materia (sin la selección de la IA).")).toEqual({ note: "", rulesFallback: true });
    expect(splitNotes("Progresión lógica. Temas en el orden natural de la materia (sin la selección de la IA).")).toEqual({ note: "Progresión lógica.", rulesFallback: true });
    expect(splitNotes("Solo una nota.")).toEqual({ note: "Solo una nota.", rulesFallback: false });
    expect(splitNotes(undefined)).toEqual({ note: "", rulesFallback: false });
  });

  it("los entregables y propósitos guardados se leen con tolerancia: lo inválido se descarta", () => {
    expect(sanitizePlanDeliverables([{ id: "kata:2026-10-06", kind: "kata", title: "K", dueDate: "2026-10-06", status: "hecho", criteria: ["c"], source: "practice" }, { id: "x", kind: "inventado", dueDate: "2026-10-06" }, { id: "y", kind: "kata", dueDate: "mal" }])).toHaveLength(1);
    expect(sanitizePlanDeliverables([{ id: "a", kind: "kata", dueDate: "2026-10-06", status: "raro" }])[0]!.status).toBe("pendiente");
    expect(sanitizePurposes({ day: { "2026-10-06": "Hoy toca…", malo: "x" }, week: { "3": "Semana 3", x: "y" }, month: { "2026-10": "Octubre" } })).toEqual({ day: { "2026-10-06": "Hoy toca…" }, week: { "3": "Semana 3" }, month: { "2026-10": "Octubre" } });
    expect(sanitizePurposes({})).toBeUndefined();
  });
});
