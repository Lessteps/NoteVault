import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  exCoachContext: vi.fn(),
  exCoachConversations: vi.fn(),
  exCoachConversationGet: vi.fn(),
  exCoachConversationSave: vi.fn(),
  exCoachConversationRename: vi.fn(),
  exCoachConversationDelete: vi.fn(),
  exCoachAiTitle: vi.fn(),
  exCoachChatStream: vi.fn(),
  exCoachChatCancel: vi.fn(),
  aiSettings: vi.fn(),
  aiSettingsSave: vi.fn(),
  aiModels: vi.fn(),
  onAiStream: vi.fn(() => () => {}),
}));

vi.mock("../lib/bridge", () => ({
  api: mockApi,
}));

import { useExerciseCoach } from "./exerciseCoach.js";

beforeEach(() => {
  vi.clearAllMocks();
  useExerciseCoach.setState({
    messages: [],
    busy: false,
    streamingId: null,
    conversationId: null,
    title: "",
    history: [],
    historyOpen: false,
  });
});

describe("useExerciseCoach store", () => {
  it("inicia con estado limpio para una nueva conversación", () => {
    const s = useExerciseCoach.getState();
    expect(s.messages).toEqual([]);
    expect(s.busy).toBe(false);
    expect(s.conversationId).toBeNull();
  });

  it("crea una nueva conversación limpiando mensajes y título", () => {
    useExerciseCoach.setState({
      conversationId: "c123",
      title: "Rutina vieja",
      messages: [{ id: "m1", role: "user", content: "hola", at: 1 }],
    });

    useExerciseCoach.getState().newConversation();

    const s = useExerciseCoach.getState();
    expect(s.conversationId).toBeNull();
    expect(s.title).toBe("");
    expect(s.messages).toEqual([]);
  });

  it("carga el contexto del coach llamando al bridge", async () => {
    mockApi.exCoachContext.mockResolvedValueOnce({
      profile: { goal: "hipertrofia", goal_note: "", weight_history: [] },
      exercisesCount: 5,
      currentWeight: 80,
      goal: "hipertrofia",
    });

    await useExerciseCoach.getState().loadContext();

    const s = useExerciseCoach.getState();
    expect(s.contextInfo?.goal).toBe("hipertrofia");
    expect(s.contextInfo?.currentWeight).toBe(80);
    expect(s.contextInfo?.exercisesCount).toBe(5);
  });

  it("refresca el historial de conversaciones del coach de forma aislada", async () => {
    mockApi.exCoachConversations.mockResolvedValueOnce([
      { id: "c1", title: "Plan de torso", created_at: "2026-10-01", updated_at: "2026-10-01", count: 4, model: "deepseek" },
    ]);

    await useExerciseCoach.getState().refreshHistory();

    const s = useExerciseCoach.getState();
    expect(s.history.length).toBe(1);
    expect(s.history[0]?.title).toBe("Plan de torso");
  });
});
