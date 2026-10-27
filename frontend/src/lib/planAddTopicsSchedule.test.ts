// El reparto por avance, la Agenda y la Ejecución con un área que ahora tiene muchos más temas (los de «Añadir al plan»): nada se pierde, la ruta manda
// y el aviso de constancia dice el ritmo necesario.

import { describe, expect, it } from "vitest";
import { buildPlan, type Plan } from "../core/mentor/plan.js";
import { addTopicsToPlan, CURRICULUM_PLAN_TARGET, type AddTopicItem } from "../core/mentor/planAddTopics.js";
import { areaSets } from "./planAreaLists.js";
import { catchUpOf } from "./planCatchUp.js";
import { buildSchedule, progressPlan } from "./planSchedule.js";
import { areaRouteTopics, topicsByWeekArea } from "./planTopicsByArea.js";

const START = "2026-10-06";
const END = "2026-12-20";
const TODAY = "2026-10-26";
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

describe("el reparto por avance con un área mucho más grande", () => {
  const MANY = 60;
  const big = (): Plan => addTopicsToPlan(basePlan(), Array.from({ length: MANY }, (_, i) => item("12 CSS", i + 1, { estMinutes: 90 }))).plan;
  const sched = (p: Plan) => buildSchedule(progressPlan(p, { today: TODAY }));

  it("la Agenda y la Ejecución comparten la ruta: todo tema añadido está en la ruta del área y en el reparto (nada se descarta)", () => {
    const plan = big();
    const fe = plan.subplans.find((s) => s.areaId === "frontend")!;
    const route = areaRouteTopics(plan, fe.id);
    expect(route).toHaveLength(4 + MANY);
    const s = sched(plan);
    const placed = new Set(s.days.flatMap((d) => d.topics.filter((t) => t.subplanId === fe.id).map((t) => t.folder)));
    for (const t of route) expect(placed.has(t.folder), t.folder).toBe(true);
    const by = topicsByWeekArea(plan, s);
    expect(by.totals[fe.id]!.topics).toBe(4 + MANY);
    expect(by.unscheduled[fe.id] ?? []).toEqual([]);
  });

  it("el orden de la ruta se respeta: los nuevos nunca se colocan antes de uno anterior sin terminar", () => {
    const plan = big();
    const fe = plan.subplans.find((s) => s.areaId === "frontend")!;
    const first = new Map<string, string>();
    for (const d of sched(plan).days) for (const t of d.topics) if (t.subplanId === fe.id && !first.has(t.folder)) first.set(t.folder, d.date);
    const order = areaRouteTopics(plan, fe.id).map((t) => first.get(t.folder)!);
    for (let i = 1; i < order.length; i++) expect(order[i]! >= order[i - 1]!, `${i}`).toBe(true);
  });

  it("lo que no cabe antes del fin se amontona (overflow) y el aviso de constancia dice el ritmo necesario", () => {
    const plan = big();
    const s = sched(plan);
    const fe = plan.subplans.find((x) => x.areaId === "frontend")!;
    const overflow = s.days.flatMap((d) => d.topics.filter((t) => t.subplanId === fe.id && t.overflow));
    expect(overflow.length).toBeGreaterThan(0);
    const days = s.days.map((d) => ({ date: d.date, study: d.study, topics: d.topics.map((t) => ({ folder: t.folder, title: t.title, minutes: t.minutes, done: t.done, area: t.area })) }));
    const c = catchUpOf(days, TODAY, END);
    expect(c.remaining).toBeGreaterThanOrEqual(4 + MANY);
    expect(c.perDay).toBeGreaterThan(1);
    expect(c.minutesPerDay).toBeGreaterThan(60);
  });

  it("completar los primeros temas hace entrar los siguientes de la ruta (hoy = lo primero que falta)", () => {
    const plan = big();
    const fe = plan.subplans.find((s) => s.areaId === "frontend")!;
    const done = fe.topics.slice(0, 4).map((t) => t.folder);
    const s = buildSchedule(progressPlan(plan, { today: TODAY, isDone: (f) => done.includes(f) }));
    // lo hecho se queda hecho y lo primero pendiente de la ruta es el primer tema añadido
    const pending = s.days.flatMap((d) => d.topics.filter((t) => t.subplanId === fe.id && !t.done).map((t) => t.folder));
    expect(pending[0]).toBe(fe.topics[4]!.folder);
    expect(areaSets(s.days, fe.id, TODAY, 1)).toBeTruthy();
  });
});
