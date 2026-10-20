// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const mockCoach = vi.hoisted(() => ({
  open: true,
  messages: [] as any[],
  busy: false,
  streamingId: null,
  conversationId: null,
  title: "",
  historyOpen: false,
  history: [],
  historyQuery: "",
  contextInfo: { goal: "hipertrofia", currentWeight: 75.5, exercisesCount: 6 },
  model: "deepseek-flash",
  models: ["deepseek-flash"],
  providerLabel: "DeepSeek",
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

vi.mock("../../store/exerciseCoach", () => ({
  useExerciseCoach: (selector: (s: any) => any) => selector(mockCoach),
}));

vi.mock("../../store/app", () => ({
  useApp: (selector: (s: any) => any) => selector({
    toast: vi.fn(),
    module: "ejercicio",
  }),
}));

import { ExerciseCoachAssistant } from "./ExerciseCoachAssistant";

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

describe("ExerciseCoachAssistant", () => {
  it("renderiza el encabezado del Coach con sugerencias rápidas cuando no hay mensajes", () => {
    act(() => {
      root?.render(<ExerciseCoachAssistant />);
    });

    expect(container?.textContent).toContain("Coach de Entrenamiento");
    expect(container?.textContent).toContain("Hipertrofia");
    expect(container?.textContent).toContain("75.5 kg");
    expect(container?.querySelector("button[title='Nueva conversación']")).not.toBeNull();
    // Sugerencias rápidas visibles
    expect(container?.textContent).toContain("¿Cómo optimizar mi rutina para hipertrofia?");
  });

  it("renderiza los mensajes del usuario y del coach", () => {
    mockCoach.messages = [
      { id: "m1", role: "user", content: "¿Qué descanso entre series?", at: 1000 },
      { id: "m2", role: "assistant", content: "Para hipertrofia, entre 60 y 90 segundos.", at: 1005 },
    ];

    act(() => {
      root?.render(<ExerciseCoachAssistant />);
    });

    expect(container?.textContent).toContain("¿Qué descanso entre series?");
    expect(container?.textContent).toContain("Para hipertrofia, entre 60 y 90 segundos.");

    mockCoach.messages = [];
  });

  it("renderiza una tarjeta de acción ejecutable cuando el coach propone ejercicios", () => {
    mockCoach.messages = [
      {
        id: "m3",
        role: "assistant",
        content: "Te propongo esta adición para el viernes:\n\n```coach-action\n{\n  \"action\": \"add_exercise\",\n  \"day\": \"viernes\",\n  \"exercises\": [{\"name\": \"Hip Thrust\", \"series_reps\": \"4x10\"}]\n}\n```\n\n¡Vas a sentir el trabajo en glúteos!",
        at: 2000,
      },
    ];

    act(() => {
      root?.render(<ExerciseCoachAssistant />);
    });

    expect(container?.textContent).toContain("Modificación de rutina sugerida · Viernes");
    expect(container?.textContent).toContain("Hip Thrust");
    expect(container?.textContent).toContain("Añadir a mi rutina del Viernes");

    mockCoach.messages = [];
  });
});
