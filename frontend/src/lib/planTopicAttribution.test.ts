// La Agenda y la Ejecución deben listar los MISMOS temas para la misma área y fecha: una sola regla de atribución (`planTopicsByArea`).
// Aquí se compara lo que cada lado calcula por su cuenta (selectores de la Agenda: `topicsByWeekArea`, `dayByArea`, `dayBases`; selectores de la
// Ejecución: `areaRouteTopics`, `basesRouteTopics`, `areaSets` y el reparto diario) con un plan que tiene un área, sus Bases y temas hechos/omitidos.

import { describe, expect, it } from "vitest";
import { areaSets, executionLists } from "./planAreaLists";
import { buildSchedule, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import { areaRouteTopics, basesClassifier, basesRouteTopics, dayBases, dayByArea, orderedAreas, topicsByWeekArea } from "./planTopicsByArea";

const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const mk = (prefix: string, n: number, group: string, week = 1): ScheduleTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `${prefix}/${i + 1}`, title: `${prefix} ${i + 1}`, estMinutes: 60, targetWeek: week, group }));

function plan(): SchedulePlan {
  const be = [...mk("F", 5, "bases"), ...mk("BE", 12, "core")];
  be[7] = { ...be[7]!, completedAt: "2026-10-07" }; // un tema del área ya hecho
  be[9] = { ...be[9]!, route: "skipped" }; // uno fuera de ruta
  be[1] = { ...be[1]!, completedAt: "2026-10-06" }; // un fundamento ya hecho
  return {
    id: "p",
    start: "2026-10-05",
    end: "2027-01-03",
    structure: "areas",
    preconditions: { minutesPerDay: 300, studyDays: [1, 2, 3, 4, 5, 6], pace: "intenso" },
    subplans: [
      { id: "s-be", areaId: "backend", area: "Backend", objective: "", groups: [BASES, CORE], phase: { fromWeek: 1, toWeek: 8 }, topics: be },
      { id: "s-fe", areaId: "frontend", area: "Frontend", objective: "", groups: [CORE], phase: { fromWeek: 5, toWeek: 12 }, topics: mk("FE", 8, "core", 5) },
    ],
  };
}

describe("atribución de temas: Agenda = Ejecución", () => {
  const p = plan();
  const sch = buildSchedule(p);
  const data = topicsByWeekArea(p, sch);
  const isBases = basesClassifier(p);
  const folders = (xs: ReadonlyArray<{ folder: string }>): string[] => [...new Set(xs.map((x) => x.folder))].sort();

  it("la ruta del área no lleva fundamentos y las Bases no llevan temas del área", () => {
    const be = areaRouteTopics(p, "s-be");
    expect(be.every((t) => t.group === "core" && t.route !== "skipped")).toBe(true);
    expect(be).toHaveLength(11);
    const bases = basesRouteTopics(p);
    expect(bases.every((t) => t.group === "bases")).toBe(true);
    expect(bases).toHaveLength(5);
  });

  it("cada tema de la ruta de un área está en la Agenda (y solo en esa área); los omitidos no están en ninguna", () => {
    for (const a of orderedAreas(p)) {
      const agenda = folders(data.weeks.flatMap((w) => w.cells.find((c) => c.subplanId === a.subplanId)!.topics));
      expect(agenda, a.area).toEqual(folders(areaRouteTopics(p, a.subplanId)));
      expect(data.unscheduled[a.subplanId]).toEqual([]);
      expect(data.totals[a.subplanId]!.topics).toBe(agenda.length);
    }
    expect(folders(data.weeks.flatMap((w) => w.bases))).toEqual(folders(basesRouteTopics(p)));
    expect(data.unscheduled.bases).toEqual([]);
    const all = data.weeks.flatMap((w) => [...w.cells.flatMap((c) => c.topics), ...w.bases]).map((t) => t.folder);
    expect(all).not.toContain("BE/5");
  });

  it("por semana: los temas de la celda de la Agenda son los de «esta semana» de la Ejecución (areaSets), y Bases los suyos", () => {
    for (const w of data.weeks) {
      for (const c of w.cells) {
        const sets = areaSets(sch.days, c.subplanId, w.start, w.week, true, (t) => !isBases(t));
        expect(folders(c.topics), `${c.area} semana ${w.week}`).toEqual([...sets.week].sort());
      }
      const bs = areaSets(sch.days, null, w.start, w.week, true, isBases);
      expect(folders(w.bases), `Bases semana ${w.week}`).toEqual([...bs.week].sort());
    }
  });

  it("por día: dayByArea (Agenda Día/Calendario y tarjetas de hoy) + dayBases == los temas del reparto de ese día", () => {
    for (const day of sch.days.filter((d) => d.study && d.topics.length > 0)) {
      const entries = dayByArea(p, day);
      for (const a of orderedAreas(p)) {
        const expected = folders(day.topics.filter((t) => t.subplanId === a.subplanId && !isBases(t) && !t.done));
        const got = folders((entries.find((e) => e.subplanId === a.subplanId)?.blocks ?? []).flatMap((b) => b.items));
        expect(got, `${a.area} ${day.date}`).toEqual(expected);
      }
      const expectedBases = folders(day.topics.filter((t) => isBases(t) && !t.done));
      expect(folders(dayBases(p, day)), `Bases ${day.date}`).toEqual(expectedBases);
      // ningún tema cae en un área y en Bases a la vez
      const inAreas = new Set(entries.flatMap((e) => (e.blocks ?? []).flatMap((b) => b.items.map((i) => i.folder))));
      for (const f of folders(dayBases(p, day))) expect(inAreas.has(f)).toBe(false);
    }
  });

  it("el conteo de temas de un día por área no incluye fundamentos", () => {
    const day = sch.days.find((d) => dayBases(p, d).length > 0 && dayByArea(p, d).some((e) => e.areaId === "backend"))!;
    expect(day).toBeTruthy();
    const be = dayByArea(p, day).find((e) => e.areaId === "backend")!;
    expect(be.topics).toBe(folders(be.blocks.flatMap((b) => b.items)).length);
  });
});

