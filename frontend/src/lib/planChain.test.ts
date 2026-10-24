// Cadena de entregables del plan: proyecto DIARIO → SEMANAL → MENSUAL.
// Módulo puro: ventanas de mes, piezas diarias, desbloqueo secuencial y cálculo de avance sin IA ni marcado manual.

import { describe, expect, it } from "vitest";
import { buildSchedule } from "./planSchedule.js";
import { chainIndex, chainProgressText, lockText, pieceDone, planChain, planMonthWindows, type ChainSignals } from "./planChain.js";

const plan = {
  id: "p1",
  start: "2026-10-06",
  end: "2027-01-04",
  structure: "areas",
  subplans: [
    {
      id: "s-be",
      area: "Backend",
      areaId: "backend",
      topics: [
        { folder: "Backend/1", title: "API 1", estMinutes: 60, targetWeek: 1 },
        { folder: "Backend/2", title: "API 2", estMinutes: 60, targetWeek: 1 },
        { folder: "Backend/3", title: "API 3", estMinutes: 60, targetWeek: 2 },
      ],
      phase: { fromWeek: 1, toWeek: 13 },
      weeks: [],
    },
    {
      id: "s-fe",
      area: "Frontend",
      areaId: "frontend",
      topics: [
        { folder: "Frontend/1", title: "UI 1", estMinutes: 60, targetWeek: 1 },
        { folder: "Frontend/2", title: "UI 2", estMinutes: 60, targetWeek: 2 },
      ],
      phase: { fromWeek: 1, toWeek: 13 },
      weeks: [],
    },
  ],
  preconditions: {
    start: "2026-10-06",
    end: "2027-01-04",
    studyDays: [2, 3, 4], // mar, mie, jue
    minutesPerDay: 180,
  },
} as any;

describe("planChain", () => {
  it("planMonthWindows divide el plan en ventanas de mes de aniversario", () => {
    const windows = planMonthWindows({ start: "2026-10-06", end: "2027-01-04" });
    expect(windows.length).toBeGreaterThanOrEqual(3);
    expect(windows[0]!.start).toBe("2026-10-06");
    expect(windows[0]!.end).toBe("2026-11-05");
    expect(windows[1]!.start).toBe("2026-11-06");
  });

  it("pieceDone valida que las áreas del día tengan su carpeta de proyecto completa", () => {
    const signals: ChainSignals = {
      dailyProjectDone: {
        "2026-10-06": ["backend", "frontend"],
        "2026-10-07": ["backend"],
      },
    };
    expect(pieceDone(signals, "2026-10-06", ["backend", "frontend"])).toBe(true);
    expect(pieceDone(signals, "2026-10-07", ["backend", "frontend"])).toBe(false);
    expect(pieceDone(signals, "2026-10-07", ["backend"])).toBe(true);
    expect(pieceDone(signals, "2026-10-08", ["backend"])).toBe(false);
  });

  it("genera la cadena con meses, semanas y piezas diarias derivadas", () => {
    const sch = buildSchedule(plan);
    const chain = planChain(plan, sch);
    expect(chain.months.length).toBeGreaterThan(0);
    expect(chain.weeks).toBeGreaterThan(0);
    expect(chain.pieces).toBeGreaterThan(0);

    const firstMonth = chain.months[0]!;
    expect(firstMonth.locked).toBe(false);
    expect(firstMonth.weeks.length).toBeGreaterThan(0);

    // los meses siguientes quedan bloqueados hasta completar el anterior
    if (chain.months.length > 1) {
      expect(chain.months[1]!.locked).toBe(true);
      expect(chain.months[1]!.lockedBy).toBe(1);
      expect(lockText("month", chain.months[1]!.lockedBy!)).toBe("Bloqueado hasta completar el mes 1");
    }
  });

  it("el avance de la cadena solo se mueve con las señales del estudiante", () => {
    const sch = buildSchedule(plan);
    const date1 = sch.days[0]!.date;
    const date2 = sch.days[1]!.date;
    const areas = sch.days[0]!.focus?.areaIds ?? ["backend"];

    const signals1: ChainSignals = {
      dailyProjectDone: { [date1]: areas },
    };
    const c1 = planChain(plan, sch, signals1);
    expect(c1.months[0]!.done).toBe(1);
    expect(c1.months[0]!.weeks[0]!.pieces[0]!.done).toBe(true);

    const idx = chainIndex(c1);
    expect(idx.months.size).toBe(c1.months.length);
    expect(idx.pieces.get(c1.months[0]!.weeks[0]!.pieces[0]!.id)?.done).toBe(true);

    expect(chainProgressText(1, 4)).toBe("1 de 4 piezas · 25 %");
  });
});
