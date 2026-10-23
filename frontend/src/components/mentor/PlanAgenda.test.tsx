// @vitest-environment jsdom
//
// Mentor — Plan, Agenda por día · semana · mes · calendario: navegación (anterior / siguiente / Hoy / selector de fecha / futuro y pasado),
// conteo visible de temas y entregables, descripción de propósito editable, calendario accesible con teclado, y la reorganización por áreas.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { buildSchedule } from "../../lib/planSchedule";
import { weekRangesOf } from "../../lib/planTime";
import { buildPracticeTrack } from "../../lib/practiceTrack";
import type { MentorPlan as PlanData, MentorPlanGet, MentorPlanRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { MODE_KEY } from "./mentorNav";

const ui = vi.hoisted(() => ({ askText: vi.fn(), confirmAction: vi.fn() }));
vi.mock("../ui", async (orig) => ({ ...(await orig<typeof import("../ui")>()), askText: ui.askText, confirmAction: ui.confirmAction }));

import { PlanWorkspace } from "./PlanWorkspace";

const START = "2026-10-05"; // lunes
const END = "2027-01-03";
const PID = `${START}_${END}`;
const TODAY = "2026-10-14";
const PRE = { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6], pace: "intenso" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "yes" as const, practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" as const } };
const WEEKS = weekRangesOf(START, END);
const mkTopics = (branch: string, n: number, group: string | undefined, first: number, step: number) =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60, targetWeek: Math.min(WEEKS.length, first + Math.floor(i / step)), ...(group ? { group } : {}) }));
const slices = (topics: Array<{ folder: string; targetWeek: number }>) => WEEKS.map((w) => ({ week: w.week, start: w.start, end: w.end, topics: topics.filter((t) => t.targetWeek === w.week).map((t) => t.folder), minutes: 0, capacityMinutes: 0 }));

/** El plan ya organizado por áreas (Backend con Bases + Lenguaje + Conocimientos; Databases), con su práctica. */
function areasPlan(): PlanData {
  const be = [...mkTopics("1 Fundamentals", 6, "bases", 1, 2), ...mkTopics("2.1 Python", 5, "lang-python", 4, 2), ...mkTopics("4 Backend", 8, "core", 6, 2)];
  const db = mkTopics("6 Databases", 6, "core", 1, 2);
  return {
    id: PID, start: START, end: END, name: "Backend + Databases · 5 oct–3 ene", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 20, preconditions: PRE as never, structure: "areas",
    programmingPractice: buildPracticeTrack(PRE as never),
    subplans: [
      { id: "s1-backend", area: "Backend", areaId: "backend", objective: "Construir servicios y APIs sólidos y seguros", topics: be, weeks: slices(be), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 },
        groups: [{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "lang-python", title: "Lenguaje: Python", kind: "language", order: 10 }, { id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }],
        deliverable: { title: "API REST con persistencia y pruebas", description: "Un servicio pequeño", criteria: ["Endpoints documentados"], status: "idea" } },
      { id: "s2-databases", area: "Databases", areaId: "databases", objective: "Modelar, consultar y operar bases de datos", topics: db, weeks: slices(db), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 },
        groups: [{ id: "core", title: "Conocimientos de bases de datos", kind: "knowledge", order: 100 }] },
    ],
  } as PlanData;
}
/** El mismo plan con la estructura ANTIGUA: un subplan por rama «Programación: …» y una pregunta de entregables por subplan. */
function legacy(): PlanData {
  const mk = (id: string, objective: string, topics: ReturnType<typeof mkTopics>) => ({ id, area: "Programación", objective, topics: topics.map(({ group: _g, ...t }) => t), weeks: slices(topics), requiredGoals: [] });
  const subs = [mk("s1-programacion", "Reforzar bases de programación", mkTopics("1 Fundamentals", 6, undefined, 1, 2)), mk("s2-programacion", "Consolidar Python", mkTopics("2.1 Python", 5, undefined, 4, 2)), mk("s3-programacion", "Servicios backend", mkTopics("4 Backend", 8, undefined, 6, 2)), mk("s4-programacion", "Modelado de datos", mkTopics("6 Databases", 6, undefined, 1, 2))];
  const { structure: _s, ...rest } = areasPlan();
  return { ...rest, name: "Bases +3 · 5 oct–3 ene", subplans: subs, openQuestions: [{ id: "deliverables", subplanId: "s1-programacion", text: "¿Quieres un entregable para Bases?", options: ["Sí", "No", "Después"] }] } as PlanData;
}

