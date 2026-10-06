// @vitest-environment jsdom
//
// Mentor — Plan: entregables «por decidir» en el borrador, la pista Programming practice en el borrador, la tarjeta
// de práctica del plan (kata, proyecto de la semana con sus 4 fases, semanas, mensual, «Abrir práctica») y la práctica de
// hoy en «Esta semana y hoy» y en el selector de objetivo de Hoy.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { buildPracticeTrack, practiceItemsFor } from "../../lib/practiceTrack";
import type { MentorChatTurn, MentorPlan as PlanData, MentorPlanDraft, MentorPlanGet, MentorPracticeStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { usePracticeDialog } from "../practice/PracticeProjectDialog";
import { MentorPlan } from "./MentorPlan";

const START = "2026-10-05";
const END = "2026-11-01";
const PID = `${START}_${END}`;
const TODAY = "2026-10-12";
const pre = {
  start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6], pace: "normal" as const, goalIds: [], subjects: ["Programación"], levels: {},
  deliverables: "ask" as const, practice: { kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 90, monthly: true, focus: "rotate" as const },
};
const track = buildPracticeTrack(pre)!;
const sub = { id: "s1-programacion", area: "Programación", objective: "Backend", topics: [], weeks: track.weeklyProject!.weeks.map((w) => ({ week: w.week, start: w.start, end: w.end, topics: [], minutes: 0, capacityMinutes: 0 })), requiredGoals: [] };

