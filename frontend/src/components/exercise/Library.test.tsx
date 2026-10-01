// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string): Promise<unknown> => {
  if (method === "ex_list") return [];
  if (method === "ex_save") return { ok: true };
  if (method === "ex_meta") return { days: [{ key: "lunes", name: "Lunes", subtitle: "Pecho", glyph: "💪" }] };
  if (method === "ex_stats") {
    return {
      year: 2026,
      today: { done: 0, total: 0, pct: 0 },
      week: { done: 0, total: 0, pct: 0, trained: 0, due: 0 },
      month: { done: 0, total: 0, pct: 0, trained: 0, due: 0 },
      anual: { done: 0, total: 0, pct: 0, trained: 0, due: 0 },
      streak: { current: 0, best: 0 },
    };
  }
  if (method === "ex_overview") {
    return { week: 0, month: 0, year: 2026, grid: {}, breakdown: [] };
  }
  if (method === "ex_days") return [];
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { useExercise } from "../../store/exercise";
import { weekdayKeyOf } from "../../lib/exercise";
import { todayIso } from "../../lib/tasks";
import { ExerciseModule } from "./ExerciseModule";
import { Library } from "./Library";

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
    days: [{ key: "lunes", name: "Lunes", subtitle: "Pecho", glyph: "💪" }],
    list: [],
    stats: null,
    loaded: true,
    error: null,
  });
});

