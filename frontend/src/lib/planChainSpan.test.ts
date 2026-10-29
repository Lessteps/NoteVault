// La cadena diario → semanal → mensual sobre TODO el plan (6 oct 2026 – 5 abr 2027): un entregable por mes, cada semana en un solo mes,
// cada pieza en una sola semana, y un avance que solo se mueve con lo que el estudiante completa.

import { describe, expect, it } from "vitest";
import { chainIndex, pieceDone, planChain, planMonthWindows } from "./planChain.js";
import { buildSchedule, deliverablesOf, countDeliverables } from "./planSchedule.js";

const topics = (area: string, n: number) => Array.from({ length: n }, (_, i) => ({ folder: `${area}/${i + 1}`, title: `${area} tema ${i + 1}`, estMinutes: 60, targetWeek: 1 + Math.floor((i * 26) / n) }));
const plan = {
  id: "p-span",
  start: "2026-10-06",
  end: "2027-04-05",
  structure: "areas",
  areaMode: "together",
  subplans: [
    { id: "s-be", area: "Backend", areaId: "backend", topics: topics("Backend", 260), phase: { fromWeek: 1, toWeek: 26 }, weeks: [] },
    { id: "s-fe", area: "Frontend", areaId: "frontend", topics: topics("Frontend", 160), phase: { fromWeek: 1, toWeek: 26 }, weeks: [] },
  ],
  preconditions: { start: "2026-10-06", end: "2027-04-05", studyDays: [1, 2, 3, 4, 5], minutesPerDay: 180 },
} as any;

const sch = buildSchedule(plan);

