// @vitest-environment jsdom
//
// The per-topic configurator offers ONLY the skills the topic declares (with the
// AI's plan, the ones it chose for that topic), plus difficulty, quantity and
// assistance.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MATHEMATICS_SKILLS } from "../../lib/skills";
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
  it("lists only the skills the topic declares", () => {
    const labels = buttons();
    expect(labels.some((l) => l.includes("Problema"))).toBe(true);
    expect(labels.some((l) => l.includes("Procedimiento guiado"))).toBe(true);
    for (const other of ["Demostración", "Contraejemplo", "Verdadero o falso", "Cálculo rápido", "Explicar (Feynman)"]) {
      expect(labels.some((l) => l.includes(other)), `“${other}” should not be offered`).toBe(false);
    }
  });

  it("offers difficulty, quantity and assistance for the chosen mode", () => {
    const text = container.textContent ?? "";
    expect(text).toContain("Competencia a entrenar");
    expect(text).toContain("2. Dificultad");
    expect(text).toContain("3. Cantidad de ejercicios");
    expect(text).toContain("4. Nivel de Asistencia");
    for (const opt of ["3–5", "6–10", "11+", "Lo que decidió la IA", "Sin ayuda (No Help)", "Asistente (Helper)"]) {
      expect(text, `missing “${opt}”`).toContain(opt);
    }
  });

  it("picks another declared skill and tracks it in the progress card", () => {
    expect(container.textContent).toContain("Problema · Nivel 1");
    const process = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Procedimiento guiado"))!;
    act(() => process.click());
    expect(container.textContent).toContain("Procedimiento guiado · Nivel 1");
  });

  it("with an AI plan, only planned difficulties can be chosen", () => {
    container.remove();
    mount({ ...topicData, topic: { ...topicData.topic!, plan: { solve: [0, 3, 2], process: [4, 0, 0] } } });
    const level = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
    // solve is selected first: easy is not planned for it.
    expect((level("Principiante") as HTMLButtonElement).disabled).toBe(true);
    expect((level("Intermedio") as HTMLButtonElement).disabled).toBe(false);
    expect(container.textContent).toContain("3 ej. planeados");
    expect(container.textContent).toContain("Fuera del plan");
  });

  it("shows a Spanish description on every offered skill", () => {
    const text = container.textContent ?? "";
    for (const skill of MATHEMATICS_SKILLS.filter((s) => ["solve", "process"].includes(s.id))) {
      expect(text, `“${skill.label}” has no description`).toContain(skill.description);
    }
  });
});
