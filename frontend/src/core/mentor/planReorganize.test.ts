// «Reorganizar por áreas»: convierte un plan de estructura antigua (un subplan por rama de carpeta) a áreas elementales con grupos y fases,
// conservando lo completado, lo fijado, los estados y los comentarios, sin tocar el original y solo cuando se pide.

import { describe, expect, it } from "vitest";
import { maxOverlap } from "../../lib/planAreas.js";
import { buildPlan, sanitizePlan, type Plan, type SubplanSeed } from "./plan.js";
import { canReorganize, reorganizeByAreas } from "./planReorganize.js";
import { buildSchedule } from "../../lib/planSchedule.js";

const START = "2026-10-06";
const END = "2027-04-05";
const t = (branch: string, n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60, ...extra }));
const legacySeed = (branch: string, n: number, objective: string, extra: Partial<SubplanSeed> = {}): SubplanSeed => ({ area: "Programación", objective, topics: t(branch, n), ...extra });

/** El plan real del usuario, en pequeño: 10 subplanes «Programación: …», uno por rama, con una nota interna, preguntas por subplan y nombre «+9». */
function legacyPlan(): Plan {
  const seeds: SubplanSeed[] = [
    legacySeed("1 Fundamentals", 12, "Reforzar bases de programación necesarias para backend, DB, frontend y automatización", { notes: "Bases fundamentales en orden lógico." }),
    legacySeed("2.1 Python", 6, "Consolidar Python como soporte para automatización y backend"),
    legacySeed("2.2 JavaScript", 5, "Afianzar JavaScript como base para frontend", { notes: "Temas en el orden natural de la materia (sin la selección de la IA)." }),
    legacySeed("2.3 TypeScript", 4, "Tipar y escalar código frontend/backend con TypeScript"),
    legacySeed("4 Backend", 8, "Avanzar en diseño e implementación de servicios backend", { notes: "Progresión básica a avanzada: fundamentos, diseño API, persistencia.", deliverable: { title: "Proyecto de demostración: Programación", description: "d", criteria: ["a"], status: "en_curso", projectId: "p1" } }),
    legacySeed("5 Frontend", 6, "Construir interfaces y lógica de frontend"),
    legacySeed("6 Databases", 5, "Dominar modelado, consultas y gestión de bases de datos"),
    legacySeed("7 Automation", 4, "Automatizar tareas y flujos de trabajo con scripts"),
    legacySeed("9 Tooling and Quality", 4, "Mejorar calidad de código y uso de herramientas de desarrollo"),
    legacySeed("programming_practice", 1, "Avanzar en programming_practice"),
  ];
  const built = buildPlan(seeds, { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, id: `${START}_${END}`, name: "Reforzar bases de programación necesaria +9 · 6 oct–5 abr", rationale: "Se prioriza lo que pidió el estudiante.", preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask", areaMode: "phased", notes: "Rotativo no incluirdesktop" } });
  const plan = sanitizePlan({ ...built.plan, proposed: true, openQuestions: built.plan.subplans.filter((s) => !s.deliverable).map((s) => ({ id: "deliverables", subplanId: s.id, text: `¿Quieres un entregable para ${s.objective.slice(0, 20)}…?`, options: ["Sí", "No", "Después"] })) }, `${START}_${END}`)!;
  // estado vivo: dos temas completados y uno fijado a mano
  plan.subplans[0]!.topics[0]!.completedAt = "2026-10-08";
  plan.subplans[4]!.topics[1]!.completedAt = "2026-10-09";
  plan.subplans[5]!.topics[2]!.pinned = true;
  plan.subplans[5]!.topics[2]!.targetWeek = 9;
  return plan;
}

describe("Reorganizar por áreas", () => {
  const ctx = { today: START };

  it("solo se ofrece en planes de estructura antigua", () => {
    const old = legacyPlan();
    expect(old.structure).toBeUndefined();
    expect(canReorganize(old)).toBe(true);
    const r = reorganizeByAreas(old, ctx)!;
    expect(r.plan.structure).toBe("areas");
    expect(canReorganize(r.plan)).toBe(false);
    expect(reorganizeByAreas(r.plan, ctx)).toBeNull();
  });

  it("agrupa los 10 subplanes por rama en áreas (Backend, Databases, Frontend, Automation, Tooling) con sus grupos; programming_practice sale", () => {
    const r = reorganizeByAreas(legacyPlan(), ctx)!;
    expect(r.plan.subplans.map((s) => s.area)).toEqual(["Backend", "Databases", "Frontend", "Automation", "Tooling and Quality"]);
    const be = r.plan.subplans[0]!;
    expect(be.groups!.map((g) => g.title)).toEqual(["Bases", "Lenguaje: Python", "Conocimientos de backend"]);
    expect(be.topics).toHaveLength(12 + 6 + 8);
    expect(r.plan.subplans[2]!.groups!.map((g) => g.title)).toEqual(["Lenguaje: JavaScript", "Lenguaje: TypeScript", "Conocimientos de frontend"]);
    expect(r.plan.subplans.every((s) => s.objective.length > 0 && s.objective.length < 70 && !s.objective.endsWith("…"))).toBe(true);
    expect(r.dropped).toEqual(["Programación/programming_practice/T01"]);
    expect(r.plan.subplans.flatMap((s) => s.topics).some((x) => /programming_practice/.test(x.folder))).toBe(false);
    expect(r.summary).toContain("Backend, Databases, Frontend, Automation, Tooling and Quality");
  });

  it("conserva lo completado (con su fecha), lo fijado, el estado y el proyecto de los entregables, y la práctica", () => {
    const old = legacyPlan();
    const r = reorganizeByAreas(old, ctx)!;
    const all = r.plan.subplans.flatMap((s) => s.topics);
    expect(all.filter((x) => x.completedAt).map((x) => [x.folder, x.completedAt])).toEqual(expect.arrayContaining([["Programación/1 Fundamentals/T01", "2026-10-08"], ["Programación/4 Backend/T02", "2026-10-09"]]));
    expect(all.filter((x) => x.completedAt)).toHaveLength(2);
    const pinned = all.find((x) => x.pinned)!;
    expect(pinned).toMatchObject({ folder: "Programación/5 Frontend/T03", targetWeek: 9 });
    // el entregable genérico «Proyecto de demostración: Programación» pasa a ser el de su área, con su estado y proyecto
    const d = r.plan.subplans[0]!.deliverable!;
    expect(d).toMatchObject({ status: "en_curso", projectId: "p1", title: "API REST con persistencia y pruebas" });
    expect(r.plan.subplans.slice(1).every((s) => !s.deliverable)).toBe(true);
    // todos los temas siguen en el plan (menos programming_practice) y la pista no se toca
    expect(all).toHaveLength(old.subplans.flatMap((s) => s.topics).length - 1);
    expect(r.plan.programmingPractice).toEqual(old.programmingPractice);
    expect(r.plan.preconditions!.notes).toBe(old.preconditions!.notes); // lo que escribió el usuario no se toca
  });

  it("los comentarios se conservan sin el aviso interno: «completado con reglas» pasa a ser un campo estructurado", () => {
    const r = reorganizeByAreas(legacyPlan(), ctx)!;
    const fe = r.plan.subplans[2]!;
    expect(fe.notes ?? "").not.toContain("selección de la IA");
    expect(fe.fallback).toMatchObject({ kind: "rules" });
    expect(fe.fallback!.reason.length).toBeGreaterThan(5);
    expect(r.plan.subplans[0]!.fallback).toBeUndefined();
    expect(r.plan.subplans[0]!.notes).toContain("Bases fundamentales en orden lógico");
    expect(r.plan.subplans[0]!.notes).toContain("Progresión básica a avanzada"); // la nota de Backend se une a la del área
    expect(r.plan.rationale).toBe("Se prioriza lo que pidió el estudiante.");
  });

  it("una sola pregunta global de entregables en vez de una por subplan", () => {
    const old = legacyPlan();
    expect(old.openQuestions!.length).toBeGreaterThan(5);
    const r = reorganizeByAreas(old, ctx)!;
    expect(r.plan.openQuestions).toHaveLength(1);
    expect(r.plan.openQuestions![0]).toMatchObject({ id: "deliverables", text: expect.stringContaining("por cada área") });
    expect(r.plan.openQuestions![0]!.subplanId).toBeUndefined();
  });

  it("el nombre autogenerado antiguo («… +9 · 6 oct–5 abr») se regenera desde las áreas; uno editado a mano se respeta", () => {
    expect(reorganizeByAreas(legacyPlan(), ctx)!.plan.name).toBe("Full stack web · 6 oct–5 abr");
    expect(reorganizeByAreas({ ...legacyPlan(), name: "Mi plan de entrevistas" }, ctx)!.plan.name).toBe("Mi plan de entrevistas");
  });

  it("las áreas se secuencian por fases (no todas las 26 semanas; máximo 2 en paralelo) y todos los temas caen dentro de la ventana de su área", () => {
    const r = reorganizeByAreas(legacyPlan(), ctx)!;
    const phases = Object.fromEntries(r.plan.subplans.map((s) => [s.id, s.phase!]));
    expect(maxOverlap(phases)).toBeLessThanOrEqual(2);
    expect(r.plan.subplans.some((s) => s.phase!.fromWeek > 1)).toBe(true);
    // Backend ‖ Databases → Frontend → Automation ‖ Tooling
    const ph = (id: string) => r.plan.subplans.find((s) => s.areaId === id)!.phase!;
    expect(ph("backend")).toEqual(ph("databases"));
    expect(ph("frontend").fromWeek).toBe(ph("backend").toWeek + 1);
    expect(ph("automation")).toEqual(ph("tooling"));
    expect(ph("automation").fromWeek).toBe(ph("frontend").toWeek + 1);
    for (const s of r.plan.subplans) {
      for (const tp of s.topics.filter((x) => !x.completedAt && !x.pinned)) {
        expect(tp.targetWeek, `${s.area} ${tp.folder}`).toBeGreaterThanOrEqual(s.phase!.fromWeek);
        expect(tp.targetWeek).toBeLessThanOrEqual(s.phase!.toWeek);
      }
    }
    // dentro de un área los grupos van en orden: Bases → Lenguaje → Conocimientos
    const groups = r.plan.subplans[0]!.topics.map((x) => x.group);
    expect(groups.indexOf("bases")).toBeLessThan(groups.indexOf("lang-python"));
    expect(groups.indexOf("lang-python")).toBeLessThan(groups.indexOf("core"));
  });

  it("no altera el original (es una función pura): el plan antiguo sigue igual y solo se escribe si el llamador lo guarda", () => {
    const old = legacyPlan();
    const snapshot = JSON.stringify(old);
    reorganizeByAreas(old, ctx);
    expect(JSON.stringify(old)).toBe(snapshot);
  });

  it("el resultado se puede leer (sanitizePlan) y repartir por días sin romperse", () => {
    const r = reorganizeByAreas(legacyPlan(), ctx)!;
    const again = sanitizePlan(JSON.parse(JSON.stringify(r.plan)), r.plan.id)!;
    expect(again.structure).toBe("areas");
    expect(again.subplans.map((s) => s.areaId)).toEqual(["backend", "databases", "frontend", "automation", "tooling"]);
    expect(again.subplans[0]!.groups).toHaveLength(3);
    const s = buildSchedule(again);
    expect(s.days.reduce((n, d) => n + d.topics.length, 0)).toBeGreaterThan(40);
  });
});
