// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finAdd = vi.fn(async (_day: string, _fields: Record<string, unknown>) => ({}));
const finDiarioBundle = vi.fn(async (_day: string) => ({
  movements: [] as Array<Record<string, unknown>>,
  checks: [] as Array<Record<string, unknown>>,
  month: { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0 },
  budget: 0,
}));
const finMeta = vi.fn(async () => ({ categories: [], goals: [], types: ["gasto", "ingreso", "ahorro", "retiro"] }));
const finSidebar = vi.fn(async () => null);
const finBudgetSet = vi.fn(async (c: number) => ({ month_budget_cents: c }));

vi.mock("../../lib/bridge", () => ({
  api: {
    finDiarioBundle: (day: string) => finDiarioBundle(day),
    finAdd: (day: string, fields: Record<string, unknown>) => finAdd(day, fields),
    finMeta: () => finMeta(),
    finSidebar: () => finSidebar(),
    finBudgetSet: (c: number) => finBudgetSet(c),
  },
}));

import { todayIso } from "../../lib/tasks";
import { Diario } from "./Diario";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function setNative(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Diario />);
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

describe("Diario", () => {
  it("solo enseña Gastos y Ahorro: ni Balance ni Ingresos", async () => {
    await mount();
    const text = host!.textContent ?? "";
    expect(text).toContain("Gastos");
    expect(text).toContain("Ahorro");
    expect(text).not.toContain("Balance");
    expect(text).not.toContain("Ingresos");
  });

  it("el registro rápido guarda con el tipo elegido", async () => {
    await mount();
    const type = host!.querySelector('select[aria-label="Tipo rápido"]') as HTMLSelectElement;
    const amount = host!.querySelector('input[aria-label="Importe rápido"]') as HTMLInputElement;
    const what = host!.querySelector('input[placeholder="Detalle"]') as HTMLInputElement;
    const save = [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes("Guardar"))!;
    await act(async () => {
      setNative(type, "ingreso");
      await Promise.resolve();
    });
    await act(async () => {
      setNative(amount, "50000");
      setNative(what, "Salario");
      await Promise.resolve();
    });
    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(finAdd).toHaveBeenCalledOnce();
    expect(finAdd.mock.calls[0]![0]).toBe(todayIso());
    expect(finAdd.mock.calls[0]![1]).toMatchObject({ type: "ingreso", what: "Salario" });
  });

  it("el registro rápido por defecto sigue siendo gasto", async () => {
    await mount();
    const amount = host!.querySelector('input[aria-label="Importe rápido"]') as HTMLInputElement;
    const what = host!.querySelector('input[placeholder="Detalle"]') as HTMLInputElement;
    const save = [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes("Guardar"))!;
    await act(async () => {
      setNative(amount, "12500");
      setNative(what, "Café");
      await Promise.resolve();
    });
    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(finAdd).toHaveBeenCalledOnce();
    expect(finAdd.mock.calls[0]![1]).toMatchObject({ type: "gasto", what: "Café" });
  });

  it("carga todo el día en una sola llamada", async () => {
    await mount();
    expect(finDiarioBundle).toHaveBeenCalledWith(todayIso());
    expect(host!.textContent ?? "").toContain("Gastos");
  });

  it("muestra la barra del presupuesto cuando vas en 85 %", async () => {
    finDiarioBundle.mockResolvedValueOnce({
      movements: [],
      checks: [],
      month: { gasto: 425000000, ingreso: 0, ahorro: 0, retiro: 0, balance: -425000000 },
      budget: 500000000,
    });
    await mount();
    expect(host!.textContent ?? "").toContain("85 %");
  });

  it("sin presupuesto invita a definirlo y lo guarda", async () => {
    await mount();
    const define = [...host!.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Define tu presupuesto"))!;
    expect(define).toBeTruthy();
    await act(async () => {
      define.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const input = host!.querySelector('input[aria-label="Presupuesto mensual"]') as HTMLInputElement;
    await act(async () => {
      setNative(input, "5000000");
      await Promise.resolve();
    });
    const save = [...host!.querySelectorAll("button")].find((b) => b.textContent === "Guardar")!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(finBudgetSet).toHaveBeenCalledWith(500000000);
  });

  it("+ Nuevo abre el diálogo con el tipo del registro rápido", async () => {
    const { useFinance } = await import("../../store/finance");
    await mount();
    const type = host!.querySelector('select[aria-label="Tipo rápido"]') as HTMLSelectElement;
    await act(async () => {
      setNative(type, "ingreso");
      await Promise.resolve();
    });
    const add = [...host!.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Nuevo movimiento"))!;
    await act(async () => {
      add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(useFinance.getState().editing).toMatchObject({ kind: "ingreso" });
    expect(useFinance.getState().editing?.day).toBe(todayIso());
    expect("movement" in (useFinance.getState().editing ?? {})).toBe(false);
  });

  it("el total del día muestra gastos, no balance", async () => {
    finDiarioBundle.mockResolvedValueOnce({
      movements: [{
        id: "m1", type: "gasto", amount_cents: 1250000, currency: "COP",
        what: "Café", attachments: [], date: todayIso(),
      }],
      checks: [],
      month: { gasto: 1250000, ingreso: 0, ahorro: 0, retiro: 0, balance: -1250000 },
      budget: 0,
    });
    await mount();
    const text = host!.textContent ?? "";
    expect(text).toContain("GASTOS DEL DÍA");
    expect(text).not.toContain("TOTAL DEL DÍA");
  });
});
