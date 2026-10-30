// Las fases se abren por PROGRESO, no por calendario: la fase posterior (Automation) no espera a su semana si ya no queda nada pendiente de las fases anteriores.
// El inicio y el fin de la ruta no cambian.
import { describe, expect, it } from "vitest";
import { buildPlan } from "../core/mentor/plan";
import { buildSchedule, progressPlan } from "./planSchedule";

const seed = (area: string, areaId: string, n: number) => ({ area, areaId, objective: area, groups: [{ id: "core", title: area, kind: "knowledge" as const, order: 100 }], topics: Array.from({ length: n }, (_, i) => ({ folder: `Programación/${area}/${i + 1} Tema`, title: `${i + 1} Tema ${area}`, estMinutes: 60, group: "core" })) });

function plan(backendTopics: number) {
  const built: any = buildPlan([seed("Backend", "backend", backendTopics), seed("Automation", "automation", 6)], { id: "2026-10-05_2027-01-03", start: "2026-10-05", end: "2027-01-03", minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: "2026-10-05", name: "Plan" }).plan;
  built.structure = "areas";
  built.areaMode = "together";
  built.subplans = built.subplans.map((s: any) => ({ ...s, phase: s.areaId === "automation" ? { fromWeek: 9, toWeek: 12 } : { fromWeek: 1, toWeek: 8 } }));
  return built;
}
const firstAutomationWeek = (p: any): number | undefined => {
  const sch = buildSchedule(progressPlan(p, { today: "2026-10-06" }));
  return sch.days.find((d) => d.topics.some((t) => t.area === "Automation"))?.week;
};

describe("fases abiertas por progreso", () => {
  it("si lo anterior se termina pronto, Automation empieza antes de su semana de calendario (9)", () => {
    const w = firstAutomationWeek(plan(4));
    expect(w).toBeDefined();
    expect(w!).toBeLessThan(9);
  });

  it("si lo anterior sigue pendiente, Automation espera a su fase", () => {
    const w = firstAutomationWeek(plan(400));
    expect(w === undefined || w >= 9).toBe(true);
  });
});
