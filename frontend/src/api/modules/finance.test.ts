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

  it("handles defaults and creates expenses", () => {
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
});
