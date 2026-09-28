// @vitest-environment jsdom
//
// Area D of FIX_VIEWS: a `type: resumen` file is a **completion dashboard**, not
// a competency matrix — a ring per area at the subject root (a ring per topic in
// an area), each card expanding down to the per-topic skill rings and what is
// still missing.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { TopicDashboardData } from "../../lib/types";
import { toOpenNote, useApp } from "../../store/app";
import { ResumenView } from "./ResumenView";

const viewNote = (scope: string, title: string) =>
  toOpenNote({
    path: `${scope}/${title}.resumen.md`,
    title,
    kind: "note",
    raw: `---\ntype: resumen\nscope: ${scope}\n---\n`,
    frontmatter: { type: "resumen", subject: "mathematics", scope, title },
    modified: 1,
    bookmarked: false,
  } as never);

const subjectNote = viewNote("Matemáticas", "Matemáticas");
const areaNote = viewNote("Matemáticas/1 Aritmética elemental y operativa", "1 Aritmética elemental y operativa");

const skill = (
  id: string,
  label: string,
  description: string,
  cells: Record<number, [attempts: number, passes: number]>,
  mastered = false,
) => ({
  skill: id,
  label,
  description,
  status: mastered ? "consolidated" : "practicing",
  totalAttempts: Object.values(cells).reduce((a, [att]) => a + att, 0),
  totalPasses: Object.values(cells).reduce((a, [, pass]) => a + pass, 0),
  bestScore: 80,
  highestPassedDifficulty: 2,
  consolidated: mastered,
  mastered,
  cells: Object.fromEntries(
    [1, 2, 3].map((d) => [
      d,
      { skill: id, difficulty: d, attempts: cells[d]?.[0] ?? 0, passes: cells[d]?.[1] ?? 0, bestScore: null },
    ]),
  ),
});

const topic = (folder: string, title: string, pct: number, complete: boolean, skills: Record<string, unknown>) => ({
  folder,
  area: folder.split("/")[1],
  subject: "mathematics",
  manifest: {
    type: "topic",
    subject: "mathematics",
    title,
    skills: Object.keys(skills),
    mastery: { min_per_skill: 6, target_difficulty: 3, exam: "required" },
  },
  progress: {
    topic: null,
    skills,
    examPassed: complete,
    examScore: complete ? 90 : null,
    isComplete: complete,
    completenessPct: pct,
    theoryNotesCount: 1,
    exerciseNotesCount: 4,
  },
});

const ARITHMETIC = "Matemáticas/1 Aritmética elemental y operativa";
const ALGEBRA = "Matemáticas/2 Álgebra elemental e intermedia";

const dashboard = {
  subjects: ["mathematics"],
  areas: ["1 Aritmética elemental y operativa", "2 Álgebra elemental e intermedia"],
  topics: [
    topic(`${ARITHMETIC}/1.1 Números naturales`, "1.1 Números naturales", 100, true, {
      solve: skill("solve", "Problema", "Resolución de problemas contextualizados y aplicados.", { 3: [7, 6] }, true),
    }),
    topic(`${ARITHMETIC}/1.2 Suma y resta`, "1.2 Suma y resta", 40, false, {
      solve: skill("solve", "Problema", "Resolución de problemas contextualizados y aplicados.", { 2: [5, 2] }),
    }),
    topic(`${ALGEBRA}/2.1 Términos`, "2.1 Términos algebraicos", 80, false, {
      prove: skill("prove", "Demostración", "Rigor matemático, proporciones formales y álgebra.", { 3: [4, 4] }),
    }),
  ],
} as unknown as TopicDashboardData;

let container: HTMLDivElement;

function mount(note = subjectNote, data: TopicDashboardData = dashboard) {
  vi.spyOn(api, "studyTopicDashboard").mockResolvedValue(data);
  vi.spyOn(api, "studyErrorDigest").mockResolvedValue({ text: "" });
  vi.spyOn(useApp.getState(), "openNote").mockResolvedValue(undefined);
  vi.spyOn(useApp.getState(), "toast").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<ResumenView note={note} />);
  });
}

