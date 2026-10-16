import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import { FinanceManager } from "../../core/financeManager.js";
import { AppState } from "../appState.js";
import { financeApi } from "./finance.js";

describe("financeApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof financeApi>;
  let today: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_fin_test_"));
    app = new AppState(tmpDir);
    api = financeApi(app);
    today = todayIso();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  /** Las categorías las crea la persona; el helper deja las que usa un test. */
  function seed(...names: Array<[string, "gasto" | "ingreso"]>): void {
    for (const [name, kind] of names) {
      api.fin_category_save("", { name, kind, icon: "•", colour: "#616161" });
    }
  }

  it("starts with no categories and creates expenses", () => {
    expect(api.fin_meta().categories).toEqual([]);
    seed(["Comida", "gasto"], ["Transporte", "gasto"], ["Salario", "ingreso"]);

    const cats = api.fin_meta().categories;
    expect(cats.some((c) => c.id === "comida")).toBe(true);

    const m = api.fin_add(today, {
      type: "gasto",
      amount_cents: 1250000,
      what: "Almuerzo\ncategory: x",
      category: "comida",
    }) as { id: string };

    const fm = new FinanceManager(tmpDir);
    const day = fm.day(today);
    expect(day[0]!.amount_cents).toBe(1250000);
    expect(day[0]!.what).toBe("Almuerzo category: x");

    expect(api.fin_sidebar().month.gasto).toBe(1250000);

    api.fin_update(today, m.id, {
      type: "gasto",
      amount_cents: 900000,
      category: "transporte",
    });
    expect(fm.day(today)[0]!.category).toBe("transporte");
  });

  it("deletes a category to the vault trash", () => {
    seed(["Comida", "gasto"], ["Mascotas", "gasto"]);
    api.fin_add(today, { type: "gasto", amount_cents: 500, category: "mascotas" });

    expect(api.fin_category_delete("mascotas")).toEqual({ ok: true });
    expect(api.fin_meta().categories.some((c) => c.id === "mascotas")).toBe(false);
    // El movimiento sigue ahí, ahora sin categoría.
    expect((new FinanceManager(tmpDir).day(today)[0] as any).category).toBe("mascotas");

    expect(() => api.fin_category_delete("mascotas")).toThrow();
    expect(() => api.fin_category_delete("")).toThrow();
  });

  it("moves a category and refuses the edges", () => {
    seed(["Almuerzo", "gasto"], ["Bus", "gasto"], ["Sueldo", "ingreso"]);
    expect(api.fin_category_move("bus", -1)).toEqual({ ok: true });
    expect(api.fin_meta().categories.map((c) => c.name)).toEqual(["Bus", "Almuerzo", "Sueldo"]);
    expect(() => api.fin_category_move("bus", -1)).toThrow();
    expect(() => api.fin_category_move("bus", 5)).toThrow();
    expect(() => api.fin_category_move("no-existe", 1)).toThrow();
  });

  it("handles goal savings and status updates", () => {
    const g = api.fin_goal_save("", {
      name: "Moto",
      target_cents: 1000000,
      suggested_cents: 500000,
      cadence: { mode: "period", period: "week" },
      show_in_daily: true,
    }) as { id: string };

    const checks = api.fin_due_checks(today);
    expect(checks.map((c) => (c.goal as any).id)).toEqual([g.id]);

    api.fin_add(today, {
      type: "ahorro",
      amount_cents: 1000000,
      goal: g.id,
    });

    const data = api.fin_goal(g.id);
    expect(data.pace.saved).toBe(1000000);
    expect((data.goal as any).status).toBe("Cumplida");

    const checksAfter = api.fin_due_checks(today);
    if (checksAfter.length > 0) {
      expect(checksAfter[0]!.checked).toBe(true);
    }
  });

  it("moves movement to another day", () => {
    seed(["Salario", "ingreso"]);
    const m = api.fin_add(today, {
      type: "ingreso",
      amount_cents: 100,
      category: "salario",
    }) as { id: string };

    api.fin_update(
      today,
      m.id,
      { type: "ingreso", amount_cents: 100, category: "salario" },
      "2026-01-02"
    );

    const fm = new FinanceManager(tmpDir);
    expect(fm.day("2026-01-02")[0]!.id).toBe(m.id);
  });

  it("refuses invalid input", () => {
    const badInputs = [
      { type: "robo", amount_cents: 1 },
      { type: "gasto", amount_cents: -5 },
      { type: "gasto", amount_cents: 0 },
      { type: "gasto", amount_cents: "12,5" },
      { type: "gasto", amount_cents: 1, category: "inventada" },
      { type: "gasto", amount_cents: 1, time: "8pm" },
      { type: "gasto", amount_cents: 1, attachments: ["../x.png"] },
    ];
    for (const bad of badInputs) {
      expect(() => api.fin_add(today, bad)).toThrow(ApiError);
    }

    expect(() => api.fin_range("2020-01-01", "2026-01-01")).toThrow(ApiError);
    expect(() =>
      api.fin_category_save("", { name: "X", colour: "red" })
    ).toThrow(ApiError);
  });

  it("computes category budget usage", () => {
    const c = api.fin_category_save("", {
      name: "Mascotas",
      icon: "🐶",
      colour: "#aa00aa",
      budget_month_cents: 5000000,
    }) as { id: string };

    api.fin_add(today, {
      type: "gasto",
      amount_cents: 6000000,
      category: c.id,
    });

    const d = new Date();
    const budgets = api.fin_month_extras(d.getFullYear(), d.getMonth() + 1).budgets;
    const row = budgets.find((b: any) => b.category.id === c.id)!;
    expect(row.used).toBe(6000000);
    expect(row.budget).toBe(5000000);
  });

  it("assigns general savings to a goal", () => {
    const g = api.fin_goal_save("", {
      name: "Moto",
      target_cents: 1000000,
      suggested_cents: 500000,
      cadence: { mode: "period", period: "week" },
      show_in_daily: true,
    }) as { id: string };

    api.fin_add(today, { type: "ahorro", amount_cents: 200000, what: "Ahorro suelto" });
    api.fin_add(today, { type: "retiro", amount_cents: 50000, what: "Retiro suelto" });
    seed(["Comida", "gasto"]);
    api.fin_add(today, { type: "gasto", amount_cents: 900000, what: "Nada que ver", category: "comida" });
    expect(api.fin_goals().general).toBe(150000);

    const r = api.fin_assign_general(g.id) as { moved: number };
    expect(r.moved).toBe(2);
    expect(api.fin_goals().general).toBe(0);
    expect(api.fin_goal(g.id).pace.saved).toBe(150000);

    expect(() => api.fin_assign_general("no-existe")).toThrow();
  });

  it("materializes recurrents without duplicating", () => {
    const r = api.fin_recurring_save("", {
      type: "gasto", amount_cents: 100000, what: "Arriendo", rule: "daily", start: today,
    }) as { id: string; rule: string };
    expect(r.rule).toBe("daily");

    expect((api.fin_recurring_run(today) as { created: number }).created).toBe(1);
    expect((api.fin_recurring_run(today) as { created: number }).created).toBe(0);
    const day = new FinanceManager(tmpDir).day(today);
    expect(day.filter((m) => m.what === "Arriendo")).toHaveLength(1);
    expect(day[0]!.reason).toBe("Automático");

    expect(() => api.fin_recurring_save("", { type: "nope", amount_cents: 1 })).toThrow();
    expect(() => api.fin_recurring_save("rc-no-existe", { type: "gasto", amount_cents: 1 })).toThrow();
  });

  it("round-trips the monthly budget", () => {
    expect((api.fin_budget_get() as { month_budget_cents: number }).month_budget_cents).toBe(0);
    expect((api.fin_budget_set(500000000) as { month_budget_cents: number }).month_budget_cents).toBe(500000000);
    expect((api.fin_budget_get() as { month_budget_cents: number }).month_budget_cents).toBe(500000000);
    expect((api.fin_budget_set(0) as { month_budget_cents: number }).month_budget_cents).toBe(0);
  });

  it("bundles the daily view in one call", () => {
    seed(["Comida", "gasto"]);
    api.fin_add(today, { type: "gasto", amount_cents: 1250000, what: "Café", category: "comida" });
    const b = api.fin_diario_bundle(today) as unknown as {
      movements: Array<{ what: string }>;
      checks: unknown[];
      month: { gasto: number };
      budget: number;
      budgets: Array<{ category: { id: string }; used: number; budget: number }>;
    };
    expect(b.movements).toHaveLength(1);
    expect(b.movements[0]!.what).toBe("Café");
    expect(b.month.gasto).toBe(1250000);
    expect(b.budget).toBe(0);
    expect(b.budgets).toBeDefined();
    expect(b.budgets.some((bg) => bg.category.id === "comida" && bg.used === 1250000)).toBe(true);
    expect(() => api.fin_diario_bundle("no-fecha")).toThrow();
  });

  it("searches the whole history", () => {
    seed(["Vivienda", "gasto"], ["Salario", "ingreso"]);
    api.fin_add("2025-03-04", { type: "gasto", amount_cents: 80000000, what: "Arriendo marzo", category: "vivienda" });
    api.fin_add("2026-01-02", { type: "gasto", amount_cents: 85000000, what: "Arriendo enero", category: "vivienda" });
    api.fin_add("2026-01-03", { type: "ingreso", amount_cents: 300000000, what: "Salario", category: "salario" });

    const all = api.fin_search("arriendo", "", "") as { total: number; movements: Array<{ what: string }> };
    expect(all.total).toBe(2);
    expect(all.movements.map((m) => m.what).sort()).toEqual(["Arriendo enero", "Arriendo marzo"]);

    const filtered = api.fin_search("", "ingreso", "") as { total: number };
    expect(filtered.total).toBe(1);

    expect((api.fin_search("", "", "") as { total: number }).total).toBe(0);
    expect(() => api.fin_search("x", "nope", "")).toThrow();

    const page = api.fin_search("arriendo", "", "", 1) as { total: number; movements: Array<{ what: string }> };
    expect(page.total).toBe(2);
    expect(page.movements).toHaveLength(1);
  });

  it("imports a batch of movements across multiple dates and updates totals", () => {
    seed(["Supermercado", "gasto"], ["Sueldo", "ingreso"]);

    const batch = [
      { date: "2026-03-01", type: "gasto", amount_cents: 450000, what: "Supermercado marzo", category: "supermercado" },
      { date: "2026-03-01", type: "ingreso", amount_cents: 25000000, what: "Sueldo marzo", category: "sueldo" },
      { date: "2026-03-02", type: "gasto", amount_cents: 120000, what: "Farmacia", category: "" },
    ];

    const result = api.fin_import_batch(batch) as { imported: number; movements: Array<{ what: string; date: string }> };
    expect(result.imported).toBe(3);
    expect(result.movements).toHaveLength(3);

    const fm = new FinanceManager(tmpDir);
    const day1 = fm.day("2026-03-01");
    expect(day1).toHaveLength(2);
    expect(day1.map((m) => m.what)).toEqual(["Supermercado marzo", "Sueldo marzo"]);

    const day2 = fm.day("2026-03-02");
    expect(day2).toHaveLength(1);
    expect(day2[0]!.amount_cents).toBe(120000);

    // Empty array handling
    expect((api.fin_import_batch([]) as { imported: number }).imported).toBe(0);

    // Validation errors
    expect(() => api.fin_import_batch("not-an-array")).toThrow(ApiError);
    expect(() => api.fin_import_batch([{ date: "bad-date", type: "gasto", amount_cents: 100 }])).toThrow();
    expect(() => api.fin_import_batch([{ date: "2026-03-01", type: "invalido", amount_cents: 100 }])).toThrow(ApiError);
  });

  it("exports all historical data with categories and goals", () => {
    seed(["Servicios", "gasto"]);
    api.fin_import_batch([
      { date: "2025-11-15", type: "gasto", amount_cents: 35000, what: "Internet" },
      { date: "2026-02-10", type: "gasto", amount_cents: 28000, what: "Luz" },
    ]);

    const exp = api.fin_export_all() as unknown as {
      movements: Array<{ what: string; date: string }>;
      categories: Array<{ id: string }>;
      currency: string;
      total_count: number;
    };

    expect(exp.total_count).toBe(2);
    expect(exp.movements).toHaveLength(2);
    expect(exp.movements[0]!.what).toBe("Internet");
    expect(exp.movements[0]!.date).toBe("2025-11-15");
    expect(exp.movements[1]!.what).toBe("Luz");
    expect(exp.currency).toBe("USD");
    expect(exp.categories.some((c) => c.id === "servicios")).toBe(true);
  });

  it("saves, lists, and deletes custom auto-categorization rules", () => {
    seed(["Cafetería", "gasto"]);
    expect(api.fin_rules_get().rules).toHaveLength(0);

    const saved = api.fin_rules_save({
      pattern: "starbucks",
      category: "cafeteria",
      type: "gasto",
    }) as { id: string; pattern: string; category: string };

    expect(saved.id).toBeDefined();
    expect(saved.pattern).toBe("starbucks");
    expect(saved.category).toBe("cafeteria");

    const list = api.fin_rules_get().rules;
    expect(list).toHaveLength(1);
    expect(list[0]!.pattern).toBe("starbucks");

    // Updating existing rule with same pattern
    const updated = api.fin_rules_save({
      pattern: "STARBUCKS",
      category: "otra-cat",
    }) as { id: string; category: string };
    expect(updated.category).toBe("otra-cat");
    expect(api.fin_rules_get().rules).toHaveLength(1);

    // Delete rule
    api.fin_rules_delete(saved.id);
    expect(api.fin_rules_get().rules).toHaveLength(0);
    expect(() => api.fin_rules_delete("no-existe")).toThrow();
  });

  it("finds existing movements in the vault matching incoming candidates (duplicate detection)", () => {
    seed(["Supermercado", "gasto"]);
    // Seed existing movements in the vault
    api.fin_add("2026-03-01", { type: "gasto", amount_cents: 450000, what: "Supermercado Carulla", category: "supermercado" });
    api.fin_add("2026-03-02", { type: "ingreso", amount_cents: 12000000, what: "Honorarios consultoría" });

    const candidates = [
      // Exact duplicate by date and amount
      { date: "2026-03-01", amount_cents: 450000, what: "CARULLA MEDELLIN", type: "gasto" },
      // Different amount on same date: not a duplicate
      { date: "2026-03-01", amount_cents: 150000, what: "Panadería", type: "gasto" },
      // Duplicate income
      { date: "2026-03-02", amount_cents: 12000000, what: "Transferencia honorarios", type: "ingreso" },
      // Different date entirely
      { date: "2026-03-05", amount_cents: 450000, what: "Supermercado", type: "gasto" },
    ];

    const res = api.fin_find_duplicates(candidates) as {
      duplicates: Array<{ index: number; existingWhat: string; existingDate: string }>;
    };

    expect(res.duplicates).toHaveLength(2);
    expect(res.duplicates[0]!.index).toBe(0);
    expect(res.duplicates[0]!.existingWhat).toBe("Supermercado Carulla");
    expect(res.duplicates[1]!.index).toBe(2);
    expect(res.duplicates[1]!.existingWhat).toBe("Honorarios consultoría");
  });
});
