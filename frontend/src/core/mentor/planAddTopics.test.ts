// «Añadir al plan»: mapa de áreas, orden (al final y en orden del catálogo), idempotencia, creación del área que falta y supervivencia al guardar.
// (el reparto por avance con un área grande está en lib/planAddTopicsSchedule.test.ts).

import { describe, expect, it } from "vitest";
import { buildPlan, sanitizePlan, type Plan } from "./plan.js";
import { addTopicsToPlan, byTopicNumber, CURRICULUM_PLAN_TARGET, curriculumAreaOfFolder, findAreaSubplan, type AddTopicItem } from "./planAddTopics.js";

const START = "2026-10-06";
const END = "2026-12-20";
const CORE = [{ id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 }];
const mk = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ folder: `Programación/${prefix}/${i + 1}.${i + 1} T${i + 1}`, title: `T${i + 1}`, estMinutes: 60, group: "core" }));

function basePlan(over: { frontend?: boolean; frontendName?: string } = {}): Plan {
  const seeds = [
    { area: "Backend", areaId: "backend", objective: "b", groups: CORE, topics: mk("4 Backend", 6) },
    ...(over.frontend === false ? [] : [{ area: over.frontendName ?? "Frontend", areaId: "frontend", objective: "f", groups: CORE, topics: mk("5 Frontend", 4) }]),
  ];
  const plan = buildPlan(seeds, { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 180, studyDays: [1, 2, 3, 4, 5], pace: "intenso", from: START }).plan;
  return { ...plan, structure: "areas", areaMode: "together" };
}
const item = (area: string, n: number, over: Partial<AddTopicItem> = {}): AddTopicItem => ({
  folder: `Programación/${area}/${area.split(" ")[0]}.${n} Tema ${n}`,
  title: `Tema ${n}`,
  estMinutes: 60,
  target: CURRICULUM_PLAN_TARGET[area.endsWith("HTML") ? "html" : area.endsWith("CSS") ? "css" : area.endsWith("Java") ? "java" : "js-reference"]!,
  ...over,
});

describe("mapa de áreas", () => {
  it("html · css · js-reference -> Frontend; java -> Java", () => {
    expect(CURRICULUM_PLAN_TARGET.html!.areaId).toBe("frontend");
    expect(CURRICULUM_PLAN_TARGET.css).toBe(CURRICULUM_PLAN_TARGET.html);
    expect(CURRICULUM_PLAN_TARGET["js-reference"]!.name).toBe("Frontend");
    expect(CURRICULUM_PLAN_TARGET.java).toMatchObject({ areaId: "java", name: "Java" });
  });
  it("la carpeta decide el área del currículo", () => {
    const areas = [{ id: "css", space: "Programación", areaFolder: "12 CSS" }, { id: "java", space: "Programación", areaFolder: "14 Java" }];
    expect(curriculumAreaOfFolder("Programación/12 CSS/12.1 X", areas)).toBe("css");
    expect(curriculumAreaOfFolder("Programación/14 Java/14.2 Y", areas)).toBe("java");
    expect(curriculumAreaOfFolder("Programación/5 Frontend/5.1 Z", areas)).toBeUndefined();
  });
  it("encuentra el área del plan por areaId o por nombre", () => {
    expect(findAreaSubplan(basePlan(), CURRICULUM_PLAN_TARGET.css!)?.areaId).toBe("frontend");
    const named = { subplans: [{ id: "x", area: "Java", topics: [], weeks: [], requiredGoals: [], objective: "" }] } as never;
    expect(findAreaSubplan(named, CURRICULUM_PLAN_TARGET.java!)?.id).toBe("x");
  });
  it("orden del catálogo: 12.2 antes que 12.10", () => {
    expect(["a/12.10 x", "a/12.2 y"].sort(byTopicNumber)).toEqual(["a/12.2 y", "a/12.10 x"]);
  });
});

