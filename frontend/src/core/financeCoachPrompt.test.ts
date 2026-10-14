import { describe, expect, it } from "vitest";
import { buildFinanceCoachPrompt, type FinanceContextData } from "./financeCoachPrompt.js";

describe("financeCoachPrompt", () => {
  it("genera un prompt con el balance del mes, presupuesto y ritmo de gasto", () => {
    const data: FinanceContextData = {
      currency: "$",
      monthLabel: "Octubre",
      monthTotals: {
        spent_cents: 4500000, // $45.000
        income_cents: 12000000, // $120.000
        saved_cents: 2000000, // $20.000
        balance_cents: 5500000, // $55.000
      },
      budget_cents: 8000000, // $80.000
      pace: {
        daysElapsed: 13,
        totalDays: 31,
        dailyAverageCents: 346153,
        projectedMonthEndCents: 10730769,
        status: "over",
      },
      categories: [
        { name: "Supermercado", kind: "gasto", spent_cents: 2500000, budget_cents: 4000000 },
        { name: "Salidas y ocio", kind: "gasto", spent_cents: 2000000, budget_cents: 2000000 },
      ],
      goals: [
        { name: "Fondo de emergencia", target_cents: 100000000, saved_cents: 35000000 },
      ],
      recurrents: [
        { what: "Alquiler", amount_cents: 3000000, type: "gasto", frequency: "mensual" },
      ],
      movements: [
        { date: "2026-10-12", type: "gasto", what: "Supermercado Coto", amount_cents: 1500000, category: "Supermercado" },
      ],
    };

    const prompt = buildFinanceCoachPrompt(data);

    expect(prompt).toContain("Asesor Financiero de NoteVault");
    expect(prompt).toContain("Octubre");
    expect(prompt).toContain("$45.000");
    expect(prompt).toContain("$120.000");
    expect(prompt).toContain("Ritmo de gasto: En exceso");
    expect(prompt).toContain("Supermercado");
    expect(prompt).toContain("Fondo de emergencia");
    expect(prompt).toContain("Alquiler");
    expect(prompt).toContain("Supermercado Coto");
    expect(prompt).toContain("finance-action");
    expect(prompt).toContain("CAPACIDAD DE BÚSQUEDA Y ANÁLISIS DE PERIODO");
  });

  it("maneja de forma segura un mes sin movimientos ni presupuesto", () => {
    const data: FinanceContextData = {
      currency: "€",
      monthLabel: "Noviembre",
      monthTotals: {
        spent_cents: 0,
        income_cents: 0,
        saved_cents: 0,
        balance_cents: 0,
      },
      budget_cents: 0,
      categories: [],
      goals: [],
      recurrents: [],
    };

    const prompt = buildFinanceCoachPrompt(data);

    expect(prompt).toContain("Asesor Financiero de NoteVault");
    expect(prompt).toContain("Noviembre");
    expect(prompt).toContain("Sin presupuesto mensual establecido");
    expect(prompt).toContain("Sin gastos registrados este mes");
  });
});
