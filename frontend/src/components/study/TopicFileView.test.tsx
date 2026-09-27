// @vitest-environment jsdom
//
// Area A: a `type: practica` file opens the topic's practice surface in a
// full-screen tab — the progress summary and the configurator — instead of the
// markdown editor.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { StudySnapshot, TopicData } from "../../lib/types";
import { toOpenNote } from "../../store/app";
import { TopicFileView } from "./TopicFileView";

const note = toOpenNote({
  path: "Matemáticas/1 Aritmética/1.1 Números naturales/1.1 Números naturales.practica.md",
  title: "1.1 Números naturales",
  kind: "note",
  raw: "---\ntype: practica\n---\n\n# Práctica\n",
  frontmatter: { type: "practica", subject: "mathematics" },
  modified: 1,
  bookmarked: false,
} as never);

const topicData = {
  is_topic: true,
  folder: "Matemáticas/1 Aritmética/1.1 Números naturales",
  topic: {
    type: "topic",
    subject: "mathematics",
    title: "1.1 Números naturales",
    skills: ["solve", "process", "prove", "counterexample", "true_false", "find_error", "drill", "explain"],
    mastery: { min_per_skill: 6, target_difficulty: 3, exam: "required" },
  },
  progress: { completenessPct: 50, skills: {}, examPassed: false, isComplete: false, exercises: 0 },
  exercises: [],
  theory_notes: [],
} as unknown as TopicData;

const snapshot = { queue: { items: [], gaps: [], counts: { recommendations: 0, srs_exercises: 0, cards: 0, total: 0 } } } as unknown as StudySnapshot;

let container: HTMLDivElement;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<TopicFileView note={note} />);
  });
}

/** The component loads its data through the bridge; let the promises settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "studyTopicGet").mockResolvedValue(topicData);
  vi.spyOn(api, "studySnapshot").mockResolvedValue(snapshot);
});

describe("TopicFileView", () => {
  it("opens as a full view with the topic, its completeness and two tabs", async () => {
    mount();
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain("Práctica del tema");
    expect(text).toContain("1.1 Números naturales");
    expect(text).toContain("50%");
    expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())).toEqual([
      "Resumen",
      "Practicar",
    ]);
    expect(api.studyTopicGet).toHaveBeenCalledWith(note.path);
  });

  it("shows the progress summary first and the configurator on Practicar", async () => {
    mount();
    await settle();

    // Resumen (default tab): the topic's own progress surface.
    expect(container.textContent).toContain("Matriz de competencias (Skill × Dificultad)");

    const practicar = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
      t.textContent?.includes("Practicar"),
    )!;
    act(() => practicar.click());

    const text = container.textContent ?? "";
    expect(text).toContain("Competencia a entrenar");
    expect(text).toContain("Dificultad");
    for (const mode of ["Problema", "Demostración", "Contraejemplo", "Cálculo rápido"]) {
      expect(text, `missing “${mode}”`).toContain(mode);
    }
  });

  it("offers to turn a folder into a topic when it is not one yet", async () => {
    vi.spyOn(api, "studyTopicGet").mockResolvedValue({ is_topic: false, folder: "Matemáticas/Suelta" } as unknown as TopicData);
    mount();
    await settle();

    expect(container.textContent).toContain("no es todavía un tema");
    expect(container.textContent).toContain("Convertir en tema");
  });
});