const row = (over: Partial<MentorPlanRow> = {}): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Backend + Databases · 5 oct–3 ene", period: "5 oct – 3 ene", status: "activo", archived: false, auto: false, subplans: 2, topics: 0, completed: 0, pct: 0, minutesPerDay: 240, programmingPractice: true, ...over });
const loaded = (p: PlanData, over: Partial<Extract<MentorPlanGet, { loading: false }>> = {}): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 2, topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: true })) })),
    summary: { subplans: p.subplans.length, topics: p.subplans.reduce((n, s) => n + s.topics.length, 0), done: 0, pct: 0, currentWeek: 2, weeks: 14 },
  },
  goals: {}, projects: {}, items: [], practiceItems: [], practice: { ppReady: true, kata: null, kataDoneDates: [], weeks: [] }, months: [], plans: [row()], aiConfigured: true, ...over,
});

/** Un día del plan con temas (el reparto diario nivela, así que no todos los días tienen). */
const busyDay = (): string => buildSchedule(areasPlan() as never).days.find((d) => d.week >= 2 && d.topics.length >= 1 && d.practice.kata)!.date;

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
// «Mi plan» enseña una sub-vista a la vez: elige la que la prueba necesita
const SECTION_ALIAS: Record<string, string> = { datos: "resumen", alcance: "resumen", catalogo: "temas", areas: "temas", ejecutar: "preparar", cobertura: "preparar", antigravity: "preparar" };
const section = async (id: string) => {
  // «Fases mes a mes» vive ahora en la Agenda, vista Mes
  if (id === "fases") {
    await act(async () => { host.querySelector<HTMLElement>("[data-testid='nav-pl:agenda']")!.click(); });
    await flush();
    await act(async () => { host.querySelector<HTMLElement>("[data-testid='nav-pl:agenda/mes']")!.click(); });
    await flush();
    return;
  }
  // si se estaba en la Agenda, se vuelve a «Mi plan» antes de elegir la sub-vista
  if (!host.querySelector(`[data-testid='nav-pl:plan/${SECTION_ALIAS[id] ?? id}']`)) {
    await act(async () => { host.querySelector<HTMLElement>("[data-testid='nav-pl:plan']")?.click(); });
    await flush();
  }
  const b = host.querySelector<HTMLElement>(`[data-testid='nav-pl:plan/${SECTION_ALIAS[id] ?? id}']`);
  expect(b, `sub-vista ${id}`).toBeTruthy();
  await act(async () => { b!.click(); });
  await flush();
  // «Preparar» agrupa ejecutar · cobertura · antigravity; el detalle de las áreas vive dentro de «Temas por área»
  if (id === "ejecutar" || id === "cobertura" || id === "antigravity") {
    const t = host.querySelector<HTMLElement>(`[data-testid=prepare-${id}]`);
    if (t) { await act(async () => { t.click(); }); await flush(); }
  }
  if (id === "areas") host.querySelector("[data-testid=plan-areas-detail]")?.setAttribute("open", "");
};
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string, within: ParentNode = host) => within.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
const tab = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid='nav-pl:${id}']`)!;
const view = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid='nav-pl:agenda/${id}']`)!;
const key = async (el: Element, k: string) => { await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); }); await flush(); };
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const setValue = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    if (el instanceof HTMLInputElement) el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
};
const openAgenda = async (p: PlanData = areasPlan(), over: Partial<Extract<MentorPlanGet, { loading: false }>> = {}) => {
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(p, over));
  await mountEl(<PlanWorkspace planId={PID} />);
  await click(tab("agenda"));
};

