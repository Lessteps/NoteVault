// @vitest-environment jsdom
//
// Detalle de un tema (`TopicInsight`) y sus dos puntos de enganche: la fila de «Temas de hoy» (Ejecución, `AreaWork`) y la tabla de «Temas <Área>» (Planeación).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorPlan, ReviewItem, TopicData } from "../../lib/types";
import type { PlanTopicRow } from "../../lib/planTopicCatalog";

const openTopic = vi.fn();
const openTopicNote = vi.fn();
vi.mock("./openTopic", () => ({ openTopic: (f: string) => openTopic(f), openTopicNote: (f: string) => openTopicNote(f), openTopicCanvas: vi.fn() }));
import { AreaWork } from "./AreaWork";
import { PlanAreaTopics } from "./PlanAreaTopics";
import { clearTopicInsightCache, TopicInsight } from "./TopicInsight";
import type { BoardRow } from "./PlanBoard";

const FOLDER = "P/4/4.1 What the backend is";
const cell = (skill: string, difficulty: 1 | 2 | 3, attempts: number, passes: number, required: number) => ({ skill, difficulty, attempts, passes, bestScore: attempts ? 80 : null, required });
const topicData = (over: Record<string, unknown> = {}): TopicData => ({
  is_topic: true,
  folder: FOLDER,
  topic: { type: "topic", subject: "programming", title: "What the backend is", skills: ["recall", "apply"], mastery: {} } as never,
  progress: {
    topic: {} as never,
    skills: {
      recall: { skill: "recall", label: "Recordar", description: "", status: "practicing", totalAttempts: 4, totalPasses: 3, bestScore: 90, highestPassedDifficulty: 1, cells: { 1: cell("recall", 1, 4, 3, 12), 2: cell("recall", 2, 0, 0, 0), 3: cell("recall", 3, 0, 0, 0) }, consolidated: false, mastered: false },
      apply: { skill: "apply", label: "Aplicar", description: "", status: "not_started", totalAttempts: 0, totalPasses: 0, bestScore: null, highestPassedDifficulty: 0, cells: { 1: cell("apply", 1, 0, 0, 12), 2: cell("apply", 2, 0, 0, 0), 3: cell("apply", 3, 0, 0, 0) }, consolidated: false, mastered: false },
    },
    examPassed: false, examScore: null, isComplete: false, completenessPct: 12, theoryNotesCount: 1, exerciseNotesCount: 24,
  } as never,
  theory_notes: [{ rel: `${FOLDER}/x.md`, title: "x" }],
  exercises: new Array(24).fill({}) as never,
  ...over,
} as TopicData);
const review = (over: Partial<ReviewItem> = {}): ReviewItem => ({ path: `Repaso/x.md`, topic: "What the backend is", topicPath: FOLDER, subject: "programming", subjectFolder: "P", next: "2026-10-29", last: "2026-10-26", level: 1, inDays: 3, skills: ["recall"], practicedDays: 2, upcoming: [], ...over });

let host: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await flush(); };

function spies(over: { topic?: TopicData | null; reviews?: ReviewItem[]; log?: unknown[] } = {}) {
  return {
    get: vi.spyOn(api, "studyTopicGet").mockImplementation(async () => (over.topic === undefined ? topicData() : over.topic) as never),
    reviews: vi.spyOn(api, "studyReviewsList").mockResolvedValue({ today: "2026-10-26", items: over.reviews ?? [] }),
    log: vi.spyOn(api, "mentorTimeLogGet").mockResolvedValue({ entries: (over.log ?? []) as never }),
  };
}

beforeEach(() => {
  clearTopicInsightCache();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  openTopic.mockClear();
  openTopicNote.mockClear();
});

const mountInsight = async (props: { planId?: string } = {}) => { await act(async () => { root.render(<TopicInsight folder={FOLDER} {...props} />); }); await flush(); };

