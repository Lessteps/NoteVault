// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string): Promise<unknown> => {
  if (method === "ex_list") return [];
  if (method === "ex_days")
    return [
      {
        date: "2026-10-01",
        day: "jueves",
        exercises: [
          {
            id: "e1",
            day: "jueves",
            name: "Bench Press",
            video: "bench.mp4",
            video_path: "",
            series_reps: "4×5",
            rest: "2-3 min",
            how_to: "Escápulas retraídas",
            has_video: true,
            video_name: "bench.mp4",
            muscles: { primary: ["pectoral"], secondary: [] },
          },
          {
            id: "e2",
            day: "jueves",
            name: "Pull-ups",
            video: "",
            video_path: "",
            series_reps: "4×6",
            rest: "2-3 min",
            how_to: "",
            has_video: false,
            video_name: "",
            muscles: { primary: ["lats"], secondary: [] },
          },
        ],
        log: {},
        pct: 0,
      },
    ];
  if (method === "ex_meta") return { days: [{ key: "jueves", name: "Jueves", subtitle: "Top B", glyph: "x" }] };
  if (method === "ex_stats") {
    return {
      year: 2026,
      today: { done: 0, total: 2, pct: 0 },
      week: { done: 0, total: 0, pct: 0, trained: 0, due: 0 },
      month: { done: 0, total: 0, pct: 0, trained: 0, due: 0 },
      anual: { done: 0, total: 0, pct: 0, trained: 0, due: 0 },
      streak: { current: 0, best: 0 },
    };
  }
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { ExerciseRow } from "./ExerciseRow";
import type { Exercise } from "../../lib/types";

function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, cleanup: () => act(() => root.unmount()) };
}

const CON_VIDEO = {
  id: "e1",
  day: "jueves",
  name: "Bench Press",
  video: "bench.mp4",
  video_path: "",
  series_reps: "4×5",
  rest: "2-3 min",
  how_to: "",
  has_video: true,
  video_name: "bench.mp4",
  muscles: { primary: ["pectoral"], secondary: [] },
} as unknown as Exercise;

const SIN_VIDEO = { ...CON_VIDEO, id: "e2", name: "Pull-ups", video: "", has_video: false, video_name: "" } as unknown as Exercise;

