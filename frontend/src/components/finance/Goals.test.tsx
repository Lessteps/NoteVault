// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finGoalSave = vi.fn(async (_id: string, _g: unknown) => ({}));

vi.mock("../../lib/bridge", () => ({
  api: {
    finGoalSave: (id: string, g: unknown) => finGoalSave(id, g),
    finMeta: async () => ({ categories: [], goals: [], types: ["gasto", "ingreso", "ahorro", "retiro"] }),
    finSidebar: async () => null,
  },
}));

import { daysBetween } from "../../lib/habits";
import { todayIso } from "../../lib/tasks";
import { useFinance } from "../../store/finance";
import { FinGoalDialog, suggestedFor } from "./Goals";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function setNative(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setDate(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function mountNew() {
  useFinance.setState({ goalEditing: "" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FinGoalDialog />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function click(name: string) {
  const b = [...host!.querySelectorAll("button")].find((x) => x.textContent === name)!;
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
  useFinance.setState({ goalEditing: null });
});

describe("suggestedFor", () => {
  it("reparte lo que falta entre los días hasta el límite", () => {
    expect(suggestedFor(300000, "2026-10-06", "2026-10-16")).toBe(27273);
    expect(suggestedFor(0, "2026-10-06", "2026-10-16")).toBeNull();
    expect(suggestedFor(300000, "2026-10-06", "")).toBeNull();
  });
});

describe("FinGoalDialog wizard", () => {
  it("paso 1 exige nombre y objetivo antes de avanzar", async () => {
    await mountNew();
    expect(host!.textContent ?? "").toContain("Paso 1 de 2");
    await click("Siguiente");
    // Sin nombre no avanza.
    expect(host!.textContent ?? "").toContain("Paso 1 de 2");
    const name = host!.querySelector('input[placeholder="p. ej. Moto"]') as HTMLInputElement;
    const target = host!.querySelector('input[aria-label="Objetivo"]') as HTMLInputElement;
    await act(async () => {
      setNative(name, "Moto");
      setNative(target, "5000000");
      await Promise.resolve();
    });
    await click("Siguiente");
    expect(host!.textContent ?? "").toContain("Paso 2 de 2");
    expect(host!.textContent ?? "").toContain("Fecha límite");
  });

  it("calcula el aporte desde el deadline y lo guarda", async () => {
    await mountNew();
    const name = host!.querySelector('input[placeholder="p. ej. Moto"]') as HTMLInputElement;
    const target = host!.querySelector('input[aria-label="Objetivo"]') as HTMLInputElement;
    await act(async () => {
      setNative(name, "Moto");
      setNative(target, "5000000");
      await Promise.resolve();
    });
    await click("Siguiente");
    const deadline = host!.querySelector('input[aria-label="Fecha límite"]') as HTMLInputElement;
    await act(async () => {
      setDate(deadline, "2026-11-05");
      await Promise.resolve();
    });
    expect(host!.textContent ?? "").toContain("Calculado del objetivo");
    await click("Crear meta");
    expect(finGoalSave).toHaveBeenCalledOnce();
    const targetCents = 500000000;
    const days = Math.max(1, daysBetween(todayIso(), "2026-11-05").length);
    expect(finGoalSave.mock.calls[0]![0]).toBe("");
    expect(finGoalSave.mock.calls[0]![1]).toMatchObject({
      name: "Moto",
      target_cents: targetCents,
      suggested_cents: Math.ceil(targetCents / days),
      status: "Activa",
    });
  });
});
