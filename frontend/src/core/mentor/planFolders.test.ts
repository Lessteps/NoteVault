import { describe, expect, it } from "vitest";
import { maxOverlap } from "../../lib/planAreas.js";
import type { CatalogTopic } from "./goalDraft.js";
import { buildPlan, type Plan, type SubplanSeed } from "./plan.js";
import { applyOps, type ChangeCtx } from "./planChange.js";
import { groupIdOf, slugOf, splitByChildFolder, topicsUnder, uniqueAreaId } from "./planFolders.js";
import { reorganizeByAreas } from "./planReorganize.js";

const START = "2026-10-06";
const END = "2027-04-05";

const cat = (folder: string, over: Partial<CatalogTopic> = {}): CatalogTopic => ({
  folder,
  title: folder.split("/").pop()!,
  subject: "Programación",
  skills: ["skill-1"],
  completenessPct: 0,
  estMinutes: 60,
  ...over,
});

function baseAreasPlan(): Plan {
  const pre = {
    start: START,
    end: END,
    minutesPerDay: 240,
    studyDays: [1, 2, 3, 4, 5, 6, 7],
    pace: "intenso" as const,
    goalIds: [],
    subjects: ["Programación"],
    levels: {},
    deliverables: "ask" as const,
    areaMode: "phased" as const,
  };
  const seeds: SubplanSeed[] = [
    { area: "Programación", objective: "Avanzar en Backend", topics: [{ folder: "Programación/4 Backend/T01", title: "Backend 1", estMinutes: 60 }] },
    { area: "Programación", objective: "Avanzar en Frontend", topics: [{ folder: "Programación/5 Frontend/T01", title: "Frontend 1", estMinutes: 60 }] },
  ];
  const legacy = buildPlan(seeds, {
    start: START,
    end: END,
    minutesPerDay: 240,
    studyDays: pre.studyDays,
    pace: "intenso",
    from: START,
    id: `${START}_${END}`,
    preconditions: pre,
  }).plan;
  return reorganizeByAreas(legacy, { today: START })!.plan;
}

describe("planFolders: funciones auxiliares puras", () => {
  it("slugOf normaliza y recorta caracteres no alfanuméricos", () => {
    expect(slugOf("HTML & CSS Avanzado")).toBe("html-css-avanzado");
    expect(slugOf("---Hola---")).toBe("hola");
    expect(slugOf("", 10)).toBe("x");
  });

  it("uniqueAreaId genera prefijo x- y desambigua colisiones", () => {
    expect(uniqueAreaId("Programación/HTML", [])).toBe("x-html");
    expect(uniqueAreaId("Programación/HTML", ["x-html"])).toBe("x-html-2");
    expect(uniqueAreaId("Programación/HTML", ["x-html", "x-html-2"])).toBe("x-html-3");
  });

  it("groupIdOf evita colisiones con grupos reservados", () => {
    expect(groupIdOf("core")).toBe("core-tema");
    expect(groupIdOf("bases")).toBe("bases-tema");
    expect(groupIdOf("lang-python")).toBe("lang-python-tema");
    expect(groupIdOf("Mi Modulo")).toBe("mi-modulo");
  });

  it("topicsUnder devuelve temas bajo una carpeta ordenados de forma natural y excluyendo los completados al 100%", () => {
    const all = [
      cat("Programación/Algoritmos/Tema 10"),
      cat("Programación/Algoritmos/Tema 2"),
      cat("Programación/Algoritmos/Tema 1", { completenessPct: 100 }),
      cat("Programación/Otras/Tema X"),
    ];
    const under = topicsUnder(all, "Programación/Algoritmos");
    expect(under.map((t) => t.folder)).toEqual([
      "Programación/Algoritmos/Tema 2",
      "Programación/Algoritmos/Tema 10",
    ]);
  });

  it("splitByChildFolder divide en subcarpetas directas como grupos y temas sueltos como grupo core", () => {
    const topics = [
      { folder: "Programación/DevOps/Docker/01 Intro" },
      { folder: "Programación/DevOps/Docker/02 Compose" },
      { folder: "Programación/DevOps/Kubernetes/01 Pods" },
      { folder: "Programación/DevOps/00 Generalidades" },
    ];
    const split = splitByChildFolder("Programación/DevOps", topics, "DevOps");
    expect(split.groups).toHaveLength(3);
    expect(split.groups[0]!.id).toBe("core");
    expect(split.groups[0]!.title).toBe("Conocimientos de DevOps");
    expect(split.groups[1]!.title).toBe("Docker");
    expect(split.groups[2]!.title).toBe("Kubernetes");

    const loose = split.topics.find((t) => t.folder.endsWith("00 Generalidades"));
    expect(loose?.group).toBe("core");
    const docker = split.topics.filter((t) => t.folder.includes("/Docker/"));
    expect(docker.every((t) => t.group === "docker")).toBe(true);
  });
});

describe("applyOps: add_folder_area y add_folder_subject", () => {
  it("add_folder_area crea un área propia con sus grupos y respeta el límite de paralelismo de fases (≤ 2)", () => {
    const p = baseAreasPlan();
    const vaultTopics = [
      cat("Programación/DevOps/Docker/T01"),
      cat("Programación/DevOps/Kubernetes/T01"),
      cat("Programación/DevOps/README"),
    ];
    const ctx: ChangeCtx = { today: START, all: vaultTopics };

    const res = applyOps(p, [{ op: "add_folder_area", folder: "Programación/DevOps", name: "DevOps" }], ctx);
    expect(res.applied).toBe(1);
    expect(res.warnings).toHaveLength(0);

    const devops = res.plan.subplans.find((s) => s.areaId === "x-devops");
    expect(devops).toBeDefined();
    expect(devops!.area).toBe("DevOps");
    expect(devops!.groups?.map((g) => g.title)).toEqual(["Conocimientos de DevOps", "Docker", "Kubernetes"]);
    expect(devops!.topics).toHaveLength(3);

    // Fases recalculadas con un máximo de 2 áreas solapadas
    const phases = Object.fromEntries(res.plan.subplans.map((s) => [s.id, s.phase!]));
    expect(maxOverlap(phases)).toBeLessThanOrEqual(2);
  });

  it("add_folder_subject añade temas de una carpeta como sub-asignatura en un área existente", () => {
    const p = baseAreasPlan();
    const fe = p.subplans.find((s) => s.areaId === "frontend")!;
    const vaultTopics = [
      cat("Programación/5 Frontend/HTML/T01"),
      cat("Programación/5 Frontend/HTML/T02"),
    ];
    const ctx: ChangeCtx = { today: START, all: vaultTopics };

    const res = applyOps(p, [{ op: "add_folder_subject", subplan: fe.id, folder: "Programación/5 Frontend/HTML", title: "HTML" }], ctx);
    expect(res.applied).toBe(1);

    const feAfter = res.plan.subplans.find((s) => s.id === fe.id)!;
    expect(feAfter.groups?.some((g) => g.id === "html" && g.title === "HTML")).toBe(true);
    expect(feAfter.topics.filter((t) => t.group === "html")).toHaveLength(2);
  });

  it("no añade temas que ya están en el plan y emite warning si no hay pendientes", () => {
    const p = baseAreasPlan();
    const ctx: ChangeCtx = {
      today: START,
      all: [cat("Programación/4 Backend/T01")], // Ya está en p
    };

    const res = applyOps(p, [{ op: "add_folder_area", folder: "Programación/4 Backend" }], ctx);
    expect(res.applied).toBe(0);
    expect(res.warnings).toEqual(["No hay temas pendientes en «Backend» para añadir."]);
  });
});