// Escenario real: el plan NO ha empezado (nada hecho), hoy es mucho después del inicio y hay temas repartidos en días anteriores. La Ejecución
// («Temas de hoy», «Temas de la semana») debe listar exactamente lo mismo que la Agenda (Día y Semana) para cada área, y lo atrasado no se mezcla en «Hoy».
describe("Ejecución = Agenda con el plan sin empezar y temas repartidos en días anteriores", () => {
  const p: SchedulePlan = { ...plan(), start: "2026-10-06", end: "2027-04-05", subplans: plan().subplans.map((s) => ({ ...s, phase: { fromWeek: 1, toWeek: 20 }, topics: s.topics.map((t) => ({ ...t, completedAt: undefined })) })) };
  const sch = buildSchedule(p);
  const isBases = basesClassifier(p);
  const today = "2026-10-23";
  const day = sch.days.find((d) => d.date === today)!;
  const week = day.week;
  const folders = (xs: ReadonlyArray<{ folder: string }>): string[] => xs.map((x) => x.folder);
  const sorted = (xs: string[]): string[] => [...new Set(xs)].sort();

  for (const started of [false, true]) {
    it(`por área, hoy y semana coinciden (ruta ${started ? "empezada" : "sin empezar"})`, () => {
      const data = topicsByWeekArea(p, sch);
      expect(day.topics.length).toBeGreaterThan(0);
      for (const a of orderedAreas(p)) {
        const route = areaRouteTopics(p, a.subplanId).map((t) => ({ folder: t.folder, done: false }));
        const sets = areaSets(sch.days, a.subplanId, today, week, started, (t) => !isBases(t));
        // lo que pinta la Ejecución como «Temas de hoy»: las filas de la tarjeta del día de ese área (la misma fuente que la Agenda, Día)
        const agendaDay = folders((dayByArea(p, day).find((e) => e.subplanId === a.subplanId)?.blocks ?? []).flatMap((b) => b.items));
        const todayRows = [...new Set(agendaDay)].map((f) => ({ folder: f, done: false }));
        const lists = executionLists(route, todayRows, sets);
        expect(folders(lists.hoy), `${a.area} hoy`).toEqual([...new Set(agendaDay)]);
        expect(sorted(folders(lists.hoy)), `${a.area} hoy vs reparto`).toEqual(sorted(folders(day.topics.filter((t) => t.subplanId === a.subplanId && !isBases(t)))));
        const agendaWeek = data.weeks[week - 1]!.cells.find((c) => c.subplanId === a.subplanId)!.topics;
        expect(sorted(folders(lists.semana)), `${a.area} semana`).toEqual(sorted(folders(agendaWeek)));
        // lo atrasado no se mezcla en «Hoy»: está en «Pendientes» (si la ruta empezó) y en la Agenda en su fecha
        const before = new Set(sch.days.filter((d) => d.date < today).flatMap((d) => d.topics.filter((t) => t.subplanId === a.subplanId && !isBases(t)).map((t) => t.folder)));
        const todaySet = new Set(folders(lists.hoy));
        expect(sorted(folders(lists.pendientes)), a.area).toEqual(started ? sorted([...before]) : []);
        for (const f of before) if (!todaySet.has(f)) expect(folders(lists.hoy)).not.toContain(f);
      }
    });
  }

  it("hay temas repartidos antes de hoy que no son los de hoy (el caso que fallaba)", () => {
    const be = orderedAreas(p)[0]!;
    const before = sch.days.filter((d) => d.date < today).flatMap((d) => d.topics.filter((t) => t.subplanId === be.subplanId && !isBases(t)).map((t) => t.folder));
    expect(before.length).toBeGreaterThan(0);
    const mine = folders(day.topics.filter((t) => t.subplanId === be.subplanId && !isBases(t)));
    expect(mine.some((f) => before.includes(f))).toBe(false);
  });
});

