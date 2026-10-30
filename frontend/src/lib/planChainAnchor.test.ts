// El plan se mide por tu progreso, no por el calendario: si el plan dice «6 oct» pero empiezas el «29 oct», tu mes 1 empieza el 29 y tiene sus semanas enteras.
import { describe, expect, it } from "vitest";
import { buildPlan } from "../core/mentor/plan";
import { planChain } from "./planChain";
import { buildSchedule, progressPlan } from "./planSchedule";

const seed = (area: string, areaId: string) => ({ area, areaId, objective: area, groups: [{ id: "core", title: area, kind: "knowledge" as const, order: 100 }], topics: Array.from({ length: 160 }, (_, i) => ({ folder: `Programación/${area}/${i + 1} Tema`, title: `${i + 1} Tema ${area}`, estMinutes: 60, group: "core" })) });

function plan() {
  const built = buildPlan([seed("Backend", "backend"), seed("Frontend", "frontend")], { id: "2026-10-06_2027-04-05", start: "2026-10-06", end: "2027-04-05", minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: "2026-10-06", name: "Plan" }).plan;
  return { ...built, structure: "areas" as const, areaMode: "together" as const };
}

describe("cadena de proyectos anclada al progreso", () => {
  it("empezando 3 semanas tarde, el mes 1 cuenta desde el primer día con trabajo y no queda aplastado en una semana", () => {
    const p: any = plan();
    const late = planChain(p, buildSchedule(progressPlan(p, { today: "2026-10-29" })));
    const onTime = planChain(p, buildSchedule(progressPlan(p, { today: "2026-10-07" })));
    expect(late.months[0]!.start).toBe("2026-10-29");
    expect(late.months[0]!.weeks.length).toBeGreaterThanOrEqual(4);
    // empezar a tiempo no cambia nada: el mes 1 sigue empezando el día del plan
    expect(onTime.months[0]!.start).toBe("2026-10-07");
    expect(late.months[0]!.weeks.length).toBeGreaterThanOrEqual(onTime.months[0]!.weeks.length - 1);
  });

  it("sin progreso aún, el calendario del plan no cuenta: el mes 1 nunca es una sola semana por haber pasado los días", () => {
    const p: any = plan();
    const c = planChain(p, buildSchedule(progressPlan(p, { today: "2026-11-15" })));
    expect(c.months[0]!.weeks.length).toBeGreaterThan(1);
  });
});
