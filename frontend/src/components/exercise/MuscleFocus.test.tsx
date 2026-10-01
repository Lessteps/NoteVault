// @vitest-environment jsdom
//
// Lo que el usuario pidió en esta ronda:
//  1. pasar el puntero por un músculo dice cómo se llama y qué ejercicio lo
//     trabaja (y lo mismo al pasar por la pastilla);
//  2. el enfoque muscular se ve en la vista diaria y en la semanal — el cuerpo de
//     cada día, en pequeño — y la rejilla del mes no lo lleva.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise, ExerciseDay } from "../../lib/types";

const SQUAT: Exercise = {
  id: "sq", day: "lunes", name: "Sentadilla", video: "", video_path: "",
  series_reps: "4x8", rest: "90 s", how_to: "", has_video: false, video_name: "",
  muscles: { primary: ["quads"], secondary: ["glutes"] },
};

/** Las fechas de un rango, `YYYY-MM-DD`. */
function eachDay(first: string, last: string): string[] {
  const out: string[] = [];
  for (const d = new Date(`${first}T12:00:00`); d <= new Date(`${last}T12:00:00`); d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** El día tal como lo devuelve la API: la sentadilla, solo los lunes. */
function dayOf(date: string): ExerciseDay {
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7; // 0 = lunes
  return { date, day: "", exercises: weekday === 0 ? [{ ...SQUAT }] : [], log: {}, pct: 0 };
}

const invoke = vi.fn(async (method: string, args?: unknown[]): Promise<unknown> => {
  if (method === "ex_days") return eachDay(String(args?.[0]), String(args?.[1])).map(dayOf);
  if (method === "ex_meta") return { days: [{ key: "lunes", name: "Lunes", subtitle: "Top A", glyph: "💪" }] };
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { useExercise } from "../../store/exercise";
import { Daily } from "./Daily";
import { ExerciseMonth, ExerciseWeek } from "./Grids";
import { MuscleFocusCard } from "./MuscleFocus";

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  invoke.mockClear();
  useExercise.setState({
    days: [{ key: "lunes", name: "Lunes", subtitle: "Top A", glyph: "💪" }],
    list: [SQUAT],
    stats: null,
    loaded: true,
    error: null,
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("enfoque muscular · el puntero", () => {
  it("nombra el músculo y el ejercicio que lo trabaja", () => {
    const host = mount(
      <MuscleFocusCard
        rows={[
          { id: "sq", name: "Sentadilla", primary: ["quads-rectus-femoris"], secondary: ["glutes-max"], done: false },
        ]}
      />,
    );
    expect(host.querySelector("[data-muscle-tip]")).toBeNull();

    const muscle = host.querySelector<SVGPathElement>('path[data-muscle="quads-rectus-femoris"]')!;
    expect(muscle).not.toBeNull();
    act(() => {
      muscle.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    const tip = host.querySelector("[data-muscle-tip]")!;
    expect(tip).not.toBeNull();
    expect(tip.textContent).toContain("Recto femoral");
    expect(tip.textContent).toContain("Sentadilla");
    expect(tip.textContent).toContain("principal");

    // Y al salir, la tarjeta se va.
    act(() => {
      muscle.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(host.querySelector("[data-muscle-tip]")).toBeNull();
  });

  it("una pastilla del día también señala al ejercicio", () => {
    const host = mount(
      <MuscleFocusCard rows={[{ id: "sq", name: "Sentadilla", primary: ["quads-rectus-femoris"], secondary: [], done: false }]} />,
    );
    const chip = host.querySelector<HTMLElement>('[data-focus="quads-rectus-femoris"]')!;
    act(() => {
      chip.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const tip = host.querySelector("[data-muscle-tip]")!;
    expect(tip).not.toBeNull();
    expect(tip.textContent).toContain("Sentadilla");
  });
});

describe("enfoque muscular · en qué vistas", () => {
  it("la diaria lo lleva al lado de los ejercicios", async () => {
    const host = mount(<Daily onVideo={() => undefined} onGoProgram={() => undefined} />);
    await settle();
    expect(host.querySelector("[data-muscle-focus]")).not.toBeNull();
  });

  it("la semana pinta el cuerpo de cada día", async () => {
    const host = mount(<ExerciseWeek />);
    await settle();
    const minis = [...host.querySelectorAll("[data-muscle-mini]")];
    expect(minis).toHaveLength(7);
    // El lunes tiene rutina; el martes no, así que se queda apagado.
    expect(minis[0]!.querySelectorAll(".nv-muscle--primary").length).toBeGreaterThan(0);
    expect(minis[1]!.querySelectorAll(".nv-muscle--primary")).toHaveLength(0);
  });

  it("el mes no lo lleva", async () => {
    const host = mount(<ExerciseMonth />);
    await settle();
    expect(host.querySelectorAll("[data-muscle-mini]")).toHaveLength(0);
  });
});
