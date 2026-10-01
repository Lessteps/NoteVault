// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** El rango que pide la vista, y unos días con trabajo real. */
const calls: Array<[string, unknown[]]> = [];
const invoke = vi.fn(async (method: string, args: unknown[]): Promise<unknown> => {
  calls.push([method, args ?? []]);
  if (method === "ex_list") return [];
  if (method === "ex_days") {
    const [from, to] = args as [string, string];
    const out: unknown[] = [];
    for (let d = from; d <= to; d = nextIso(d)) {
      out.push({
        date: d,
        exercises: [{ id: "e1", name: "Press banca" }],
        log: { e1: { done: true, reps: 20 } },
      });
    }
    return out;
  }
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

function nextIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

import { useExercise } from "../../store/exercise";
import { ProgressGraph } from "./ProgressGraph";

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
  calls.length = 0;
  invoke.mockClear();
  useExercise.setState({
    days: [{ key: "lunes", name: "Lunes", subtitle: "Pecho", glyph: "💪" }],
    // El press banca trabaja pectoral de principal y tríceps de secundario.
    list: [
      {
        id: "e1",
        day: "lunes",
        name: "Press banca",
        video: "",
        video_path: "",
        series_reps: "4×8",
        rest: "",
        how_to: "",
        has_video: false,
        video_name: "",
        muscles: { primary: ["pectoral"], secondary: ["triceps"] },
      },
    ] as never,
    stats: null,
    loaded: true,
    error: null,
  });
});

describe("ProgressGraph", () => {
  it("dibuja una línea por grupo con días trabajados", async () => {
    const { host, cleanup } = mount(<ProgressGraph period="semana" />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // Dos grupos con datos: Pecho y Brazos.
      expect(host.querySelectorAll("[data-group-toggle]").length).toBe(6);
      expect(host.textContent).toContain("Pecho: 7 días");
      expect(host.textContent).toContain("Brazos: 7 días");
      expect(host.querySelectorAll("path")).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("trocea el rango del año: ninguna petición pasa de 31 días", async () => {
    const { cleanup } = mount(<ProgressGraph period="anio" />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const asked = calls.filter(([m]) => m === "ex_days");
      // Un año son 365 días, así que tiene que salirse en varios trozos.
      expect(asked.length).toBeGreaterThan(1);
      for (const [, args] of asked) {
        const [from, to] = args as [string, string];
        const span = Math.round(
          (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
        );
        // ex_days lanza ApiError con rangos de más de 31 días.
        expect(span).toBeLessThanOrEqual(31);
      }
    } finally {
      cleanup();
    }
  });
});