const text = () => container.textContent ?? "";

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

const click = async (element: Element | null) => {
  await act(async () => {
    (element as HTMLElement | null)?.click();
    await Promise.resolve();
  });
};

describe("ResumenView", () => {
  it("is a completion dashboard at the subject root, never a competency matrix", async () => {
    mount(subjectNote);
    await settle();

    expect(text()).toContain("Resumen de la materia");
    expect(text()).toContain("Matemáticas");
    // One ring per internal area, both of them.
    expect(text()).toContain("1 Aritmética elemental y operativa");
    expect(text()).toContain("2 Álgebra elemental e intermedia");
    expect(text()).toContain("Áreas");
    // KPIs.
    for (const kpi of ["Temas", "Progreso", "Competencias", "Intentos"]) {
      expect(text(), `missing KPI ${kpi}`).toContain(kpi);
    }
    // The engine's numbers, not the whole vault's: 3 topics, one mastered.
    expect(text()).toContain("3/3");
    // And nothing that looks like the topic view's matrix.
    expect(text()).not.toContain("Matriz de competencias");
    expect(text()).not.toContain("SKILL × DIFICULTAD");
    expect(text()).not.toContain("Habilidad pedagógica");
    expect(container.querySelectorAll("svg[role=img]").length).toBeGreaterThanOrEqual(2);
  });

  it("shows one ring per topic when the scope is an area", async () => {
    mount(areaNote);
    await settle();

    expect(text()).toContain("Resumen del área");
    expect(text()).toContain("Temas");
    // The other area's topic is out of scope.
    expect(text()).not.toContain("2.1 Términos algebraicos");
    expect(text()).toContain("1.1 Números naturales");
    expect(text()).toContain("1.2 Suma y resta");
    expect(text()).not.toContain("Matriz de competencias");
  });

  it("expands an area into its topics and a topic into its skill rings and gaps", async () => {
    mount(subjectNote);
    await settle();

    // Closed at first: no topic rows yet.
    expect(text()).not.toContain("falta");

    const areaCard = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("1 Aritmética elemental y operativa"),
    )!;
    await click(areaCard);
    expect(text()).toContain("1.2 Suma y resta");

    const topicRow = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("1.2 Suma y resta"),
    )!;
    await click(topicRow);

    // Its skill rings, with the real numbers and what is missing.
    expect(text()).toContain("Problema");
    expect(text()).toContain("0/6"); // nothing passed at the target difficulty yet
    expect(text()).toContain("falta ★★★ Dif");
  });

  it("opens a topic's own practice view from its row", async () => {
    mount(areaNote);
    await settle();

    vi.spyOn(api, "studyViewEnsure").mockResolvedValue({
      ok: true,
      kind: "practica",
      path: `${ARITHMETIC}/1.1 Números naturales/1.1 Números naturales.practica.md`,
      created: [],
      tagged: [],
      errors: [],
    });
    const action = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Practicar")!;
    await click(action);
    await settle();
    await settle();

    expect(useApp.getState().openNote).toHaveBeenCalledWith(
      `${ARITHMETIC}/1.1 Números naturales/1.1 Números naturales.practica.md`,
    );
  });

  it("practises the whole scope: an area session, then its first exercise", async () => {
    mount(areaNote);
    await settle();

    const session = vi.spyOn(api, "studyAreaSessionBuild").mockResolvedValue({
      ok: true,
      skill: "solve",
      difficulty: 2,
      assistance: "no_help",
      exercises: [{ rel: `${ARITHMETIC}/1.1 Números naturales/Ejercicios/1.1-E01.md` }],
      first_exercise: `${ARITHMETIC}/1.1 Números naturales/Ejercicios/1.1-E01.md`,
    } as never);

    const practice = [...container.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Practicar el área"),
    )!;
    await click(practice);

    expect(session).toHaveBeenCalled();
    expect(useApp.getState().openNote).toHaveBeenCalledWith(
      `${ARITHMETIC}/1.1 Números naturales/Ejercicios/1.1-E01.md`,
    );
  });
});