describe("TopicInsight", () => {
  it("sin datos todavía: tema sin teoría ni práctica, sin repaso", async () => {
    spies({ topic: topicData({ progress: { ...topicData().progress!, skills: {}, completenessPct: 0, theoryNotesCount: 0, exerciseNotesCount: 0 }, theory_notes: [], exercises: [] }) });
    await mountInsight({ planId: "p1" });
    expect(byTest("topic-insight")!.dataset.state).toBe("sin_tratar");
    expect(byTest("insight-theory")!.textContent).toContain("Aún no hay apunte");
    expect(byTest("insight-exercises")!.textContent).toContain("Sin ejercicios todavía");
    expect(byTest("insight-last")!.textContent).toContain("Aún no has practicado");
    expect(byTest("insight-review")!.textContent).toContain("Sin repaso programado");
  });

  it("teoría sin trabajar: el apunte existe pero no hay bloques de teoría registrados", async () => {
    spies({ log: [{ id: "a", areaKey: "s1", date: "2026-10-20", minutes: 30, kind: "pomodoro", work: "practice", topics: [FOLDER], at: "" }] });
    await mountInsight({ planId: "p1" });
    expect(byTest("insight-theory")!.textContent).toContain("Sin trabajar todavía");
    expect(byTest("insight-theory")!.textContent).toContain("1 apunte creado");
  });

  it("teoría trabajada: cuenta los bloques de teoría registrados del tema", async () => {
    spies({ log: [
      { id: "a", areaKey: "s1", date: "2026-10-20", minutes: 30, kind: "pomodoro", work: "theory", topics: [FOLDER], at: "" },
      { id: "b", areaKey: "s1", date: "2026-10-22", minutes: 40, kind: "manual", work: "theory", topics: [FOLDER, "otro"], at: "" },
      { id: "c", areaKey: "s1", date: "2026-10-23", minutes: 99, kind: "manual", work: "theory", topics: ["otro"], at: "" },
    ] });
    await mountInsight({ planId: "p1" });
    const t = byTest("insight-theory")!.textContent!;
    expect(t).toContain("Trabajada");
    expect(t).toContain("2 bloques");
    expect(t).toContain("1.2 h"); // 70 min
  });

  it("ejercicios 3 de 24 con barras por skill, y repaso con última fecha y siguiente", async () => {
    spies({ reviews: [review()] });
    await mountInsight();
    expect(byTest("topic-insight")!.dataset.state).toBe("en_curso");
    expect(byTest("insight-exercises-count")!.textContent).toBe("3 de 24");
    expect(byTest("insight-exercises")!.textContent).toContain("4 intentos");
    expect(byTest("insight-exercises")!.textContent).toContain("mejor nota 90");
    const skills = [...host.querySelectorAll("[data-testid=insight-skill]")].map((e) => e.textContent);
    expect(skills).toEqual(["Recordar3/12", "Aplicar0/12"]);
    expect(byTest("insight-review")!.textContent).toContain("en 3 días");
    expect(byTest("insight-review")!.textContent).toContain("Repaso 2");
    expect(byTest("insight-last")!.textContent).not.toContain("Aún no has practicado");
  });

  it("tema completo y error de lectura", async () => {
    spies({ topic: topicData({ progress: { ...topicData().progress!, isComplete: true, completenessPct: 100 } }) });
    await mountInsight();
    expect(byTest("topic-insight")!.dataset.state).toBe("completo");
    act(() => root.unmount());
    root = createRoot(host);
    clearTopicInsightCache();
    vi.restoreAllMocks();
    spies({ topic: null });
    await mountInsight();
    expect(byTest("insight-error")).toBeTruthy();
  });

  it("los accesos abren la teoría y los ejercicios; hay una región con nombre", async () => {
    spies();
    await mountInsight();
    expect(host.querySelector("section[aria-labelledby]")).toBeTruthy();
    await click(byTest("insight-open-theory"));
    await click(byTest("insight-open-practice"));
    expect(openTopicNote).toHaveBeenCalledWith(FOLDER);
    expect(openTopic).toHaveBeenCalledWith(FOLDER);
  });

  it("guarda lo leído por carpeta: montarlo otra vez no vuelve a pedir", async () => {
    const s = spies();
    await mountInsight();
    act(() => root.unmount());
    root = createRoot(host);
    await mountInsight();
    expect(s.get).toHaveBeenCalledTimes(1);
    expect(s.reviews).toHaveBeenCalledTimes(1);
  });
});

