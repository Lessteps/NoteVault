// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  nutriItemAdd: vi.fn(),
  nutriWaterSet: vi.fn(),
  nutriFoodSave: vi.fn(),
}));

vi.mock("../../lib/bridge", () => ({
  api: mockApi,
}));

import { NutritionActionCard } from "./NutritionActionCard";
import { useNutrition } from "../../store/nutrition";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  useNutrition.setState({
    selectedDate: "2026-10-16",
    loadDay: vi.fn(),
    loadFoods: vi.fn(),
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

describe("NutritionActionCard", () => {
  it("renderiza una propuesta add_meal_item y la aplica al hacer clic", async () => {
    const onAppliedSpy = vi.fn();
    mockApi.nutriItemAdd.mockResolvedValueOnce({});

    await act(async () => {
      root!.render(
        <NutritionActionCard
          action={{
            action: "add_meal_item",
            meal: "almuerzo",
            item: {
              name: "Pechuga de pavo",
              amount: 200,
              unit: "g",
              calories: 250,
              protein: 48,
              carbs: 0,
              fat: 4,
            },
          }}
          onApplied={onAppliedSpy}
        />,
      );
    });

    expect(host!.textContent).toContain("Propuesta para Almuerzo");
    expect(host!.textContent).toContain("Pechuga de pavo");
    expect(host!.textContent).toContain("250 kcal");
    expect(host!.textContent).toContain("48g P");

    const applyBtn = host!.querySelector('[data-testid="apply-action-btn"]') as HTMLButtonElement;
    expect(applyBtn).toBeTruthy();

    await act(async () => {
      applyBtn.click();
    });

    expect(mockApi.nutriItemAdd).toHaveBeenCalledWith("2026-10-16", "almuerzo", expect.objectContaining({
      name: "Pechuga de pavo",
      calories: 250,
    }));
    expect(onAppliedSpy).toHaveBeenCalled();
    expect(host!.textContent).toContain("Registrado en almuerzo");
  });

  it("renderiza una propuesta set_water y la aplica", async () => {
    mockApi.nutriWaterSet.mockResolvedValueOnce({});

    await act(async () => {
      root!.render(
        <NutritionActionCard
          action={{
            action: "set_water",
            water_ml: 2200,
          }}
        />,
      );
    });

    expect(host!.textContent).toContain("Actualización de hidratación");
    expect(host!.textContent).toContain("2200 ml");

    const applyBtn = host!.querySelector('[data-testid="apply-action-btn"]') as HTMLButtonElement;
    await act(async () => {
      applyBtn.click();
    });

    expect(mockApi.nutriWaterSet).toHaveBeenCalledWith("2026-10-16", 2200);
    expect(host!.textContent).toContain("Agua actualizada");
  });

  it("renderiza una propuesta add_food_to_pantry y la guarda", async () => {
    mockApi.nutriFoodSave.mockResolvedValueOnce({});

    await act(async () => {
      root!.render(
        <NutritionActionCard
          action={{
            action: "add_food_to_pantry",
            entry: {
              name: "Yogur con nueces",
              serving_size: 1,
              serving_unit: "pote",
              calories: 190,
              protein: 12,
              carbs: 10,
              fat: 11,
              category: "Snacks",
            },
          }}
        />,
      );
    });

    expect(host!.textContent).toContain("Guardar en Despensa");
    expect(host!.textContent).toContain("Yogur con nueces");

    const applyBtn = host!.querySelector('[data-testid="apply-action-btn"]') as HTMLButtonElement;
    await act(async () => {
      applyBtn.click();
    });

    expect(mockApi.nutriFoodSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Yogur con nueces",
      calories: 190,
    }));
    expect(host!.textContent).toContain("Guardado en tu despensa");
  });
});
