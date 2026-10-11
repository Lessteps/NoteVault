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

  const spread = (): PlanData => {
    const A = "Programación/1 Fundamentals/1.1 A";
    const B = "Programación/1 Fundamentals/1.2 B";
    const big = (folder: string) => ({ folder, title: folder.split("/").pop()!, targetWeek: 1, estMinutes: 360 });
    return plan({ subplans: [{ ...sub("s1", "Fundamentals", "Reforzar bases", A), topics: [big(A), big(B)] }] as never });
  };

  it("ruta sólida: con un día sin terminar, los temas de días posteriores salen bloqueados y sin flecha", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(spread()));
    await mountEl(<MentorPlan planId={PID} />);
    const rows = all("board-topic");
    expect(rows.map((r) => r.dataset.state)).toEqual(["sin_tratar", "bloqueado"]);
    expect(rows[1]!.querySelector("[data-testid=board-arrow]")).toBeNull();
    // vas atrasado respecto al frente: el aviso dice qué terminar primero
    expect(byTest("run-gate")!.textContent).toContain("termina primero");
    expect(byTest("run-gate")!.textContent).toContain("1.1 A");
  });

  it("la flecha de un tema ofrece abrir el apunte (.md) o el archivo de práctica", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValue({ ok: true, kind: "practica", path: "", created: [], errors: [] } as never);
    await mountEl(<MentorPlan planId={PID} />);
    expect(byTest("board-menu")).toBeNull();
    await click(all("board-arrow")[0]);
    const menu = byTest("board-menu")!;
    expect(menu.getAttribute("role")).toBe("menu");
    expect([...menu.querySelectorAll("[role=menuitem]")].map((b) => b.textContent!.trim())).toEqual(["Abrir apunte (.md)", "Abrir archivo de práctica"]);
    await click(byTest("board-open-practice"));
    expect(ensure).toHaveBeenCalledWith(F1);
    expect(byTest("board-menu")).toBeNull();
  });

  it("los filtros reducen los temas de cada área", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan planId={PID} />);
    expect(all("board-topic")).toHaveLength(2);
    const pend = [...byTest("board-filters")!.querySelectorAll("button")].find((b) => b.textContent === "Pendientes")!;
    await click(pend);
    expect(all("board-topic")).toHaveLength(1); // el de Python ya está completo
  });

  const due = (areaId: string, label: string, dates: string[]) =>
    dates.map((date, i) => ({ day: i + 1, date, state: "pending" as const, today: date === TODAY, title: `Kata ${i + 1} de ${label}`, skillName: "Endpoint design", level: 1, minutes: 20, summary: "Resumen", rel: `${areaId}/katas/00${i + 1}.md`, fileReady: false }));
  const areaView = (areaId: string, label: string, dates: string[]) => ({
    areaId, label, folder: areaId, folderReady: true, purpose: "p", name: label, languages: [], ledgerSkill: areaId, level: 1, levelSource: "declared", skills: [],
    kata: {
      plannedDays: dates.length, doneDays: 0, streak: 0, todayPlanned: true, todayDone: false, todayIndex: dates.length,
      next: null, week: [], due: due(areaId, label, dates).sort((x, y) => Number(y.today) - Number(x.today) || x.date.localeCompare(y.date)),
    },
    weekly: { title: "w", description: "d", week: 1, focus: false }, weeks: [], monthly: { title: "m", description: "d", blocks: [] },
  });
  const byArea = () => plan({ structure: "areas", subplans: [{ ...sub("s1", "Backend", "Reforzar bases", F1), areaId: "backend" }, { ...sub("s2", "Databases", "Consolidar", F2), areaId: "databases" }] as never });

  it("la práctica diaria vive DENTRO de la tarjeta de su área y lista todos los retos por hacer, no solo el de hoy", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(byArea()));
    const dates = ["2026-10-07", "2026-10-08", TODAY];
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue({ today: TODAY, ppReady: true, ppBase: "Programación/programming_practice", areas: [areaView("backend", "Backend", dates), areaView("databases", "Databases", [TODAY])] } as never);
    const open = vi.spyOn(api, "mentorAreaKataOpen").mockResolvedValue({ rel: "Programación/programming_practice/backend/katas/001.md", created: true, date: "2026-10-07" });
    const mark = vi.spyOn(api, "mentorAreaKataMark").mockResolvedValue({ today: TODAY, ppReady: true, ppBase: "", areas: [] } as never);
    await mountEl(<MentorPlan planId={PID} />);
    // ya no hay una sección «Práctica de hoy» aparte ni kata de lógica general
    expect(byTest("run-practice")).toBeNull();
    expect(host.textContent).not.toContain("Kata de lógica");
    const cards = all("run-area-progress");
    const backend = cards.find((c) => c.dataset.area === "backend")!;
    const block = backend.querySelector("[data-testid=area-practice-block]")!;
    expect(block).toBeTruthy();
    // 3 retos que tocaban hasta hoy: hoy primero y luego los atrasados del más antiguo al más reciente
    expect(block.querySelector("[data-testid=area-practice-count]")!.textContent).toContain("3 retos por hacer");
    const rows = [...block.querySelectorAll("[data-testid=kata-row]")] as HTMLElement[];
    expect(rows.map((r) => r.dataset.date)).toEqual([TODAY, "2026-10-07", "2026-10-08"]);
    expect(rows[1]!.textContent).toContain("Atrasado");
    // el acceso directo: la flecha de un kata atrasado abre ESE kata aunque su archivo aún no exista
    await click(rows[1]!.querySelector("[data-testid=board-arrow]"));
    expect([...byTest("board-menu")!.querySelectorAll("[role=menuitem]")].map((b) => b.textContent!.trim())).toEqual(["Abrir kata (.md)", "Marcar hecho", "Saltar este día", "Ver práctica de Backend"]);
    await click(byTest("kata-open"));
    expect(open).toHaveBeenCalledWith(PID, "backend", "2026-10-07");
    // y se marca el día concreto con la casilla
    await click(rows[1]!.querySelector("[data-testid=kata-check]"));
    expect(mark).toHaveBeenCalledWith(PID, "backend", "2026-10-07", "done");
  });

  it("si faltan las carpetas de las áreas en programming_practice las deja preparadas una sola vez", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(byArea()));
    const missing = { ...areaView("backend", "Backend", [TODAY]), folderReady: false };
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue({ today: TODAY, ppReady: true, ppBase: "Programación/programming_practice", areas: [missing] } as never);
    const setup = vi.spyOn(api, "mentorAreaPracticeSetup").mockResolvedValue({ created: [], folders: [], view: { today: TODAY, ppReady: true, ppBase: "", areas: [missing] } } as never);
    await mountEl(<MentorPlan planId={PID} />);
    await flush();
    expect(setup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith(PID);
  });

  it("el proyecto diario y el semanal van al final de la vista, después de «Lo que viene»", async () => {
    const p = plan({ structure: "areas", subplans: [{ ...sub("s1", "Backend", "Reforzar bases", F1), areaId: "backend" }, { ...sub("s2", "Databases", "Consolidar", F2), areaId: "databases" }] as never });
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(p));
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue({ today: TODAY, ppReady: true, ppBase: "", areas: [] } as never);
    await mountEl(<MentorPlan planId={PID} />);
    const run = byTest("plan-run")!;
    const order = [...run.children].map((c) => (c as HTMLElement).dataset.testid);
    expect(order.indexOf("run-projects")).toBe(order.length - 1);
    expect(order.indexOf("run-next")).toBeLessThan(order.indexOf("run-projects"));
    const projects = byTest("run-projects")!;
    expect(byTest("run-project-daily")!.textContent).toContain("Proyecto diario");
    expect(byTest("run-project-weekly")!.textContent).toContain("Proyecto semanal");
    expect(projects.textContent).toContain("Entregable por definir");
    // desglosados por área: qué hacer, cómo hacerlo y el resultado real
    const daily = byTest("daily-areas")!;
    expect([...daily.querySelectorAll("[data-testid=project-area]")].map((e) => (e as HTMLElement).dataset.area)).toEqual(["databases", "backend"]);
    expect(daily.textContent).toContain("Qué hay que hacer");
    expect(daily.textContent).toContain("Cómo hacerlo");
    expect(daily.querySelectorAll("[data-testid=project-result]").length).toBe(2);
    expect(byTest("weekly-areas")!.textContent).toContain("Resultado real");
  });
});

