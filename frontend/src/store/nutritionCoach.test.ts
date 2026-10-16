import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  nutriCoachContext: vi.fn(),
  nutriCoachConversations: vi.fn(),
  nutriCoachConversationGet: vi.fn(),
  nutriCoachConversationSave: vi.fn(),
  nutriCoachConversationRename: vi.fn(),
  nutriCoachConversationDelete: vi.fn(),
  nutriCoachAiTitle: vi.fn(),
  nutriCoachChatStream: vi.fn(),
  nutriCoachChatCancel: vi.fn(),
  aiSettings: vi.fn(),
  aiSettingsSave: vi.fn(),
  aiModels: vi.fn(),
  onAiStream: vi.fn(() => () => {}),
}));

vi.mock("../lib/bridge", () => ({
  api: mockApi,
}));

import { useNutritionCoach } from "./nutritionCoach";

beforeEach(() => {
  vi.clearAllMocks();
  useNutritionCoach.setState({
    messages: [],
    busy: false,
    streamingId: null,
    conversationId: null,
    title: "",
    history: [],
    historyOpen: false,
    contextInfo: null,
  });
});

describe("useNutritionCoach store", () => {
  it("inicia con estado limpio", () => {
    const s = useNutritionCoach.getState();
    expect(s.messages).toEqual([]);
    expect(s.busy).toBe(false);
    expect(s.conversationId).toBeNull();
  });

  it("crea una nueva conversación limpiando mensajes y título", () => {
    useNutritionCoach.setState({
      conversationId: "c1",
      title: "Dieta de volumen",
      messages: [{ id: "m1", role: "user", content: "hola", at: 1 }],
    });

    useNutritionCoach.getState().newConversation();
    const s = useNutritionCoach.getState();
    expect(s.conversationId).toBeNull();
    expect(s.title).toBe("");
    expect(s.messages).toEqual([]);
  });

  it("carga el contexto del asesor nutricional", async () => {
    mockApi.nutriCoachContext.mockResolvedValueOnce({
      date: "2026-10-16",
      targetCalories: 2200,
      consumedCalories: 600,
      caloriesRemaining: 1600,
      consumedProtein: 45,
      targetProtein: 150,
      consumedWater: 1000,
      targetWater: 2500,
      goal: "hipertrofia",
      weight: 80,
      foodsCount: 8,
    });

    await useNutritionCoach.getState().loadContext();
    const s = useNutritionCoach.getState();
    expect(s.contextInfo?.targetCalories).toBe(2200);
    expect(s.contextInfo?.caloriesRemaining).toBe(1600);
    expect(s.contextInfo?.goal).toBe("hipertrofia");
  });

  it("refresca el historial de conversaciones del asesor", async () => {
    mockApi.nutriCoachConversations.mockResolvedValueOnce([
      { id: "c1", title: "Cálculo de macros", created_at: "2026-10-16", updated_at: "2026-10-16", count: 4, model: "gemini" },
    ]);

    await useNutritionCoach.getState().refreshHistory();
    const s = useNutritionCoach.getState();
    expect(s.history).toHaveLength(1);
    expect(s.history[0]?.title).toBe("Cálculo de macros");
  });
});
