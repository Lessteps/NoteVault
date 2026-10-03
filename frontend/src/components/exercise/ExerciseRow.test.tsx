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
});
