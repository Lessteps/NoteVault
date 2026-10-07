// @vitest-environment jsdom
//
// Mentor — «Mi plan»: tabla de fases mes a mes accesible, tarjetas de grupos y rejilla de temas (desplegar, filtro, «Mostrar N más»),
// cobertura de notas y práctica (determinista + revisión con IA simulada) y aviso de Bases que lleva a «Pedir cambios» sin enviar nada.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { computeCoverage } from "../../lib/planCoverage";
import type { MentorPlan as PlanData, MentorPlanGet, MentorPlanRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";

const ui = vi.hoisted(() => ({ askText: vi.fn(), confirmAction: vi.fn() }));
vi.mock("../ui", async (orig) => ({ ...(await orig<typeof import("../ui")>()), askText: ui.askText, confirmAction: ui.confirmAction }));

import { MentorPlan } from "./MentorPlan";

const START = "2026-10-06";
const END = "2027-04-05";
const PID = `${START}_${END}`;
const TODAY = "2026-11-10";

const topics = (branch: string, n: number, group: string, firstWeek: number, perWeek: number) =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60, targetWeek: firstWeek + Math.floor(i / perWeek), group }));
const GROUPS = [
  { id: "bases", title: "Bases", kind: "bases" as const, order: 0 },
  { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 },
  { id: "core", title: "Conocimientos de backend", kind: "knowledge" as const, order: 100 },
];
const be = [...topics("1 Fundamentals", 40, "bases", 1, 4), ...topics("2.1 Python", 5, "lang-python", 11, 2), ...topics("4 Backend", 6, "core", 14, 2)];
const plan = (): PlanData =>
  ({
    id: PID, start: START, end: END, name: "Backend + Databases", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", structure: "areas", proposed: false,
    preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", freeObjective: "full stack especializado en automatización" },
    subplans: [
      { id: "s1", area: "Backend", areaId: "backend", objective: "Servicios y APIs", topics: be, weeks: [], requiredGoals: [], phase: { fromWeek: 1, toWeek: 26 }, groups: GROUPS },
      { id: "s2", area: "Frontend", areaId: "frontend", objective: "Interfaces", topics: topics("5 Frontend", 4, "core", 20, 2), weeks: [], requiredGoals: [], phase: { fromWeek: 20, toWeek: 26 }, groups: [GROUPS[2]!] },
    ],
  }) as unknown as PlanData;
