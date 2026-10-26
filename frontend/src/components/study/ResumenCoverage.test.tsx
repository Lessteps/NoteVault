// @vitest-environment jsdom
//
// Páginas de espacio y de área de Notas (`type: resumen`) con el currículo de referencia: marca de «falta de desarrollo» en las áreas relacionadas,
// tarjetas «Por crear» (dashed) para las áreas del currículo que aún no existen y la vista «Temas por crear» que se abre y se cierra con «Volver».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { TopicDashboardData } from "../../lib/types";
import { toOpenNote, useApp } from "../../store/app";
import { ResumenView } from "./ResumenView";
import { cover, row } from "../../lib/curriculumFixtures";
import { curriculumApi, useCurriculum } from "../../store/curriculum";

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

const FRONT = "Programación/5 Frontend";
const dashboard = {
  subjects: ["programming"],
  areas: ["5 Frontend", "2.2 JavaScript"],
  topics: [
    topic(`${FRONT}/5.1 Colores`, "5.1 Colores", 50, false, { solve: skill("solve", "Problema", "x", { 3: [7, 6] }) }),
    topic("Programación/2.2 JavaScript/2.2.1 Variables", "2.2.1 Variables", 20, false, { solve: skill("solve", "Problema", "x", { 3: [1, 1] }) }),
  ],
} as unknown as TopicDashboardData;
const subjectNote = viewNote("Programación", "Programación");
const areaNote = viewNote(FRONT, "5 Frontend");



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


const CSS = cover("css", "CSS", "12 CSS", [
  row("1", "Color", "parcial", "esencial", ["color"], [`${FRONT}/5.1 Colores`]),
  row("2", "Layout", "faltante"),
  row("3", "Layout", "faltante"),
  row("4", "Layout", "faltante"),
]);
const HTML = cover("html", "HTML", "11 HTML", [row("h1", "Base", "faltante"), row("h2", "Base", "faltante")]);
const GOOD = cover("java", "Java", "14 Java", [row("j1", "Base", "cubierto")]);
const capi = curriculumApi() as unknown as Record<string, unknown>;

beforeEach(() => {
  useCurriculum.setState({ areas: [], loaded: false, loading: false, error: "", pending: [], version: 0 });
  capi.studyCurriculumCoverage = vi.fn(async () => ({ areas: [CSS, HTML, GOOD] }));
  capi.studyCurriculumHandoffList = vi.fn(async () => []);
});
afterEach(() => {
  delete capi.studyCurriculumCoverage;
  delete capi.studyCurriculumHandoffList;
  container?.remove();
  vi.restoreAllMocks();
});

describe("ResumenView con el currículo de referencia", () => {
  it("en la página del espacio: marca en las áreas relacionadas y tarjeta «Por crear» para las áreas inexistentes con poco desarrollo (no para las bien cubiertas)", async () => {
    mount(subjectNote);
    await settle();
    await settle();
    const lacking = container.querySelectorAll("[data-testid=group-lacking]");
    expect(lacking).toHaveLength(1);
    expect(lacking[0]!.textContent).toContain("Desarrollo insuficiente · 13 % · faltan 3");
    expect(container.querySelector("[data-testid=pending-area-html]")!.textContent).toContain("Por crear");
    expect(container.querySelector("[data-testid=pending-area-java]")).toBeNull();
    expect(container.querySelector("[data-testid=pending-area-css]")).toBeTruthy(); // 12 CSS tampoco existe en la vault de este test
  });

  it("en la página de un área: banner de falta de desarrollo con «Ver temas por crear», y «Volver»", async () => {
    mount(areaNote);
    await settle();
    await settle();
    expect(container.querySelector("[data-testid=resumen-lacking]")!.textContent).toContain("CSS: Desarrollo insuficiente");
    await click(container.querySelector("[data-testid=coverage-open]"));
    expect(container.querySelector("[data-testid=curriculum-gaps]")!.getAttribute("data-area")).toBe("css");
    expect(text()).toContain("Temas por crear · CSS");
    await click(container.querySelector("[data-testid=gaps-back]"));
    expect(container.querySelector("[data-testid=curriculum-gaps]")).toBeNull();
    expect(text()).toContain("Resumen del área");
  });

  it("la tarjeta «Por crear» abre la vista de huecos del área", async () => {
    mount(subjectNote);
    await settle();
    await settle();
    await click(container.querySelector("[data-testid=pending-area-html]"));
    expect(container.querySelector("[data-testid=curriculum-gaps]")!.getAttribute("data-area")).toBe("html");
  });

  it("sin la operación del backend la página funciona igual, sin marcas", async () => {
    delete capi.studyCurriculumCoverage;
    mount(subjectNote);
    await settle();
    await settle();
    expect(container.querySelector("[data-testid=coverage-chip]")).toBeNull();
    expect(text()).toContain("5 Frontend");
  });
});