beforeEach(() => {
  localStorage.clear();
  ui.askText.mockReset();
  ui.confirmAction.mockReset();
  useNavState.setState({ values: { [MODE_KEY]: "planeacion" } }); // las pruebas de la vista de plan abren la cara «plan»
  useMentor.setState({ planVersion: 0, plans: [], plansLoaded: false, pendingObjective: null });
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

describe("estructura de la Agenda", () => {
  it("la barra lateral ofrece Día · Semana · Mes · Calendario bajo Agenda y la semana actual por defecto", async () => {
    await openAgenda();
    const subs = [...host.querySelectorAll("[data-testid='nav-pl:agenda']")][0]!.parentElement!.querySelectorAll("[role=group] button");
    expect([...subs].map((t) => t.textContent)).toEqual(["Día", "Semana", "Mes", "Calendario"]);
    // la página ya no repite la barra de vistas
    expect(host.querySelector("[role=tablist][aria-label='Vista de la agenda']")).toBeNull();
    expect(view("semana").getAttribute("aria-current")).toBe("page");
    expect(byTest("agenda-title").textContent).toContain("Semana 2");
    await click(view("mes"));
    expect(view("mes").getAttribute("aria-current")).toBe("page");
    expect(byTest("agenda-month")).toBeTruthy();
    // la vista elegida se recuerda por plan
    expect(useNavState.getState().values[`mentor.agendaView.${PID}`]).toBe("mes");
  });

  it("la barra lateral (modo Planeación) lista Mi plan · Agenda · Práctica · Entregables · Preguntas y ajustes, sin pestañas en la página", async () => {
    await openAgenda();
    const top = [...host.querySelectorAll("aside nav > div > button")].map((b) => b.getAttribute("data-testid")!.replace("nav-pl:", ""));
    expect(top).toEqual(["plan", "agenda", "practica", "entregables", "cambios"]);
    expect(host.querySelector("[role=tablist]")).toBeNull();
  });
});

describe("navegación por el tiempo", () => {
  it("← anterior / siguiente → mueven un día, una semana o un mes; «Hoy» vuelve; nunca sale del plan", async () => {
    await openAgenda();
    await click(view("dia"));
    expect(byTest("agenda-title").textContent).toContain("miércoles 14 de octubre");
    await click(byTest("agenda-next"));
    expect(byTest("agenda-title").textContent).toContain("jueves 15 de octubre");
    await click(byTest("agenda-prev"));
    await click(byTest("agenda-prev"));
    expect(byTest("agenda-title").textContent).toContain("martes 13 de octubre");
    await click(byTest("agenda-today"));
    expect(byTest("agenda-title").textContent).toContain("miércoles 14 de octubre");
    await click(view("semana"));
    await click(byTest("agenda-next"));
    expect(byTest("agenda-title").textContent).toContain("Semana 3 · 19–25 oct");
    await click(view("mes"));
    await click(byTest("agenda-next"));
    expect(byTest("agenda-title").textContent).toContain("Noviembre 2026");
    // el último mes recortado al plan: «Siguiente» se desactiva
    for (let i = 0; i < 4; i++) await click(byTest("agenda-next"));
    expect(byTest("agenda-title").textContent).toContain("Enero 2027");
    expect((byTest("agenda-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("«Esta semana» y «Este mes» son atajos al presente; el selector de fecha salta al futuro y al pasado del plan", async () => {
    await openAgenda();
    await click(view("dia"));
    await setValue(byTest("agenda-date") as HTMLInputElement, "2026-12-24");
    expect(byTest("agenda-title").textContent).toContain("jueves 24 de diciembre");
    await click(byTest("agenda-this-week"));
    expect(view("semana").getAttribute("aria-current")).toBe("page");
    expect(byTest("agenda-title").textContent).toContain("Semana 2");
    await setValue(byTest("agenda-date") as HTMLInputElement, "2026-11-20");
    expect(byTest("agenda-title").textContent).toContain("Semana 7");
    await click(byTest("agenda-this-month"));
    expect(view("mes").getAttribute("aria-current")).toBe("page");
    expect(byTest("agenda-title").textContent).toContain("Octubre 2026");
    // pasado: la primera semana del plan
    await setValue(byTest("agenda-date") as HTMLInputElement, START);
    await click(view("semana"));
    expect(byTest("agenda-title").textContent).toContain("Semana 1");
    expect((byTest("agenda-prev") as HTMLButtonElement).disabled).toBe(true);
  });

  it("al cambiar de periodo se anuncia en una región aria-live («Semana 3 · …: N temas, M entregables»)", async () => {
    await openAgenda();
    await click(byTest("agenda-next"));
    const live = byTest("agenda-live");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toMatch(/^Semana 3 · 19–25 oct: \d+ temas?, \d+ entregables?\.$/);
    expect(byTest("plan-live").textContent).toContain("Semana 3");
  });

  it("un plan FUTURO muestra su calendario desde su fecha de inicio y lo dice", async () => {
    await openAgenda(areasPlan(), { today: "2026-09-20", status: "futuro" });
    expect(byTest("agenda-title").textContent).toContain("Semana 1");
    expect(byTest("agenda-status").textContent).toContain("aún no ha empezado");
    await click(view("dia"));
    expect(byTest("agenda-title").textContent).toContain("lunes 5 de octubre"); // «Hoy» queda fuera: el ancla es el inicio del plan
  });
});

describe("conteos visibles de temas y entregables", () => {
  it("día: «N temas · tiempo · M entregables», temas con sus minutos, ruta por área, práctica del día y entregables", async () => {
    await openAgenda();
    await click(view("dia"));
    await setValue(byTest("agenda-date") as HTMLInputElement, busyDay());
    const counts = byTest("agenda-day-counts").textContent!;
    expect(counts).toMatch(/\d+ temas?/);
    expect(counts).toMatch(/\d+ entregables?/);
    const topics = host.querySelectorAll("[data-testid=agenda-topic]");
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) expect(t.querySelector("[data-testid=agenda-topic-minutes]")!.textContent).toMatch(/\d+ min|[\d,.]+ h/);
    expect(byTest("agenda-purpose-text").textContent!.length).toBeGreaterThan(10);
    // la agenda por enfoque ordena el día: teoría → práctica → reto de lógica → proyectos al final
    expect(byTest("agenda-day-theory").textContent).toContain("Teoría de Backend");
    expect(byTest("agenda-day-practice").textContent).toContain("Práctica de Backend");
    expect(byTest("agenda-day-logic").textContent).toContain("Reto de lógica");
    expect(byTest("agenda-practice-kata")).toBeTruthy();
    expect(byTest("agenda-day-projects").textContent).toContain("Proyecto diario");
    expect(byTest("agenda-day-projects").textContent).toContain("Proyecto semanal");
  });

  it("semana: temas por área, horas, práctica y entregables de la semana, y los días con «Ver día»", async () => {
    await openAgenda();
    const w = byTest("agenda-week");
    expect(byTest("agenda-week-counts").textContent).toMatch(/\d+ temas · .+ de estudio · \d+ entregables/);
    expect(w.querySelectorAll("[data-testid=agenda-week-day]")).toHaveLength(7);
    expect(byTest("agenda-week-areas").querySelectorAll("li").length).toBeGreaterThan(0);
    expect(byTest("agenda-week-deliverables").textContent).toMatch(/\d+ entregables/);
    await click(button("Ver el día miércoles 14 de octubre", w));
    expect(view("dia").getAttribute("aria-current")).toBe("page");
    expect(byTest("agenda-title").textContent).toContain("miércoles 14 de octubre");
  });

  it("mes: temas por semana dentro del mes, áreas en foco, hitos y entregables del mes", async () => {
    await openAgenda();
    await click(view("mes"));
    expect(byTest("agenda-month-counts").textContent).toMatch(/\d+ temas · .+ de estudio · \d+ entregables · \d+ semanas/);
    expect(host.querySelectorAll("[data-testid=agenda-month-week]").length).toBeGreaterThanOrEqual(4);
    expect(byTest("agenda-month-areas").querySelectorAll("li").length).toBeGreaterThan(0);
    expect(byTest("agenda-month-deliverables").textContent).toMatch(/\d+ katas/);
    expect(byTest("agenda-purpose-text").textContent).toContain("Octubre 2026");
    await click(button("Ver la semana 3", byTest("agenda-month")));
    expect(view("semana").getAttribute("aria-current")).toBe("page");
    expect(byTest("agenda-title").textContent).toContain("Semana 3");
  });
});

describe("propósito editable", () => {
  it("«Editar propósito» guarda el texto en el plan y «Volver al automático» lo borra", async () => {
    const set = vi.spyOn(api, "mentorPlanSetPurpose").mockImplementation(async (o) => ({ ...areasPlan(), purposes: o.text ? { [o.scope]: { [o.key]: o.text } } : undefined }) as never);
    await openAgenda();
    await click(view("dia"));
    await click(button("Editar propósito"));
    const ta = host.querySelector<HTMLTextAreaElement>("[data-testid=agenda-purpose] textarea")!;
    await setValue(ta, "Hoy: HTTP y el kata");
    await click(button("Guardar propósito"));
    expect(set).toHaveBeenCalledWith({ id: PID, scope: "day", key: TODAY, text: "Hoy: HTTP y el kata" });
  });
});

describe("calendario accesible", () => {
  it("rejilla role=grid con cabeceras, una etiqueta por día («miércoles 14 de octubre: N temas, M entregables») y resumen por semana en el margen", async () => {
    await openAgenda();
    await click(view("calendario"));
    const grid = byTest("agenda-grid");
    expect(grid.getAttribute("role")).toBe("grid");
    expect(grid.getAttribute("aria-label")).toBe("Calendario de Octubre 2026");
    expect([...grid.querySelectorAll("[role=columnheader]")].map((c) => c.getAttribute("aria-label") ?? c.textContent)).toEqual(["Semana", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]);
    const today = grid.querySelector<HTMLButtonElement>("button[data-date='2026-10-14']")!;
    expect(today.getAttribute("aria-label")).toMatch(/^miércoles 14 de octubre: Backend \d+ temas? y práctica(; [A-Za-z ]+ \d+ temas? y práctica)*(, proyecto diario)?, (\d+ entregables?|sin entregables)/);
    expect(today.getAttribute("aria-current")).toBe("date");
    const cell = grid.querySelector<HTMLButtonElement>(`button[data-date='${busyDay()}']`)!;
    expect(cell.getAttribute("aria-label")).toMatch(/: Backend \d+ temas? y práctica.*\d+ entregables?/);
    // las filas enteras fuera del plan no se pintan (el plan empieza el lunes 5 de oct: no hay fila de septiembre)
    expect(grid.querySelector("button[data-date='2026-10-04']")).toBeNull();
    const margins = grid.querySelectorAll("[data-testid=agenda-week-margin]");
    expect(margins.length).toBeGreaterThanOrEqual(4);
    // el margen resume la fila lunes–domingo y dice qué semana(s) del plan toca
    expect(margins[0]!.getAttribute("aria-label")).toMatch(/^Semana 1: \d+ temas?, \d+ entregables?/);
    // indicadores compactos: nº de temas, kata, entregable
    expect(cell.textContent).toMatch(/Back\d+t/);
    expect(cell.textContent).toContain("K");
    expect(cell.textContent).toContain("◆");
  });

  it("un solo día en el orden de Tab; las flechas mueven la selección y el foco; Inicio/Fin, RePág/AvPág; Intro abre el día", async () => {
    await openAgenda();
    await click(view("calendario"));
    const grid = byTest("agenda-grid");
    const cells = [...grid.querySelectorAll<HTMLButtonElement>("button[data-date]")];
    expect(cells.filter((c) => c.tabIndex === 0).map((c) => c.dataset.date)).toEqual([TODAY]);
    const on = (d: string) => grid.querySelector<HTMLButtonElement>(`button[data-date='${d}']`)!;
    on(TODAY).focus();
    await key(on(TODAY), "ArrowRight");
    expect(document.activeElement).toBe(on("2026-10-15"));
    expect(on("2026-10-15").getAttribute("data-selected")).toBe("true");
    await key(on("2026-10-15"), "ArrowDown");
    expect(document.activeElement).toBe(on("2026-10-22"));
    await key(on("2026-10-22"), "ArrowLeft");
    await key(on("2026-10-21"), "ArrowUp");
    expect(document.activeElement).toBe(on("2026-10-14"));
    await key(on("2026-10-14"), "Home");
    expect(document.activeElement).toBe(on("2026-10-12")); // lunes
    await key(on("2026-10-12"), "End");
    expect(document.activeElement).toBe(on("2026-10-18")); // domingo
    // otro mes
    await key(on("2026-10-18"), "PageDown");
    expect(byTest("agenda-grid").getAttribute("aria-label")).toBe("Calendario de Noviembre 2026");
    expect(grid.querySelector("button[data-selected='true']")!.getAttribute("data-date")).toBe("2026-11-18"); // el mismo día del mes siguiente
    expect(grid.querySelectorAll("button[data-date][tabindex='0']")).toHaveLength(1);
    // el detalle del día elegido se ve debajo y Intro lleva el foco a él
    const detail = byTest("agenda-calendar-detail");
    expect(detail.querySelector("h2")!.textContent!.toLowerCase()).toContain("noviembre");
    const cur = grid.querySelector<HTMLButtonElement>("button[data-selected='true']")!;
    await key(cur, "Enter");
    expect(document.activeElement).toBe(detail);
    expect(detail.querySelector("[data-testid=agenda-day-counts]")).toBeTruthy();
  });

  it("no se sale del plan con las flechas y al hacer clic en un día se ve su detalle diario", async () => {
    await openAgenda(areasPlan(), { today: START });
    await click(view("calendario"));
    const grid = byTest("agenda-grid");
    const first = grid.querySelector<HTMLButtonElement>(`button[data-date='${START}']`)!;
    first.focus();
    await key(first, "ArrowLeft");
    expect(grid.querySelector(`button[data-date='${START}']`)!.getAttribute("data-selected")).toBe("true");
    await click(grid.querySelector("button[data-date='2026-10-09']"));
    expect(byTest("agenda-calendar-detail").querySelector("h2")!.textContent!.toLowerCase()).toContain("viernes 9 de octubre");
  });
});

describe("Mi plan por áreas y «Reorganizar por áreas»", () => {
  it("un plan por áreas enseña la línea de fases, los grupos de cada área y su objetivo corto", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(areasPlan()));
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("fases");
    expect(host.querySelector("[data-testid=plan-legacy-bar]")).toBeNull();
    const phases = [...host.querySelectorAll("[data-testid=plan-phase]")];
    expect(phases.map((p) => p.textContent)).toEqual([expect.stringContaining("Backend"), expect.stringContaining("Databases")]);
    expect(phases[0]!.textContent).toMatch(/semanas 1–\d+/);
    await section("areas");
    const cards = host.querySelectorAll("[data-testid=subplan-card]");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.querySelector("[data-testid=area-objective]")!.textContent).toBe("Construir servicios y APIs sólidos y seguros");
    expect(cards[0]!.textContent).toContain("Bases · 6");
    expect(cards[0]!.textContent).toContain("Lenguaje: Python · 5");
    expect(cards[0]!.textContent).toContain("Conocimientos de backend · 8");
    // el nombre sale de las áreas
    expect(host.querySelector("#plan-title")!.textContent).toBe("Backend + Databases · 5 oct–3 ene");
  });

  it("un plan de estructura antigua se lee tal cual y ofrece «Reorganizar por áreas» SIN hacerlo solo; al pulsarlo pide confirmación y llama a la API", async () => {
    const old = legacy();
    const get = vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(old));
    const reorg = vi.spyOn(api, "mentorPlanReorganize").mockResolvedValue({ plan: areasPlan(), entry: { n: 1, at: "2026-10-14T10:00:00Z", comment: "Reorganizar por áreas", status: "applied", source: "rules", summary: "ok", delta: { added: 0, removed: 0, moved: 3, deliverables: 0, structure: 2 }, changed: [], warnings: [], fixOptions: [] }, history: [], applied: true });
    await mountEl(<PlanWorkspace planId={PID} />);
    const bar = byTest("plan-legacy-bar");
    expect(bar.textContent).toContain("estructura antigua");
    expect(bar.textContent).toContain("No se hace solo");
    await section("areas");
    expect(host.querySelectorAll("[data-testid=subplan-card]")).toHaveLength(4); // se pinta la estructura antigua
    expect(reorg).not.toHaveBeenCalled();
    // cancelar la confirmación no hace nada
    ui.confirmAction.mockResolvedValueOnce(false);
    await click(byTest("plan-reorganize"));
    expect(reorg).not.toHaveBeenCalled();
    ui.confirmAction.mockResolvedValueOnce(true);
    await click(byTest("plan-reorganize"));
    expect(reorg).toHaveBeenCalledWith(PID);
    expect(ui.confirmAction.mock.calls[1]![1]).toContain("Se conservan los temas completados");
    expect(byTest("plan-live").textContent).toContain("Plan reorganizado por áreas");
    get.mockRestore();
  });

  it("el aviso «completado con reglas» solo aparece cuando ocurrió, con su motivo, y sin notas internas", async () => {
    const p = areasPlan();
    p.subplans[1] = { ...p.subplans[1]!, fallback: { kind: "rules", reason: "la IA tardó demasiado" } };
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(p));
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("alcance");
    const note = byTest("plan-fallback-note");
    expect(note.textContent).toContain("Completado con reglas");
    expect(note.textContent).toContain("Databases: la IA tardó demasiado");
    expect(host.textContent).not.toContain("sin la selección de la IA)");
    const clean = areasPlan();
    vi.restoreAllMocks();
    vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([row()]);
    act(() => root.unmount());
    root = createRoot(host);
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(clean));
    await mountEl(<PlanWorkspace planId={PID} />);
    expect(host.querySelector("[data-testid=plan-fallback-note]")).toBeNull();
  });
});

