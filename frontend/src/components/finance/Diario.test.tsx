// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finAdd = vi.fn(async (_day: string, _fields: Record<string, unknown>) => ({}));
const finMeta = vi.fn(async () => ({ categories: [], goals: [], types: ["gasto", "ingreso", "ahorro", "retiro"] }));
const finSidebar = vi.fn(async () => null);

vi.mock("../../lib/bridge", () => ({
  api: {
    finRange: async () => [],
    finDueChecks: async () => [],
    finAdd: (day: string, fields: Record<string, unknown>) => finAdd(day, fields),
    finMeta: () => finMeta(),
    finSidebar: () => finSidebar(),
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
    const what = host!.querySelector('input[placeholder="En qué"]') as HTMLInputElement;
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
    const what = host!.querySelector('input[placeholder="En qué"]') as HTMLInputElement;
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
});
