// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockProfile = {
  weight: 81.2,
  goal: "hipertrofia",
  goal_note: "Prioridad torso",
  dietary_restrictions: "Lactosa, picante",
  gender: "hombre" as const,
  age: 27,
  height_cm: 180,
};

import { NutriProfileView } from "./NutriProfileView";
import { useNutrition } from "../../store/nutrition";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  useNutrition.setState({
    profile: mockProfile,
    loadProfile: vi.fn(),
    saveProfile: vi.fn().mockResolvedValue(mockProfile),
    applySuggestedTargets: vi.fn().mockResolvedValue({ weight: 81.2, goal: "hipertrofia" }),
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

describe("NutriProfileView", () => {
  it("renderiza el perfil cargado con peso, objetivo y alimentos que hacen daño", async () => {
    await act(async () => {
      root!.render(<NutriProfileView />);
    });

    expect(host!.textContent).toContain("Perfil del Usuario y Preferencias");
    expect(host!.textContent).toContain("Peso corporal y Biometría");
    expect(host!.textContent).toContain("Objetivo Nutricional");
    expect(host!.textContent).toContain("Alimentos que te hacen daño o restricciones alimentarias");

    const weightInput = host!.querySelector('[data-testid="input-weight"]') as HTMLInputElement;
    expect(weightInput).toBeTruthy();
    expect(weightInput.value).toBe("81.2");

    const restrictionsTextarea = host!.querySelector('[data-testid="input-dietary-restrictions"]') as HTMLTextAreaElement;
    expect(restrictionsTextarea).toBeTruthy();
    expect(restrictionsTextarea.value).toBe("Lactosa, picante");
  });

  it("permite seleccionar un nuevo objetivo y guardar el perfil", async () => {
    const saveSpy = vi.fn().mockResolvedValue(mockProfile);
    useNutrition.setState({ saveProfile: saveSpy });

    await act(async () => {
      root!.render(<NutriProfileView />);
    });

    const cutGoalBtn = host!.querySelector('[data-testid="goal-option-perdida_grasa"]') as HTMLButtonElement;
    expect(cutGoalBtn).toBeTruthy();

    await act(async () => {
      cutGoalBtn.click();
    });

    const saveBtn = host!.querySelector('[data-testid="save-profile-btn"]') as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      saveBtn.click();
    });

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      goal: "perdida_grasa",
      dietary_restrictions: "Lactosa, picante",
      weight: 81.2,
    }));
  });

  it("permite habilitar y deshabilitar la opción de restricciones con el toggle", async () => {
    const saveSpy = vi.fn().mockResolvedValue(mockProfile);
    useNutrition.setState({ saveProfile: saveSpy });

    await act(async () => {
      root!.render(<NutriProfileView />);
    });

    const toggle = host!.querySelector('[data-testid="toggle-restrictions"]') as HTMLInputElement;
    expect(toggle).toBeTruthy();
    expect(toggle.checked).toBe(true);

    // Deshabilitar restricciones
    await act(async () => {
      toggle.click();
    });
    expect(toggle.checked).toBe(false);
    expect(host!.querySelector('[data-testid="input-dietary-restrictions"]')).toBeNull();

    const saveBtn = host!.querySelector('[data-testid="save-profile-btn"]') as HTMLButtonElement;
    await act(async () => {
      saveBtn.click();
    });

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      dietary_restrictions: "Ninguno",
    }));
  });

  it("permite recalcular metas llamando a applySuggestedTargets", async () => {
    const applySpy = vi.fn().mockResolvedValue({ weight: 81.2, goal: "hipertrofia" });
    useNutrition.setState({ applySuggestedTargets: applySpy });

    await act(async () => {
      root!.render(<NutriProfileView />);
    });

    const recalcBtn = host!.querySelector('[data-testid="recalculate-targets-btn"]') as HTMLButtonElement;
    expect(recalcBtn).toBeTruthy();

    await act(async () => {
      recalcBtn.click();
    });

    expect(applySpy).toHaveBeenCalled();
  });
});