describe("AreaWork — «Temas de hoy»", () => {
  const rowOf = (over: Partial<BoardRow> = {}): BoardRow => ({ folder: FOLDER, title: "What the backend is", week: 1, state: "sin_tratar", done: false, exercises: 0, ...over });

  it("la flecha de la fila despliega el detalle debajo (sin leer nada antes) y sigue habiendo Teoría / Ejercicios", async () => {
    const s = spies({ reviews: [review()] });
    const r = rowOf();
    await act(async () => {
      root.render(<AreaWork planId="p1" areaName="Backend" rows={[r]} todayRows={[r]} sets={{ today: new Set([FOLDER]), week: new Set([FOLDER]), pending: new Set() }} today="2026-10-26" colour="#3b82f6" reviews={[]} plannedMinutes={0} />);
    });
    await flush();
    expect(byTest("topic-note-theory")).toBeTruthy();
    expect(byTest("topic-note-practice")).toBeTruthy();
    expect(byTest("topic-insight")).toBeNull();
    expect(s.get).not.toHaveBeenCalled();
    const toggle = byTest("insight-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(byTest("board-topic")!.contains(byTest("topic-insight"))).toBe(true);
    expect(s.get).toHaveBeenCalledWith(FOLDER);
    expect(s.log).toHaveBeenCalledWith("p1");
    expect(byTest("insight-exercises-count")!.textContent).toBe("3 de 24");
    await click(toggle);
    expect(byTest("topic-insight")).toBeNull();
  });
});

describe("PlanAreaTopics — detalle del tema", () => {
  const plan = {
    id: "p1",
    subplans: [{ id: "s1", area: "Backend", objective: "", topics: [{ folder: FOLDER, title: "What the backend is", targetWeek: 1, estMinutes: 30 }], weeks: [], requiredGoals: [] }],
  } as unknown as MentorPlan;
  const row: PlanTopicRow = { folder: FOLDER, title: "What the backend is", branch: "Backend", inPlan: true, exists: true, topicType: "unknown", theory: true, contract: true, canvas: true, manifest: true, skills: 3, exercises: 5, score: 100, complete: false, gaps: 0 };

  it("el desplegable de la fila lleva el detalle arriba y el panel de regenerar debajo; no lee nada hasta desplegar", async () => {
    const s = spies({ reviews: [review()] });
    vi.spyOn(api, "mentorPlanTopicCatalog").mockResolvedValue({ loading: false, rows: [row] });
    vi.spyOn(api, "aiSettings").mockResolvedValue({ config: { is_bridge: false }, providers: [], models: [] } as never);
    await act(async () => { root.render(<PlanAreaTopics plan={plan} />); });
    await flush();
    expect(byTest("topic-insight")).toBeNull();
    expect(s.get).not.toHaveBeenCalled();
    await click(byTest("row-expand"));
    const exp = byTest("area-row-expanded")!;
    expect(exp.contains(byTest("topic-insight"))).toBe(true);
    expect(exp.contains(byTest("regen-panel"))).toBe(true);
    expect(byTest("topic-insight")!.compareDocumentPosition(byTest("regen-panel")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(s.get).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith("p1");
    expect(byTest("insight-exercises-count")!.textContent).toBe("3 de 24");
    await click(byTest("row-expand"));
    expect(byTest("topic-insight")).toBeNull();
  });
});