const row = (): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Backend + Databases", period: "6 oct – 5 abr", status: "activo", archived: false, auto: false, subplans: 2, topics: 55, completed: 0, pct: 0, minutesPerDay: 240 });
const loaded = (p: PlanData = plan()): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 5, topics: s.topics.map((t, i) => ({ ...t, state: i === 0 ? ("completo" as const) : ("sin_tratar" as const), pct: i === 0 ? 100 : 0, found: true })) })),
    summary: { subplans: 2, topics: 55, done: 2, pct: 3, currentWeek: 5, weeks: 26 },
  },
  goals: {}, projects: {}, items: [], practiceItems: [], practice: null, months: [], plans: [row()], aiConfigured: true,
});
const vaultTopics = () => [...be, ...topics("5 Frontend", 4, "core", 20, 2)].map((t, i) => ({ folder: t.folder, title: t.title, theoryNotes: i % 2 === 0 ? 1 : 0, exerciseCount: i % 3 === 0 ? 2 : 0, completenessPct: 0 }));
const coverage = () => computeCoverage(plan() as never, vaultTopics(), { ppReady: true });

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string, within: ParentNode = host) => within.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const setValue = async (el: HTMLInputElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
  await flush();
};
const open = async () => {
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
  await mountEl(<MentorPlan planId={PID} />);
};

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  useMentor.setState({ planVersion: 0, plans: [], plansLoaded: false, pendingObjective: null });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([row()]);
  vi.spyOn(api, "mentorPlanCoverage").mockResolvedValue({ loading: false, coverage: coverage(), review: null, aiConfigured: true });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Fases del plan mes a mes (tabla accesible)", () => {
  it("es una tabla con caption, scope en columnas y filas, el mes actual resaltado y totales", async () => {
    await open();
    const table = byTest("plan-months-table") as HTMLTableElement;
    expect(table.tagName).toBe("TABLE");
    expect(table.querySelector("caption")!.textContent).toContain("mes a mes");
    const heads = [...table.querySelectorAll("thead th")];
    expect(heads.every((h) => h.getAttribute("scope") === "col")).toBe(true);
    expect(heads.length).toBe(8); // Área + oct … abr
    expect(heads[1]!.textContent).toContain("oct 2026");
    expect(heads[7]!.textContent).toContain("abr 2027");
    const current = [...host.querySelectorAll("[data-testid=plan-month-head]")].filter((h) => h.getAttribute("aria-current") === "date");
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("nov 2026");
    const rows = [...table.querySelectorAll("[data-testid=plan-month-row]")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector("th")!.getAttribute("scope")).toBe("row");
    expect(rows[0]!.textContent).toContain("Backend");
    expect(rows[0]!.textContent).toContain("Bases 16"); // oct: semanas 1–4 = 16 temas de Bases
    expect(rows[1]!.querySelector("[data-empty=true]")).toBeTruthy(); // Frontend no hace nada en octubre
    expect(rows[1]!.textContent).toContain("—");
    expect(byTest("plan-month-totals").querySelector("th")!.getAttribute("scope")).toBe("row");
    expect(byTest("plan-month-totals").textContent).toContain("temas");
    // se desplaza dentro de su contenedor, con la primera columna fija
    expect(byTest("plan-months-scroll").className).toContain("overflow-x-auto");
    expect(table.querySelector("thead th")!.className).toContain("sticky");
  });

  it("pulsar un mes abre la Agenda en la vista Mes de ese mes", async () => {
    await open();
    await click(button("diciembre de 2026"));
    const v = useNavState.getState().values;
    expect(v[`mentor.planTab.${PID}`]).toBe("agenda");
    expect(v[`mentor.agendaView.${PID}`]).toBe("mes");
    // la fecha pedida se consume una vez: la Agenda ya está anclada en ese mes
    await flush();
    expect(byTest("agenda-date").getAttribute("value") ?? (byTest("agenda-date") as HTMLInputElement).value).toBe("2026-12-01");
    expect(byTest("agenda-title").textContent!.toLowerCase()).toContain("diciembre");
    expect(host.querySelector("#plan-tabs-tab-agenda")!.getAttribute("aria-selected")).toBe("true");
  });
});