describe("la fila de un ejercicio", () => {
  beforeEach(() => {
    invoke.mockClear();
  });

  it("con video, un solo control para abrirlo", () => {
    // Antes el nombre era un botón con un ▶ *y* además salía un botón «▶ Video»
    // al final: dos controles para la misma acción, separados por los campos.
    const { host, cleanup } = render(
      <ExerciseRow day="2026-10-01" ex={CON_VIDEO} entry={{}} onChanged={() => undefined} onVideo={() => undefined} />,
    );
    try {
      const controles = host.querySelectorAll(
        '[title^="Ver video"], button',
      );
      const abrenVideo = [...controles].filter(
        (b) => b.getAttribute("title")?.startsWith("Ver video") || b.textContent?.includes("Video"),
      );
      expect(abrenVideo).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("sin video, no hay ningún control de video", () => {
    const { host, cleanup } = render(
      <ExerciseRow day="2026-10-01" ex={SIN_VIDEO} entry={{}} onChanged={() => undefined} onVideo={() => undefined} />,
    );
    try {
      expect(host.querySelector('[title^="Ver video"]')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("el control abre el video del ejercicio", () => {
    const abiertos: string[] = [];
    const { host, cleanup } = render(
      <ExerciseRow day="2026-10-01" ex={CON_VIDEO} entry={{}} onChanged={() => undefined} onVideo={(e) => abiertos.push(e.id)} />,
    );
    try {
      const control = host.querySelector('[title="Ver video: Bench Press"]') as HTMLElement;
      act(() => {
        control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(abiertos).toEqual(["e1"]);
    } finally {
      cleanup();
    }
  });

  it("letras o negativos en kg/reps avisan y no se guardan", async () => {
    const { host, cleanup } = render(
      <ExerciseRow day="2026-10-01" ex={SIN_VIDEO} entry={{}} onChanged={() => undefined} onVideo={() => undefined} />,
    );
    try {
      const kg = host.querySelector('input[aria-label="Peso: Pull-ups"]') as HTMLInputElement;
      await act(async () => {
        kg.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(kg, "abc");
        kg.dispatchEvent(new Event("input", { bubbles: true }));
        kg.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      await act(async () => {
        kg.blur();
        await Promise.resolve();
        await Promise.resolve();
      });
      const error = host.querySelector("[data-row-error]");
      expect(error).not.toBeNull();
      expect(error!.textContent).toContain("Solo números");
      expect(invoke.mock.calls.some((c) => c[0] === "ex_mark")).toBe(false);
      // Al corregirlo, el error se va y guarda.
      await act(async () => {
        kg.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(kg, "80");
        kg.dispatchEvent(new Event("input", { bubbles: true }));
        kg.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      await act(async () => {
        kg.blur();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(host.querySelector("[data-row-error]")).toBeNull();
      expect(invoke.mock.calls.some((c) => c[0] === "ex_mark")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("tras un fallo al guardar ofrece reintentar en la fila", async () => {
    invoke.mockImplementation(async (method: string) => {
      if (method === "ex_mark") throw new Error("Fallo de disco");
      return { ok: true };
    });
    const { host, cleanup } = render(
      <ExerciseRow day="2026-10-01" ex={SIN_VIDEO} entry={{}} onChanged={() => undefined} onVideo={() => undefined} />,
    );
    try {
      const check = host.querySelector('input[aria-label="Hecho: Pull-ups"]') as HTMLInputElement;
      await act(async () => {
        check.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      const retry = host.querySelector("[data-row-retry]") as HTMLButtonElement | null;
      expect(retry).not.toBeNull();
      invoke.mockImplementation(async () => ({ ok: true }));
      await act(async () => {
        retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(host.querySelector("[data-row-status]")!.textContent).toContain("✓");
    } finally {
      cleanup();
    }
  });

  it("el descanso y el «cómo hacerlo» se ven siempre", () => {
    // `compact` los ocultaba, pero nadie lo usaba: cuatro ramas muertas.
    const { host, cleanup } = render(
      <ExerciseRow
        day="2026-10-01"
        ex={{ ...CON_VIDEO, how_to: "Escápulas retraídas" } as Exercise}
        entry={{}}
        onChanged={() => undefined}
        onVideo={() => undefined}
      />,
    );
    try {
      expect(host.textContent).toContain("2-3 min");
      expect(host.textContent).toContain("Escápulas retraídas");
    } finally {
      cleanup();
    }
  });

  it("el descanso abre un temporizador con los segundos del texto", () => {
    const { host, cleanup } = render(
      <ExerciseRow day="2026-10-01" ex={CON_VIDEO} entry={{}} onChanged={() => undefined} onVideo={() => undefined} />,
    );
    try {
      act(() => {
        (host.querySelector("[data-rest-timer]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // "2-3 min" → cota alta: 3:00.
      expect(host.querySelector("[data-rest-countdown]")!.textContent).toContain("03:00");
    } finally {
      cleanup();
    }
  });

  it("si el descanso no se entiende, pide segundos a mano", () => {
    const { host, cleanup } = render(
      <ExerciseRow
        day="2026-10-01"
        ex={{ ...CON_VIDEO, rest: "cuando puedas" } as Exercise}
        entry={{}}
        onChanged={() => undefined}
        onVideo={() => undefined}
      />,
    );
    try {
      act(() => {
        (host.querySelector("[data-rest-timer]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(host.querySelector("[data-rest-manual]")).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("el temporizador suma 15 s y se puede cerrar", () => {
    vi.useFakeTimers();
    try {
      const { host, cleanup } = render(
        <ExerciseRow day="2026-10-01" ex={{ ...CON_VIDEO, rest: "90s" } as Exercise} entry={{}} onChanged={() => undefined} onVideo={() => undefined} />,
      );
      try {
        act(() => {
          (host.querySelector("[data-rest-timer]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        act(() => {
          (host.querySelector("[data-rest-start]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        act(() => {
          vi.advanceTimersByTime(10000);
        });
        expect(host.querySelector("[data-rest-remaining]")!.textContent).toContain("01:20");
        act(() => {
          (host.querySelector("[data-rest-add]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(host.querySelector("[data-rest-remaining]")!.textContent).toContain("01:35");
        act(() => {
          (host.querySelector("[data-rest-close]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(host.querySelector("[data-rest-countdown]")).toBeNull();
      } finally {
        cleanup();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("muestra la última sesión y al hacer clic autocompleta el peso y reps", async () => {
    invoke.mockImplementation(async (method: string): Promise<unknown> => {
      if (method === "ex_history") {
        return [
          { date: "2026-09-20", weight: 70, reps: 10 },
          { date: "2026-09-27", weight: 75, reps: 8 },
        ];
      }
      return { ok: true };
    });

    const { host, cleanup } = render(
      <ExerciseRow
        day="2026-10-01"
        ex={CON_VIDEO}
        entry={{}}
        onChanged={() => undefined}
        onVideo={() => undefined}
      />,
    );

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const prevBtn = host.querySelector("[data-last-session]");
      expect(prevBtn).not.toBeNull();
      expect(prevBtn!.textContent).toContain("75kg");
      expect(prevBtn!.textContent).toContain("8");

      await act(async () => {
        prevBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const weightInput = host.querySelector('input[aria-label="Peso: Bench Press"]') as HTMLInputElement;
      const repsInput = host.querySelector('input[aria-label="Reps: Bench Press"]') as HTMLInputElement;
      expect(weightInput.value).toBe("75");
      expect(repsInput.value).toBe("8");

      expect(invoke).toHaveBeenCalledWith("ex_mark", ["2026-10-01", "e1", false, "75", "8", ""]);
    } finally {
      cleanup();
    }
  });
});
