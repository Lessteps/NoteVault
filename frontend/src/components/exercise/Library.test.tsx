// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_INVOKE = async (method: string): Promise<unknown> => {
  if (method === "ex_list") return [];
  if (method === "ex_library_list") return [];
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
import { libraryFingerprint } from "../../lib/exerciseLibrary";
import { useDialog } from "../ui";
import { ExerciseModule } from "./ExerciseModule";
import { Library } from "./Library";

/**
 * Todos los montajes vivos de la prueba. Un test que se olvida de desmontar
 * deja un árbol entero escuchando en el store, y el siguiente falla de forma
 * intermitente según el orden.
 */
const mounted: Array<() => void> = [];

// Estas pruebas montan el módulo entero con los 302 ejercicios de la biblioteca
// en el DOM, y hay más de una anécdota. Con el límite por defecto de 5 s, bajo
// carga, alguna se pasa por poco y falla de forma intermitente. Mismo patrón que
// `glyphRecognizer.test.ts`.
vi.setConfig({ testTimeout: 30_000 });

function mount(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  const cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  mounted.push(cleanup);
  return { host, cleanup, banner: () => host.querySelector("[data-stale-banner]") };
}

// ── Aviso de copias desfasadas ────────────────────────────────────────────
//
// Una entrada propia en la biblioteca del vault, con sus pasos, y una copia en
// el programa que puede estar vieja. La huella se calcula con la misma función
// que la aplicación, así que el test no codifica un número mágico.

const MIA_1 = {
  slug: "mia-1",
  name: "Mi press",
  equipment: "Barra",
  muscles: { primary: ["pectoral"], secondary: ["triceps"] },
  how_to: "1. Baja\n2. Empuja",
};

/** La huella de `MIA_1` tal como la ve la aplicación ahora mismo. */
const CURRENT_FP = libraryFingerprint({
  slug: MIA_1.slug,
  name: MIA_1.name,
  how_toPropia: MIA_1.how_to,
  localPrimary: MIA_1.muscles.primary,
  localSecondary: MIA_1.muscles.secondary,
});

/** Las escrituras a ex_save que ha hecho el test, en orden. */
let savedAt: (n: number) => [string, Record<string, unknown>];

function seedRoutineCopy(over: Record<string, unknown>) {
  invoke.mockImplementation(async (method: string) => {
    if (method === "ex_save") return { ok: true, id: "e1" };
    if (method === "ex_library_list") return [MIA_1];
    if (method === "ex_list")
      return [
        {
          id: "e1",
          day: "lunes",
          name: "Mi press",
          video: "",
          video_path: "",
          series_reps: "",
          rest: "",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: ["pectoral"], secondary: [] },
          ...over,
        },
      ];
    return BASE_INVOKE(method);
  });
}

/** Monta el módulo, se queda en Ejercicios → Tu programa y deja que las
 *  entradas propias carguen: el aviso de desfasados depende de ellas. */
