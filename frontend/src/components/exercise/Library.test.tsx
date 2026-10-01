// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BASE_INVOKE = async (method: string): Promise<unknown> => {
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
};
const invoke = vi.fn(BASE_INVOKE);
(window as unknown as { nv: unknown }).nv = { invoke };

import { useExercise } from "../../store/exercise";
import { useNavState } from "../../store/navState";
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
  invoke.mockReset();
  invoke.mockImplementation(BASE_INVOKE);
  // La navegación se recuerda en un store global; sin limpiarlo, una prueba
  // deja la vista de Progreso apuntando donde la anterior la puso.
  useNavState.setState({ values: {} });
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

      // Dentro, Rejilla · Músculos · Año.
      const tabs = host.querySelector("[data-progress-tabs]")!;
      expect(tabs.textContent).toContain("Rejilla");
      expect(tabs.textContent).toContain("Músculos");
      expect(tabs.textContent).toContain("Año");

      // Solo se ve una vista a la vez.
      expect(host.querySelectorAll("[data-progress-view]")).toHaveLength(1);
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

  it("Tu rutina tiene buscador de biblioteca y deja elegir el día", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      // El buscador de la biblioteca vive dentro del formulario de tu rutina.
      const picker = host.querySelector("[data-library-picker]")!;
      expect(picker).not.toBeNull();
      const search = picker.querySelector('input[aria-label="Buscar en la biblioteca"]') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(search, "bench press");
        search.dispatchEvent(new Event("input", { bubbles: true }));
        search.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      const hit = picker.querySelector("[data-library-pick]")!;
      expect(hit).not.toBeNull();

      // Al elegirlo se rellena el formulario con su musculación.
      await act(async () => {
        hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const name = host.querySelector('input[aria-label="Nombre"]') as HTMLInputElement;
      expect(name.value).toBe("Bench Press");

      // Y el día lo elige quien añade, no la app.
      const day = host.querySelector('select[aria-label="Día"]') as HTMLSelectElement;
      expect(day).not.toBeNull();
      expect(day.value).toBe("lunes");
    } finally {
      cleanup();
    }
  });

  it("el buscador de la biblioteca marca lo que ya está en la rutina", async () => {
    // "Bench Press" ya está en la rutina: lo dice el backend, no el store,
    // porque al montar el módulo se recarga la lista.
    invoke.mockImplementation(async (method: string) => {
      if (method === "ex_list")
        return [
          {
            id: "e1",
            day: "lunes",
            name: "Bench Press",
            video: "",
            video_path: "",
            series_reps: "",
            rest: "",
            how_to: "",
            has_video: false,
            video_name: "",
            muscles: { primary: ["pectoral"], secondary: [] },
          },
        ];
      return BASE_INVOKE(method);
    });
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const picker = host.querySelector("[data-library-picker]")!;
      const search = picker.querySelector('input[aria-label="Buscar en la biblioteca"]') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(search, "bench press");
        search.dispatchEvent(new Event("input", { bubbles: true }));
        search.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      const hit = picker.querySelector('[data-library-pick="bench-press"]')!;
      expect(hit.getAttribute("data-in-routine")).toBe("true");
      expect(hit.textContent).toContain("ya en tu rutina");
    } finally {
      cleanup();
    }
  });

  it("la Biblioteca y Gestionar son un apartado con dos pestañas", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      const side = () => [...host.querySelectorAll("aside nav button")];
      const labels = side().map((b) => b.textContent ?? "");
      // Un solo item: ni "Biblioteca" ni "Gestionar ejercicios" sueltos.
      expect(labels.some((l) => l.includes("Gestionar ejercicios"))).toBe(false);
      expect(labels.filter((l) => l.includes("Ejercicios")).length).toBe(1);

      await act(async () => {
        side().find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const tabs = [...host.querySelectorAll("[data-exercises-tab]")].map((t) =>
        t.textContent?.trim(),
      );
      expect(tabs).toEqual(["Tu rutina", "Biblioteca"]);
    } finally {
      cleanup();
    }
  });

  it("añadir desde la Biblioteca deja el formulario a mano en el detalle", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      await act(async () => {
        host.querySelector('[data-exercises-tab="biblioteca"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const add = host.querySelector("[data-library-add]")!;
      expect(add).not.toBeNull();
      await act(async () => {
        add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      // Ya en la rutina, el panel ofrece series y descanso sin salir.
      const detail = host.querySelector("[data-library-detail]")!;
      expect(detail.querySelector('input[aria-label="Series × reps"]')).not.toBeNull();
      expect(detail.querySelector('input[aria-label="Descanso"]')).not.toBeNull();
      expect(add.getAttribute("data-library-added")).toBe("true");
    } finally {
      cleanup();
    }
  });

  it("el progreso tiene tres pestañas, no cinco", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Progreso"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const tabs = [...host.querySelectorAll("[data-progress-tab]")].map((t) =>
        t.textContent?.trim(),
      );
      // Semana y Mes viven en una; Mapa y Gráfica, en otra.
      expect(tabs).toEqual(["Rejilla", "Músculos", "Año"]);
    } finally {
      cleanup();
    }
  });

  it("la pestaña Rejilla trae el selector de periodo y la rejilla", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Progreso"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      // El estado de navegación es global: se elige la pestaña explícitamente.
      await act(async () => {
        host.querySelector('[data-progress-tab="rejilla"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const period = host.querySelector("[data-grid-period]")!;
      expect(period).not.toBeNull();
      expect(period.textContent).toContain("Semana");
      expect(period.textContent).toContain("Mes");

      await act(async () => {
        host.querySelector('[data-grid-period="mes"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.textContent).toContain("Mes");
    } finally {
      cleanup();
    }
  });

  it("la pestaña Músculos alterna entre el mapa grande y la gráfica", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Progreso"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      await act(async () => {
        host.querySelector('[data-progress-tab="musculos"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      await act(async () => {
        host.querySelector('[data-progress-tab="musculos"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const sub = host.querySelector("[data-muscle-view]")!;
      expect(sub).not.toBeNull();
      expect(sub.textContent).toContain("Gráfica");
      expect(sub.textContent).toContain("Cuerpo");

      await act(async () => {
        host.querySelector('[data-muscle-view="mapa"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.querySelector("[data-progress-map]")).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("el progreso tiene una gráfica de líneas con un selector de grupos", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Progreso"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      // La gráfica vive en Músculos → Gráfica.
      await act(async () => {
        host.querySelector('[data-progress-tab="musculos"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const graph = host.querySelector("[data-progress-graph]")!;
      expect(graph).not.toBeNull();

      // Un botón por grupo muscular: se encienden y apagan.
      const toggles = graph.querySelectorAll("[data-group-toggle]");
      expect(toggles.length).toBeGreaterThanOrEqual(6);
      // Todos encendidos al entrar.
      for (const t of toggles) expect(t.getAttribute("aria-pressed")).toBe("true");
      const first = toggles[0]!;
      const group = first.getAttribute("data-group-toggle");

      await act(async () => {
        first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      // Apagado: queda en false y su línea desaparece del SVG.
      expect(first.getAttribute("aria-pressed")).toBe("false");
      const legend = graph.textContent ?? "";
      expect(legend).not.toContain(`${group}: `);

      // Y se vuelve a encender.
      await act(async () => {
        host.querySelector(`[data-group-toggle="${group}"]`)!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(
        host.querySelector(`[data-group-toggle="${group}"]`)!.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(host.textContent).toContain("Volumen por grupo");
    } finally {
      cleanup();
    }
  });

  it("el progreso tiene una cuarta pestaña: el mapa con métricas", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Progreso"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const tabs = host.querySelector("[data-progress-tabs]")!;
      expect(tabs.textContent).toContain("Músculos");

      await act(async () => {
        host.querySelector('[data-progress-tab="musculos"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        host.querySelector('[data-muscle-view="mapa"]')!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      // El mapa grande, con su cuerpo y las métricas por músculo.
      const map = host.querySelector("[data-progress-map]")!;
      expect(map).not.toBeNull();
      expect(host.querySelectorAll("[data-progress-view]")).toHaveLength(1);
      expect(host.textContent).toContain("En la semana");
      expect(host.textContent).toContain("sesiones");
      expect(host.textContent).toContain("reps");
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
