// Mentor — páginas del plan: iconos de las áreas, alcance de una página, pestañas por página y fechas de un área (módulo puro).

import { describe, expect, it } from "vitest";
import { activeAreas, areaEmoji, areaState, BASES_EMOJI, normalizePageTab, scopeDates, scopeFromStored, scopeInfo, scopeKey, scopeOnly, SCOPE_ALL, SCOPE_BASES } from "./mentorAreas";

const plan = {
  start: "2026-10-05",
  end: "2027-04-04",
  name: "Full Stack Junior",
  subplans: [
    { id: "s-fe", area: "Frontend", areaId: "frontend", phase: { fromWeek: 7, toWeek: 10 }, topics: [] },
    { id: "s-be", area: "Backend", areaId: "backend", phase: { fromWeek: 1, toWeek: 6 }, topics: [] },
    { id: "s-x", area: "Mi área", topics: [] },
  ],
} as never;

describe("mentorAreas", () => {
  it("cada área lleva el emoji de la referencia; las propias, la carpeta", () => {
    expect([ "backend", "databases", "frontend", "automation", "tooling", "logic" ].map(areaEmoji)).toEqual(["⚙️", "🗄️", "🎨", "🤖", "🛠️", "💡"]);
    expect(areaEmoji(undefined)).toBe("📁");
    expect(BASES_EMOJI).toBe("📦");
  });

  it("el alcance de una página sale del filtro guardado; lo desconocido es la Vista general", () => {
    expect(scopeFromStored("", plan)).toEqual(SCOPE_ALL);
    expect(scopeFromStored("s-be", plan)).toEqual({ kind: "area", subplanId: "s-be" });
    expect(scopeFromStored("__bases", plan)).toEqual(SCOPE_BASES);
    expect(scopeFromStored("fantasma", plan)).toEqual(SCOPE_ALL);
    expect([scopeKey(SCOPE_ALL), scopeKey(SCOPE_BASES), scopeKey({ kind: "area", subplanId: "s-be" })]).toEqual(["all", "__bases", "s-be"]);
    expect([scopeOnly(SCOPE_ALL), scopeOnly(SCOPE_BASES), scopeOnly({ kind: "area", subplanId: "s-be" })]).toEqual([null, "__bases", "s-be"]);
    expect(scopeInfo(plan, { kind: "area", subplanId: "s-be" })).toMatchObject({ title: "Backend", emoji: "⚙️", name: "Backend" });
    expect(scopeInfo(plan, SCOPE_ALL, "Mi plan").title).toBe("Mi plan");
  });

  it("las pestañas válidas dependen de la página; una desconocida vuelve a Semana", () => {
    expect(normalizePageTab("temas", { kind: "area", subplanId: "s-be" })).toBe("temas");
    expect(normalizePageTab("temas", SCOPE_ALL)).toBe("semana");
    expect(normalizePageTab("area", SCOPE_ALL)).toBe("area");
    expect(normalizePageTab("detalles", SCOPE_BASES)).toBe("semana");
    expect(normalizePageTab("", SCOPE_ALL)).toBe("semana");
  });

  it("las fechas de un área son su fase dentro del plan; sin fase, las del plan", () => {
    expect(scopeDates(plan, { kind: "area", subplanId: "s-be" })).toEqual({ start: "2026-10-05", end: "2026-11-15" });
    expect(scopeDates(plan, { kind: "area", subplanId: "s-fe" })).toEqual({ start: "2026-11-16", end: "2026-12-13" });
    expect(scopeDates(plan, { kind: "area", subplanId: "s-x" })).toEqual({ start: "2026-10-05", end: "2027-04-04" });
    expect(scopeDates(plan, SCOPE_ALL)).toEqual({ start: "2026-10-05", end: "2027-04-04" });
  });

  it("áreas activas: las que su fase incluye en la semana actual (en el orden fijo); sin ninguna, todas", () => {
    expect(activeAreas(plan, 3).map((a) => a.subplanId)).toEqual(["s-be", "s-x"]);
    expect(activeAreas(plan, 8).map((a) => a.subplanId)).toEqual(["s-fe", "s-x"]);
  });

  it("estado de un área: completo si no queda nada, próximo si su fase no ha empezado, activo en otro caso", () => {
    const done = { total: 4, done: 4, pending: 0, pct: 100 };
    const mid = { total: 4, done: 1, pending: 3, pct: 25 };
    expect(areaState(plan, { kind: "area", subplanId: "s-fe" }, mid, 2)).toBe("proximo");
    expect(areaState(plan, { kind: "area", subplanId: "s-fe" }, mid, 8)).toBe("activo");
    expect(areaState(plan, { kind: "area", subplanId: "s-fe" }, done, 2)).toBe("completo");
  });
});
