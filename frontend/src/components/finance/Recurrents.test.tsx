// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finRecurringList = vi.fn(async () => [] as Array<Record<string, unknown>>);
const finRecurringSave = vi.fn(async (_id: string, _f: unknown) => ({}));
const finRecurringDelete = vi.fn(async (_id: string) => ({ ok: true }));

vi.mock("../../lib/bridge", () => ({
  api: {
    finRecurringList: () => finRecurringList(),
    finRecurringSave: (id: string, f: unknown) => finRecurringSave(id, f),
    finRecurringDelete: (id: string) => finRecurringDelete(id),
    finRecurringRun: async () => ({ created: 0 }),
    finMeta: async () => ({ categories: [], goals: [], types: ["gasto", "ingreso", "ahorro", "retiro"] }),
    finSidebar: async () => null,
  },
}));

import { useFinance } from "../../store/finance";
import { Recurrents, RecurringDialog, nextDates, ruleText } from "./Recurrents";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount() {
  useFinance.setState({ recurringEditing: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<><Recurrents /><RecurringDialog /></>);
    await Promise.resolve();
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
  finRecurringList.mockResolvedValue([]);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  useFinance.setState({ recurringEditing: null });
});

describe("ruleText", () => {
  it("describe reglas en cristiano", () => {
    expect(ruleText("daily")).toBe("Todos los días");
    expect(ruleText("monthly:1")).toContain("mes");
    expect(ruleText("every:15")).toContain("15");
  });
});

describe("nextDates", () => {
  it("previsualiza las próximas fechas de la regla", async () => {
    const { todayIso } = await import("../../lib/tasks");
    const { addDays } = await import("../../lib/habits");
    const today = todayIso();
    expect(nextDates("daily", today)).toEqual([today, addDays(today, 1), addDays(today, 2)]);
    const monthly = nextDates("monthly:1", today);
    expect(monthly).toHaveLength(3);
    expect(monthly.every((d) => d.slice(8) === "01")).toBe(true);
    expect(nextDates("blah", today)).toEqual([]);
  });
});

describe("Recurrents", () => {
  it("lista lo que se repite", async () => {
    finRecurringList.mockResolvedValueOnce([{
      id: "rc1", type: "gasto", amount_cents: 800000, what: "Arriendo", category: "", goal: "",
      rule: "monthly:1", start: "2026-10-01", end: "", archived: false, last: "",
    }]);
    await mount();
    expect(host!.textContent ?? "").toContain("Arriendo");
    expect(host!.textContent ?? "").toContain("mes");
  });

  it("crear guarda con tipo e importe", async () => {
    await mount();
    await click("Nuevo recurrente");
    const amount = host!.querySelector('input[aria-label="Importe"]') as HTMLInputElement;
    const what = host!.querySelector('input[placeholder="p. ej. Arriendo"]') as HTMLInputElement;
    await act(async () => {
      setNative(amount, "800000");
      setNative(what, "Arriendo");
      await Promise.resolve();
    });
    await click("Guardar");
    expect(finRecurringSave).toHaveBeenCalledOnce();
    expect(finRecurringSave.mock.calls[0]![0]).toBe("");
    expect(finRecurringSave.mock.calls[0]![1]).toMatchObject({ type: "gasto", what: "Arriendo" });
  });
});
