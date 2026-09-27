// @vitest-environment jsdom
//
// Area C (Interfaces V3), verified by rendering: the per-topic configurator
// offers every mathematics mode (not only the ones the manifest happens to
// declare), plus difficulty, quantity and assistance.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TopicConfiguratorDialog } from "./TopicConfiguratorDialog";
import type { TopicData } from "../../lib/types";

/** The real shape of a seeded maths topic: `_tema.md` declares a subset. */
const topicData: TopicData = {
  is_topic: true,
  folder: "Matemáticas/1 Aritmética elemental y operativa/1.1 Números naturales",
  topic: {
    type: "topic",
    subject: "mathematics",
    title: "1.1 Números naturales, enteros y recta numérica",
    skills: ["solve", "process"],
    mastery: { min_per_skill: 6, target_difficulty: 3, exam: "required" },
  },
  exercises: [],
  theory_notes: [],
};

const MATH_MODES = [
  "Problema", "Procedimiento guiado", "Demostración", "Contraejemplo",
  "Verdadero o falso", "Encontrar el error", "Cálculo rápido", "Explicar (Feynman)",
];

let container: HTMLDivElement;

function mount(data: TopicData = topicData) {
  container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TopicConfiguratorDialog topicData={data} onClose={() => undefined} />);
  });
}

const buttons = () => [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");

beforeEach(() => mount());

describe("TopicConfiguratorDialog", () => {
  it("lists every mathematics mode, the declared ones first", () => {
    const labels = buttons();
    for (const label of MATH_MODES) {
      expect(labels.some((l) => l.includes(label)), `missing “${label}”`).toBe(true);
    }

    // solve / process are declared by the manifest; the rest is widened in.
    const positions = ["Problema", "Procedimiento guiado", "Demostración"].map((l) =>
      buttons().findIndex((b) => b.includes(l)),
    );
    expect(positions[0]).toBeLessThan(positions[1]!);
    expect(positions[1]).toBeLessThan(positions[2]!);
  });

  it("offers difficulty, quantity and assistance for the chosen mode", () => {
    const text = container.textContent ?? "";
    expect(text).toContain("Competencia a entrenar");
    expect(text).toContain("2. Dificultad");
    expect(text).toContain("3. Cantidad de ejercicios");
    expect(text).toContain("4. Nivel de Asistencia");
    for (const opt of ["3–5", "6–10", "11+", "Decide tú", "Sin ayuda (No Help)", "Asistente (Helper)"]) {
      expect(text, `missing “${opt}”`).toContain(opt);
    }
  });

  it("lets a widened mode be picked, and tracks it in the progress card", () => {
    expect(container.textContent).toContain("Problema · Nivel 1");

    const counterexample = [...container.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Contraejemplo"))!;
    act(() => counterexample.click());

    expect(container.textContent).toContain("Contraejemplo · Nivel 1");
  });
});
