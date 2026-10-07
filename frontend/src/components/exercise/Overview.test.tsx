// @vitest-environment jsdom
// Vista general absorbing lo que hacía Diaria: las flechas de fecha.
//
// Diaria era una copia de la mitad inferior de Vista general con `date = hoy`
// y un botón para cambiar de fecha. Aquí se fija que Vista general ya navega.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DAYS_VISTOS: string[] = [];
// El día que devuelve el backend, configurable por test: por defecto vacío.
let MOCK_EXERCISES: Array<{ id: string; name: string }> = [];
let MOCK_LOG: Record<string, { done?: boolean }> = {};

const invoke = vi.fn(async (method: string, ...rest: unknown[]): Promise<unknown> => {
  const argv = (rest[0] ?? []) as unknown[];
  if (method === "ex_list") return [];
  if (method === "ex_days") {
    const date = String(argv[0] ?? "");
    DAYS_VISTOS.push(date);
    return [{ date, day: "lunes", exercises: MOCK_EXERCISES, log: MOCK_LOG, pct: 0 }];
  }
  if (method === "ex_meta")
    return { days: [{ key: "lunes", name: "Lunes", subtitle: "Top A", glyph: "x" }] };
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
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { useExercise } from "../../store/exercise";
import { useNavState } from "../../store/navState";
import { ExerciseModule } from "./ExerciseModule";

function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, cleanup: () => act(() => root.unmount()) };
}