// Un tema extra añadido a HOY (de la ruta que está más adelante, de la vault dentro de un área o de la vault suelto) cae en la Agenda (Día) y en la
// Ejecución («Temas de hoy») por la MISMA regla: el del área sale en su área, el suelto en el cubo «Extra».
describe("temas extra de hoy: Agenda = Ejecución", () => {
  const today = "2026-10-14";
  const base = plan();
  const ahead = base.subplans[0]!.topics.find((t) => t.folder === "BE/11")!; // el último tema de la ruta de Backend
  const p: SchedulePlan = {
    ...base,
    extraTopics: [
      { date: today, folder: ahead.folder, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
      { date: today, folder: "Vault/Redis", area: "s-be", title: "Redis básico", estMinutes: 30, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
      { date: today, folder: "Vault/Suelto", title: "Tema suelto", estMinutes: 30, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
    ],
  };
  const sch = buildSchedule(p);
  const day = sch.days.find((d) => d.date === today)!;
  const isBases = basesClassifier(p);
  const week = day.week;

  it("el tema de la ruta adelantado y el de la vault con área salen en «Temas de hoy» de Backend, igual que en la Agenda (Día)", () => {
    const agenda = [...new Set((dayByArea(p, day).find((e) => e.subplanId === "s-be")?.blocks ?? []).flatMap((b) => b.items.map((i) => i.folder)))];
    expect(agenda).toEqual(expect.arrayContaining([ahead.folder, "Vault/Redis"]));
    const sets = areaSets(sch.days, "s-be", today, week, true, (t) => !isBases(t));
    const lists = executionLists(areaRouteTopics(p, "s-be").map((t) => ({ folder: t.folder, done: false })), agenda.map((f) => ({ folder: f, done: false })), sets);
    expect(lists.hoy.map((r) => r.folder)).toEqual(agenda);
    expect(sets.today.has(ahead.folder)).toBe(true);
    expect(sets.today.has("Vault/Redis")).toBe(true);
    // y el tema adelantado no se repite más adelante en la ruta de Backend
    const later = sch.days.filter((d) => d.date > today).flatMap((d) => d.topics.filter((t) => t.folder === ahead.folder && !t.extra));
    expect(later).toEqual([]);
  });

  it("el tema de la vault sin área va al cubo «Extra», que también está en la Agenda (Día)", () => {
    const entry = dayByArea(p, day).find((e) => e.subplanId === "extra");
    expect(entry?.area).toBe("Extra");
    expect([...new Set((entry?.blocks ?? []).flatMap((b) => b.items.map((i) => i.folder)))]).toEqual(["Vault/Suelto"]);
    expect(areaSets(sch.days, "extra", today, week, true).today.has("Vault/Suelto")).toBe(true);
    expect(orderedAreas(p).some((a) => a.subplanId === "extra")).toBe(false); // no es un área del plan
  });
});