describe("addTopicsToPlan", () => {
  it("añade AL FINAL de la ruta de Frontend sin tocar los temas que ya hay", () => {
    const plan = basePlan();
    const fe0 = plan.subplans.find((s) => s.areaId === "frontend")!;
    const r = addTopicsToPlan(plan, [item("12 CSS", 10), item("12 CSS", 2), item("11 HTML", 1)]);
    const fe = r.plan.subplans.find((s) => s.areaId === "frontend")!;
    expect(fe.topics.slice(0, fe0.topics.length)).toEqual(fe0.topics);
    // por número de carpeta: 11.1, 12.2, 12.10
    expect(fe.topics.slice(fe0.topics.length).map((t) => t.title)).toEqual(["Tema 1", "Tema 2", "Tema 10"]);
    expect(fe.topics.slice(fe0.topics.length).every((t) => t.addedFrom === "curriculum" && t.group === "core" && !t.route)).toBe(true);
    // las demás áreas no cambian
    expect(r.plan.subplans.find((s) => s.areaId === "backend")).toEqual(plan.subplans.find((s) => s.areaId === "backend"));
    // la semana objetivo informativa queda después del último tema
    const last = Math.max(...fe0.topics.map((t) => t.targetWeek));
    expect(fe.topics.slice(fe0.topics.length).every((t) => t.targetWeek >= last)).toBe(true);
    expect(r.created).toEqual([]);
    expect(r.added).toHaveLength(3);
  });

  it("es idempotente: repetir no duplica ni cambia nada", () => {
    const plan = basePlan();
    const once = addTopicsToPlan(plan, [item("12 CSS", 1), item("12 CSS", 2)]);
    const twice = addTopicsToPlan(once.plan, [item("12 CSS", 1), item("12 CSS", 2), item("12 CSS", 3)]);
    expect(twice.added.map((a) => a.folder)).toEqual(["Programación/12 CSS/12.3 Tema 3"]);
    expect(twice.skipped.map((s) => s.reason)).toEqual(["ya está en el plan", "ya está en el plan"]);
    const again = addTopicsToPlan(twice.plan, [item("12 CSS", 3)]);
    expect(again.plan).toBe(twice.plan);
    expect(again.added).toEqual([]);
    const all = again.plan.subplans.flatMap((s) => s.topics.map((t) => t.folder));
    expect(new Set(all).size).toBe(all.length);
  });

  it("crea Frontend si el plan no lo tiene (con su grupo y sin tocar lo demás)", () => {
    const plan = basePlan({ frontend: false });
    const r = addTopicsToPlan(plan, [item("11 HTML", 1)]);
    expect(r.created).toEqual([{ id: "frontend", area: "Frontend" }]);
    const fe = r.plan.subplans.at(-1)!;
    expect(fe).toMatchObject({ area: "Frontend", areaId: "frontend" });
    expect(fe.groups?.[0]).toMatchObject({ id: "core", kind: "knowledge" });
    expect(r.plan.subplans[0]).toEqual(plan.subplans[0]);
  });

  it("crea el área Java y la reutiliza después", () => {
    const plan = basePlan();
    const r = addTopicsToPlan(plan, [item("14 Java", 1), item("14 Java", 2)]);
    expect(r.created).toEqual([{ id: "java", area: "Java" }]);
    const java = r.plan.subplans.find((s) => s.areaId === "java")!;
    expect(java.topics.map((t) => t.title)).toEqual(["Tema 1", "Tema 2"]);
    const more = addTopicsToPlan(r.plan, [item("14 Java", 3)]);
    expect(more.created).toEqual([]);
    expect(more.plan.subplans.find((s) => s.areaId === "java")!.topics).toHaveLength(3);
    expect(more.plan.subplans.filter((s) => s.areaId === "java")).toHaveLength(1);
  });

  it("un área elegida a mano (subplanId) manda sobre el mapa", () => {
    const plan = basePlan();
    const r = addTopicsToPlan(plan, [{ ...item("14 Java", 1), subplanId: plan.subplans.find((s) => s.areaId === "backend")!.id, target: undefined }]);
    expect(r.plan.subplans.find((s) => s.areaId === "backend")!.topics.at(-1)!.title).toBe("Tema 1");
    const bad = addTopicsToPlan(plan, [{ ...item("14 Java", 1), subplanId: "nope" }]);
    expect(bad.added).toEqual([]);
    expect(bad.skipped[0]!.reason).toMatch(/ya no existe/);
  });

  it("sobrevive a guardar y leer el plan (addedFrom y grupos)", () => {
    const r = addTopicsToPlan(basePlan(), [item("12 CSS", 1)]);
    const back = sanitizePlan(JSON.parse(JSON.stringify(r.plan)))!;
    const t = back.subplans.find((s) => s.areaId === "frontend")!.topics.at(-1)!;
    expect(t).toMatchObject({ title: "Tema 1", addedFrom: "curriculum", group: "core" });
  });
});
