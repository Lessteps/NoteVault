// @vitest-environment jsdom
//
// Mentor — Plan: el motor v2 en la interfaz (áreas juntas, práctica diaria de lenguaje, proyecto del tema, entregables por área, tabla mes a mes).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { buildSchedule, progressPlan } from "../../lib/planSchedule";
import { weekRangesOf } from "../../lib/planTime";
import { buildPracticeTrack } from "../../lib/practiceTrack";
import type { MentorPlan as PlanData, MentorPlanGet, MentorPlanRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { MODE_KEY } from "./mentorNav";
import { gotoSection, navTab, navView } from "./mentorTestNav";

const ui = vi.hoisted(() => ({ askText: vi.fn(), confirmAction: vi.fn() }));
vi.mock("../ui", async (orig) => ({ ...(await orig<typeof import("../ui")>()), askText: ui.askText, confirmAction: ui.confirmAction }));

import { PlanWorkspace } from "./PlanWorkspace";

const START = "2026-10-05";
const END = "2027-01-03";
const PID = `${START}_${END}`;
const TODAY = "2026-10-14";
const PRE = { start: START, end: END, minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "yes" as const, practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" as const } };
const WEEKS = weekRangesOf(START, END);
const mkTopics = (branch: string, n: number, group: string, first: number, step: number) =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60, targetWeek: Math.min(WEEKS.length, first + Math.floor(i / step)), group }));
const slices = (topics: Array<{ folder: string; targetWeek: number }>) => WEEKS.map((w) => ({ week: w.week, start: w.start, end: w.end, topics: topics.filter((t) => t.targetWeek === w.week).map((t) => t.folder), minutes: 0, capacityMinutes: 0 }));

function areasPlan(extra: Partial<PlanData> = {}): PlanData {
  const be = [...mkTopics("1 Fundamentals", 6, "bases", 1, 2), ...mkTopics("2.1 Python", 5, "lang-python", 4, 2), ...mkTopics("4 Backend", 8, "core", 6, 2)];
  const db = mkTopics("6 Databases", 6, "core", 1, 2);
  return {
    id: PID, start: START, end: END, name: "Backend + Databases · 5 oct–3 ene", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 20, preconditions: PRE as never, structure: "areas",
    programmingPractice: buildPracticeTrack(PRE as never),
    subplans: [
      { id: "s1-backend", area: "Backend", areaId: "backend", objective: "Servicios", topics: be, weeks: slices(be), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 },
        groups: [{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "lang-python", title: "Lenguaje: Python", kind: "language", order: 10 }, { id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }] },
      { id: "s2-databases", area: "Databases", areaId: "databases", objective: "Datos", topics: db, weeks: slices(db), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 }, groups: [{ id: "core", title: "Conocimientos de bases de datos", kind: "knowledge", order: 100 }] },
    ],
    ...extra,
  } as PlanData;
}

const row = (): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Backend + Databases · 5 oct–3 ene", period: "5 oct – 3 ene", status: "activo", archived: false, auto: false, subplans: 2, topics: 0, completed: 0, pct: 0, minutesPerDay: 360, programmingPractice: true });
const loaded = (p: PlanData, exercisesOf: (folder: string) => number = () => 0): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 2, topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: true, ...(exercisesOf(t.folder) ? { exercises: exercisesOf(t.folder) } : {}) })) })),
    summary: { subplans: p.subplans.length, topics: p.subplans.reduce((n, s) => n + s.topics.length, 0), done: 0, pct: 0, currentWeek: 2, weeks: 14 },
  },
  goals: {}, projects: {}, items: [], practiceItems: [], practice: { ppReady: true, kata: null, kataDoneDates: [], weeks: [] }, months: [], plans: [row()], aiConfigured: true,
});


let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
// «Mi plan» enseña una sub-vista a la vez: elige la que la prueba necesita
const section = (id: string) => gotoSection(host, id, click);
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string, within: ParentNode = host) => within.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
const all = (id: string, within: ParentNode = host) => [...within.querySelectorAll<HTMLElement>(`[data-testid=${id}]`)];
const tab = (id: string) => navTab(host, id) as HTMLButtonElement;
const view = (id: string) => navView(host, id) as HTMLButtonElement;
const setValue = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
};
const openAgenda = async (p: PlanData = areasPlan(), exercisesOf?: (f: string) => number) => {
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(p, exercisesOf));
  await mountEl(<PlanWorkspace planId={PID} />);
  await click(tab("agenda"));
};
const openDay = async (date: string, p?: PlanData, exercisesOf?: (f: string) => number) => {
  await openAgenda(p, exercisesOf);
  await click(view("dia"));
  await setValue(byTest("agenda-date") as HTMLInputElement, date);
};

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: { [MODE_KEY]: "planeacion" } }); // las pruebas de la vista de plan abren la cara «plan»
  useMentor.setState({ planVersion: 0, plans: [], plansLoaded: false, pendingObjective: null });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([row()]);
  vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: false, label: "", elapsed: 0 });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});


