// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CoachAction } from "../../lib/exerciseCoachActions";

const mockApi = vi.hoisted(() => ({
  exSave: vi.fn().mockResolvedValue({ id: "ex1" }),
  exLibrarySave: vi.fn().mockResolvedValue({ entry: { slug: "press-svend" } }),
  exLibraryList: vi.fn().mockResolvedValue([{ slug: "mia-press-svend", name: "Press Svend" }]),
  exLibraryRemove: vi.fn().mockResolvedValue(true),
  exRemove: vi.fn().mockResolvedValue({ ok: true }),
  exWeightAdd: vi.fn().mockResolvedValue({ weight_history: [{ date: "2026-10-13", weight: 76.5 }] }),
}));

const mockExerciseRefresh = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockExerciseRefreshProfile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockExerciseList = vi.hoisted(() => ({ current: [] as any[] }));
const mockToast = vi.hoisted(() => vi.fn());

vi.mock("../../lib/bridge", () => ({
  api: mockApi,
}));

vi.mock("../../store/exercise", () => ({
  useExercise: {
    getState: () => ({
      refresh: mockExerciseRefresh,
      refreshProfile: mockExerciseRefreshProfile,
      list: mockExerciseList.current,
    }),
  },
}));

vi.mock("../../store/app", () => ({
  useApp: Object.assign(
    (selector: (s: any) => any) => selector({ toast: mockToast }),
    { getState: () => ({ toast: mockToast }) }
  ),
}));

import { CoachActionCard } from "./CoachActionCard";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("CoachActionCard", () => {
  const sampleAction: CoachAction = {
    action: "add_exercise",
    day: "viernes",
    exercises: [
      { name: "Sentadilla búlgara", series_reps: "3x10", rest: "90s", how_to: "Torso a 45 grados" },
      { name: "Extensiones de cuádriceps", series_reps: "3x12", rest: "60s" },
    ],
  };

  it("renderiza los ejercicios y el botón para añadir a la rutina", () => {
    act(() => {
      root.render(<CoachActionCard action={sampleAction} />);
    });

    expect(host.textContent).toContain("Viernes");
    expect(host.textContent).toContain("Sentadilla búlgara");
    expect(host.textContent).toContain("3x10");
    expect(host.textContent).toContain("Extensiones de cuádriceps");
    expect(host.querySelector("button")).not.toBeNull();
    expect(host.textContent).toContain("Añadir a mi rutina");
  });

  it("llama a api.exSave y useExercise.refresh al pulsar el botón", async () => {
    await act(async () => {
      root.render(<CoachActionCard action={sampleAction} />);
    });

    const addBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Añadir"));
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn?.click();
    });

    expect(mockApi.exSave).toHaveBeenCalledTimes(2);
    expect(mockApi.exSave).toHaveBeenCalledWith("", expect.objectContaining({
      day: "viernes",
      name: "Sentadilla búlgara",
      series_reps: "3x10",
      rest: "90s",
    }));
    expect(mockExerciseRefresh).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("info", expect.stringContaining("Viernes"));
    expect(host.textContent).toContain("Añadido a tu rutina");
  });

  it("renderiza y ejecuta la acción add_to_library para guardar en biblioteca", async () => {
    const libAction: CoachAction = {
      action: "add_to_library",
      exercise: {
        name: "Press Svend",
        equipment: "dumbbell",
        muscles: { primary: ["pecho"], secondary: ["tríceps"] },
        how_to: "Comprimir dos mancuernas",
      },
    };

    await act(async () => {
      root.render(<CoachActionCard action={libAction} />);
    });

    expect(host.textContent).toContain("Nuevo ejercicio para tu Biblioteca");
    expect(host.textContent).toContain("Press Svend");
    expect(host.textContent).toContain("dumbbell");
    expect(host.textContent).toContain("pecho");

    const saveBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Guardar en mi Biblioteca"));
    expect(saveBtn).toBeDefined();

    await act(async () => {
      saveBtn?.click();
    });

    expect(mockApi.exLibrarySave).toHaveBeenCalledWith({
      name: "Press Svend",
      equipment: "dumbbell",
      muscles: { primary: ["pecho"], secondary: ["tríceps"] },
      how_to: "Comprimir dos mancuernas",
    });
    expect(mockToast).toHaveBeenCalledWith("info", expect.stringContaining("Press Svend"));
    expect(host.textContent).toContain("Guardado en Biblioteca");
  });

  it("renderiza y ejecuta la acción remove_exercise para quitar de rutina", async () => {
    const removeAction: CoachAction = {
      action: "remove_exercise",
      day: "martes",
      exercise_name: "Romanian Deadlift",
    };

    mockExerciseList.current = [
      { id: "martes_romaniandeadlift", day: "martes", name: "Romanian Deadlift" },
    ];

    await act(async () => {
      root.render(<CoachActionCard action={removeAction} />);
    });

    expect(host.textContent).toContain("Quitar ejercicio de rutina · Martes");
    expect(host.textContent).toContain("Romanian Deadlift");

    const removeBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Quitar de mi rutina"));
    expect(removeBtn).toBeDefined();

    await act(async () => {
      removeBtn?.click();
    });

    expect(mockApi.exRemove).toHaveBeenCalledWith("martes_romaniandeadlift");
    expect(mockExerciseRefresh).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("info", expect.stringContaining("Romanian Deadlift"));
    expect(host.textContent).toContain("Eliminado de tu rutina");
  });

  it("renderiza y ejecuta la acción remove_from_library para borrar de la biblioteca", async () => {
    const removeLibAction: CoachAction = {
      action: "remove_from_library",
      exercise_name: "Press Svend",
    };

    await act(async () => {
      root.render(<CoachActionCard action={removeLibAction} />);
    });

    expect(host.textContent).toContain("Eliminar de la Biblioteca");
    expect(host.textContent).toContain("Press Svend");

    const deleteBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Eliminar de mi Biblioteca"));
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      deleteBtn?.click();
    });

    expect(mockApi.exLibraryRemove).toHaveBeenCalledWith("mia-press-svend");
    expect(mockToast).toHaveBeenCalledWith("info", expect.stringContaining("Press Svend"));
    expect(host.textContent).toContain("Eliminado de tu Biblioteca");
  });

  it("renderiza y ejecuta la acción record_weight para guardar pesaje", async () => {
    const recordWeightAction: CoachAction = {
      action: "record_weight",
      weight: 76.5,
      date: "2026-10-13",
    };

    await act(async () => {
      root.render(<CoachActionCard action={recordWeightAction} />);
    });

    expect(host.textContent).toContain("Registro de peso corporal");
    expect(host.textContent).toContain("76.5 kg");

    const saveWeightBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Guardar 76.5 kg"));
    expect(saveWeightBtn).toBeDefined();

    await act(async () => {
      saveWeightBtn?.click();
    });

    expect(mockApi.exWeightAdd).toHaveBeenCalledWith("2026-10-13", 76.5);
    expect(mockExerciseRefreshProfile).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("info", expect.stringContaining("76.5 kg"));
    expect(host.textContent).toContain("Pesaje guardado");
  });
});