describe("ejercicio", () => {
  it("el progreso agrupa semanal, mensual y anual en una sola vista", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      // La barra lateral ya no ofrece Semanal, Mensual ni Anual sueltos.
      const side = () => [...host.querySelectorAll("aside nav button")];
      const labels = side().map((b) => b.textContent ?? "");
      expect(labels.some((l) => l.includes("Semanal"))).toBe(false);
      expect(labels.some((l) => l.includes("Mensual"))).toBe(false);
      expect(labels.some((l) => l.includes("Anual"))).toBe(false);
      expect(labels.some((l) => l.includes("Progreso"))).toBe(true);

      await act(async () => {
        side().find((b) => b.textContent?.includes("Progreso"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      // Dentro, los tres periodos como conmutador.
      const tabs = host.querySelector("[data-progress-tabs]")!;
      expect(tabs).not.toBeNull();
      expect(tabs.textContent).toContain("Semana");
      expect(tabs.textContent).toContain("Mes");
      expect(tabs.textContent).toContain("Año");

      // Solo se ve un periodo a la vez.
      expect(host.querySelectorAll("[data-progress-view]")).toHaveLength(1);
      expect(host.textContent).toContain("Semana");
    } finally {
      cleanup();
    }
  });
});

describe("Biblioteca de Ejercicio", () => {
  it("busca en el catálogo y añade a la rutina con músculos mapeados", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const input = host.querySelector('input[placeholder*="Buscar"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      await act(async () => {
        input.focus();
        // Simula escritura controlada por React
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "bench press");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.textContent).toContain("Bench Press");
      const add = [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Añadir"),
      );
      expect(add).not.toBeUndefined();
      await act(async () => {
        add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(invoke).toHaveBeenCalledWith(
        "ex_save",
        [
          "",
          expect.objectContaining({
            name: "Bench Press",
            muscles: expect.objectContaining({ primary: expect.arrayContaining(["pectoral"]) }),
          }),
        ],
      );
    } finally {
      cleanup();
    }
  });

  it("arranca mostrando los 302 y filtra por equipo", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const rows = () => host.querySelectorAll("[data-slug]").length;
      expect(rows()).toBe(302);

      const equipment = host.querySelector('select[aria-label="Filtrar por equipo"]') as HTMLSelectElement;
      expect(equipment).not.toBeNull();
      expect(equipment.options.length).toBeGreaterThan(5);
      await act(async () => {
        equipment.value = "Towel";
        equipment.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      expect(rows()).toBeGreaterThan(0);
      expect(rows()).toBeLessThan(302);
      // Todas las que quedan son de ese equipo.
      expect(host.textContent).not.toContain("Bodyweight ·");

      await act(async () => {
        const clear = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Limpiar"));
        clear!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(rows()).toBe(302);
    } finally {
      cleanup();
    }
  });

  it("no ofrece elegir día: añade al día de hoy", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      // Sin desplegable de días: los selects que hay son de filtros.
      expect(host.querySelector('select[aria-label*="día" i]')).toBeNull();

      const add = [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Añadir"),
      );
      await act(async () => {
        add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const save = invoke.mock.calls.find((c) => c[0] === "ex_save");
      expect(save).toBeDefined();
      // El día enviado es el de hoy, no un "lunes" fijo.
      const args = (save as unknown as unknown[])[1] as Array<{ day: string }>;
      expect(args[1]!.day).toBe(weekdayKeyOf(todayIso()));
    } finally {
      cleanup();
    }
  });

  it("filtra por músculo con el cuerpo de la columna izquierda", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const rows = () => host.querySelectorAll("[data-slug]").length;
      const body = host.querySelector("[data-library-body]");
      expect(body).not.toBeNull();

      // El cuerpo ofrece los músculos como botones, no un desplegable suelto.
      const pectoral = host.querySelector('[data-library-muscle="pectoral"]');
      expect(pectoral).not.toBeNull();

      await act(async () => {
        pectoral!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(rows()).toBeGreaterThan(10);
      expect(rows()).toBeLessThan(302);
      // Solo pectoral como principal.
      for (const row of host.querySelectorAll("[data-slug]")) {
        expect(row.textContent).not.toContain("Back ·");
      }

      // Un segundo clic quita el filtro.
      await act(async () => {
        host.querySelector('[data-library-muscle="pectoral"]')!.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
        await Promise.resolve();
      });
      expect(rows()).toBe(302);
    } finally {
      cleanup();
    }
  });

  it("el detalle tiene su propio botón de añadir y avisa si ya está en la rutina", async () => {
    useExercise.setState({
      list: [
        {
          id: "e1",
          day: "lunes",
          name: "Bench Press",
          video: "",
          video_path: "",
          series_reps: "4×8",
          rest: "90 s",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: ["pectoral"], secondary: ["triceps"] },
        },
        {
          id: "e2",
          day: "jueves",
          name: "Bench Press",
          video: "",
          video_path: "",
          series_reps: "4×6",
          rest: "90 s",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: ["pectoral"], secondary: [] },
        },
      ],
    });
    const { host, cleanup } = mount(<Library />);
    try {
      // Con algo en la rutina pero nada seleccionado, el panel invita a elegir.
      const idle = host.querySelector("[data-library-detail]")!;
      expect(idle.textContent).toContain("Elige un ejercicio");

      // Se elige el de press de banca y el panel avisa de que ya está.
      const row = [...host.querySelectorAll("[data-slug]")].find((r) =>
        r.textContent?.includes("Bench Press"),
      )!;
      await act(async () => {
        row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const detail = host.querySelector("[data-library-detail]")!;
      expect(detail.textContent).toContain("Ya en tu rutina");
      expect(detail.textContent).toContain("lunes");
      expect(detail.textContent).toContain("jueves");

      const add = detail!.querySelector("button");
      expect(add!.textContent).toContain("Añadir a hoy");
      await act(async () => {
        add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const save = invoke.mock.calls.find((c) => c[0] === "ex_save");
      expect(save).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("la lista y el detalle tienen scroll propio y la cabecera no se desplaza", () => {
    const { host, cleanup } = mount(<Library />);
    try {
      expect(host.querySelector("[data-library-toolbar]")).not.toBeNull();
      const scrollers = host.querySelectorAll("[data-library-scroll]");
      expect(scrollers.length).toBe(2);
      for (const s of scrollers) expect(s.className).toMatch(/overflow-y-auto/);
      // El contenedor raíz ya no hace scroll: si lo hiciera, el detalle se
      // iría de pantalla al bajar por la lista.
      const root = host.firstElementChild as HTMLElement;
      expect(root.className).not.toMatch(/overflow-y-auto/);
    } finally {
      cleanup();
    }
  });

  it("enfoca el buscador al entrar y Esc limpia la búsqueda", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const search = host.querySelector<HTMLInputElement>('input[aria-label="Buscar ejercicios"]')!;
      // Autofoco: se puede escribir sin clicar nada.
      expect(search).toBe(document.activeElement);

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(search, "squat");
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await Promise.resolve();
      });
      const filtered = host.querySelectorAll("[data-slug]").length;
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(302);

      // Esc vacía solo el texto, no los filtros de equipo/músculo.
      const equipment = host.querySelector<HTMLSelectElement>(
        'select[aria-label="Filtrar por equipo"]',
      )!;
      await act(async () => {
        equipment.value = "Barbell";
        equipment.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      await act(async () => {
        search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await Promise.resolve();
      });
      expect(search.value).toBe("");
      expect(equipment.value).toBe("Barbell");
    } finally {
      cleanup();
    }
  });

  it("muestra las ilustraciones locales sobre fondo oscuro (arte blanco)", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const imgs = [...host.querySelectorAll("img")] as HTMLImageElement[];
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        // Local offline, nunca CDN (CSP img-src 'self').
        expect(img.getAttribute("src")).toContain("workout-guide-assets/");
        expect(img.getAttribute("src")).not.toContain("http");
        // El arte es blanco monocromo: fondo claro lo vuelve invisible.
        expect(img.className).not.toMatch(/bg-white/);
      }
    } finally {
      cleanup();
    }
  });
});
