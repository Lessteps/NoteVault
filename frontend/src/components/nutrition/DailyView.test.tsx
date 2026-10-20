// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNutrition } from "../../store/nutrition";
import { MacroCards } from "./MacroCards";
import { MealSection } from "./MealSection";
import type { NutriDaySummary } from "../../lib/nutritionTypes";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function createMockSummary(): NutriDaySummary {
  return {
    date: "2026-10-16",
    log: {
      date: "2026-10-16",
      meals: {
        desayuno: [
          {
            id: "fi1",
            name: "Huevos revueltos",
            amount: 3,
            unit: "huevos",
            calories: 216,
            protein: 18.9,
            carbs: 1.2,
            fat: 14.4,
          },
        ],
        almuerzo: [],
        merienda: [],
        cena: [],
        snacks: [],
      },
      water_ml: 1250,
    },
    targets: {
      calories: 2200,
      protein_g: 150,
      carbs_g: 240,
      fat_g: 65,
      water_ml: 2500,
    },
    totals: {
      calories: 216,
      protein: 18.9,
      carbs: 1.2,
      fat: 14.4,
      water_ml: 1250,
    },
    byMeal: {
      desayuno: { calories: 216, protein: 18.9, carbs: 1.2, fat: 14.4, itemsCount: 1 },
      almuerzo: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
      merienda: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
      cena: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
      snacks: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
    },
  };
}

describe("MacroCards component", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const summary = createMockSummary();
    useNutrition.setState({
      summary,
      targets: summary.targets,
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

  it("renderiza correctamente calorías, proteínas, carbohidratos, grasas y agua", async () => {
    await act(async () => {
      root!.render(<MacroCards />);
    });

    expect(host!.textContent).toContain("Calorías");
    expect(host!.textContent).toContain("216");
    expect(host!.textContent).toContain("/ 2200 kcal");
    expect(host!.textContent).toContain("Proteínas");
    expect(host!.textContent).toContain("18.9");
    expect(host!.textContent).toContain("/ 150g");
    expect(host!.textContent).toContain("Agua");
    expect(host!.textContent).toContain("1250");
  });

  it("renderiza la barra de distribución calórica (% kcal de macros)", async () => {
    await act(async () => {
      root!.render(<MacroCards />);
    });

    expect(host!.textContent).toContain("Distribución calórica (% kcal de macros):");
    expect(host!.textContent).toContain("🥩 Proteínas: 36%");
    expect(host!.textContent).toContain("🍚 Carbos: 2%");
    expect(host!.textContent).toContain("🥑 Grasas: 62%");
  });

  it("permite sumar y restar agua con los botones rápidos", async () => {
    const setWaterSpy = vi.fn();
    useNutrition.setState({ setWater: setWaterSpy });

    await act(async () => {
      root!.render(<MacroCards />);
    });

    const plusBtn = host!.querySelector('button[title="Sumar 250ml (1 vaso)"]') as HTMLButtonElement;
    expect(plusBtn).toBeTruthy();

    await act(async () => {
      plusBtn.click();
    });
    expect(setWaterSpy).toHaveBeenCalledWith(1500);

    const minusBtn = host!.querySelector('button[title="Restar 250ml"]') as HTMLButtonElement;
    expect(minusBtn).toBeTruthy();

    await act(async () => {
      minusBtn.click();
    });
    expect(setWaterSpy).toHaveBeenCalledWith(1000);
  });
});

describe("MealSection component", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const summary = createMockSummary();
    useNutrition.setState({
      summary,
      openAddMeal: vi.fn(),
      removeFoodFromMeal: vi.fn(),
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

  it("renderiza la sección de desayuno con sus alimentos y totales", async () => {
    await act(async () => {
      root!.render(<MealSection meal="desayuno" />);
    });

    expect(host!.textContent).toContain("Desayuno");
    expect(host!.textContent).toContain("Huevos revueltos");
    expect(host!.textContent).toContain("3 huevos");
    expect(host!.textContent).toContain("216 kcal");
  });

  it("muestra estado vacío cuando no hay alimentos en el turno", async () => {
    await act(async () => {
      root!.render(<MealSection meal="almuerzo" />);
    });

    expect(host!.textContent).toContain("Almuerzo");
    expect(host!.textContent).toContain("Sin alimentos registrados en este turno");
  });

  it("llama a openAddMeal al hacer clic en Añadir alimento", async () => {
    const openAddMealSpy = vi.fn();
    useNutrition.setState({ openAddMeal: openAddMealSpy });

    await act(async () => {
      root!.render(<MealSection meal="cena" />);
    });

    const addBtn = host!.querySelector('[data-testid="add-food-btn-cena"]') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();

    await act(async () => {
      addBtn.click();
    });

    expect(openAddMealSpy).toHaveBeenCalledWith("cena");
  });

  it("llama a removeFoodFromMeal al eliminar un alimento", async () => {
    const removeSpy = vi.fn();
    useNutrition.setState({ removeFoodFromMeal: removeSpy });

    await act(async () => {
      root!.render(<MealSection meal="desayuno" />);
    });

    const deleteBtn = host!.querySelector('[data-testid="delete-food-btn-fi1"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    await act(async () => {
      deleteBtn.click();
    });

    expect(removeSpy).toHaveBeenCalledWith("desayuno", "fi1");
  });

  it("abre el modal de edición y llama a updateFoodInMeal al guardar", async () => {
    const updateSpy = vi.fn();
    useNutrition.setState({ updateFoodInMeal: updateSpy });

    await act(async () => {
      root!.render(<MealSection meal="desayuno" />);
    });

    const editBtn = host!.querySelector('[data-testid="edit-food-btn-fi1"]') as HTMLButtonElement;
    expect(editBtn).toBeTruthy();

    await act(async () => {
      editBtn.click();
    });

    expect(document.body.textContent).toContain("Editar alimento en Desayuno");

    const saveBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Guardar cambios"),
    );
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn!.click();
    });

    expect(updateSpy).toHaveBeenCalledWith("desayuno", "fi1", expect.objectContaining({
      name: "Huevos revueltos",
      calories: 216,
    }));
  });

  it("permite escribir y guardar notas del día", async () => {
    const { NutritionModule } = await import("./NutritionModule");
    const setNotesSpy = vi.fn();
    useNutrition.setState({
      setNotes: setNotesSpy,
      activeTab: "diario",
      loadDay: vi.fn(),
      loadFoods: vi.fn(),
      loadSettings: vi.fn(),
    });

    await act(async () => {
      root!.render(<NutritionModule />);
    });

    const textarea = host!.querySelector('[data-testid="daily-notes-textarea"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    await act(async () => {
      const tracker = (textarea as any)._valueTracker;
      if (tracker) tracker.setValue("");
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      nativeSetter?.call(textarea, "Cena con amigos");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const saveBtn = host!.querySelector('[data-testid="save-notes-btn"]') as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn.click();
    });

    expect(setNotesSpy).toHaveBeenCalledWith("Cena con amigos");
  });

  it("llama a copyMealFromYesterday al hacer clic en Copiar de ayer", async () => {
    const copySpy = vi.fn().mockResolvedValue(true);
    useNutrition.setState({ copyMealFromYesterday: copySpy });

    await act(async () => {
      root!.render(<MealSection meal="desayuno" />);
    });

    const copyBtn = host!.querySelector('[data-testid="copy-yesterday-btn-desayuno"]') as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();

    await act(async () => {
      copyBtn.click();
    });

    expect(copySpy).toHaveBeenCalledWith("desayuno");
  });
});
