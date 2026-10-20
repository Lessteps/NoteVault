// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FinanceAction } from "../../lib/financeCoachActions";

const mockApi = vi.hoisted(() => ({
  finAdd: vi.fn().mockResolvedValue({ id: "mv1" }),
  finBudgetSet: vi.fn().mockResolvedValue({ budget: 8000000 }),
  finCategorySave: vi.fn().mockResolvedValue({ id: "cat2", name: "Comida" }),
  finGoals: vi.fn().mockResolvedValue({ goals: [{ id: "g1", name: "Fondo de emergencia" }] }),
  finDelete: vi.fn().mockResolvedValue({ ok: true }),
  finRange: vi.fn().mockResolvedValue([{ id: "mv99", what: "Cena restaurante", amount_cents: 1800000 }]),
  finRecurringSave: vi.fn().mockResolvedValue({ id: "rc1" }),
}));

const mockChanged = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockToast = vi.hoisted(() => vi.fn());

vi.mock("../../lib/bridge", () => ({
  api: mockApi,
}));

vi.mock("../../store/finance", () => ({
  useFinance: Object.assign(
    (selector: (s: any) => any) => selector({ meta: { categories: [{ id: "cat1", name: "Supermercado" }] }, changed: mockChanged }),
    { getState: () => ({ changed: mockChanged, meta: { categories: [{ id: "cat1", name: "Supermercado" }] } }) },
  ),
}));

vi.mock("../../store/app", () => ({
  useApp: Object.assign(
    (selector: (s: any) => any) => selector({ toast: mockToast }),
    { getState: () => ({ toast: mockToast }) },
  ),
}));

import { FinanceActionCard } from "./FinanceActionCard";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("FinanceActionCard", () => {
  it("renderiza y ejecuta la acción add_movement para registrar gasto", async () => {
    const action: FinanceAction = {
      action: "add_movement",
      movement: {
        type: "gasto",
        amount: 15000,
        what: "Compras semanales",
        category: "Supermercado",
        date: "2026-10-13",
      },
    };

    await act(async () => {
      root.render(<FinanceActionCard action={action} />);
    });

    expect(host.textContent).toContain("Compras semanales");
    expect(host.textContent).toContain("Supermercado");

    const regBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Registrar"));
    expect(regBtn).toBeDefined();

    await act(async () => {
      regBtn?.click();
    });

    expect(mockApi.finAdd).toHaveBeenCalledWith("2026-10-13", expect.objectContaining({
      type: "gasto",
      amount_cents: 1500000,
      what: "Compras semanales",
      category: "cat1",
    }));
    expect(mockChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Registrado en tu Diario");
  });

  it("renderiza y ejecuta la acción set_budget para actualizar presupuesto", async () => {
    const action: FinanceAction = {
      action: "set_budget",
      budget: 85000,
    };

    await act(async () => {
      root.render(<FinanceActionCard action={action} />);
    });

    expect(host.textContent).toContain("Ajuste de Presupuesto Mensual");

    const budgetBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Establecer presupuesto"));
    expect(budgetBtn).toBeDefined();

    await act(async () => {
      budgetBtn?.click();
    });

    expect(mockApi.finBudgetSet).toHaveBeenCalledWith(8500000);
    expect(mockChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Presupuesto guardado");
  });

  it("renderiza y ejecuta la acción create_category para crear una nueva categoría", async () => {
    const action: FinanceAction = {
      action: "create_category",
      category: {
        name: "Comida y Super",
        kind: "gasto",
        icon: "🛒",
        budget: 60000,
      },
    };

    await act(async () => {
      root.render(<FinanceActionCard action={action} />);
    });

    expect(host.textContent).toContain("Nueva Categoría de Gasto");
    expect(host.textContent).toContain("Comida y Super");
    expect(host.textContent).toContain("🛒");

    const createBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Crear categoría"));
    expect(createBtn).toBeDefined();

    await act(async () => {
      createBtn?.click();
    });

    expect(mockApi.finCategorySave).toHaveBeenCalledWith("", expect.objectContaining({
      name: "Comida y Super",
      kind: "gasto",
      icon: "🛒",
      budget_month_cents: 6000000,
    }));
    expect(mockChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Categoría creada");
  });

  it("renderiza y ejecuta la acción add_saving para aportar a meta", async () => {
    const action: FinanceAction = {
      action: "add_saving",
      saving: {
        goal_name: "Fondo de emergencia",
        amount: 25000,
        date: "2026-10-14",
      },
    };

    await act(async () => {
      root.render(<FinanceActionCard action={action} />);
    });

    expect(host.textContent).toContain("Aporte a Meta de Ahorro");
    expect(host.textContent).toContain("Fondo de emergencia");

    const saveBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Aportar"));
    expect(saveBtn).toBeDefined();

    await act(async () => {
      saveBtn?.click();
    });

    expect(mockApi.finAdd).toHaveBeenCalledWith("2026-10-14", expect.objectContaining({
      type: "ahorro",
      amount_cents: 2500000,
      goal: "g1",
    }));
    expect(mockChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Ahorro registrado");
  });

  it("renderiza y ejecuta la acción remove_movement para borrar un gasto", async () => {
    const action: FinanceAction = {
      action: "remove_movement",
      movement: {
        what: "Cena restaurante",
        amount: 18000,
        day: "2026-10-13",
      },
    };

    await act(async () => {
      root.render(<FinanceActionCard action={action} />);
    });

    expect(host.textContent).toContain("Eliminar Movimiento del Diario");
    expect(host.textContent).toContain("Cena restaurante");

    const deleteBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Eliminar de mi Diario"));
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      deleteBtn?.click();
    });

    expect(mockApi.finDelete).toHaveBeenCalledWith("2026-10-13", "mv99");
    expect(mockChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Movimiento eliminado");
  });

  it("renderiza y ejecuta la acción create_recurring para programar suscripción", async () => {
    const action: FinanceAction = {
      action: "create_recurring",
      recurring: {
        what: "Spotify Premium",
        amount: 4500,
        type: "gasto",
        frequency: "mensual",
      },
    };

    await act(async () => {
      root.render(<FinanceActionCard action={action} />);
    });

    expect(host.textContent).toContain("Programar Recurrente");
    expect(host.textContent).toContain("Spotify Premium");

    const progBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Programar"));
    expect(progBtn).toBeDefined();

    await act(async () => {
      progBtn?.click();
    });

    expect(mockApi.finRecurringSave).toHaveBeenCalledWith("", expect.objectContaining({
      type: "gasto",
      amount_cents: 450000,
      what: "Spotify Premium",
      rule: "monthly",
    }));
    expect(mockChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Recurrente programado");
  });
});
