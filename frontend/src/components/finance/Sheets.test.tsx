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

import { monthlySigned, Sheet } from "./Sheets";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Sheet />);
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
    finRecurringList.mockResolvedValueOnce([rec("")]);
    await mount();
    await click("Año");
    expect(host!.textContent ?? "").toContain("800.000");
    expect(host!.textContent ?? "").toContain("Proyección 3 meses");
  });

  it("un recurrente terminado no proyecta", async () => {
    finRecurringList.mockResolvedValueOnce([{
      id: "rc1", type: "gasto", amount_cents: 80000000, what: "Arriendo", category: "", goal: "",
      rule: "monthly:1", start: "2020-01-01", end: "2020-06-01", archived: false, last: "",
    }]);
    await mount();
    await click("Año");
    expect(host!.textContent ?? "").not.toContain("800.000");
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