describe("Áreas, grupos y temas como tarjetas", () => {
  it("el área abre sus grupos como tarjetas con temas, horas, semanas y cobertura; los temas son tarjetas en rejilla", async () => {
    await open();
    await click(button("Backend", byTest("subplan-card")));
    const groups = [...host.querySelectorAll("[data-testid=group-card]")];
    expect(groups.map((g) => g.querySelector("h6")!.textContent)).toEqual([expect.stringContaining("Bases"), expect.stringContaining("Lenguaje: Python"), expect.stringContaining("Conocimientos de backend")]);
    expect(groups[0]!.textContent).toContain("1/40 hechos");
    expect(groups[0]!.textContent).toContain("Cobertura");
    expect(groups[0]!.textContent).toContain("Fundamentos comunes");
    expect(host.querySelector("[data-testid=topic-grid]")).toBeNull(); // nada desplegado hasta que se abre un grupo
    await click(button("Bases", groups[0] as HTMLElement));
    const grid = byTest("topic-grid");
    expect(grid.querySelector("ul")!.className).toContain("grid");
    expect(grid.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(24);
    expect(grid.querySelector("[data-testid=plan-topic]")!.textContent).toContain("Completo");
    await click(button("Mostrar 16 más", grid));
    expect(grid.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(40);
    expect(button("Mostrar", grid)).toBeUndefined();
  });

  it("el filtro rápido por texto y por estado reduce la rejilla", async () => {
    await open();
    await click(button("Backend", byTest("subplan-card")));
    await click(button("Bases", host.querySelector("[data-testid=group-card]") as HTMLElement));
    const grid = byTest("topic-grid");
    await setValue(grid.querySelector("[data-testid=topic-filter-text]")!, "Fundamentals 7");
    expect(grid.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(1);
    expect(grid.textContent).toContain("1 de 40 temas");
    await setValue(grid.querySelector("[data-testid=topic-filter-text]")!, "");
    await setValue(grid.querySelector("[data-testid=topic-filter-state]")!, "hechos");
    expect(grid.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(1);
    await setValue(grid.querySelector("[data-testid=topic-filter-state]")!, "sin_practica");
    expect(grid.querySelectorAll("[data-testid=plan-topic]").length).toBeGreaterThan(5);
    await setValue(grid.querySelector("[data-testid=topic-filter-text]")!, "zzz");
    expect(grid.textContent).toContain("Ningún tema coincide");
  });
});

describe("Aviso de Bases", () => {
  it("avisa de las 40 Bases, ofrece «Pedir cambios» con el texto pre-rellenado y no envía nada", async () => {
    await open();
    const change = vi.spyOn(api, "mentorPlanChange");
    const warn = byTest("bases-warning");
    expect(warn.textContent).toContain("Muchas Bases");
    expect(host.querySelectorAll("[data-testid=bases-warning]")).toHaveLength(1); // Frontend no tiene Bases
    await click(byTest("bases-ask-change"));
    expect(host.querySelector("#plan-tabs-tab-cambios")!.getAttribute("aria-selected")).toBe("true");
    const box = host.querySelector<HTMLTextAreaElement>("[data-testid=plan-changes] textarea")!;
    expect(box.value).toBe("Reduce Bases a lo esencial y aplícalas junto al lenguaje");
    expect(change).not.toHaveBeenCalled();
  });
});

describe("Cobertura de notas y práctica", () => {
  it("cada tarjeta enseña «teoría X/Y · práctica X/Y» y el detalle lista faltantes con «Ver tema»", async () => {
    await open();
    const cards = host.querySelectorAll("[data-testid=subplan-card]");
    const line = cards[0]!.querySelector("[data-testid=area-coverage-line]")!.textContent!;
    expect(line).toMatch(/teoría \d+\/51 · práctica \d+\/51/);
    await click(button("Backend", cards[0] as HTMLElement));
    const cov = byTest("area-coverage");
    expect(cov.textContent).toContain("Faltan ejercicios en");
    expect(cov.textContent).toContain("Sin notas de teoría");
    expect(cov.querySelector("button[aria-label^='Ver tema']")).toBeTruthy();
    expect(byTest("plan-coverage-totals").textContent).toContain("Con ejercicios");
  });

  it("«Revisar cobertura con el Mentor» llama a la API, guarda y enseña los faltantes en la tarjeta del área", async () => {
    await open();
    const review = {
      at: "2026-11-10T10:00:00.000Z", source: "ai" as const, profile: "full stack especializado en automatización", summary: "Backend se queda corto para automatización.", discarded: 1,
      areas: [{ key: "backend", area: "Backend", assessment: "Faltan colas y jobs.", missing: [{ title: "Message queues", why: "trabajos en segundo plano", groupId: "core" }], misplaced: [] }],
    };
    const run = vi.spyOn(api, "mentorPlanCoverageReview").mockResolvedValue({ loading: false, source: "ai", review, plan: { ...plan(), coverageReview: review }, coverage: coverage() });
    await setValue(byTest("coverage-profile") as HTMLInputElement, "full stack especializado en automatización");
    await click(byTest("coverage-review-run"));
    expect(run).toHaveBeenCalledWith(PID, "full stack especializado en automatización");
    expect(byTest("coverage-review-summary").textContent).toContain("Backend se queda corto");
    await click(button("Backend", host.querySelector("[data-testid=subplan-card]") as HTMLElement));
    const ai = byTest("area-ai-review");
    expect(ai.textContent).toContain("Faltantes sugeridos por el Mentor");
    expect(ai.querySelector("[data-testid=ai-missing]")!.textContent).toContain("Message queues");
    expect(ai.textContent).toContain("no se crean notas");
  });

  it("sin IA no se rompe: muestra el motivo y la cobertura calculada sigue visible", async () => {
    await open();
    vi.spyOn(api, "mentorPlanCoverageReview").mockResolvedValue({ loading: false, source: "none", reason: "La IA no está configurada: sin IA solo se muestra la cobertura calculada.", coverage: coverage() });
    await click(byTest("coverage-review-run"));
    expect(byTest("coverage-note").textContent).toContain("sin IA solo se muestra la cobertura calculada");
    expect(byTest("plan-coverage-totals")).toBeTruthy();
    expect(host.querySelector("[data-testid=area-ai-review]")).toBeNull();
  });
});
