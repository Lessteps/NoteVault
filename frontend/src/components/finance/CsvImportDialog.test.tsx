// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finImportBatch = vi.fn(async (_items: unknown) => ({ imported: 2, movements: [] }));
const finRulesGet = vi.fn(async () => ({ rules: [] }));
const finRulesSave = vi.fn(async (fields: unknown) => ({ id: "r1", ...(fields as object) }));
const finFindDuplicates = vi.fn(async (_candidates: unknown) => ({ duplicates: [] }));

vi.mock("../../lib/bridge", () => ({
  api: {
    finImportBatch: (items: unknown) => finImportBatch(items),
    finRulesGet: () => finRulesGet(),
    finRulesSave: (fields: unknown) => finRulesSave(fields),
    finFindDuplicates: (candidates: unknown) => finFindDuplicates(candidates),
    finMeta: async () => ({
      categories: [
        { id: "comida", name: "Alimentación", kind: "gasto", icon: "🍔", budget_month_cents: 0, order: 0, archived: false },
        { id: "sueldo", name: "Sueldo", kind: "ingreso", icon: "💰", budget_month_cents: 0, order: 0, archived: false },
      ],
      goals: [],
      types: ["gasto", "ingreso", "ahorro", "retiro"],
      type_labels: { gasto: "Gasto", ingreso: "Ingreso", ahorro: "Ahorro", retiro: "Retiro" },
      type_colours: { gasto: "#f2555a", ingreso: "#4ade80", ahorro: "#eab308", retiro: "#ff9632" },
      goal_statuses: [],
      currency: "USD",
    }),
    finSidebar: async () => null,
  },
}));

import { useFinance } from "../../store/finance";
import { CsvImportDialog } from "./CsvImportDialog";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("CsvImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinance.setState({
      meta: {
        categories: [
          { id: "comida", name: "Alimentación", kind: "gasto", icon: "🍔", colour: "#f2555a", budget_month_cents: 0, order: 0, archived: false },
          { id: "sueldo", name: "Sueldo", kind: "ingreso", icon: "💰", colour: "#4ade80", budget_month_cents: 0, order: 0, archived: false },
        ],
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

  it("renders drag and drop upload zone when open with no file", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<CsvImportDialog isOpen={true} onClose={() => {}} />);
    });

    expect(host.textContent).toContain("Importar extracto bancario (CSV)");
    expect(host.textContent).toContain("Arrastra tu extracto bancario (.csv)");
    expect(host.textContent).toContain("Seleccionar archivo local");
  });

  it("does not render when isOpen is false", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<CsvImportDialog isOpen={false} onClose={() => {}} />);
    });

    expect(host.innerHTML).toBe("");
  });
});
