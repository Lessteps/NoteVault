// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNutrition } from "../../store/nutrition";
import { FoodLibraryView } from "./FoodLibraryView";
import { NutritionSettingsDialog } from "./NutritionSettingsDialog";
import type { NutriFoodLibraryEntry, NutriTargets } from "../../lib/nutritionTypes";

const mockOpenMenu = vi.fn();

vi.mock(import("../ui"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    openMenu: (e: any, items: any[]) => {
      mockOpenMenu(e, items);
      if (items && items[0] && items[0].onSelect) {
        items[0].onSelect();
      }
    },
  };
});

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const MOCK_FOODS: NutriFoodLibraryEntry[] = [
  {
    id: "f1",
    name: "Pechuga de pollo",
    serving_size: 100,
    serving_unit: "g",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    category: "Proteínas",
  },
  {
    id: "f2",
    name: "Avena en hojuelas",
    serving_size: 50,
    serving_unit: "g",
    calories: 189,
    protein: 6.5,
    carbs: 33,
    fat: 3.5,
    category: "Carbohidratos",
  },
];

const MOCK_TARGETS: NutriTargets = {
  calories: 2200,
  protein_g: 150,
  carbs_g: 240,
  fat_g: 65,
  water_ml: 2500,
  auto_calculate: false,
};

describe("FoodLibraryView component", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    useNutrition.setState({
      foods: MOCK_FOODS,
      saveFoodToLibrary: vi.fn(),
      deleteFoodFromLibrary: vi.fn(),
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

  it("renderiza la lista de alimentos de la despensa con sus macros", async () => {
    await act(async () => {
      root!.render(<FoodLibraryView />);
    });

    expect(host!.textContent).toContain("Pechuga de pollo");
    expect(host!.textContent).toContain("165 kcal");
    expect(host!.textContent).toContain("31g P");

    expect(host!.textContent).toContain("Avena en hojuelas");
    expect(host!.textContent).toContain("189 kcal");
    expect(host!.textContent).toContain("33g C");
  });

  it("filtra alimentos según el texto de búsqueda", async () => {
    await act(async () => {
      root!.render(<FoodLibraryView />);
    });

    const searchInput = host!.querySelector('input[placeholder="Buscar en tu despensa..."]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(searchInput, "pollo");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(host!.textContent).toContain("Pechuga de pollo");
    expect(host!.textContent).not.toContain("Avena en hojuelas");
  });

  it("permite abrir el modal para crear un nuevo alimento", async () => {
    await act(async () => {
      root!.render(<FoodLibraryView />);
    });

    const newBtn = host!.querySelector('[data-testid="new-food-btn"]') as HTMLButtonElement;
    expect(newBtn).toBeTruthy();

    await act(async () => {
      newBtn.click();
    });

    expect(document.body.textContent).toContain("Nuevo alimento para tu despensa");
  });

  it("permite registrar consumo rápido desde la despensa", async () => {
    const quickConsumeSpy = vi.fn().mockResolvedValue(undefined);
    useNutrition.setState({ quickConsumeFood: quickConsumeSpy });

    await act(async () => {
      root!.render(<FoodLibraryView />);
    });

    const consumeBtn = host!.querySelector('[data-testid="quick-consume-btn-f1"]') as HTMLButtonElement;
    expect(consumeBtn).toBeTruthy();

    await act(async () => {
      consumeBtn.click();
    });

    expect(mockOpenMenu).toHaveBeenCalled();
    expect(quickConsumeSpy).toHaveBeenCalledWith(MOCK_FOODS[0], "desayuno", 1);
  });
});

describe("NutritionSettingsDialog component", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    useNutrition.setState({
      settingsOpen: true,
      targets: MOCK_TARGETS,
      saveTargets: vi.fn(),
      applySuggestedTargets: vi.fn().mockResolvedValue({ weight: 80, goal: "hipertrofia" }),
      setSettingsOpen: vi.fn(),
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

  it("renderiza los valores actuales de las metas", async () => {
    await act(async () => {
      root!.render(<NutritionSettingsDialog />);
    });

    expect(document.body.textContent).toContain("Metas Nutricionales Diarias");
    expect(document.body.textContent).toContain("Calorías diarias (kcal):");
    expect(document.body.textContent).toContain("Proteínas (g):");
  });

  it("llama a applySuggestedTargets al hacer clic en Calcular ahora", async () => {
    const applySpy = vi.fn().mockResolvedValue({ weight: 80, goal: "hipertrofia" });
    useNutrition.setState({ applySuggestedTargets: applySpy });

    await act(async () => {
      root!.render(<NutritionSettingsDialog />);
    });

    const calcBtn = document.body.querySelector('[data-testid="sync-exercise-btn"]') as HTMLButtonElement;
    expect(calcBtn).toBeTruthy();

    await act(async () => {
      calcBtn.click();
    });

    expect(applySpy).toHaveBeenCalled();
  });

  it("guarda las metas al hacer clic en Guardar metas", async () => {
    const saveSpy = vi.fn();
    useNutrition.setState({ saveTargets: saveSpy });

    await act(async () => {
      root!.render(<NutritionSettingsDialog />);
    });

    const saveBtn = document.body.querySelector('[data-testid="save-targets-btn"]') as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn.click();
    });

    expect(saveSpy).toHaveBeenCalledWith({
      calories: 2200,
      protein_g: 150,
      carbs_g: 240,
      fat_g: 65,
      water_ml: 2500,
    });
  });
});