describe("Vista general con navegación de fechas", () => {
  beforeEach(() => {
    DAYS_VISTOS.length = 0;
    MOCK_EXERCISES = [];
    MOCK_LOG = {};
    invoke.mockClear();
    useNavState.setState({ values: {} });
    useExercise.setState({
      days: [{ key: "lunes", name: "Lunes", subtitle: "Top A", glyph: "x" }],
      list: [],
      stats: null,
      loaded: true,
      error: null,
    });
  });

  it("el sidebar ya no tiene Diaria: son tres pantallas", () => {
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      const items = [...host.querySelectorAll("aside nav button")].map((b) => b.textContent ?? "");
      expect(items.some((t) => t.includes("Diaria"))).toBe(false);
      expect(items.some((t) => t.includes("Vista general"))).toBe(true);
      expect(items.some((t) => t.includes("Progreso"))).toBe(true);
      expect(items.some((t) => t.includes("Ejercicios"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("Vista general trae los botones de fecha", () => {
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      const prev = host.querySelector('button[aria-label="Anterior"]');
      const next = host.querySelector('button[aria-label="Siguiente"]');
      expect(prev).not.toBeNull();
      expect(next).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("no repite las cifras que ya pintan los anillos", async () => {
    // Debajo de los anillos había seis `StatTile` con «días entrenados» de
    // semana/mes/año, «días con rutina» y «mejor racha». Los anillos ya dicen
    // `entrenados/deuda` de los tres periodos y `StreakLine` dice la mejor
    // racha: eran 96 px repitiendo lo de dos líneas más arriba, y empujaban
    // la sesión —lo único que se hace aquí— por debajo del fold.
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const txt = host.textContent ?? "";
      for (const muerta of [
        "Esta semana · días entrenados",
        "Este mes · días entrenados",
        "Días con rutina esta semana",
        "Días con rutina este mes",
        "Mejor racha del año",
      ]) {
        expect(txt).not.toContain(muerta);
      }
      // Y los anillos y la racha siguen ahí: no se han llevado por delante los
      // únicos que sobriamente informaban de algo.
      expect(txt).toContain("Semana");
      expect(txt).toContain("Mes");
      expect(txt).toContain("Año");
      expect(txt).toContain("Racha actual");
    } finally {
      cleanup();
    }
  });

  it("el héroe enseña la fecha y la píldora de pendientes del día abierto", async () => {
    // Rediseño premium: la cabecera es un héroe con la fecha grande y lo que
    // te queda, no una fila de botones sueltos. La píldora cuenta lo pendiente
    // del día abierto —hechos/total de la sesión— y no existe si no hay nada.
    MOCK_EXERCISES = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    MOCK_LOG = { a: { done: true } };
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const hero = host.querySelector("[data-overview-hero]");
      expect(hero).not.toBeNull();
      expect(hero!.textContent).toContain("hoy");
      const pill = host.querySelector("[data-pending-pill]");
      expect(pill).not.toBeNull();
      expect(pill!.textContent).toContain("1");
    } finally {
      cleanup();
    }
  });

  it("sin pendientes no hay píldora en el héroe", async () => {
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(host.querySelector("[data-overview-hero]")).not.toBeNull();
      expect(host.querySelector("[data-pending-pill]")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("la sesión lleva barra de progreso con hechos y total", async () => {
    // Antes era una píldora «1/2». Ahora es una barra fina con los mismos
    // números como valores accesibles: se ve el avance, no solo la cifra.
    MOCK_EXERCISES = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    MOCK_LOG = { a: { done: true } };
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const bar = host.querySelector("[data-session-progress]");
      expect(bar).not.toBeNull();
      expect(bar!.getAttribute("aria-valuenow")).toBe("1");
      expect(bar!.getAttribute("aria-valuemax")).toBe("2");
    } finally {
      cleanup();
    }
  });

  it("los anillos viven en el sidebar y la pantalla se queda con la racha", async () => {
    // Los cuatro anillos (Hoy, Semana, Mes, Año) se mudaron al sidebar, donde
    // están las estadísticas del módulo: ahí se ven desde cualquier pantalla,
    // no solo desde Vista general. La pantalla se queda con la racha.
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const side = host.querySelector("aside")!;
      const main = host.querySelector("main")!;
      for (const etiqueta of ["Hoy:", "Semana:", "Mes:", "Año:"]) {
        // Un anillo en el sidebar…
        const enSide = side.querySelector(`svg[aria-label^="${etiqueta}"]`);
        expect(enSide).not.toBeNull();
        // …y ninguno en la pantalla.
        expect(main.querySelector(`svg[aria-label^="${etiqueta}"]`)).toBeNull();
      }
      // La racha sigue en la pantalla.
      expect(main.textContent).toContain("Racha actual");
      // Y el sidebar ya no pinta las barras: eran los mismos cuatro números
      // en otro formato, y ahora los dicen los anillos.
      expect(side.querySelector('[data-side-bar]')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("pulsar anterior pide el día anterior", async () => {
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      // La carga inicial es una promesa: hay que dejar que resuelva antes de
      // mirar qué día se pidió.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const hoy = DAYS_VISTOS.at(-1)!;
      expect(hoy).toBeTruthy();
      await act(async () => {
        (host.querySelector('button[aria-label="Anterior"]') as HTMLElement)
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(DAYS_VISTOS.length).toBeGreaterThan(1);
      const pedido = DAYS_VISTOS.at(-1)!;
      const d = new Date(`${hoy}T12:00:00`);
      d.setDate(d.getDate() - 1);
      expect(pedido).toBe(d.toISOString().slice(0, 10));
    } finally {
      cleanup();
    }
  });

  it("«Ir a hoy» desde Tu programa vuelve al día de hoy", async () => {
    const { host, cleanup } = render(<ExerciseModule />);
    try {
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      // Se va dos días atrás desde Vista general…
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Vista general"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      await act(async () => {
        const prev = host.querySelector('button[aria-label="Anterior"]') as HTMLElement;
        prev.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        prev.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      const atras = DAYS_VISTOS.at(-1)!;
      // …y desde Tu programa, «Ir a hoy» devuelve a hoy.
      await act(async () => {
        [...host.querySelectorAll("aside nav button")]
          .find((b) => b.textContent?.includes("Ejercicios"))!
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      DAYS_VISTOS.length = 0;
      await act(async () => {
        (host.querySelector("[data-go-today]") as HTMLElement)
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      const d = new Date();
      expect(DAYS_VISTOS.at(-1)).toBe(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      // Y el día al que se había ido era anterior: eso prueba que estaba
      // mirando otro día de verdad y no que el botón no hiciera nada.
      expect(atras < (DAYS_VISTOS[0] ?? "")).toBe(true);
    } finally {
      cleanup();
    }
  });
});
