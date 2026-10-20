// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exDays = vi.fn(async () => [
  {
    date: "2026-10-12",
    day: "lu",
    exercises: [],
    pct: 50,
    log: {
      ex1: { done: true, weight: 80, reps: 10, notes: "" },
      ex2: { done: false, weight: 0, reps: 0, notes: "" },
    },
  },
]);

vi.mock("../../lib/bridge", () => ({
  api: {
    exDays: () => exDays(),
  },
}));

import { useExercise } from "../../store/exercise";
import { WeeklyMuscleVolume } from "./WeeklyMuscleVolume";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("WeeklyMuscleVolume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExercise.setState({
      list: [
        {
          id: "ex1",
          day: "lu",
          name: "Press de banca plano",
          video: "",
          video_path: "",
          series_reps: "4x10",
          rest: "90s",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: ["pectoral"], secondary: [] },
        },
        {
          id: "ex2",
          day: "lu",
          name: "Fondos en paralelas",
          video: "",
          video_path: "",
          series_reps: "3x12",
          rest: "90s",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: ["pectoral"], secondary: ["triceps"] },
        },
        {
          id: "ex3",
          day: "mi",
          name: "Sentadilla trasera",
          video: "",
          video_path: "",
          series_reps: "4x8",
          rest: "120s",
          how_to: "",
          has_video: false,
          video_name: "",
          muscles: { primary: ["quads"], secondary: ["glutes"] },
        },
      ],
    });
  });

  afterEach(() => {
    if (root && host) {
      act(() => {
        root!.unmount();
      });
      host.remove();
    }
    host = null;
    root = null;
  });

  it("renders KPI summary, hypertrophy scale legend, and muscle groups", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<WeeklyMuscleVolume />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain("Series semanales");
    expect(host.textContent).toContain("Mayor estímulo");
    expect(host.textContent).toContain("Pecho");
    expect(host.textContent).toContain("Rangos de volumen semanal basados en ciencia de hipertrofia");
    expect(host.textContent).toContain("10 - 20 series: Óptimo hipertrofia");

    // Muscle groups
    expect(host.textContent).toContain("Pecho");
    expect(host.textContent).toContain("Espalda");
    expect(host.textContent).toContain("Piernas");
    expect(host.textContent).toContain("Hombros");
    expect(host.textContent).toContain("Brazos");
    expect(host.textContent).toContain("Core");

    // Contributing exercises
    expect(host.textContent).toContain("Press de banca plano");
    expect(host.textContent).toContain("Fondos en paralelas");
  });
});
