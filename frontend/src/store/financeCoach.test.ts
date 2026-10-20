import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  finCoachContext: vi.fn(),
  finCoachConversations: vi.fn(),
  finCoachConversationGet: vi.fn(),
  finCoachConversationSave: vi.fn(),
  finCoachConversationRename: vi.fn(),
  finCoachConversationDelete: vi.fn(),
  finCoachAiTitle: vi.fn(),
  finCoachChatStream: vi.fn(),
  finCoachChatCancel: vi.fn(),
  aiSettings: vi.fn(),
  aiSettingsSave: vi.fn(),
  aiModels: vi.fn(),
  onAiStream: vi.fn(() => () => {}),
}));

vi.mock("../lib/bridge", () => ({
  api: mockApi,
}));

import { useFinanceCoach } from "./financeCoach.js";

beforeEach(() => {
  vi.clearAllMocks();
  useFinanceCoach.setState({
    messages: [],
    busy: false,
    streamingId: null,
    conversationId: null,
    title: "",
    history: [],
    historyOpen: false,
  });
});

describe("useFinanceCoach store", () => {
  it("inicia con estado limpio para una nueva conversación", () => {
    const s = useFinanceCoach.getState();
    expect(s.messages).toEqual([]);
    expect(s.busy).toBe(false);
    expect(s.conversationId).toBeNull();
  });

  it("crea una nueva conversación limpiando mensajes y título", () => {
    useFinanceCoach.setState({
      conversationId: "c123",
      title: "Presupuesto de septiembre",
      messages: [{ id: "m1", role: "user", content: "hola", at: 1 }],
    });

    useFinanceCoach.getState().newConversation();

    const s = useFinanceCoach.getState();
    expect(s.conversationId).toBeNull();
    expect(s.title).toBe("");
    expect(s.messages).toEqual([]);
  });

  it("carga el contexto financiero llamando al bridge", async () => {
    mockApi.finCoachContext.mockResolvedValueOnce({
      currency: "$",
      monthLabel: "Octubre",
      monthTotals: { spent_cents: 200000, income_cents: 800000, saved_cents: 100000, balance_cents: 500000 },
      budget_cents: 500000,
      categories: [],
      goals: [],
      recurrents: [],
    });

    await useFinanceCoach.getState().loadContext();

    const s = useFinanceCoach.getState();
    expect(s.contextData?.monthLabel).toBe("Octubre");
    expect(s.contextData?.currency).toBe("$");
    expect(s.contextData?.budget_cents).toBe(500000);
  });

  it("refresca el historial de conversaciones del coach de finanzas de forma aislada", async () => {
    mockApi.finCoachConversations.mockResolvedValueOnce([
      { id: "c1", title: "Ahorro en salidas", created_at: "2026-10-01", updated_at: "2026-10-01", count: 4, model: "gemini" },
    ]);

    await useFinanceCoach.getState().refreshHistory();

    const s = useFinanceCoach.getState();
    expect(s.history.length).toBe(1);
    expect(s.history[0]?.title).toBe("Ahorro en salidas");
  });
});
