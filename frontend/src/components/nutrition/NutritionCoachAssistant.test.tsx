// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  nutriCoachContext: vi.fn(async () => ({
    date: "2026-10-16",
    caloriesRemaining: 1500,
    targetCalories: 2200,
    consumedCalories: 700,
    consumedProtein: 50,
    targetProtein: 150,
    consumedWater: 1000,
    targetWater: 2500,
    goal: "hipertrofia",
    weight: 80,
    foodsCount: 8,
  })),
  nutriCoachConversations: vi.fn(),
  nutriCoachConversationGet: vi.fn(),
  nutriCoachConversationSave: vi.fn(),
  nutriCoachConversationRename: vi.fn(),
  nutriCoachConversationDelete: vi.fn(),
  nutriCoachAiTitle: vi.fn(),
  nutriCoachChatStream: vi.fn(),
  nutriCoachChatCancel: vi.fn(),
  aiSettings: vi.fn(async () => ({
    config: { provider: "gemini", model: "models/gemini-3.5-flash-lite", is_bridge: false },
    providers: [{ key: "gemini", label: "Google Gemini" }],
    models: ["models/gemini-3.5-flash-lite"],
  })),
  aiSettingsSave: vi.fn(),
  aiModels: vi.fn(async () => []),
  onAiStream: vi.fn(() => () => {}),
}));

vi.mock("../../lib/bridge", () => ({
  api: mockApi,
}));

import { NutritionCoachAssistant } from "./NutritionCoachAssistant";
import { useNutritionCoach } from "../../store/nutritionCoach";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  useNutritionCoach.setState({
    messages: [],
    busy: false,
    conversationId: null,
    title: "",
    history: [],
    historyOpen: false,
    model: "models/gemini-3.5-flash-lite",
    providerLabel: "Google Gemini",
    contextInfo: {
      date: "2026-10-16",
      caloriesRemaining: 1500,
      targetCalories: 2200,
      consumedCalories: 700,
      consumedProtein: 50,
      targetProtein: 150,
      consumedWater: 1000,
      targetWater: 2500,
      goal: "hipertrofia",
      weight: 80,
      foodsCount: 8,
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

describe("NutritionCoachAssistant component", () => {
  it("renderiza la cabecera idéntica al Coach de Ejercicio con badges y sugerencias iniciales", async () => {
    await act(async () => {
      root!.render(<NutritionCoachAssistant />);
    });

    expect(host!.textContent).toContain("Asesor Nutricional");
    expect(host!.textContent).toContain("1500 kcal rest.");
    expect(host!.textContent).toContain("hipertrofia");
    expect(host!.textContent).toContain("Sugerencias rápidas");
    expect(host!.textContent).toContain("¿Cómo cubro los gramos de proteína que me faltan hoy?");
  });

  it("al hacer clic en una sugerencia llama a ask()", async () => {
    const askSpy = vi.fn();
    useNutritionCoach.setState({ ask: askSpy });

    await act(async () => {
      root!.render(<NutritionCoachAssistant />);
    });

    const sugBtn = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("proteína"),
    );
    expect(sugBtn).toBeTruthy();

    await act(async () => {
      sugBtn!.click();
    });

    expect(askSpy).toHaveBeenCalledWith("🥩 ¿Cómo cubro los gramos de proteína que me faltan hoy?");
  });

  it("renderiza mensajes de usuario y asistente con tarjetas de acción interactivas", async () => {
    useNutritionCoach.setState({
      messages: [
        { id: "m1", role: "user", content: "Comí 200g de pollo", at: Date.now() },
        {
          id: "m2",
          role: "assistant",
          content: `Excelente aporte de proteínas.
\`\`\`nutrition-action
{
  "action": "add_meal_item",
  "meal": "almuerzo",
  "item": {
    "name": "Pechuga de pollo",
    "amount": 200,
    "unit": "g",
    "calories": 330,
    "protein": 62,
    "carbs": 0,
    "fat": 7.2
  }
}
\`\`\`
¿Querés que lo registre en tu almuerzo?`,
          at: Date.now(),
        },
      ],
    });

    await act(async () => {
      root!.render(<NutritionCoachAssistant />);
    });

    expect(host!.textContent).toContain("Comí 200g de pollo");
    expect(host!.textContent).toContain("Excelente aporte de proteínas.");
    // Tarjeta de acción interactiva integrada en el chat
    expect(host!.querySelector('[data-testid="nutrition-action-card"]')).toBeTruthy();
    expect(host!.textContent).toContain("Propuesta para Almuerzo");
    expect(host!.textContent).toContain("330 kcal");
  });

  it("permite abrir una nueva conversación con el botón +", async () => {
    const newConvSpy = vi.fn();
    useNutritionCoach.setState({ newConversation: newConvSpy });

    await act(async () => {
      root!.render(<NutritionCoachAssistant />);
    });

    const plusBtn = host!.querySelector('button[title="Nueva conversación"]') as HTMLButtonElement;
    expect(plusBtn).toBeTruthy();

    await act(async () => {
      plusBtn.click();
    });

    expect(newConvSpy).toHaveBeenCalled();
  });
});