const plan = (over: Partial<PlanData> = {}): PlanData => ({
  id: PID, start: START, end: END, name: "Backend · 5 oct–1 nov", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 8, preconditions: pre,
  subplans: [sub], programmingPractice: track, openQuestions: [{ id: "deliverables", subplanId: "s1-programacion", text: "¿Quieres un entregable?", options: ["Sí", "No", "Después"] }], ...over,
});
const status = (over: Partial<MentorPracticeStatus> = {}): MentorPracticeStatus => ({
  ppReady: true,
  kata: { plannedDays: 7, doneDays: 5, streak: 3, todayPlanned: true, todayDone: false },
  weeks: [
    { week: 1, phases: { build: "hecho", construct: "hecho", defend: "hecho", postmortem: "hecho" }, project: { folder: "Gastos", title: "Gastos", state: "done", score: 82 }, current: false, source: "pp" },
    { week: 2, phases: { build: "hecho", construct: "en_curso", defend: "pendiente", postmortem: "pendiente" }, project: { folder: "Agenda", title: "Agenda", state: "building" }, current: true, source: "pp" },
  ],
  ...over,
});
const loaded = (over: Partial<Extract<MentorPlanGet, { loading: false }>> = {}): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: plan(),
  derived: { subplans: [{ id: "s1-programacion", total: 0, done: 0, pct: 0, currentWeek: 2, topics: [] }], summary: { subplans: 1, topics: 0, done: 0, pct: 0, currentWeek: 2, weeks: 4 } },
  goals: {}, projects: {}, items: [], practiceItems: practiceItemsFor("2026-10-14", [{ id: PID, start: START, end: END, name: "Backend", programmingPractice: track }]), practice: status(), months: [],
  plans: [{ id: PID, start: START, end: END, name: "Backend · 5 oct–1 nov", period: "5 oct – 1 nov", status: "activo", archived: false, auto: false, subplans: 1, topics: 0, completed: 0, pct: 0, minutesPerDay: 240, programmingPractice: true }],
  aiConfigured: true, ...over,
});
const draft = (over: Partial<MentorPlanDraft> = {}): MentorPlanDraft => ({
  month: "2026-10", start: START, end: END, hoursPerWeek: 6, rationale: "r", subplans: [sub], warnings: [], fits: true, totalMinutes: 0, availableMinutes: 100,
  requiredHoursPerWeek: null, from: START, discarded: [], why: {}, preconditions: pre, auto: true,
  programmingPractice: track, openQuestions: [{ id: "deliverables", subplanId: "s1-programacion", text: "¿Quieres un entregable (proyecto de demostración) para Programación: Backend?", options: ["Sí", "No", "Después"] }], ...over,
});
const bot = (id: string, extra: Partial<MentorChatTurn> = {}): MentorChatTurn => ({ id, role: "assistant", content: "x", at: "2026-10-05T10:00:03", ...extra });

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const click = async (el: Element | undefined) => {
  expect(el, "botón no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  usePracticeDialog.setState({ open: false });
  useMentor.setState({ turns: [], pending: null, chatId: null, chatLoaded: true, planVersion: 0, pendingObjective: null, plans: [], plansLoaded: false, acceptingPlan: false });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorChatLoad").mockResolvedValue({ turns: [], pending: null });
  vi.spyOn(api, "mentorOverview").mockResolvedValue({ loading: true });
  vi.spyOn(api, "mentorPlanList").mockResolvedValue(loaded().loading ? [] : (loaded() as any).plans);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("borrador: por decidir y práctica", () => {
  const none = () => loaded({ id: null, plan: null, derived: null, items: [], practiceItems: [], practice: null, plans: [] });

  it("lista «Por decidir: entregables» con Añadir entregable / No lo quiero por subplan y muestra la práctica", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(none());
    useMentor.setState({ turns: [bot("a1", { planDraft: draft() })], pending: "a1", chatId: "c1" });
    await mountEl(<MentorPlan />);
    const card = host.querySelector("[data-testid=plan-draft]")!;
    expect(card.textContent).toContain("entregables a discutir");
    const q = card.querySelector("[data-testid=draft-open-questions]")!;
    expect(q.textContent).toContain("Por decidir: entregables");
    expect(q.textContent).toContain("Pendiente de decidir");
    expect(q.querySelectorAll("[data-testid=draft-open-question]")).toHaveLength(1);
    expect(q.textContent).toContain("¿Quieres un entregable (proyecto de demostración) para Programación: Backend?");
    expect(button("Añadir entregable", q)).toBeTruthy();
    expect(button("No lo quiero", q)).toBeTruthy();
    // no genera entregables solo: el subplan no lo menciona
    expect(card.textContent).not.toContain("· entregable:");
    // práctica
    const p = card.querySelector("[data-testid=draft-practice]")!;
    expect(p.textContent).toContain("Programming practice");
    expect(p.textContent).toContain("kata diario de 30 min");
    expect(p.textContent).toContain("proyecto semanal full stack");
    expect(p.textContent).toContain("foco Backend");
    await click(button("Ver calendario semanal", card));
    expect(card.querySelector("[data-testid=draft-calendar]")!.textContent).toContain("Proyecto semanal 1 · foco Backend");
  });

  it("los botones responden la pregunta por subplan (yes / no) y el borrador se actualiza", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(none());
    const answer = vi.spyOn(api, "mentorPlanDraftAnswer").mockImplementation(async ({ answer: a }) => ({
      turns: [bot("a1", { planDraft: draft({ openQuestions: undefined, subplans: [{ ...sub, ...(a === "yes" ? { deliverable: { title: "Proyecto de demostración: Backend", description: "", criteria: [], status: "idea" as const } } : {}) }] }) })],
      pending: "a1",
      planDraft: draft(),
    }));
    useMentor.setState({ turns: [bot("a1", { planDraft: draft() })], pending: "a1", chatId: "c1" });
    await mountEl(<MentorPlan />);
    await click(button("Añadir entregable"));
    expect(answer).toHaveBeenCalledWith({ turnId: "a1", chatId: "c1", subplanId: "s1-programacion", answer: "yes" });
    expect(host.querySelector("[data-testid=draft-open-questions]")).toBeNull();
    expect(host.querySelector("[data-testid=plan-draft]")!.textContent).toContain("entregable: Proyecto de demostración");
    // y «No lo quiero»
    useMentor.setState({ turns: [bot("a1", { planDraft: draft() })], pending: "a1" });
    await flush();
    await click(button("No lo quiero"));
    expect(answer).toHaveBeenLastCalledWith({ turnId: "a1", chatId: "c1", subplanId: "s1-programacion", answer: "no" });
  });

  it("sin preguntas ni práctica no aparece ninguna de las dos secciones", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(none());
    useMentor.setState({ turns: [bot("a1", { planDraft: draft({ openQuestions: undefined, programmingPractice: undefined, preconditions: { ...pre, practice: undefined, deliverables: "yes" } }) })], pending: "a1", chatId: "c1" });
    await mountEl(<MentorPlan />);
    expect(host.querySelector("[data-testid=draft-open-questions]")).toBeNull();
    expect(host.querySelector("[data-testid=draft-practice]")).toBeNull();
    expect(host.querySelector("[data-testid=draft-preconditions]")!.textContent).toContain("con entregables");
  });
});