function togetherPlan(): PlanData {
  const p = areasPlan();
  const fe = mkTopics("5 Frontend", 8, "core", 1, 2);
  const tp = (title: string) => ({ title: `Calculadora de ${title}`, description: "Aplica el tema", level: "aplicado" as const, basis: "medido" as const, requires: [], language: "Python", source: "template" as const });
  const subplans = [
    ...p.subplans.map((s) => ({ ...s, phase: { fromWeek: 1, toWeek: WEEKS.length }, topics: s.topics.map((t, i) => (s.areaId === "backend" && i % 3 === 0 ? { ...t, topicProject: tp(t.title) } : t)) })),
    { id: "s3-frontend", area: "Frontend", areaId: "frontend", objective: "UI", topics: fe, weeks: slices(fe), requiredGoals: [], phase: { fromWeek: 1, toWeek: WEEKS.length }, groups: [{ id: "core", title: "Conocimientos de frontend", kind: "knowledge" as const, order: 100 }] },
  ];
  const languages = [{ id: "python", required: true, why: "Backend", weight: 3 }, { id: "javascript", required: true, why: "Frontend", weight: 2 }, { id: "typescript", required: true, why: "Frontend", weight: 2 }];
  return { ...p, deliverablesDefinedAt: "2026-10-02T00:00:00Z", subplans, areaMode: "together", areaModeWhy: "Elegiste estudiar Backend, Frontend y Databases juntas.", areaModeBy: "user", preconditions: { ...(p.preconditions as object), areaMode: "together", languages } as never } as PlanData;
}
const dayOf = (p: PlanData): string => buildSchedule(progressPlan(p as never, { today: TODAY })).days.find((d) => d.week >= 2 && d.study && d.focus)!.date;

describe("Agenda: áreas juntas, lenguaje diario, proyecto del tema y entregables por área", () => {
  it("el día muestra todas las áreas, la práctica de lenguaje, su sistema de práctica y el desglose por área", async () => {
    const p = togetherPlan();
    await openDay(dayOf(p), p);
    const day = byTest("agenda-day");
    expect(day.textContent).toContain("Áreas juntas");
    expect(day.textContent).not.toContain("Enfoque: Full stack");
    expect(byTest("agenda-day-today-line").textContent).toMatch(/teoría de backend.*teoría de frontend|teoría de frontend.*teoría de backend/);
    expect(byTest("agenda-day-today-line").textContent).toContain("práctica de");
    const blocks = all("agenda-block", day).map((b) => b.getAttribute("data-block"));
    expect(blocks).toEqual(expect.arrayContaining(["backend-theory", "db-theory", "frontend-theory", "lang-daily"]));
    const lang = all("agenda-block", day).find((b) => b.getAttribute("data-block") === "lang-daily")!;
    expect(lang.textContent).toMatch(/Práctica de (Python|JavaScript|TypeScript)/);
    expect(lang.textContent).toContain("Práctica diaria");
    expect(all("agenda-exercise", lang).length).toBeGreaterThanOrEqual(3);
    const sys = all("agenda-area-practice", day).map((d) => d.textContent!);
    expect(sys.some((t) => t.includes("Componentes con Atomic Design"))).toBe(true);
    expect(sys.some((t) => t.includes("Cada fin de semana"))).toBe(true);
    expect(byTest("agenda-project-daily").textContent).toMatch(/Feature del día/);
    expect(byTest("area-counts-day").textContent).toMatch(/Por área:/);
  });

  it("el día en que se completa un tema aparece «Proyecto del tema» con su nivel y cuenta como entregable", async () => {
    const p = togetherPlan();
    const sch = buildSchedule(progressPlan(p as never, { today: TODAY }));
    const withTp = sch.days.find((d) => d.topicProjects?.length)!;
    expect(withTp).toBeTruthy();
    await openDay(withTp.date, p);
    const sec = byTest("agenda-day-topic-projects");
    expect(sec.textContent).toContain("Proyecto del tema");
    expect(sec.textContent).toContain("Nivel Aplicado");
    expect(sec.textContent).toContain("según tu actividad medida");
    expect(byTest("agenda-project-topic").textContent).toContain("Calculadora de");
  });

  it("la pestaña Entregables resume por área (Backend · Frontend · Databases · Integradores) y filtra por área", async () => {
    await openAgenda(togetherPlan());
    await click(tab("entregables"));
    const sum = byTest("area-counts-plan").textContent!;
    expect(sum).toMatch(/Backend \d+/);
    expect(sum).toMatch(/Frontend \d+/);
    expect(sum).toMatch(/Integradores \d+/);
    expect(byTest("deliverable-filters").textContent).toContain("Integradores (varias áreas)");
  });

  it("Mi plan: la tabla mes a mes dice que las áreas van juntas y marca los meses con varias a la vez", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(togetherPlan()));
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("fases");
    expect(byTest("plan-months-mode").textContent).toContain("Áreas juntas");
    expect(byTest("plan-months-mode").textContent).toContain("Elegiste estudiar");
    const sims = all("plan-month-simultaneous").map((e) => e.textContent!);
    expect(sims.length).toBeGreaterThan(0);
    expect(sims[0]).toMatch(/Backend \+ Databases \+ Frontend|Backend \+ Frontend \+ Databases/);
  });
});
