import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinCategory, FinGoal, FinMeta, FinSidebar } from "../lib/types";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    finMeta: vi.fn(),
    finSidebar: vi.fn(),
    finRecurringRun: vi.fn(),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { categoryOf, goalOf, useFinance } from "./finance";
import { useApp } from "./app";

function category(over: Partial<FinCategory> = {}): FinCategory {
  return {
    id: "comida", name: "Comida", icon: "🍽", colour: "#f4511e",
    kind: "gasto", budget_month_cents: 60000000, order: 1, archived: false, ...over,
  };
}

function goal(over: Partial<FinGoal> = {}): FinGoal {
  return {
    id: "f1", name: "Moto", icon: "🏍", colour: "#33b679", target_cents: 1200000000,
    currency: "COP", start: "2026-09-14", deadline: "2027-06-30", show_in_daily: true,
    cadence: { mode: "rule", rule: "weekly:4" }, suggested_cents: 5000000,
    status: "Activa", created: "2026-09-14", notes: "", ...over,
  };
}

function meta(): FinMeta {
  return {
    types: ["gasto", "ingreso", "ahorro", "retiro"],
    type_labels: { gasto: "Gasto", ingreso: "Ingreso", ahorro: "Ahorro", retiro: "Retiro" },
    type_colours: { gasto: "#f4511e", ingreso: "#33b679", ahorro: "#039be5", retiro: "#e67c73" },
    goal_statuses: ["Activa"], currency: "COP",
    categories: [category()], goals: [goal()],
  };
}

function sidebar(): FinSidebar {
  return { pending: 0, month: { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0 }, general: 0, goals: [], total_saved: 0 };
}

function reset() {
  vi.clearAllMocks();
  useFinance.setState({
    view: "diario", meta: null, sidebar: null, loaded: false, version: 0,
    editing: null, goalId: null, goalEditing: null, categoryEditing: null,
    recurringEditing: null,
  });
  useApp.setState({ toasts: [] });
}

beforeEach(reset);

describe("load", () => {
  it("fills meta + sidebar and bumps version", async () => {
    apiMock.finMeta.mockResolvedValue(meta());
    apiMock.finSidebar.mockResolvedValue(sidebar());
    await useFinance.getState().load();
    const s = useFinance.getState();
    expect(s.meta?.currency).toBe("COP");
    expect(s.loaded).toBe(true);
    expect(s.version).toBe(1);
  });
  it("changed reloads through the same path", async () => {
    apiMock.finMeta.mockResolvedValue(meta());
    apiMock.finSidebar.mockResolvedValue(sidebar());
    await useFinance.getState().changed();
    expect(useFinance.getState().version).toBe(1);
    expect(apiMock.finMeta).toHaveBeenCalledTimes(1);
  });
  it("a failure toasts instead of throwing", async () => {
    apiMock.finMeta.mockRejectedValue(new Error("caído"));
    apiMock.finSidebar.mockResolvedValue(sidebar());
    await useFinance.getState().load();
    expect(useFinance.getState().loaded).toBe(false);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("caído");
  });
  it("runs recurrents on load", async () => {
    apiMock.finMeta.mockResolvedValue(meta());
    apiMock.finSidebar.mockResolvedValue(sidebar());
    apiMock.finRecurringRun.mockResolvedValue({ created: 2 });
    const { todayIso } = await import("../lib/tasks");
    await useFinance.getState().load();
    expect(apiMock.finRecurringRun).toHaveBeenCalledWith(todayIso());
    expect(useFinance.getState().loaded).toBe(true);
  });
  it("migrates legacy semanal/mensual/anual views to periodo", async () => {
    apiMock.finMeta.mockResolvedValue(meta());
    apiMock.finSidebar.mockResolvedValue(sidebar());
    apiMock.finRecurringRun.mockResolvedValue({ created: 0 });
    for (const legacy of ["semanal", "mensual", "anual"]) {
      useFinance.setState({ view: legacy as "diario", loaded: false });
      await useFinance.getState().load();
      expect(useFinance.getState().view).toBe("periodo");
    }
    useFinance.setState({ view: "diario", loaded: false });
    await useFinance.getState().load();
    expect(useFinance.getState().view).toBe("diario");
  });
});

describe("sync actions", () => {
  it("setView clears the open goal", () => {
    useFinance.setState({ view: "metas", goalId: "f1" });
    useFinance.getState().setView("diario");
    expect(useFinance.getState()).toMatchObject({ view: "diario", goalId: null });
  });
  it("edit/openGoal/setGoalEditing/setCategoryEditing", () => {
    const s = () => useFinance.getState();
    s().edit({ day: "2026-09-29", kind: "gasto" });
    expect(useFinance.getState().editing).toMatchObject({ day: "2026-09-29" });
    s().edit(null);
    expect(useFinance.getState().editing).toBeNull();
    s().openGoal("f1");
    expect(useFinance.getState()).toMatchObject({ goalId: "f1", view: "metas" });
    s().setGoalEditing("");
    s().setCategoryEditing({ id: "comida", kind: "gasto" });
    s().setRecurringEditing({ id: "" });
    expect(useFinance.getState()).toMatchObject({
      goalEditing: "", categoryEditing: { id: "comida", kind: "gasto" },
      recurringEditing: { id: "" },
    });
  });
});

describe("categoryOf/goalOf", () => {
  const m = meta();
  it("finds by id", () => {
    expect(categoryOf(m, "comida")?.name).toBe("Comida");
    expect(goalOf(m, "f1")?.name).toBe("Moto");
  });
  it("returns undefined for missing ids, null meta or no id", () => {
    expect(categoryOf(m, "zzz")).toBeUndefined();
    expect(goalOf(m, "zzz")).toBeUndefined();
    expect(categoryOf(null, "comida")).toBeUndefined();
    expect(goalOf(null, "f1")).toBeUndefined();
    expect(categoryOf(m, undefined)).toBeUndefined();
    expect(goalOf(m, undefined)).toBeUndefined();
  });
});
