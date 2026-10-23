import { describe, expect, it } from "vitest";
import { areaSets } from "./planAreaLists";
import type { ScheduleDay } from "./planSchedule";

const t = (subplanId: string, folder: string, done = false) => ({ subplanId, folder, done });
const day = (date: string, week: number, topics: Array<ReturnType<typeof t>>) => ({ date, week, topics }) as unknown as ScheduleDay;
const days = [
  day("2026-10-12", 2, [t("s1", "A", true), t("s1", "B"), t("s2", "X")]),
  day("2026-10-15", 2, [t("s1", "C")]),
  day("2026-10-16", 2, [t("s1", "B"), t("s1", "D"), t("s2", "Y")]),
  day("2026-10-19", 3, [t("s1", "E")]),
];

describe("conjuntos de la ruta de un área", () => {
  it("hoy, esta semana y pendientes (su tiempo previsto ya pasó y no se terminó) de un área", () => {
    const s = areaSets(days, "s1", "2026-10-16", 2);
    expect([...s.today].sort()).toEqual(["B", "D"]);
    expect([...s.week].sort()).toEqual(["A", "B", "C", "D"]);
    expect([...s.pending].sort()).toEqual(["B", "C"]); // A está hecho; D toca justo hoy (aún en su tiempo); E es de la semana que viene
  });

  it("mientras la ruta no ha empezado nada está pendiente (y «hoy» sigue siendo solo lo repartido hoy)", () => {
    const s = areaSets(days, "s1", "2026-10-16", 2, false);
    expect(s.pending.size).toBe(0);
    expect([...s.today].sort()).toEqual(["B", "D"]);
  });

  it("sin área cuenta todo el plan", () => {
    const s = areaSets(days, null, "2026-10-16", 2);
    expect([...s.today].sort()).toEqual(["B", "D", "Y"]);
    expect(s.pending.has("X")).toBe(true);
  });

  it("un tema hecho en otro día de su reparto no queda pendiente", () => {
    const d2 = [day("2026-10-12", 2, [t("s1", "B", true)]), day("2026-10-16", 2, [t("s1", "B", false)])];
    expect(areaSets(d2, "s1", "2026-10-16", 2).pending.size).toBe(0);
  });
});
