// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finExportAll = vi.fn(async () => ({
  movements: [
    { id: "m1", date: "2026-10-01", type: "gasto", amount_cents: 5000, what: "Café" },
    { id: "m2", date: "2026-10-02", type: "ingreso", amount_cents: 200000, what: "Sueldo" },
  ],
  categories: [{ id: "cat1", name: "Alimentación", kind: "gasto", budget_month_cents: 0 }],
  goals: [],
  currency: "USD",
  total_count: 2,
}));

vi.mock("../../lib/bridge", () => ({
  api: {
    finExportAll: () => finExportAll(),
    saveTextAs: vi.fn(async () => ({ ok: true, path: "/tmp/test.csv" })),
    finMeta: async () => ({
      categories: [],
      goals: [],
      types: ["gasto", "ingreso", "ahorro", "retiro"],
      currency: "USD",
    }),
  },
}));

import { useFinance } from "../../store/finance";
import { ExportDialog } from "./ExportDialog";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinance.setState({
      meta: {
        categories: [],
        goals: [],
        types: ["gasto", "ingreso", "ahorro", "retiro"],
        type_labels: { gasto: "Gasto", ingreso: "Ingreso", ahorro: "Ahorro", retiro: "Retiro" },
        type_colours: { gasto: "#f2555a", ingreso: "#4ade80", ahorro: "#eab308", retiro: "#ff9632" },
        goal_statuses: [],
        currency: "USD",
      },
    });
  });

  afterEach(() => {
    if (root && host) {
      act(() => {
        root!.unmount();
      });
      host.remove();
    }
    host = null;
    root = null;
  });

  it("renders export options and formats when open", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<ExportDialog isOpen={true} onClose={() => {}} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain("Exportación y Reportes de Finanzas");
    expect(host.textContent).toContain("Mes actual");
    expect(host.textContent).toContain("Año completo");
    expect(host.textContent).toContain("Todo el Vault");
    expect(host.textContent).toContain("Descargar CSV");
    expect(host.textContent).toContain("Descargar JSON");
  });

  it("does not render when isOpen is false", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<ExportDialog isOpen={false} onClose={() => {}} />);
    });

    expect(host.innerHTML).toBe("");
  });
});
