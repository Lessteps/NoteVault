// @vitest-environment jsdom
//
// Las dos reglas que el usuario pidió y que son fáciles de romper sin querer:
// los cuatro dashboards circulares en el sidebar del módulo (se ven desde
// cualquier pantalla, no solo desde Vista general), y que la vista anual NO
// permita rellenar nada (solo se mira).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string): Promise<unknown> => {
  if (method === "ex_overview") return { week: 0, month: 0, year: 0, grid: {}, breakdown: [] };
  if (method === "ex_meta") return { days: [{ key: "lunes", name: "Lunes", subtitle: "Top A", glyph: "💪" }] };
  if (method === "ex_list") return [];
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { useExercise } from "../../store/exercise";
import { ExerciseModule } from "./ExerciseModule";
import { Yearly } from "./Yearly";

function mount(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, cleanup: () => act(() => root.unmount()) };
}

beforeEach(() => {
  invoke.mockClear();
  useExercise.setState({
    days: [{ key: "lunes", name: "Lunes", subtitle: "Top A", glyph: "💪" }],
    list: [],
    stats: null,
    loaded: true,
    error: null,
  });
});

describe("vista general de Ejercicio", () => {
  it("los cuatro dashboards circulares están en el sidebar, uno por periodo", () => {
    // Antes estaban arriba en Vista general; se mudaron al sidebar para verse
    // desde cualquier pantalla del módulo. Por eso aquí se monta el módulo
    // entero, no solo la vista: los anillos ya no viven en ella.
    useExercise.setState({
      stats: {
        year: 2026,
        today: { done: 1, total: 4, pct: 0.25 },
        week: { done: 3, total: 12, pct: 0.25, trained: 2, due: 4 },
        month: { done: 9, total: 40, pct: 0.225, trained: 6, due: 20 },
        anual: { done: 90, total: 400, pct: 0.225, trained: 60, due: 200 },
        streak: { current: 3, best: 7 },
      },
    });
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      const side = host.querySelector("aside")!;
      const main = host.querySelector("main")!;
      const rings = [...side.querySelectorAll('svg[role="img"]')]
        .map((s) => s.getAttribute("aria-label") ?? "")
        .filter((label) => /^(Hoy|Semana|Mes|Año):/.test(label));
      expect(rings).toEqual(["Hoy: 25%", "Semana: 25%", "Mes: 23%", "Año: 23%"]);
      // …y ninguno en la pantalla: ahí solo queda la racha, con la mejor.
      for (const etiqueta of ["Hoy:", "Semana:", "Mes:", "Año:"]) {
        expect(main.querySelector(`svg[aria-label^="${etiqueta}"]`)).toBeNull();
      }
      expect(main.textContent).toContain("Racha actual");
      expect(main.textContent).toContain("mejor del año: 7");
      expect(main.textContent).toContain("3 días");
    } finally {
      cleanup();
    }
  });
});

describe("vista anual de Ejercicio", () => {
  it("no ofrece ninguna casilla que rellenar", async () => {
    const { host, cleanup } = mount(<Yearly />);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(invoke).toHaveBeenCalledWith("ex_overview", [new Date().getFullYear(), ""]);
      expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
      expect(host.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
      // Lo único interactivo es elegir el año o el ejercicio, nunca marcar.
      const labels = [...host.querySelectorAll("button")].map((b) => b.textContent?.trim());
      expect(labels).not.toContain("Hecho");
    } finally {
      cleanup();
    }
  });
});