describe("pestaña «Entregables»: pregunta global, proyectos de área y agenda con filtros", () => {
  const withQuestion = (): PlanData => ({ ...areasPlan(), openQuestions: [{ id: "deliverables", text: "¿Quieres un entregable (proyecto de demostración) por cada área del plan?", options: ["Sí", "No", "Después"] }] });
  const bare = (): PlanData => {
    const p = areasPlan();
    return { ...p, deliverablesDefinedAt: "2026-10-02T00:00:00Z", subplans: p.subplans.map((s) => ({ ...s, deliverable: undefined })) } as PlanData;
  };

  it("UNA sola pregunta global (no una por subplan): «Añadir a todas las áreas» confirma y responde sin subplanId", async () => {
    const ans = vi.spyOn(api, "mentorPlanAnswer").mockResolvedValue(bare());
    ui.confirmAction.mockResolvedValue(true);
    await openAgenda({ ...bare(), openQuestions: withQuestion().openQuestions }); // plan sin entregables y con la pregunta
    await click(tab("entregables"));
    expect(host.querySelectorAll("[data-testid=plan-open-question]")).toHaveLength(0);
    expect(byTest("plan-global-question").textContent).toContain("por cada área");
    await click(button("Añadir a todas las áreas"));
    expect(ui.confirmAction).toHaveBeenCalledTimes(1);
    expect(ans).toHaveBeenCalledWith({ id: PID, answer: "yes" });
    ans.mockClear();
    ui.confirmAction.mockResolvedValue(true);
    await click(button("No quiero ninguno"));
    expect(ans).toHaveBeenCalledWith({ id: PID, answer: "no" });
  });

  it("excepción por área: «Añadir proyecto» / «Quitar» actúan sobre un área concreta", async () => {
    const toggle = vi.spyOn(api, "mentorPlanAreaDeliverable").mockResolvedValue(bare());
    await openAgenda(bare());
    await click(tab("entregables"));
    const cards = host.querySelectorAll("[data-testid=plan-deliverable-card]");
    expect(cards).toHaveLength(2);
    await click(button("Añadir entregable a Databases", cards[1]!));
    expect(toggle).toHaveBeenCalledWith({ id: PID, subplanId: expect.stringContaining("databases"), enabled: true });
  });

  it("la agenda de entregables filtra por periodo, tipo y área, cuenta hechos/pendientes y cambia el estado con la API", async () => {
    const upd = vi.spyOn(api, "mentorPlanUpdateDeliverable").mockResolvedValue(areasPlan());
    await openAgenda(areasPlan(), { practice: { ppReady: true, kata: null, kataDoneDates: ["2026-10-14", "2026-10-13"], weeks: [] } });
    await click(tab("entregables"));
    const count = byTest("deliverable-count").textContent!;
    expect(count).toMatch(/\d+ entregables · 2 hechos · \d+ pendientes/); // octubre ya hecho: 2 katas
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Tipo']")!, "kata");
    expect([...host.querySelectorAll("[data-testid=deliverable-row]")].every((r) => r.textContent!.includes("Kata"))).toBe(true);
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Periodo']")!, "semana");
    // semana del 12 al 18 oct: 6 katas (lunes a sábado)
    expect(host.querySelectorAll("[data-testid=deliverable-row]")).toHaveLength(6);
    expect(byTest("deliverable-count").textContent).toMatch(/^6 entregables · 2 hechos · 4 pendientes/);
    // el filtro por área deja lo de esa área y los proyectos integradores que la incluyen (los katas no tienen área)
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Tipo']")!, "");
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Periodo']")!, "todo");
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Área']")!, "backend");
    expect([...host.querySelectorAll("[data-testid=deliverable-row]")].every((r) => !r.textContent!.includes("Kata") && r.textContent!.includes("Proyecto"))).toBe(true);
    // cambiar el estado de uno
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Área']")!, "");
    await setValue(host.querySelector<HTMLSelectElement>("select[aria-label='Periodo']")!, "semana");
    const sel = host.querySelector<HTMLSelectElement>("select[aria-label='Estado de Kata del 15 oct']")!;
    await setValue(sel, "hecho");
    expect(upd).toHaveBeenCalledWith({ id: PID, deliverableId: "kata:2026-10-15", status: "hecho" });
  });
});
