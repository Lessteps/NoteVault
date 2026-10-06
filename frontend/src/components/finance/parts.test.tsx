// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useFinance } from "../../store/finance";
import type { Movement } from "../../lib/types";
import { MovementTable } from "./parts";
import { CategoryMatrix } from "./Sheets";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount(el: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(el);
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  useFinance.setState({ editing: null });
});

const mov = (over: Partial<Movement> = {}): Movement => ({
  id: "m1",
  type: "gasto",
  amount_cents: 1250000,
  currency: "COP",
  what: "Almuerzo",
  reason: "Trabajo",
  time: "13:00",
  attachments: [],
  date: "2026-10-06",
  ...over,
});

function clickRow(name: RegExp) {
  const b = [...host!.querySelectorAll("button")].find((x) => name.test(x.textContent ?? ""))!;
  expect(b).toBeTruthy();
  return act(async () => {
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("MovementTable", () => {
  it("cabecera de 4 columnas y detalle combinado", async () => {
    await mount(<MovementTable withDate rows={[{ kind: "data", m: mov() }]} />);
    const text = host!.textContent ?? "";
    expect(text).toContain("Fecha");
    expect(text).toContain("Detalle");
    expect(text).toContain("Categoría");
    expect(text).toContain("Importe");
    expect(text).not.toContain("Hora");
    expect(text).not.toContain("Razón");
    expect(text).toContain("Almuerzo — Trabajo");
  });

  it("clic despliega hora y tipo; Editar abre el diálogo", async () => {
    await mount(<MovementTable withDate rows={[{ kind: "data", m: mov() }]} />);
    expect(host!.textContent ?? "").not.toContain("13:00");
    await clickRow(/Almuerzo/);
    expect(host!.textContent ?? "").toContain("13:00");
    expect(host!.textContent ?? "").toContain("Gasto");
    await clickRow(/Almuerzo/);
    expect(host!.textContent ?? "").not.toContain("13:00");
    // Reabre y edita.
    await clickRow(/Almuerzo/);
    const edit = [...host!.querySelectorAll("button")].find((x) => x.textContent === "Editar")!;
    await act(async () => {
      edit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(useFinance.getState().editing?.movement?.id).toBe("m1");
  });

  it("Duplicar abre el formulario con copia para hoy", async () => {
    const { todayIso } = await import("../../lib/tasks");
    await mount(<MovementTable withDate rows={[{ kind: "data", m: mov() }]} />);
    await clickRow(/Almuerzo/);
    const dup = [...host!.querySelectorAll("button")].find((x) => x.textContent === "Duplicar")!;
    await act(async () => {
      dup.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const editing = useFinance.getState().editing;
    expect(editing?.movement).toBeUndefined();
    expect(editing?.day).toBe(todayIso());
    expect(editing?.preset).toMatchObject({ type: "gasto", amount_cents: 1250000, what: "Almuerzo" });
  });
});

describe("CategoryMatrix", () => {
  it("incluye gastos e ingresos por separado", async () => {
    const cats = [{ id: "c1", name: "Comida", icon: "🍔", colour: "#fff", kind: "gasto", budget_month_cents: 0, order: 0, archived: false }];
    await mount(
      <CategoryMatrix
        list={[mov({ category: "c1" }), mov({ id: "m2", type: "ingreso", amount_cents: 5000000, category: "c1", what: "Salario", reason: "" })]}
        columns={[["2026-10-06", "6"]]}
        keyOf={(m) => m.date}
        cats={cats as never}
      />,
    );
    const text = host!.textContent ?? "";
    expect(text).toContain("Gasto");
    expect(text).toContain("Ingreso");
    expect(text).not.toContain("Sin movimientos");
    expect(text).toContain("62.500");
  });
});
