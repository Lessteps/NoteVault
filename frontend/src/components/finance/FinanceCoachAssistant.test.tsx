// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const mockFinanceCoach = vi.hoisted(() => ({
  open: true,
  messages: [] as any[],
  busy: false,
  streamingId: null,
  conversationId: null,
  title: "",
  historyOpen: false,
  history: [],
  historyQuery: "",
  contextData: {
    currency: "$",
    monthLabel: "Octubre",
    monthTotals: { spent_cents: 4500000, income_cents: 12000000, saved_cents: 2000000, balance_cents: 5500000 },
    budget_cents: 8000000,
    categories: [],
    goals: [],
    recurrents: [],
  },
  model: "models/gemini-3.5-flash-lite",
  models: ["models/gemini-3.5-flash-lite"],
  providerLabel: "Google Gemini",
  awaitingPaste: false,
  setOpen: vi.fn(),
  ask: vi.fn(),
  stop: vi.fn(),
  pasteReply: vi.fn(),
  vote: vi.fn(),
  loadContext: vi.fn(),
  loadModels: vi.fn(),
  setModel: vi.fn(),
  setHistory: vi.fn(),
  setHistoryQuery: vi.fn(),
  refreshHistory: vi.fn(),
  newConversation: vi.fn(),
  openConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("../../store/financeCoach", () => ({
  useFinanceCoach: (selector: (s: any) => any) => selector(mockFinanceCoach),
}));

vi.mock("../../store/app", () => ({
  useApp: (selector: (s: any) => any) => selector({
    toast: vi.fn(),
    module: "finanzas",
  }),
}));

import { FinanceCoachAssistant } from "./FinanceCoachAssistant";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  container = null;
});

describe("FinanceCoachAssistant", () => {
  it("renderiza el encabezado del Asesor Financiero con sugerencias rápidas cuando está vacío", () => {
    act(() => {
      root?.render(<FinanceCoachAssistant />);
    });

    expect(container?.textContent).toContain("Asesor Financiero");
    expect(container?.textContent).toContain("Octubre");
    expect(container?.querySelector("button[title='Nueva conversación']")).not.toBeNull();
    expect(container?.textContent).toContain("¿Cómo viene mi ritmo de gasto este mes vs presupuesto?");
  });

  it("renderiza los mensajes del usuario y del coach con tarjetas de acción", () => {
    mockFinanceCoach.messages = [
      { id: "m1", role: "user", content: "Gasté 15000 en coto", at: 1000 },
      {
        id: "m2",
        role: "assistant",
        content: "Te preparé la confirmación para registrarlo:\n\n```finance-action\n{\n  \"action\": \"add_movement\",\n  \"movement\": {\"type\": \"gasto\", \"amount\": 15000, \"what\": \"Supermercado Coto\"}\n}\n```\n\nQuedó anotado.",
        at: 1005,
      },
    ];

    act(() => {
      root?.render(<FinanceCoachAssistant />);
    });

    expect(container?.textContent).toContain("Gasté 15000 en coto");
    expect(container?.textContent).toContain("Supermercado Coto");
    expect(container?.textContent).toContain("Registrar gasto");

    mockFinanceCoach.messages = [];
  });
});