describe("cadena de entregables sobre el plan completo", () => {
  it("hay UN entregable por mes del plan (6 ventanas del 6 al 5) y cada semana pertenece a un solo mes", () => {
    const w = planMonthWindows(plan);
    expect(w).toHaveLength(6);
    expect(w[0]).toEqual({ start: "2026-10-06", end: "2026-11-05" });
    expect(w[5]).toEqual({ start: "2027-03-06", end: "2027-04-05" });
    const chain = planChain(plan, sch);
    expect(chain.months).toHaveLength(6);
    expect(chain.months.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6]);
    const weekNumbers = chain.months.flatMap((m) => m.weeks.map((x) => x.week));
    expect(new Set(weekNumbers).size).toBe(weekNumbers.length);
    expect(weekNumbers).toEqual([...weekNumbers].sort((a, b) => a - b));
    expect(weekNumbers).toHaveLength(26);
    for (const m of chain.months) {
      expect(m.title).toMatch(/^Mes \d+ · /);
      expect(m.title).not.toContain("por definir");
      expect(m.goal.length).toBeGreaterThan(20);
      expect(m.criteria.length).toBeGreaterThanOrEqual(3);
      expect(m.id).toBe(`mm:${m.month}`);
      for (const wk of m.weeks) {
        expect(wk.slice).toContain(`Hito ${wk.n} de ${m.weeks.length}`);
        for (const p of wk.pieces) expect(p.slice).toContain(`Pieza ${p.n} de ${wk.pieces.length}`);
      }
    }
  });

  it("las piezas de cada semana son las de sus días de estudio y los totales cuadran con los entregables diarios", () => {
    const chain = planChain(plan, sch);
    const ids = chain.months.flatMap((m) => m.weeks.flatMap((w) => w.pieces.map((p) => p.id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(chain.pieces).toBe(ids.length);
    expect(chain.months.every((m) => m.total === m.weeks.reduce((n, w) => n + w.total, 0))).toBe(true);
    const list = deliverablesOf(plan, null, sch);
    expect(list.filter((d) => d.kind === "daily_project")).toHaveLength(ids.length);
    expect(list.filter((d) => d.kind === "monthly_project").map((d) => d.id)).toEqual(chain.months.map((m) => m.id));
    // un único proyecto mensual por mes y sin pendientes del bloque de pista
    expect(list.filter((d) => d.kind === "monthly_project")).toHaveLength(6);
    expect(countDeliverables(list).done).toBe(0);
  });

  it("el avance sale SOLO de lo completado: semana hecha ⇒ mes en curso; todas las semanas ⇒ mes hecho y el siguiente se desbloquea", () => {
    const base = planChain(plan, sch);
    expect(base.months.every((m) => m.status === "pendiente")).toBe(true);
    expect(base.months[0]!.locked).toBe(false);
    expect(base.months.slice(1).every((m) => m.locked)).toBe(true);
    expect(base.months[1]!.lockedBy).toBe(1);
    expect(base.months[0]!.weeks[1]!.locked).toBe(true); // semana 2 bloqueada hasta completar la 1
    expect(base.months[0]!.weeks[1]!.lockedBy).toBe(1);
    expect(base.months[0]!.weeks[0]!.pieces[0]!.current).toBe(true);

    const first = base.months[0]!;
    const done: Record<string, string[]> = {};
    for (const p of first.weeks[0]!.pieces) done[p.date] = p.areaIds;
    const one = planChain(plan, sch, { dailyProjectDone: done });
    expect(one.months[0]!.weeks[0]!.status).toBe("hecho");
    expect(one.months[0]!.weeks[0]!.pct).toBe(100);
    expect(one.months[0]!.status).toBe("en_curso");
    expect(one.months[0]!.weeks[1]!.locked).toBe(false); // la anterior ya está hecha
    expect(one.months[1]!.locked).toBe(true);

    for (const w of first.weeks) for (const p of w.pieces) done[p.date] = p.areaIds;
    const all = planChain(plan, sch, { dailyProjectDone: done });
    expect(all.months[0]!.status).toBe("hecho");
    expect(all.months[0]!.pct).toBe(100);
    expect(all.months[1]!.locked).toBe(false);
    expect(all.months[2]!.locked).toBe(true);
    // y los entregables derivados lo reflejan: ni una sola marca manual interviene
    const list = deliverablesOf(plan, { weeks: [], dailyProjectDone: done }, sch);
    expect(list.find((d) => d.id === all.months[0]!.id)!.status).toBe("hecho");
    expect(list.find((d) => d.id === all.months[1]!.id)!.status).toBe("pendiente");
  });

  it("un estado guardado a mano en Plan.deliverables NO mueve nada", () => {
    const month = planChain(plan, sch).months[0]!;
    const tampered = { ...plan, deliverables: [{ id: month.id, kind: "monthly_project", title: "x", description: "", dueDate: month.dueDate, criteria: [], status: "hecho", source: "practice" }] };
    const list = deliverablesOf(tampered, null, sch);
    expect(list.find((d) => d.id === month.id)!.status).toBe("pendiente");
  });

  it("una pieza de varias áreas exige todas sus carpetas completas", () => {
    expect(pieceDone({ dailyProjectDone: { "2026-10-06": ["backend"] } }, "2026-10-06", ["backend", "frontend"])).toBe(false);
    expect(pieceDone({ dailyProjectDone: { "2026-10-06": ["backend", "frontend"] } }, "2026-10-06", ["backend", "frontend"])).toBe(true);
    const idx = chainIndex(planChain(plan, sch));
    expect(idx.months.size).toBe(6);
  });

  it("el proyecto mensual es UN producto real que crece: una etapa por mes, un hito por semana y los temas del mes repartidos entre sus hitos", () => {
    const chain = planChain(plan, sch);
    expect(chain.months[0]!.title).toMatch(/^Mes 1 · La primera versión del producto/);
    expect(chain.months[1]!.title).toMatch(/^Mes 2 · Cuentas, permisos y pruebas/);
    for (const m of chain.months) {
      expect(m.product?.milestones).toHaveLength(m.weeks.length);
      for (const wk of m.weeks) {
        expect(wk.milestone?.title).toBeTruthy();
        expect(wk.title).toContain(`Hito ${wk.n}: ${wk.milestone!.title}`);
      }
      // ningún tema del mes se pierde: todos tienen un hito donde aplicarse
      expect(m.product!.milestones.flatMap((x) => x.topics)).toEqual(m.topics);
      expect(m.goal).toMatch(/Consolidas lo que aprendes este mes/);
      expect(m.criteria.join(" ")).toMatch(/UN producto real/);
    }
  });
});
