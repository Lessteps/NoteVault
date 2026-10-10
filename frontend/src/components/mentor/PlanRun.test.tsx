// @vitest-environment jsdom
//
// Mentor — las dos caras de un plan: «Plan» (pestañas para armarlo y ajustarlo) y «Ejecución» (solo lectura: qué hago hoy, cómo voy en
// cada área y qué viene). Un plan mantenido abre en ejecución; uno propuesto, en plan; la elección se recuerda por plan.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorPlan as PlanData, MentorPlanGet, MentorPlanRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { MentorPlan } from "./MentorPlan";
import { planModeKey, planTabKey } from "./planShared";

const START = "2026-10-06";
const END = "2027-04-05";
const PID = `${START}_${END}`;
const TODAY = "2026-10-12";
const F1 = "Programación/1 Fundamentals/1.1 What programming is";
const F2 = "Programación/2.1 Python/2.1.1 Project structure";

const week = (n: number, topics: string[]) => ({ week: n, start: START, end: END, topics, minutes: 60 * topics.length, capacityMinutes: 240 });
const sub = (id: string, area: string, objective: string, folder: string) => ({
  id, area, objective, notes: "Temas en el orden natural de la materia.",
  topics: [{ folder, title: folder.split("/").pop()!, targetWeek: 1, estMinutes: 60 }], weeks: [week(1, [folder]), week(2, [])], requiredGoals: [],
});
const plan = (over: Partial<PlanData> = {}): PlanData => ({
  id: PID, start: START, end: END, name: "Reforzar bases", createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z", proposed: false,
  hoursPerWeek: 37, rationale: "Se prioriza lo que pidió el estudiante.",
  preconditions: { start: START, end: END, minutesPerDay: 420, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no" } as never,
  subplans: [sub("s1", "Fundamentals", "Reforzar bases", F1), sub("s2", "Python", "Consolidar Python", F2)] as never,
  ...over,
});
const row = (over: Partial<MentorPlanRow> = {}): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Reforzar bases", period: "6 oct – 5 abr", status: "activo", archived: false, auto: false, subplans: 2, topics: 2, completed: 0, pct: 0, minutesPerDay: 420, ...over });
const loaded = (p: PlanData = plan()): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: p.proposed ? "propuesto" : "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s, i) => ({ id: s.id, total: s.topics.length, done: i, pct: i * 100, currentWeek: 1, topics: s.topics.map((t) => ({ ...t, state: i ? ("completo" as const) : ("sin_tratar" as const), pct: i * 100, found: true })) })),
    summary: { subplans: p.subplans.length, topics: p.subplans.length, done: 1, pct: 50, currentWeek: 1, weeks: 26 },
  },
  goals: {}, projects: {}, items: [], months: [], plans: [row()], aiConfigured: true,
});

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const all = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid=${id}]`)];

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  useMentor.setState({ planVersion: 0, plans: [], plansLoaded: false });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([row()]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("vista de ejecución", () => {
  it("un plan mantenido abre en ejecución: hoy, avance por área y sin pestañas", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    expect(byTest("plan-run")).toBeTruthy();
    expect(host.querySelector("[role=tablist]")).toBeNull();
    expect(byTest("plan-mode-ejecucion")!.getAttribute("aria-pressed")).toBe("true");
    expect(byTest("plan-mode-plan")!.getAttribute("aria-pressed")).toBe("false");
    // hoy, con su semana
    expect(byTest("run-today")!.textContent).toContain("Semana 1");
    expect(byTest("run-today")!.textContent).toContain("12 de octubre");
    // un tarjeta de avance por área, con su porcentaje real
    const areas = all("run-area-progress");
    expect(areas.map((a) => a.querySelector("h3")!.textContent)).toEqual(["Fundamentals", "Python"]);
    expect(areas[0]!.textContent).toContain("0 %");
    expect(areas[1]!.textContent).toContain("100 %");
    expect(byTest("run-progress")!.textContent).toContain("50 %");
  });

  it("es de solo lectura: ningún campo de texto ni acción que cambie el plan", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    const run = byTest("plan-run")!;
    expect(run.querySelector("textarea, input, select")).toBeNull();
    const labels = [...run.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels.some((l) => /guardar|aplicar|ejecutar|eliminar|renombrar|mantener/i.test(l))).toBe(false);
  });

  it("alterna con la vista de plan, que recupera sus pestañas, y lo recuerda por plan", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    await click(byTest("plan-mode-plan"));
    expect(host.querySelector("[role=tablist]")).toBeTruthy();
    expect(byTest("plan-run")).toBeNull();
    expect(useNavState.getState().values[planModeKey(PID)]).toBe("plan");
    await click(byTest("plan-mode-ejecucion"));
    expect(byTest("plan-run")).toBeTruthy();
    expect(useNavState.getState().values[planModeKey(PID)]).toBe("ejecucion");
  });

  it("un plan propuesto abre en la vista de plan (aún hay que decidir si se mantiene)", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan({ proposed: true })));
    await mountEl(<MentorPlan planId={PID} />);
    expect(host.querySelector("[role=tablist]")).toBeTruthy();
    expect(byTest("plan-run")).toBeNull();
    expect(byTest("plan-proposed-bar")).toBeTruthy();
  });

  it("«Ver en la Agenda» de un próximo día cambia a la vista de plan, pestaña Agenda", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    const next = all("run-upcoming-day");
    expect(next.length).toBeGreaterThan(0);
    await click(next[0]);
    const v = useNavState.getState().values;
    expect(v[planModeKey(PID)]).toBe("plan");
    expect(v[planTabKey(PID)]).toBe("agenda");
    expect(host.querySelector("[role=tablist]")).toBeTruthy();
  });
});
