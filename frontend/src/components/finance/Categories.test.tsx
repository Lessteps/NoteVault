// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finCategorySave = vi.fn(async (_id: string, _f: unknown) => ({}));

vi.mock("../../lib/bridge", () => ({
  api: {
    finMonthExtras: async () => ({ budgets: [] }),
    finRange: async () => [],
    finCategorySave: (id: string, f: unknown) => finCategorySave(id, f),
    finMeta: async () => ({ categories: [], goals: [], types: ["gasto", "ingreso", "ahorro", "retiro"] }),
    finSidebar: async () => null,
    finRecurringRun: async () => ({ created: 0 }),
  },
}));

import { useFinance } from "../../store/finance";
import { Categories, CategoryDialog } from "./Categories";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount() {
  useFinance.setState({ categoryEditing: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<><Categories /><CategoryDialog /></>);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setNative(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function click(name: string) {
  const b = [...host!.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === name)!;
  expect(b, name).toBeTruthy();
  return act(async () => {
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
  useFinance.setState({ categoryEditing: null });
});

describe("Categories", () => {
  it("un solo botón Nueva categoría (sin duplicado de ingreso)", async () => {
    await mount();
    const labels = [...host!.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
    expect(labels).toContain("Nueva categoría");
    expect(labels.some((l) => l.includes("ingreso"))).toBe(false);
  });

  it("el diálogo elige tipo y guarda una categoría de ingreso", async () => {
    await mount();
    await click("Nueva categoría");
    const income = [...host!.querySelectorAll("button")].find((x) => x.textContent === "Ingreso")!;
    await act(async () => {
      income.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const name = host!.querySelector('input[placeholder="p. ej. Mascotas"]') as HTMLInputElement;
    await act(async () => {
      setNative(name, "Salario");
      await Promise.resolve();
    });
    await click("Guardar");
    expect(finCategorySave).toHaveBeenCalledOnce();
    expect(finCategorySave.mock.calls[0]![0]).toBe("");
    expect(finCategorySave.mock.calls[0]![1]).toMatchObject({ kind: "ingreso", name: "Salario" });
  });
});
