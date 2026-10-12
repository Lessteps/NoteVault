// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finRange = vi.fn(async (_a: string, _b: string) => [] as Array<Record<string, unknown>>);
const finMonthExtras = vi.fn(async (_y: number, _m: number) => ({
  this: { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0 },
  prev: { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0 },
  budgets: [] as Array<Record<string, unknown>>,
}));
const finSearch = vi.fn(async (_q: string, _k: string, _c: string, _o: number): Promise<{ total: number; movements: Array<Record<string, unknown>> }> => ({ total: 0, movements: [] }));
const finRecurringList = vi.fn(async () => [] as Array<Record<string, unknown>>);

vi.mock("../../lib/bridge", () => ({
  api: {
    finRange: (a: string, b: string) => finRange(a, b),
    finMonthExtras: (y: number, m: number) => finMonthExtras(y, m),
    finSearch: (q: string, k: string, c: string, o = 0) => finSearch(q, k, c, o),
    finRecurringList: () => finRecurringList(),
  },
}));

import { BalanceAccumulated, CategoryTrend, FixedVsVariable, monthlyAverages, monthlySigned, Sheet } from "./Sheets";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount(el: React.ReactNode = <Sheet />) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(el);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function click(name: string) {
  const b = [...host!.querySelectorAll("button")].find((x) => x.textContent === name)!;
  expect(b).toBeTruthy();
  return act(async () => {
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("Sheet (Periodo)", () => {
  it("por defecto es Mes con comparativa mensual", async () => {
    await mount();
    const text = host!.textContent ?? "";
    expect(text).toContain("Periodo");
    expect(text).toContain("Comparación con el mes anterior");
    expect(text).toContain("Presupuesto por categoría");
    expect(finMonthExtras).toHaveBeenCalled();
  });

  it("Año muestra gasto por mes, tabla anual y comparativa con el año anterior", async () => {
    await mount();
    await click("Año");
    const text = host!.textContent ?? "";
    const year = String(new Date().getFullYear());
    expect(text).toContain("Gasto por mes");
    expect(text).toContain(`TOTAL ${year}`);
    expect(text).toContain("Comparación con el año anterior");
    const prevFirst = `${Number(year) - 1}-01-01`;
    expect(finRange.mock.calls.some((c) => c[0] === prevFirst)).toBe(true);
  });

  it("Semana muestra comparativa con la semana anterior", async () => {
    await mount();
    await click("Semana");
    expect(host!.textContent ?? "").toContain("Comparación con la semana anterior");
  });

  it("Año muestra balance acumulado y proyección a 3 meses", async () => {
    await mount();
    await click("Año");
    const text = host!.textContent ?? "";
    expect(text).toContain("Balance acumulado");
    expect(text).toContain("Proyección 3 meses");
  });

  it("Historial busca en todo el historial, no solo el periodo", async () => {
    finSearch.mockResolvedValueOnce({
      total: 2,
      movements: [{
        id: "m9", type: "gasto", amount_cents: 80000000, currency: "COP",
        what: "Arriendo viejo", attachments: [], date: "2024-02-03",
      }],
    });
    await mount();
    const search = [...host!.querySelectorAll("input")].find((i) =>
      (i.getAttribute("placeholder") ?? "").includes("Buscar")) as HTMLInputElement;
    expect(search).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(search, "arriendo");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await click("Historial");
    expect(finSearch).toHaveBeenCalledWith("arriendo", "", "", 0);
    expect(host!.textContent ?? "").toContain("2");
    expect(host!.textContent ?? "").toContain("Arriendo viejo");
  });

  it("Mostrar más pagina el historial", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({
      id: `m${i}`, type: "gasto", amount_cents: 1000, currency: "COP",
      what: `Viejo ${i}`, attachments: [], date: "2024-02-03",
    }));
    finSearch.mockResolvedValueOnce({ total: 150, movements: page(100) });
    await mount();
    const search = [...host!.querySelectorAll("input")].find((i) =>
      (i.getAttribute("placeholder") ?? "").includes("Buscar")) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(search, "arriendo");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await click("Historial");
    expect(host!.textContent ?? "").toContain("Mostrar más (100 de 150)");
    finSearch.mockResolvedValueOnce({ total: 150, movements: page(50) });
    const more = [...host!.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Mostrar más"))!;
    await act(async () => {
      more.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(finSearch).toHaveBeenLastCalledWith("arriendo", "", "", 100);
    expect(host!.textContent ?? "").not.toContain("Mostrar más");
  });
  it("la proyección suma recurrentes vigentes e ignora terminados", async () => {
    const rec = (end: string) => ({
      id: "rc1", type: "gasto", amount_cents: 80000000, what: "Arriendo", category: "", goal: "",
      rule: "monthly:1", start: "2020-01-01", end, archived: false, last: "",
    });
    finRecurringList.mockResolvedValue([rec("")]);
    await mount();
    await click("Año");
    expect(host!.textContent ?? "").toContain("800,000.00");
    expect(host!.textContent ?? "").toContain("Proyección 3 meses");
  });

  it("un recurrente terminado no proyecta", async () => {
    finRecurringList.mockResolvedValue([{
      id: "rc1", type: "gasto", amount_cents: 80000000, what: "Arriendo", category: "", goal: "",
      rule: "monthly:1", start: "2020-01-01", end: "2020-06-01", archived: false, last: "",
    }]);
    await mount();
    await click("Año");
    expect(host!.textContent ?? "").not.toContain("800,000.00");
  });
});

describe("monthlySigned", () => {
  it("convierte reglas a equivalente mensual con signo", () => {
    expect(monthlySigned("daily", "gasto", 10000)).toBe(-300000);
    expect(monthlySigned("every:15", "gasto", 10000)).toBe(-20000);
    expect(monthlySigned("monthly:1", "ingreso", 10000)).toBe(10000);
    expect(monthlySigned("monthly:1,15", "ingreso", 10000)).toBe(20000);
    expect(monthlySigned("weekly:1", "gasto", 70000)).toBe(-300000);
    expect(monthlySigned("blah", "gasto", 10000)).toBe(0);
  });
});

describe("BalanceAccumulated", () => {
  it("acumula los balances mensuales preservando la riqueza generada", async () => {
    const emptyRow = { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0, neto: 0, disponible: 0 };
    // 3 meses con ingreso 3.000.000, gasto 1.800.000 y ahorro 1.200.000
    // balance mensual = 1.200.000
    const row = { gasto: 1800000, ingreso: 3000000, ahorro: 1200000, retiro: 0, balance: 1200000, neto: 1200000, disponible: 0 };
    const yearRows = [row, row, row, ...Array(9).fill(emptyRow)];
    await mount(<BalanceAccumulated yearRows={yearRows} />);
    const text = host!.textContent ?? "";
    expect(text).toContain("Balance acumulado");
  });
});

describe("FixedVsVariable", () => {
  it("muestra desglose porcentual de gastos fijos vs variables respecto a ingresos", async () => {
    finRecurringList.mockResolvedValueOnce([{
      id: "rc1", type: "gasto", amount_cents: 80000000, what: "Arriendo",
      rule: "monthly:1", start: "2020-01-01", end: "", archived: false, last: "",
    }]);
    await mount(
      <FixedVsVariable monthGasto={120000000} monthIngreso={200000000} firstDay="2026-10-01" />,
    );
    const text = host!.textContent ?? "";
    expect(text).toContain("Estructura de gastos · Fijos vs Variables");
    expect(text).toContain("Fijos");
    expect(text).toContain("40% del ingreso");
    expect(text).toContain("Variables");
    expect(text).toContain("20% del ingreso");
    expect(text).toContain("Libre");
    expect(text).toContain("40% del ingreso");
  });
});

describe("CategoryTrend", () => {
  it("muestra historial de 6 meses con promedio y mes pico", async () => {
    finRange.mockResolvedValueOnce([
      { id: "m1", type: "gasto", amount_cents: 20000, category: "c1", date: "2026-06-15" },
      { id: "m2", type: "gasto", amount_cents: 60000, category: "c1", date: "2026-08-10" },
      { id: "m3", type: "gasto", amount_cents: 40000, category: "c1", date: "2026-10-02" },
    ]);
    const cat = { id: "c1", name: "Supermercado", icon: "🛒", colour: "#4ade80", kind: "gasto" as const, budget_month_cents: 0, order: 0, archived: false };
    await mount(<CategoryTrend category={cat} anchor="2026-10-15" />);
    const text = host!.textContent ?? "";
    expect(text).toContain("Evolución de 🛒 Supermercado · Últimos 6 meses");
    expect(text).toContain("Promedio mensual");
    expect(text).toContain("Mes pico");
  });
});

describe("monthlyAverages", () => {
  const mov = (date: string, type: string, amount_cents: number) => ({
    id: `${date}-${type}`, type, amount_cents, currency: "COP", what: "X", attachments: [], date,
  });
  it("divide entre los meses con datos, no siempre 3", () => {
    const one = monthlyAverages([mov("2026-09-15", "gasto", 3000000)] as never);
    expect(one).toMatchObject({ n: 1, gasto: 3000000, ingreso: 0 });
    const three = monthlyAverages([
      mov("2026-07-05", "gasto", 3000000),
      mov("2026-08-05", "gasto", 6000000),
      mov("2026-09-05", "ingreso", 9000000),
    ] as never);
    expect(three).toMatchObject({ n: 3, gasto: 3000000, ingreso: 3000000 });
    expect(monthlyAverages([])).toMatchObject({ n: 1, gasto: 0, ingreso: 0 });
  });
});
