// @vitest-environment jsdom
//
// Sub-vista «Temas por área»: sub-barra con las áreas del plan, sub-barra de grupos dentro de cada área, tabla de temas y «Generar todo».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { PlanTopicRow } from "../../lib/planTopicCatalog";
import type { MentorPlan } from "../../lib/types";

const openTopic = vi.fn();
vi.mock("./openTopic", () => ({ openTopic: (f: string) => openTopic(f) }));
import { PlanAreaTopics } from "./PlanAreaTopics";

const topic = (folder: string, week: number, over: Record<string, unknown> = {}) => ({ folder, title: folder.split("/").pop()!, targetWeek: week, estMinutes: 30, ...over });
const sub = (id: string, area: string, topics: unknown[], groups?: unknown[]) => ({ id, area, objective: "", topics, weeks: [], requiredGoals: [], ...(groups ? { groups } : {}) });
const PLAN = {
  id: "p1",
  subplans: [
    sub("s1", "Backend", [topic("P/4/4.1 HTTP", 1, { group: "bases" }), topic("P/4/4.2 REST", 2, { group: "kn" })], [
      { id: "bases", title: "Bases", kind: "bases", order: 1 },
      { id: "kn", title: "Conocimientos", kind: "knowledge", order: 2 },
    ]),
    { ...sub("s2", "Frontend", [topic("P/5/5.1 DOM", 1)]), areaId: "frontend" },
  ],
} as unknown as MentorPlan;
const row = (folder: string, over: Partial<PlanTopicRow> = {}): PlanTopicRow => ({
  folder, title: folder.split("/").pop()!, branch: "Backend", inPlan: true, exists: true, topicType: "unknown", theory: true, contract: true, canvas: true,
  manifest: true, skills: 3, exercises: 5, score: 100, complete: true, gaps: 0, ...over,
});
const ROWS = [row("P/4/4.1 HTTP"), row("P/4/4.2 REST", { canvas: false, exercises: 0, complete: false })];

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const titles = () => [...host.querySelectorAll("[data-testid=area-open]")].map((e) => e.textContent);
const click = async (id: string) => { await act(async () => { byTest(id)!.click(); }); };
const mount = async (plan: MentorPlan) => { await act(async () => { root.render(<PlanAreaTopics plan={plan} />); }); await flush(); await flush(); };

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanTopicCatalog").mockResolvedValue({ loading: false, rows: ROWS });
  vi.spyOn(api, "mentorExecutionReport").mockResolvedValue({ loading: false, report: { planId: "p1", at: "", scope: {}, areas: [], tasks: [], totals: { tasks: 0, required: 0, aiCalls: 0, files: 0, minutes: 0, byKind: {} }, manual: [], aiConfigured: true, maxWeek: 4 }, execution: null, aiConfigured: true } as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  openTopic.mockClear();
});

describe("PlanAreaTopics", () => {
  it("una pestaña por área del plan; la primera abierta, con sus temas en orden de ruta y lo que falta marcado con texto", async () => {
    await mount(PLAN);
    const tabs = [...byTest("area-tabs")!.querySelectorAll("button")].map((b) => b.dataset.testid);
    expect(tabs).toEqual(["area-tabs-s1", "area-tabs-frontend"]);
    expect(byTest("area-tabs-s1")!.getAttribute("aria-pressed")).toBe("true");
    expect(byTest("area-tabs-s1")!.textContent).toContain("por generar"); // el aviso también va escrito para lectores de pantalla
    expect(titles()).toEqual(["4.1 HTTP", "4.2 REST"]);
    const rest = host.querySelectorAll("[data-testid=area-row]")[1]!;
    expect(rest.textContent).toContain("Sin mapa");
    expect(rest.textContent).toContain("Sin ejercicios");
    expect(byTest("area-summary")!.textContent).toContain("1 por generar");
  });

  it("cambia de área y de grupo con las sub-barras; abrir un tema lo abre", async () => {
    await mount(PLAN);
    expect(byTest("group-tabs")).toBeTruthy();
    await click("group-tabs-kn");
    expect(titles()).toEqual(["4.2 REST"]);
    await click("area-tabs-frontend");
    expect(titles()).toEqual(["5.1 DOM"]);
    expect(byTest("group-tabs")).toBeNull(); // sin grupos no hay segunda sub-barra
    await click("area-tabs-s1");
    expect(titles()).toEqual(["4.1 HTTP", "4.2 REST"]); // al volver, el grupo se reinicia a «Todos»
    await click("area-open");
    expect(openTopic).toHaveBeenCalledWith("P/4/4.1 HTTP");
  });

  it("«Generar todo» abre el diálogo con el alcance de ese tema; lo completo no se puede generar", async () => {
    await mount(PLAN);
    const btns = [...host.querySelectorAll<HTMLButtonElement>("[data-testid=generate-topic]")];
    expect(btns[0]!.disabled).toBe(true); // HTTP está completo
    expect(btns[1]!.disabled).toBe(false);
    await act(async () => { btns[1]!.click(); });
    await flush(); await flush();
    expect(byTest("exec-scope-topic")!.textContent).toContain("4.2 REST");
    expect(api.mentorExecutionReport).toHaveBeenCalledWith("p1", expect.objectContaining({ mode: "topic", folder: "P/4/4.2 REST", includeRecommended: true }));
  });

  it("«Generar el área» usa el alcance del área", async () => {
    await mount(PLAN);
    await act(async () => { byTest("generate-area")!.click(); });
    await flush(); await flush();
    expect(api.mentorExecutionReport).toHaveBeenCalledWith("p1", expect.objectContaining({ mode: "area", areaKey: "s1" }));
  });

  it("si el plan cambia de áreas la sub-barra se actualiza sola", async () => {
    await mount(PLAN);
    await click("area-tabs-frontend");
    await mount({ ...PLAN, subplans: PLAN.subplans.slice(0, 1) } as MentorPlan);
    expect(byTest("area-tabs-frontend")).toBeNull();
    expect(titles()).toEqual(["4.1 HTTP", "4.2 REST"]);
  });
});