describe("plan aceptado: tarjeta Programming practice", () => {
  it("fila con kata, proyecto de esta semana con sus 4 fases y estado, semanas y mensual", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    const row = host.querySelector("[data-testid=practice-row]")!;
    expect(row).toBeTruthy();
    expect(row.querySelector("section[aria-label='Programming practice']")).toBeTruthy();
    const kata = row.querySelector("[data-testid=practice-kata]")!.textContent!;
    expect(kata).toContain("Kata de lógica · 30 min");
    expect(kata).toContain("5/7 días hechos");
    expect(kata).toContain("racha 3");
    expect(kata).toContain("Hoy: pendiente");
    const proj = row.querySelector("[data-testid=practice-project]")!.textContent!;
    expect(proj).toContain("Proyecto de la semana 2");
    expect(proj).toContain("Proyecto semanal 2 · foco Databases");
    expect(proj).toContain("Full stack: frontend + backend + base de datos");
    for (const t of ["Especificación: Hecho", "Construcción: En curso", "Defensa: Pendiente", "Postmortem: Pendiente"]) expect(proj).toContain(t);
    expect(row.querySelector("[data-testid=practice-project-linked]")!.textContent).toContain("«Agenda» (en construcción)");
    const weeks = row.querySelector("[data-testid=practice-weeks]")!.textContent!;
    expect(weeks).toContain("foco Backend");
    expect(weeks).toContain("4/4 fases");
    expect(row.querySelector("[data-testid=practice-monthly]")!.textContent).toContain("Semanas 1–4");
    // cabecera: chip de la práctica y entregables a discutir pendientes
    expect(host.querySelector("[data-testid=plan-practice-chip]")!.textContent).toContain("Programming practice");
    expect(host.querySelector("[data-testid=plan-preconditions]")!.textContent).toContain("Entregables: a discutir");
    expect(host.querySelector("[data-testid=plan-open-questions]")!.textContent).toContain("Pendiente de decidir: entregables en 1 subplan");
  });

  it("«Abrir práctica» abre el diálogo de práctica de programación", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    await click(button("Abrir práctica", host.querySelector("[data-testid=practice-project]")!));
    expect(usePracticeDialog.getState().open).toBe(true);
  });

  it("sin el módulo programming_practice lo dice y el estado es manual; sin pista no hay tarjeta", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ practice: status({ ppReady: false, weeks: [] }) }));
    await mountEl(<MentorPlan planId={PID} />);
    expect(host.querySelector("[data-testid=practice-kata]")!.textContent).toContain("se anota a mano en los bloques de «Hoy»");
    act(() => root.unmount());
    root = createRoot(host);
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ plan: plan({ programmingPractice: undefined, openQuestions: undefined }), practice: null, practiceItems: [] }));
    await mountEl(<MentorPlan planId={PID} />);
    expect(host.querySelector("[data-testid=practice-row]")).toBeNull();
    expect(host.querySelector("[data-testid=plan-practice-chip]")).toBeNull();
  });

  it("un plan anterior (sin pista ni práctica en las precondiciones) se lee y se pinta igual", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ plan: plan({ programmingPractice: undefined, openQuestions: undefined, preconditions: { ...pre, practice: undefined, deliverables: "yes" } }), practice: undefined, practiceItems: undefined }));
    await mountEl(<MentorPlan planId={PID} />);
    expect(host.querySelector("[data-testid=plan-header]")).toBeTruthy();
    expect(host.querySelector("[data-testid=practice-row]")).toBeNull();
  });
});

describe("esta semana y hoy: la práctica del día", () => {
  it("lista el kata y la sesión del proyecto; «Planear mi día con esto» y el atajo de práctica dejan el objetivo", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    await click(button("Esta semana / Hoy"));
    const items = host.querySelectorAll("[data-testid=plan-week-practice-item]");
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.textContent).toContain("Reto diario");
    expect(items[0]!.textContent).toContain("Programming practice");
    await click(button("Programming practice (kata + proyecto)"));
    expect(useMentor.getState().pendingObjective).toEqual({ type: "programming_practice" });
    expect(useNavState.getState().values["mentor.view"]).toBe("hoy");
    useMentor.setState({ pendingObjective: null });
    useNavState.setState({ values: {} });
    await click(button("Planear mi día con esto"));
    expect(useMentor.getState().pendingObjective).toEqual({ type: "plan" });
  });
});

describe("la tarjeta del borrador en el chat", () => {
  it("avisa de la práctica incluida y de los entregables por decidir", async () => {
    const { MentorAssistant } = await import("./MentorAssistant");
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    useMentor.setState({ turns: [bot("a1", { planDraft: draft() })], pending: "a1", chatId: "c1", chatLoaded: true });
    await mountEl(<MentorAssistant />);
    const t = host.querySelector("[data-testid=chat-plan-draft-extras]")!.textContent!;
    expect(t).toContain("Programming practice incluida");
    expect(t).toContain("1 entregable por decidir");
  });
});