async function mountProgram() {
  const seen: Array<[string, Record<string, unknown>]> = [];
  const inner = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    const argv = (rest[0] ?? []) as unknown[];
    if (method === "ex_save") {
      seen.push([String(argv[0]), (argv[1] ?? {}) as Record<string, unknown>]);
    }
    return (inner as (...a: unknown[]) => Promise<unknown>)(method, ...rest);
  });
  // Índice negativo cuenta desde el final: savedAt(-1) es la última escritura.
  savedAt = (n) => seen[n < 0 ? seen.length + n : n]!;
  const view = mount(<ExerciseModule />);
  await act(async () => {
    [...view.host.querySelectorAll("aside nav button")]
      .find((b) => b.textContent?.includes("Ejercicios"))!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

/** Abre el panel del formulario en Tu programa (cerrado por defecto). */
async function openDrawer(host: { querySelector(s: string): Element | null }) {
  await act(async () => {
    (host.querySelector("[data-add-exercise]") as HTMLButtonElement)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  mounted.length = 0;
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

afterEach(() => {
  // Cualquier montaje que el test no haya desmontado se desmonta aquí.
  while (mounted.length) mounted.pop()!();
});

describe("ejercicio", () => {
  it("la barra lateral se colapsa a solo iconos y los anillos se apilan en vertical", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      const aside = () => host.querySelector("aside")!;
      expect(aside().className).toMatch(/w-\[260px\]/);
      const hide = host.querySelector('button[aria-label="Ocultar barra lateral"]') as HTMLButtonElement | null;
      expect(hide).not.toBeNull();
      await act(async () => {
        hide!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      // Colapsada: estrecha, sin etiquetas, solo los tres iconos.
      expect(aside().className).toMatch(/w-16/);
      const labels = [...host.querySelectorAll("aside nav button")].map((b) => b.textContent ?? "");
      expect(labels.every((l) => l.trim() === "")).toBe(true);
      expect(host.querySelectorAll("aside nav button")).toHaveLength(3);
      // Anillos en vertical.
      expect(host.querySelector("[data-period-rings]")!.className).toMatch(/grid-cols-1/);
      // Al ampliar vuelven a su posición original.
      const show = host.querySelector('button[aria-label="Mostrar barra lateral"]') as HTMLButtonElement | null;
      expect(show).not.toBeNull();
      await act(async () => {
        show!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(aside().className).toMatch(/w-\[260px\]/);
      expect([...host.querySelectorAll("aside nav button")].map((b) => b.textContent ?? "").some((l) => l.includes("Ejercicios"))).toBe(true);
      expect(host.querySelector("[data-period-rings]")!.className).toMatch(/grid-cols-2/);
    } finally {
      cleanup();
    }
  });

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

  it("los días vacíos colapsan y se expanden al pulsar", async () => {
    invoke.mockImplementation(async (method: string) => {
      if (method === "ex_meta")
        return { days: [
          { key: "lunes", name: "Lunes", subtitle: "Pecho", glyph: "💪" },
          { key: "martes", name: "Martes", subtitle: "Espalda", glyph: "🦵" },
        ] };
      if (method === "ex_list")
        return [
          {
            id: "e1", day: "lunes", name: "Press banca", video: "", video_path: "",
            series_reps: "4×8", rest: "90 s", how_to: "", has_video: false,
            video_name: "", muscles: { primary: ["pectoral"], secondary: [] },
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
        await Promise.resolve();
      });
      // Martes no tiene nada: plegado, sin filas.
      const toggle = host.querySelector('[data-routine-day-toggle="martes"]');
      expect(toggle).not.toBeNull();
      expect(host.querySelector('[data-routine-day="martes"] [data-routine-exercise]')).toBeNull();
      // Lunes sí tiene: abierto.
      expect(host.querySelector('[data-routine-day="lunes"] [data-routine-exercise]')).not.toBeNull();
      await act(async () => {
        toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.querySelector('[data-routine-day="martes"]')!.textContent).toContain("Sin ejercicios");
    } finally {
      cleanup();
    }
  });

  it("el formulario abre en un panel solo al añadir o editar", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      // Cerrado al entrar: la lista respira a ancho completo.
      expect(host.querySelector('input[aria-label="Nombre"]')).toBeNull();
      await act(async () => {
        host.querySelector("[data-add-exercise]")!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.querySelector('input[aria-label="Nombre"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("Tu programa tiene buscador de biblioteca y deja elegir el día", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      // El buscador de la biblioteca vive dentro del formulario de tu rutina.
      await openDrawer(host);
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

  it("un ejercicio escrito a mano con el mismo nombre no se marca como duplicado", async () => {
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
      await openDrawer(host);
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
      // Escrito a mano: mismo nombre, pero no vino de la biblioteca, así que no
      // es un duplicado. Antes esto se decidía comparando nombres y salía mal.
      expect(hit.getAttribute("data-in-routine")).toBeNull();
      expect(hit.textContent).not.toContain("ya en tu rutina");
    } finally {
      cleanup();
    }
  });

  it("un programa vacío ofrece la Biblioteca en vez de decir que hoy descansas", async () => {
    // El programa nace vacío. Decir «día de descanso» sería mentira, y
    // mandaría a la pantalla equivocada.
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const empty = host.querySelector("[data-program-empty]")!;
      expect(empty).not.toBeNull();
      expect(empty.textContent).toContain("no hay ejercicios");
      expect(empty.textContent).not.toContain("Día de descanso");

      // Y el atajo lleva a la Biblioteca, que es de donde se monta.
      await act(async () => {
        empty.querySelector("[data-go-biblioteca]")!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.querySelectorAll("[data-slug]").length).toBe(302);
    } finally {
      cleanup();
    }
  });

  it("una pestaña guardada que ya no existe cae en Tu programa", async () => {
    // Quien tenía guardada la pestaña vieja no debe quedarse en blanco.
    useNavState.setState({ values: { "ejercicio.ejercicios": "rutina" } });
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(
        host.querySelector('[data-exercises-tab="programa"]')?.getAttribute("aria-selected"),
      ).toBe("true");
    } finally {
      cleanup();
    }
  });

  it("Tu programa lleva a la sesión del día y se vuelve", async () => {
    const { host, cleanup } = mount(<ExerciseModule />);
    try {
      // Desde Ejercicios, «Ir a hoy» salta a Vista general sin pasar por el sidebar.
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const goToday = host.querySelector("[data-go-today]")!;
      expect(goToday).not.toBeNull();
      await act(async () => {
        goToday.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      // En Vista general: el botón de vuelta al programa.
      const back = host.querySelector("[data-go-program-view]")!;
      expect(back).not.toBeNull();
      await act(async () => {
        back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.querySelector('[data-exercises-tab="programa"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("copiar de la biblioteca guarda el origen y su huella", async () => {
  const { host, cleanup } = mount(<Library />);
  try {
    const saved: Array<Record<string, unknown>> = [];
    // En Electron el puente llama invoke(método, [args...]): el segundo
    // parámetro es el array de argumentos, no el primero de ellos.
    invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
      const argv = (rest[0] ?? []) as unknown[];
      if (method === "ex_save") {
        saved.push((argv[1] ?? {}) as Record<string, unknown>);
        return { ok: true, id: "nuevo" };
      }
      return BASE_INVOKE(method);
    });
    const add = host.querySelector("[data-library-add]")!;
    await act(async () => {
      add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved).toHaveLength(1);
    // El slug es de verdad uno del catálogo, no un marcador.
    expect(typeof saved[0]!.source).toBe("string");
    expect(String(saved[0]!.source)).not.toBe("undefined");
    expect(String(saved[0]!.source)).toMatch(/^[a-z0-9-]+$/);
    expect(String(saved[0]!.sourceFp).length).toBeGreaterThan(0);
  } finally {
    cleanup();
  }
});

it("el picker marca lo que ya usas por su origen, no por el nombre", async () => {
  invoke.mockImplementation(async (method: string) => {
    if (method === "ex_list")
      return [
        {
          id: "e1",
          day: "lunes",
          // Nombre DISTINTO del de la biblioteca, pero el mismo origen.
          name: "Mi press particular",
          video: "",
          video_path: "",
          series_reps: "",
          rest: "",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: [], secondary: [] },
          source: "bench-press",
          sourceFp: "x",
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
    await openDrawer(host);
    const picker = host.querySelector("[data-library-picker]")!;
    const search = picker.querySelector('input[aria-label="Buscar en la biblioteca"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(search, "bench press");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    // Con nombres distintos, comparar por nombre fallaría: sale marcado igual.
    expect(picker.querySelector('[data-library-pick="bench-press"]')!.getAttribute("data-in-routine")).toBe("true");
  } finally {
    cleanup();
  }
});

it("el formulario ofrece los dos botones, con nombres distintos", async () => {
  const { host, cleanup } = mount(<ExerciseModule />);
  try {
    await act(async () => {
      [...host.querySelectorAll("aside nav button")]
        .find((b) => b.textContent?.includes("Ejercicios"))!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await openDrawer(host);
    const toProgram = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Guardar ejercicio"),
    )!;
    const toLibrary = host.querySelector("[data-library-save]")!;
    expect(toProgram).toBeTruthy();
    expect(toLibrary.textContent).toContain("Biblioteca");
    expect(toLibrary.textContent).not.toBe(toProgram.textContent);
  } finally {
    cleanup();
  }
});

it("guardar en la biblioteca no escribe en el programa", async () => {
  const calls: string[] = [];
  invoke.mockImplementation(async (method: string) => {
    calls.push(method);
    if (method === "ex_library_save")
      return { entry: { slug: "mia-1", name: "Mío", equipment: "", muscles: { primary: ["pectoral"], secondary: [] }, how_to: "" }, created: true };
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
    // Un nombre primero: la biblioteca exige un nombre, el programa también.
    await openDrawer(host);
    const name = host.querySelector('input[aria-label="Nombre"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(name, "Mi ejercicio");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector("[data-library-save]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toContain("ex_library_save");
    // Lo importante: NO se escribió en el programa.
    expect(calls).not.toContain("ex_save");
  } finally {
    cleanup();
  }
});

it("el botón de la biblioteca no requiere día", async () => {
  const seen: unknown[] = [];
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    const argv = (rest[0] ?? []) as unknown[];
    if (method === "ex_library_save") {
      seen.push(argv[0]);
      return { entry: { slug: "mia-1", name: "Mío", equipment: "", muscles: { primary: [], secondary: [] }, how_to: "" }, created: true };
    }
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
    await openDrawer(host);
    const name = host.querySelector('input[aria-label="Nombre"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(name, "Solo biblioteca");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector("[data-library-save]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const payload = seen[0] as Record<string, unknown>;
    expect(payload).toBeTruthy();
    // La biblioteca no guarda días: un ejercicio de la biblioteca sirve para
    // cualquier día, y así lo añade quien lo usa.
    expect(payload.day).toBeUndefined();
    expect(payload.name).toBe("Solo biblioteca");
  } finally {
    cleanup();
  }
});

it("un fallo al guardar en la biblioteca no dice que se añadió al programa", async () => {
  invoke.mockImplementation(async (method: string) => {
    if (method === "ex_library_save") throw new Error("El ejercicio necesita un nombre.");
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
    await openDrawer(host);
    await act(async () => {
      host.querySelector("[data-library-save]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    // El mensaje del programa y el de la biblioteca son cosas distintas: un
    // fallo al guardar en la biblioteca no puede decir «Ejercicio añadido ✓».
    const panel = host.querySelector("aside")!;
    expect(panel.textContent).not.toContain("Ejercicio añadido");
  } finally {
    cleanup();
  }
});

it("avisa cuando una copia quedó desfasada", async () => {
  seedRoutineCopy({ source: "mia-1", sourceFp: "huella-vieja" });
  const { cleanup, banner } = await mountProgram();
  try {
    expect(banner()).not.toBeNull();
    expect(banner()!.textContent).toContain("cambió en la Biblioteca");
  } finally {
    cleanup();
  }
});

it("con auto-sync actualiza sola y no muestra el banner", async () => {
  useNavState.setState({ values: { "ejercicio.sync-auto": true } });
  seedRoutineCopy({
    name: "Vieja copia",
    series_reps: "4×8",
    source: "mia-1",
    sourceFp: "huella-vieja",
  });
  const { host } = await mountProgram();
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(host.querySelector("[data-stale-banner]")).toBeNull();
  const sent = savedAt(-1)[1] as Record<string, unknown>;
  expect(sent.name).toBe("Mi press");
  expect(sent.series_reps).toBeUndefined();
});

it("apagado no escribe nada hasta pulsar Actualizar", async () => {
  seedRoutineCopy({ source: "mia-1", sourceFp: "huella-vieja" });
  const { host } = await mountProgram();
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
  expect(host.querySelector("[data-stale-banner]")).not.toBeNull();
  expect(savedAt(-1)).toBeUndefined();
});

it("no avisa si nada ha cambiado", async () => {
  // La huella guardada es la de la entrada tal y como está: no hay nada que
  // actualizar.
  seedRoutineCopy({ source: "mia-1", sourceFp: CURRENT_FP });
  const { banner } = await mountProgram();
  expect(banner()).toBeNull();
});

it("no avisa si el origen ya no está en la biblioteca", async () => {
  // Review Focus 5: una entrada borrada a mano. Comparar su huella daría
  // «desfasado» sobre algo que ya no existe, y el aviso sería mentira.
  seedRoutineCopy({ source: "mia-borrada", sourceFp: "cualquiera" });
  const { banner } = await mountProgram();
  expect(banner()).toBeNull();
});

it("no avisa de los ejercicios escritos a mano", async () => {
  seedRoutineCopy({ source: "", sourceFp: "" });
  const { banner } = await mountProgram();
  expect(banner()).toBeNull();
});

it("actualizar solo toca los campos de la biblioteca", async () => {
  // El más importante del spec: tus números son tuyos.
  seedRoutineCopy({
    name: "Vieja copia",
    how_to: "Pasos viejos",
    muscles: { primary: ["pectoral"], secondary: [] },
    series_reps: "4×8",
    rest: "90 s",
    video_path: "",
    day: "martes",
    source: "mia-1",
    sourceFp: "huella-vieja",
  });
  const { banner } = await mountProgram();
  await act(async () => {
    banner()!.querySelector("[data-stale-update]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // El manejador encadena un exSave por copia y luego recarga la biblioteca:
    // varias vueltas para que todo se resuelva dentro del act.
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const sent = savedAt(-1)[1] as Record<string, unknown>;
  // Lo de la biblioteca entra.
  expect(sent.name).toBe("Mi press");
  expect(sent.how_to).toBe("1. Baja\n2. Empuja");
  expect(sent.muscles).toEqual({ primary: ["pectoral"], secondary: ["triceps"] });
  // Lo tuyo NO se manda, ni se toca: ex_save conserva lo que no llega.
  expect(sent.series_reps).toBeUndefined();
  expect(sent.rest).toBeUndefined();
  expect(sent.video_path).toBeUndefined();
  expect(sent.day).toBeUndefined();
  // Y la huella se actualiza, que es lo que cierra el aviso.
  expect(String(sent.sourceFp)).toBe(CURRENT_FP);
});

it("se puede descartar el aviso sin cambiar nada", async () => {
  seedRoutineCopy({ source: "mia-1", sourceFp: "huella-vieja" });
  const { cleanup, banner } = await mountProgram();
  try {
    await act(async () => {
      banner()!.querySelector("[data-stale-dismiss]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(banner()).toBeNull();
    expect(savedAt(-1)).toBeUndefined();
  } finally {
    cleanup();
  }
});

it("propone vincular una copia antigua sin origen", async () => {
  seedRoutineCopy({ name: "Mi press", source: "", sourceFp: "" });
  const { host } = await mountProgram();
  const orphan = () => host.querySelector("[data-orphan-banner]");
  expect(orphan()).not.toBeNull();
  expect(orphan()!.textContent).toContain("de la Biblioteca");
});

it("vincular guarda origen y huella sin tocar tus números", async () => {
  seedRoutineCopy({
    name: "Mi press",
    series_reps: "4×8",
    rest: "90 s",
    source: "",
    sourceFp: "",
  });
  const { host } = await mountProgram();
  await act(async () => {
    host.querySelector("[data-orphan-link]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const sent = savedAt(-1)[1] as Record<string, unknown>;
  expect(sent.source).toBe("mia-1");
  expect(String(sent.sourceFp)).toBe(CURRENT_FP);
  expect(sent.series_reps).toBeUndefined();
  expect(sent.rest).toBeUndefined();
});

it("mantener a mano no vuelve a proponer", async () => {
  seedRoutineCopy({ name: "Mi press", source: "", sourceFp: "" });
  const { host } = await mountProgram();
  await act(async () => {
    host.querySelector("[data-orphan-keep]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const sent = savedAt(-1)[1] as Record<string, unknown>;
  expect(sent.sourceFp).toBe("manual");
  expect(host.querySelector("[data-orphan-banner]")).toBeNull();
});

it("el botón Historial abre la ficha del ejercicio", async () => {
  seedRoutineCopy({ name: "Mi press", source: "", sourceFp: "" });
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    if (method === "ex_history") return [];
    const inner = BASE_INVOKE as (...a: unknown[]) => Promise<unknown>;
    if (method === "ex_save") return { ok: true, id: "e1" };
    if (method === "ex_library_list") return [MIA_1];
    if (method === "ex_list")
      return [
        {
          id: "e1", day: "lunes", name: "Mi press", video: "", video_path: "",
          series_reps: "", rest: "", how_to: "", has_video: false, video_name: "",
          muscles: { primary: ["pectoral"], secondary: [] }, source: "", sourceFp: "",
        },
      ];
    return inner(method, ...rest);
  });
  const { host } = await mountProgram();
  await act(async () => {
    host.querySelector('[title="Historial"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  expect(host.querySelector("[data-history-panel]")).not.toBeNull();
  expect(host.querySelector("[data-history-panel]")!.textContent).toContain("Mi press");
});

function seedTwoOnMonday() {
  useExercise.setState({
    days: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"].map((k) => ({
      key: k, name: k, subtitle: "", glyph: "💪",
    })),
  });  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    if (method === "ex_meta") return { days: [{ key: "lunes", name: "Lunes", subtitle: "", glyph: "💪" }, { key: "martes", name: "Martes", subtitle: "", glyph: "🦵" }, { key: "miercoles", name: "Miércoles", subtitle: "", glyph: "💪" }, { key: "jueves", name: "Jueves", subtitle: "", glyph: "🦵" }, { key: "viernes", name: "Viernes", subtitle: "", glyph: "🔥" }, { key: "sabado", name: "Sábado", subtitle: "", glyph: "🚶" }, { key: "domingo", name: "Domingo", subtitle: "", glyph: "😴" }] };
    if (method === "ex_library_list") return [MIA_1];
    if (method === "ex_list")
      return ["Press A", "Press B"].map((name, i) => ({
        id: `e${i + 1}`, day: "lunes", name, video: "", video_path: "",
        series_reps: "4×8", rest: "90 s", how_to: "", has_video: false, video_name: "",
        muscles: { primary: ["pectoral"], secondary: [] }, source: "mia-1", sourceFp: CURRENT_FP,
      }));
    return (BASE_INVOKE as (...a: unknown[]) => Promise<unknown>)(method, ...rest);
  });
}

it("duplicar día copia los ejercicios al destino con su origen", async () => {
  seedTwoOnMonday();
  const { host } = await mountProgram();
  await act(async () => {
    host.querySelector('[data-duplicate-day="lunes"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  const select = host.querySelector("[data-duplicate-target]") as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, "martes");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    host.querySelector("[data-duplicate-confirm]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const days = savedAt(-1) !== undefined
    ? [savedAt(-2), savedAt(-1)].map(([, f]) => f)
    : [];
  expect(days).toHaveLength(2);
  for (const f of days) {
    expect(f.day).toBe("martes");
    expect(f.source).toBe("mia-1");
  }
  expect((days[0] as Record<string, unknown>).series_reps).toBe("4×8");
});

it("mover cambia el día y conserva tus números", async () => {
  seedTwoOnMonday();
  const { host } = await mountProgram();
  await act(async () => {
    host.querySelector('[data-move-exercise="e1"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  const select = host.querySelector('[data-move-target="e1"]') as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, "martes");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    host.querySelector('[data-move-confirm="e1"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const [id, f] = savedAt(-1) as [string, Record<string, unknown>];
  expect(id).toBe("e1");
  expect(f.day).toBe("martes");
  expect(f.series_reps).toBeUndefined();
});

it("una entrada propia muestra «Sin imágenes» en vez de recuadros vacíos", async () => {
  invoke.mockImplementation(async (method: string) => {
    if (method === "ex_library_list")
      return [
        {
          slug: "mia-1",
          name: "Mi press",
          equipment: "Barra",
          muscles: { primary: ["pectoral"], secondary: [] },
          how_to: "1. Baja la barra\n2. Empuja",
        },
      ];
    return BASE_INVOKE(method);
  });
  const { host, cleanup } = mount(<Library />);
  try {
    // Las entradas propias se cargan del vault: hay que dejar que resuelvan.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const row = host.querySelector('[data-slug="mia-1"]')!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const detail = host.querySelector("[data-library-detail]")!;
    // Sin imágenes no se dibuja una tira de recuadros rotos.
    expect(detail.querySelector("img")).toBeNull();
    expect(detail.textContent).toContain("Sin imágenes");
    // Y el resto del detalle sigue ahí: esto no es un ejercicio vacío.
    expect(detail.textContent).toContain("Mi press");
    expect(detail.textContent).toContain("Barra");
  } finally {
    cleanup();
  }
});

it("una entrada propia con video lo muestra en el detalle", async () => {
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    if (method === "ex_library_list")
      return [
        {
          slug: "mia-1",
          name: "Mi press",
          equipment: "Barra",
          muscles: { primary: ["pectoral"], secondary: [] },
          how_to: "1. Baja\n2. Empuja",
          video_path: "ejercicio/videos/mio.mp4",
        },
      ];
    if (method === "ex_library_video_url") return { url: "http://video/mio.mp4", name: "mio.mp4" };
    return (BASE_INVOKE as (...a: unknown[]) => Promise<unknown>)(method, ...rest);
  });
  const { host, cleanup } = mount(<Library />);
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const row = host.querySelector('[data-slug="mia-1"]')!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const detail = host.querySelector("[data-library-detail]")!;
    expect(detail.querySelector("[data-library-video]")).not.toBeNull();
  } finally {
    cleanup();
  }
});

it("añadir desde la biblioteca hereda el video propio", async () => {
  const saved: Array<Record<string, unknown>> = [];
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    const argv = (rest[0] ?? []) as unknown[];
    if (method === "ex_library_list")
      return [
        {
          slug: "mia-1",
          name: "Mi press",
          equipment: "Barra",
          muscles: { primary: ["pectoral"], secondary: [] },
          how_to: "1. Baja\n2. Empuja",
          video_path: "ejercicio/videos/mio.mp4",
        },
      ];
    if (method === "ex_library_video_url") return { url: "http://video/mio.mp4", name: "mio.mp4" };
    if (method === "ex_save") {
      saved.push((argv[1] ?? {}) as Record<string, unknown>);
      return { ok: true, id: "nuevo" };
    }
    return (BASE_INVOKE as (...a: unknown[]) => Promise<unknown>)(method, ...rest);
  });
  const { host, cleanup } = mount(<Library />);
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const row = host.querySelector('[data-slug="mia-1"]')!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('[data-library-add="mia-1"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved.at(-1)!.video_path).toBe("ejercicio/videos/mio.mp4");
  } finally {
    cleanup();
  }
});

it("un ejercicio del catálogo sigue mostrando sus tres imágenes", async () => {
  const { host, cleanup } = mount(<Library />);
  try {
    const row = host.querySelector("[data-slug]")!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const detail = host.querySelector("[data-library-detail]")!;
    expect(detail.querySelectorAll("img").length).toBeGreaterThan(0);
    expect(detail.textContent).not.toContain("Sin imágenes");
  } finally {
    cleanup();
  }
});

it("añadir a hoy desde la Biblioteca copia TUS pasos, no un texto de relleno", async () => {
  // Revisión final, crítico: add() pedía las instrucciones sin tus entradas, así
  // que un ejercicio tuyo llegaba al programa con «Barra · Pectoral» en vez de
  // sus pasos. Es el camino del botón «Añadir».
  invoke.mockImplementation(async (method: string) => {
    if (method === "ex_library_list")
      return [
        {
          slug: "mia-1",
          name: "Mi press",
          equipment: "Barra",
          muscles: { primary: ["pectoral"], secondary: [] },
          how_to: "1. Baja la barra\n2. Empuja",
        },
      ];
    if (method === "ex_save") return { ok: true, id: "nuevo" };
    return BASE_INVOKE(method);
  });
  const saved: Array<Record<string, unknown>> = [];
  const inner = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    const argv = (rest[0] ?? []) as unknown[];
    if (method === "ex_save") saved.push((argv[1] ?? {}) as Record<string, unknown>);
    return (inner as (...a: unknown[]) => Promise<unknown>)(method, ...rest);
  });
  const { host, cleanup } = mount(<Library />);
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const row = host.querySelector('[data-slug="mia-1"]')!;
    await act(async () => {
      row.querySelector("[data-library-add]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved).toHaveLength(1);
    expect(String(saved[0]!.how_to)).toContain("Baja la barra");
    expect(String(saved[0]!.source)).toBe("mia-1");
  } finally {
    cleanup();
  }
});

it("una entrada propia se puede quitar de la biblioteca", async () => {
  // El «deshacer» de una edición: si escribiste encima de un ejercicio del
  // catálogo y te arrepientes, sin esto habría que editar el fichero a mano.
  const calls: string[] = [];
  const MIA = {
    slug: "mia-1",
    name: "Mi press",
    equipment: "Barra",
    muscles: { primary: ["pectoral"], secondary: [] },
    how_to: "1. Baja",
  };
  invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
    const argv = (rest[0] ?? []) as unknown[];
    if (method === "ex_library_list") return [MIA];
    if (method === "ex_library_remove") {
      calls.push(String(argv[0]));
      return true;
    }
    return BASE_INVOKE(method);
  });
  const { host, cleanup } = mount(<Library />);
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector('[data-slug="mia-1"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    const quitar = host.querySelector("[data-library-remove]")!;
    expect(quitar).not.toBeNull();
    await act(async () => {
      quitar.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Pide confirmación antes de borrar: es el «deshacer» de una edición. El
    // diálogo se pinta en DialogHost, en la raíz de la app, así que el test
    // responde por el store.
    expect(useDialog.getState().req?.title).toBe("Quitar de la biblioteca");
    await act(async () => {
      useDialog.getState().req?.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toContain("mia-1");
  } finally {
    cleanup();
  }
});

it("un ejercicio del catálogo no ofrece quitarse", async () => {
  const { host, cleanup } = mount(<Library />);
  try {
    const row = host.querySelector("[data-slug]")!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    // Los 302 no se quitan: no están en tu fichero, y quitarlos no sería deshacer
    // una edición sino borrar el catálogo.
    expect(host.querySelector("[data-library-remove]")).toBeNull();
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
      expect(tabs).toEqual(["Tu programa", "Biblioteca"]);
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
          // Vienen de la biblioteca: el aviso se decide por el origen.
          source: "bench-press",
          sourceFp: "x",
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
          source: "bench-press",
          sourceFp: "x",
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

  it("embebida en Ejercicios también ofrece buscador de texto", async () => {
    const { host, cleanup } = mount(<Library embedded />);
    try {
      const search = host.querySelector('input[aria-label="Buscar ejercicios"]') as HTMLInputElement | null;
      expect(search).not.toBeNull();
      const rows = () => host.querySelectorAll("[data-slug]").length;
      expect(rows()).toBe(302);
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(search!, "bench press");
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        search!.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      expect(rows()).toBeGreaterThan(0);
      expect(rows()).toBeLessThan(302);
      expect(host.textContent).toContain("Bench Press");
      // Sin botón "Limpiar": la X va dentro del buscador.
      expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Limpiar")).toBe(false);
      const clear = host.querySelector('button[aria-label="Limpiar búsqueda"]') as HTMLButtonElement | null;
      expect(clear).not.toBeNull();
      await act(async () => {
        clear!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(search!.value).toBe("");
      expect(rows()).toBe(302);
    } finally {
      cleanup();
    }
  });

  it("embebida también filtra por equipo", async () => {
    const { host, cleanup } = mount(<Library embedded />);
    try {
      const equipment = host.querySelector('select[aria-label="Filtrar por equipo"]') as HTMLSelectElement | null;
      expect(equipment).not.toBeNull();
      const rows = () => host.querySelectorAll("[data-slug]").length;
      expect(rows()).toBe(302);
      await act(async () => {
        equipment!.value = "Dumbbell";
        equipment!.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      expect(rows()).toBeGreaterThan(0);
      expect(rows()).toBeLessThan(302);
    } finally {
      cleanup();
    }
  });

  it("embebida marca favoritos con estrella y los filtra", async () => {
    const seen: string[] = [];
    const inner = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (method: string, ...rest: unknown[]) => {
      if (method === "ex_favorites") return [...seen];
      if (method === "ex_favorite_toggle") {
        const argv = (rest[0] ?? []) as unknown[];
        const slug = String(argv[0] ?? "");
        const i = seen.indexOf(slug);
        if (i >= 0) seen.splice(i, 1);
        else seen.push(slug);
        return { slug, on: seen.includes(slug) };
      }
      return (inner as (...a: unknown[]) => Promise<unknown>)(method, ...rest);
    });
    const { host, cleanup } = mount(<Library embedded />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const star = host.querySelector('[data-favorite]') as HTMLButtonElement | null;
      expect(star).not.toBeNull();
      const slug = star!.getAttribute("data-favorite")!;
      await act(async () => {
        star!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(star!.getAttribute("aria-pressed")).toBe("true");
      const only = host.querySelector('[data-favorites-only]') as HTMLButtonElement | null;
      expect(only).not.toBeNull();
      await act(async () => {
        only!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      const rows = [...host.querySelectorAll("[data-slug]")].map((r) => r.getAttribute("data-slug"));
      expect(rows).toEqual([slug]);
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
