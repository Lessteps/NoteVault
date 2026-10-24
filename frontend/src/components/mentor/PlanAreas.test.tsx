// @vitest-environment jsdom
//
// Mentor — Plan: las vistas POR ÁREA. «Poner todas las áreas desde el día 1» (aviso, confirmación con el antes/después, aplicar, deshacer),
// «Temas por semana y área» en Mi plan, Semana y Mes con los temas separados por área, el Calendario con indicadores por área, filtro por área
// y teclado, el detalle del día ordenado por área y los entregables «por definir» (pestaña, contadores y chips ocultos hasta que existan).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { planTogetherPhases } from "../../lib/planAreas";
import { buildSchedule, progressPlan } from "../../lib/planSchedule";
import { topicsByWeekArea } from "../../lib/planTopicsByArea";
import { weekRangesOf } from "../../lib/planTime";
import type { MentorChangeEntry, MentorPlan as PlanData, MentorPlanGet, MentorPlanRow } from "../../lib/types";
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
const PRE = { start: START, end: END, minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask" as const };
const WEEKS = weekRangesOf(START, END);
const mk = (branch: string, n: number, group: string, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60, targetWeek: from + Math.floor((i / n) * (to - from + 1)), group }));
const slices = (topics: Array<{ folder: string; targetWeek: number }>) => WEEKS.map((w) => ({ week: w.week, start: w.start, end: w.end, topics: topics.filter((t) => t.targetWeek === w.week).map((t) => t.folder), minutes: 0, capacityMinutes: 0 }));
const CORE = (title: string) => ({ id: "core", title, kind: "knowledge" as const, order: 100 });

type Phases = Record<string, { fromWeek: number; toWeek: number }>;
/** Cinco áreas guardadas en un orden NO canónico (Backend, Databases, Frontend, Automation, Tooling) para comprobar el orden fijo. */
function fivePlan(mode: "phased" | "together", extra: Partial<PlanData> = {}): PlanData {
  const phased: Phases = { backend: { fromWeek: 1, toWeek: 6 }, databases: { fromWeek: 1, toWeek: 6 }, frontend: { fromWeek: 7, toWeek: 10 }, automation: { fromWeek: 11, toWeek: 13 }, tooling: { fromWeek: 11, toWeek: 13 } };
  const defs = [
    { id: "backend", area: "Backend", branch: "4 Backend", n: 12 },
    { id: "databases", area: "Databases", branch: "6 Databases", n: 8 },
    { id: "frontend", area: "Frontend", branch: "5 Frontend", n: 8 },
    { id: "automation", area: "Automation", branch: "7 Automation", n: 5 },
    { id: "tooling", area: "Tooling and Quality", branch: "9 Tooling and Quality", n: 5 },
  ];
  const caps = WEEKS.map(() => 100);
  const together = planTogetherPhases(defs.map((d) => ({ key: d.id, weight: d.n * 60, areaId: d.id })), caps);
  const ph: Phases = mode === "together" ? together : phased;
  const subplans = defs.map((d) => {
    const topics = mk(d.branch, d.n, "core", ph[d.id]!.fromWeek, ph[d.id]!.toWeek);
    return { id: `s-${d.id}`, area: d.area, areaId: d.id, objective: d.area, topics, weeks: slices(topics), requiredGoals: [], phase: ph[d.id]!, groups: [CORE(`Conocimientos de ${d.area}`)] };
  });
  return {
    id: PID, start: START, end: END, name: "Full stack web · 5 oct–3 ene", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 20,
    preconditions: { ...PRE, ...(mode === "together" ? { areaMode: "together" } : {}) } as never, structure: "areas",
    ...(mode === "together" ? { areaMode: "together" as const, areaModeWhy: "Por defecto, todas juntas desde el día 1.", areaModeBy: "rules" as const } : {}),
    openQuestions: [{ id: "deliverables", text: "¿Quieres un entregable (proyecto de demostración) por cada área del plan?", options: ["Sí", "No", "Después"] }],
    subplans, ...extra,
  } as PlanData;
}

const row = (): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Full stack web · 5 oct–3 ene", period: "5 oct – 3 ene", status: "activo", archived: false, auto: false, subplans: 5, topics: 0, completed: 0, pct: 0, minutesPerDay: 360 });
const loaded = (p: PlanData): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 2, topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: true })) })),
    summary: { subplans: p.subplans.length, topics: p.subplans.reduce((n, s) => n + s.topics.length, 0), done: 0, pct: 0, currentWeek: 2, weeks: WEEKS.length },
  },
  goals: {}, projects: {}, items: [], practiceItems: [], practice: { ppReady: true, kata: null, kataDoneDates: [], weeks: [] }, months: [], plans: [row()], aiConfigured: true,
});
const entry = (): MentorChangeEntry => ({ n: 1, at: "2026-10-14T10:00:00Z", comment: "Poner todas las áreas desde el día 1 (Automation al final)", status: "applied", source: "rules", summary: "Áreas juntas.", delta: { added: 0, removed: 0, moved: 40, deliverables: 0 }, changed: [], warnings: [], fixOptions: [] } as never);

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
const key = async (el: Element, k: string) => { await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); }); await flush(); };
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
const open = async (p: PlanData) => {
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(p));
  await mountEl(<PlanWorkspace planId={PID} />);
};
const openAgenda = async (p: PlanData, v?: string) => {
  await open(p);
  await click(tab("agenda"));
  if (v) await click(view(v));
};
const firstStudyDay = (p: PlanData, week = 2): string => buildSchedule(progressPlan(p as never, { today: TODAY })).days.find((d) => d.week === week && d.study && (d.blocks ?? []).length > 0)!.date;

beforeEach(() => {
  localStorage.clear();
  ui.confirmAction.mockReset();
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

describe("Mi plan: «Poner todas las áreas desde el día 1»", () => {
  it("un plan por fases ofrece el aviso con la pregunta y el botón; uno que ya estudia juntas, no", async () => {
    await open(fivePlan("phased"));
    const bar = byTest("plan-together-bar");
    expect(bar.textContent).toContain("Tu plan estudia las áreas por fases");
    expect(bar.textContent).toContain("¿Quieres todas desde el día 1, con Automation al final?");
    expect(byTest("plan-together-open").textContent).toBe("Poner todas las áreas desde el día 1");
    expect(bar.getAttribute("aria-labelledby")).toBeTruthy();
    expect(byTest("plan-together-confirm")).toBeFalsy();
    act(() => root.unmount());
    host.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.restoreAllMocks();
    vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
    vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: false, label: "", elapsed: 0 });
    await open(fivePlan("together"));
    expect(byTest("plan-together-bar")).toBeFalsy();
    await section("datos");
    expect(byTest("plan-area-mode-chip").textContent).toContain("Juntas desde el día 1");
  });

  it("la confirmación resume el antes/después de las semanas de cada área (orden fijo) y cancelar no cambia nada", async () => {
    const change = vi.spyOn(api, "mentorPlanChange");
    await open(fivePlan("phased"));
    await click(byTest("plan-together-open"));
    const conf = byTest("plan-together-confirm");
    expect(conf.getAttribute("role")).toBe("group");
    const rows = [...conf.querySelectorAll("tbody tr")];
    expect(rows.map((r) => r.getAttribute("data-area"))).toEqual(["backend", "frontend", "databases", "tooling", "automation"]);
    expect(byTest("together-before", rows[0] as HTMLElement).textContent).toContain("semanas 1–6");
    expect(byTest("together-before", rows[1] as HTMLElement).textContent).toContain("semanas 7–10");
    expect(byTest("together-before", rows[3] as HTMLElement).textContent).toContain("semanas 11–13");
    // después: todas desde la semana 1 (Tooling incluida) y Automation al final
    for (const i of [0, 1, 2, 3]) expect(byTest("together-after", rows[i] as HTMLElement).textContent).toMatch(/^semanas 1–/);
    expect(byTest("together-after", rows[4] as HTMLElement).textContent).toMatch(/^semanas \d+–13.*al final/);
    expect(conf.textContent).toContain("se puede deshacer");
    // Escape cierra; cancelar también; nada se llamó
    await click(byTest("plan-together-cancel"));
    expect(byTest("plan-together-confirm")).toBeFalsy();
    expect(change).not.toHaveBeenCalled();
  });

  it("aplicar llama a set_area_mode (determinista), recalcula la vista, anuncia el resultado y se puede deshacer", async () => {
    const together = fivePlan("together");
    const change = vi.spyOn(api, "mentorPlanChange").mockResolvedValue({ loading: false, plan: together, entry: entry(), history: [entry()], applied: true });
    const undo = vi.spyOn(api, "mentorPlanChangeUndo").mockResolvedValue({ plan: fivePlan("phased"), history: [] });
    await open(fivePlan("phased"));
    await click(byTest("plan-together-open"));
    // tras aplicar, el servidor devuelve el plan ya en «juntas»
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(together));
    await click(byTest("plan-together-apply"));
    expect(change).toHaveBeenCalledWith({ id: PID, ops: [{ op: "set_area_mode", mode: "together" }], label: "Poner todas las áreas desde el día 1 (Automation al final)" });
    expect(byTest("plan-together-done").textContent).toContain("todas las áreas están activas desde el día 1");
    expect(byTest("plan-live").textContent).toContain("Automation");
    // deshacer desde el propio aviso
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(fivePlan("phased")));
    await click(byTest("plan-together-undo"));
    expect(undo).toHaveBeenCalledWith(PID);
    expect(byTest("plan-together-done")).toBeFalsy();
    expect(byTest("plan-together-bar").textContent).toContain("Tu plan estudia las áreas por fases");
    // los datos clave (otra sub-vista) ya no dicen «Juntas desde el día 1»
    await section("datos");
    expect(byTest("plan-preconditions").textContent).not.toContain("Juntas desde el día 1");
  });

  it("si la operación falla lo dice con un aviso y el aviso sigue ofreciendo el botón", async () => {
    vi.spyOn(api, "mentorPlanChange").mockRejectedValue(new Error("Ese plan ya no existe."));
    await open(fivePlan("phased"));
    await click(byTest("plan-together-open"));
    await click(byTest("plan-together-apply"));
    expect(host.querySelector("[role=alert]")!.textContent).toContain("Ese plan ya no existe.");
    expect(byTest("plan-together-open")).toBeTruthy();
  });
});

describe("Mi plan: «Temas por semana y área»", () => {
  it("tabla semanas × áreas en el orden fijo, con los totales por área y cada semana expandible a su lista de temas", async () => {
    await open(fivePlan("together"));
    await section("temas");
    const sec = byTest("plan-area-topics");
    expect(sec.querySelector("h2")!.textContent).toBe("Temas por semana y área");
    const heads = [...sec.querySelectorAll("thead th")].map((h) => h.textContent!.trim());
    expect(heads).toEqual(["Semana", "Backend", "Frontend", "Databases", "Tooling and Quality", "Automation", "Total"]);
    const rows = all("area-topics-row", sec);
    expect(rows).toHaveLength(WEEKS.length);
    // la semana actual (2) viene abierta; las demás cerradas
    expect(all("area-topics-detail", sec)).toHaveLength(1);
    const totals = byTest("area-topics-totals", sec);
    expect([...totals.querySelectorAll("td")].slice(0, 5).map((c) => c.textContent!.match(/^\d+/)![0])).toEqual(["12", "8", "8", "5", "5"]);
    // cada semana: el nº de temas de la fila es la suma de sus celdas
    for (const r of rows) {
      const cells = all("area-topics-cell", r).map((c) => Number(c.textContent!.match(/^\d+/)?.[0] ?? 0));
      expect(Number(r.querySelector("td:last-child")!.firstChild!.textContent)).toBe(cells.reduce((a, b) => a + b, 0));
    }
    // expandir una semana muestra los temas de cada área con su día
    // (con 4 temas por área y día el plan de prueba se reparte en pocas semanas: se abre una semana que tenga temas)
    const withTopics = rows.find((r) => r.querySelector("button")!.getAttribute("aria-expanded") === "false" && all("area-topics-cell", r).some((c) => Number(c.textContent!.match(/^\d+/)?.[0] ?? 0) > 0))!;
    const btn = withTopics.querySelector("button")!;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const detail = all("area-topics-detail", sec).find((d) => d.id === btn.getAttribute("aria-controls"))!;
    expect(detail.textContent).toMatch(/Backend/);
    await click(byTest("area-topics-collapse", sec));
    expect(all("area-topics-detail", sec)).toHaveLength(0);
    await click(byTest("area-topics-expand", sec));
    expect(all("area-topics-detail", sec)).toHaveLength(WEEKS.length);
  });

  it("la tabla mes a mes sigue el mismo orden de áreas y cuenta los entregables de la cadena (nunca «por definir»)", async () => {
    await open(fivePlan("together"));
    await section("fases");
    const names = all("plan-month-row").map((r) => r.querySelector("th")!.textContent!);
    expect(names.map((n) => n.replace(/\d.*$/, "").trim())).toEqual(["Backend", "Frontend", "Databases", "Tooling and Quality", "Automation"]);
    expect(byTest("plan-month-totals").textContent).not.toContain("por definir");
    expect(byTest("plan-month-totals").textContent).not.toMatch(/\d\s*h/); // los meses no se miden por horas previstas
    expect(host.textContent).not.toContain("Marcar en curso");
  });
});

describe("Agenda: Semana y Mes con los temas separados por área", () => {
  it("la vista Semana tiene una sección por área (orden fijo) con nº de temas, horas, lista con estado y día y el total del plan", async () => {
    const p = fivePlan("together");
    await openAgenda(p, "semana");
    const sec = byTest("agenda-week-areas");
    const cards = all("week-area", sec);
    expect(cards.map((c) => c.getAttribute("data-area"))).toEqual(["backend", "frontend", "databases", "tooling"]);
    const be = cards[0]!;
    expect(be.querySelector("h4")!.textContent).toContain("Backend");
    expect(byTest("week-area-count", be).textContent).toMatch(/^\d+ temas?$/);
    const topics = all("area-topic", be);
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      expect(byTest("area-topic-days", t).getAttribute("aria-label")).toMatch(/Día asignado: (lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d+/);
      expect(t.textContent).toMatch(/Hoy|Pendiente|Hecho|Sin tratar/);
    }
    expect(byTest("week-area-total", be).textContent).toMatch(/En todo el plan: 12 temas/);
    // Automation aún no empieza: no tiene tarjeta, va en la línea de «sin temas esta semana»
    expect(byTest("week-areas-empty").textContent).toContain("Automation");
    expect(byTest("week-areas-empty").textContent).toContain("fuera de su fase");
    // el total de la cabecera de la semana es la suma de las áreas
    const sum = cards.reduce((n, c) => n + all("area-topic", c).length, 0);
    expect(byTest("agenda-week-counts").textContent).toContain(`${sum} temas`);
  });

  it("la vista Mes desglosa cada semana por área y da los totales del mes por área", async () => {
    await openAgenda(fivePlan("together"), "mes");
    const totals = byTest("month-area-totals");
    expect([...totals.querySelectorAll("li")].map((l) => l.getAttribute("data-area"))).toEqual(["backend", "frontend", "databases", "tooling", "automation"]);
    const weeks = all("agenda-month-week");
    expect(weeks.length).toBeGreaterThan(3);
    const chips = byTest("month-week-areas", weeks[1]!);
    expect(chips.textContent).toMatch(/Backend \d+ temas?/);
    expect(chips.getAttribute("aria-label")).toMatch(/^Temas de la semana \d+ por área$/);
  });
});

describe("Agenda: Semana y Mes segmentadas por categoría", () => {
  const withBases = (): PlanData => {
    const p = fivePlan("together");
    const subplans = p.subplans.map((s) => (s.areaId === "backend" ? { ...s, groups: [...(s.groups ?? []), { id: "bases", title: "Bases", kind: "bases" as const, order: 1 }], topics: s.topics.map((t, i) => (i < 3 ? { ...t, group: "bases" } : t)) } : s));
    return { ...p, subplans } as PlanData;
  };
  const sched = (p: PlanData) => buildSchedule(progressPlan(p as never, { today: TODAY }));

  it("Semana: cifras, tira de días con conteos y una tarjeta separada por área con los mismos temas que el selector compartido", async () => {
    const p = fivePlan("together");
    await openAgenda(p, "semana");
    expect(all("week-stat-done").length + all("week-stat-theory").length + all("week-stat-practice").length).toBeGreaterThanOrEqual(2);
    expect(byTest("agenda-week").textContent).not.toContain("Enfoque:");
    const week = Math.floor((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${START}T00:00:00Z`)) / 86400000 / 7) + 1;
    const data = topicsByWeekArea(p as never, sched(p));
    const w = data.weeks[week - 1]!;
    // una tarjeta por área CON temas, en el orden fijo, y sus conteos son los del selector compartido (Agenda == Ejecución)
    const cards = all("week-area");
    expect(cards.map((c) => c.getAttribute("data-area"))).toEqual(w.cells.filter((c) => c.topics.length).map((c) => c.areaId));
    for (const c of w.cells.filter((x) => x.topics.length)) {
      const card = cards.find((x) => x.getAttribute("data-area") === c.areaId)!;
      expect(byTest("week-area-count", card).textContent).toBe(`${c.topics.length} ${c.topics.length === 1 ? "tema" : "temas"}`);
      expect(all("area-topic", card).map((r) => r.getAttribute("data-folder"))).toEqual(c.topics.map((t) => t.folder));
      expect(byTest("week-area-progress", card).textContent).toBe(`${c.done}/${c.topics.length} hechos`);
      for (const r of all("area-topic", card)) {
        expect(r.textContent).toMatch(/Teoría|Práctica/);
        expect(r.textContent).toMatch(/Hoy|Pendiente|Hecho|Sin tratar|En curso/);
        expect(byTest("area-topic-days", r).getAttribute("aria-label")).toMatch(/Día asignado: (lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d+/);
      }
    }
    // tira de días: 7 botones y cada conteo = temas del selector asignados a ese día
    const strip = all("agenda-week-strip-day");
    expect(strip).toHaveLength(7);
    for (const b of strip) {
      const d = b.getAttribute("data-date")!;
      const n = [...w.cells.flatMap((c) => c.topics), ...w.bases].filter((t) => t.dates.includes(d)).length;
      expect(b.getAttribute("data-count")).toBe(String(n));
    }
    expect(strip.find((b) => b.getAttribute("data-date") === TODAY)!.getAttribute("aria-current")).toBe("date");
    expect(byTest("agenda-week-strip-today")).toBeTruthy();
    // pulsar un día abre la vista Día de esa fecha
    await click(strip.find((b) => b.getAttribute("data-date") === TODAY)!);
    expect(byTest("agenda-day")).toBeTruthy();
  });

  it("Semana: Bases va en su propia sección y sus temas no cuentan en ninguna área", async () => {
    const p = withBases();
    await openAgenda(p, "semana");
    const wk = Math.floor((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${START}T00:00:00Z`)) / 86400000 / 7) + 1;
    const w = topicsByWeekArea(p as never, sched(p)).weeks[wk - 1]!;
    expect(w.bases.length).toBeGreaterThan(0);
    const bases = byTest("week-bases");
    expect(bases.textContent).toContain("Bases · lógica aplicada");
    expect(all("area-topic", bases).map((r) => r.getAttribute("data-folder"))).toEqual(w.bases.map((t) => t.folder));
    for (const card of all("week-area")) for (const r of all("area-topic", card)) expect(w.bases.map((t) => t.folder)).not.toContain(r.getAttribute("data-folder"));
  });

  it("Mes: cifras, leyenda y un bloque por semana con una fila por área (nº de temas y horas) y los temas como chips que se expanden", async () => {
    const p = withBases();
    await openAgenda(p, "mes");
    const data = topicsByWeekArea(p as never, sched(p));
    expect(all("month-stat-topics")).toHaveLength(1);
    expect(byTest("month-legend").textContent).toContain("Backend");
    expect(byTest("month-legend").textContent).toContain("Bases");
    const blocks = all("agenda-month-week");
    expect(blocks.length).toBeGreaterThan(3);
    for (const b of blocks) {
      const w = data.weeks[Number(b.getAttribute("data-week")) - 1]!;
      const rows = all("month-week-area", b);
      expect(rows.map((r) => r.getAttribute("data-area"))).toEqual(w.cells.filter((c) => c.topics.length).map((c) => c.areaId));
      if (!rows.length && !w.bases.length) expect(byTest("month-week-empty", b)).toBeTruthy();
      for (const r of rows) {
        const c = w.cells.find((x) => x.areaId === r.getAttribute("data-area"))!;
        expect(r.textContent).toContain(`${c.topics.length} ${c.topics.length === 1 ? "tema" : "temas"}`);
        expect(all("month-week-area-topics", r)[0]!.querySelectorAll("span").length).toBe(Math.min(3, c.topics.length));
      }
    }
    const withMore = blocks.flatMap((b) => all("month-week-area-more", b));
    expect(withMore.length).toBeGreaterThan(0);
    const row = withMore[0]!.closest("[data-testid=month-week-area]")!;
    const before = row.querySelectorAll("[data-testid=month-week-area-topics] > span").length;
    await click(withMore[0]);
    expect(row.querySelectorAll("[data-testid=month-week-area-topics] > span").length).toBeGreaterThan(before);
    expect(all("month-week-bases").length).toBeGreaterThan(0);
  });
});

describe("Calendario por áreas", () => {
  const cellOf = (date: string) => byTest("agenda-grid").querySelector<HTMLButtonElement>(`button[data-date='${date}']`)!;

  it("cada día enseña un indicador por área con texto (no solo color) y su etiqueta da el desglose por área", async () => {
    const p = fivePlan("together");
    await openAgenda(p, "calendario");
    const d = firstStudyDay(p);
    const cell = cellOf(d);
    const areas = [...cell.querySelectorAll("[data-testid=agenda-cell-area]")];
    expect(areas.map((a) => a.getAttribute("data-area"))).toEqual(["backend", "frontend", "databases", "tooling"]);
    expect(areas[0]!.textContent).toMatch(/^Back\d+t/);
    expect(areas[1]!.textContent).toMatch(/^Front\d+t P/); // Frontend tiene práctica de UI y componentes
    expect(areas[2]!.textContent).toMatch(/^BD/);
    const label = cell.getAttribute("aria-label")!;
    expect(label).toMatch(/^[a-záéíóú]+ \d+ de [a-z]+: Backend \d+ temas?( y práctica)?; Frontend \d+ temas? y práctica; Databases \d+ temas?( y práctica)?; Tooling and Quality/);
    expect(label).not.toContain("por definir"); // la cadena de entregables siempre está definida
    expect(byTest("agenda-grid").getAttribute("role")).toBe("grid");
    expect(byTest("agenda-calendar").textContent).toContain("Cada línea es un área");
  });

  it("la página de cada área (ítem de la barra) deja solo esa área en el calendario y en el detalle, y la Vista general vuelve a mostrarlas todas", async () => {
    const p = fivePlan("together");
    await openAgenda(p, "calendario");
    const d = firstStudyDay(p);
    const nav = (id: string) => host.querySelector<HTMLElement>(`[data-testid='nav-pl:${id}']`)!;
    // la barra lleva un ítem por área, en el orden fijo, y ya no hay fichas de filtro en el calendario
    expect([...host.querySelectorAll("aside nav > div > button")].map((b) => b.getAttribute("data-testid")!.replace("nav-pl:", "")).slice(0, 6)).toEqual(["general", "area/s-backend", "area/s-frontend", "area/s-databases", "area/s-tooling", "area/s-automation"]);
    expect(host.querySelector("[data-testid=agenda-area-tabs]")).toBeNull();
    expect(host.querySelector("[data-testid=area-filter]")).toBeNull();
    await click(cellOf(d));
    expect(all("agenda-day-area", byTest("agenda-calendar-detail")).map((s) => s.getAttribute("data-area"))).toEqual(["backend", "frontend", "databases", "tooling"]);
    await click(nav("area/s-frontend")); // Frontend
    expect(nav("area/s-frontend").getAttribute("aria-current")).toBe("page");
    expect(byTest("plan-page-title").textContent).toBe("Frontend");
    await click(view("calendario"));
    expect([...cellOf(d).querySelectorAll("[data-testid=agenda-cell-area]")].map((a) => a.getAttribute("data-area"))).toEqual(["frontend"]);
    expect(cellOf(d).getAttribute("aria-label")).toMatch(/Frontend \d+ temas? y práctica/);
    expect(cellOf(d).getAttribute("aria-label")).not.toContain("Backend");
    await click(cellOf(d));
    expect(all("agenda-day-area", byTest("agenda-calendar-detail")).map((s) => s.getAttribute("data-area"))).toEqual(["frontend"]);
    // con filtro no se ven los proyectos integradores ni el reto de lógica
    expect(byTest("agenda-day-projects", byTest("agenda-calendar-detail"))).toBeFalsy();
    await click(nav("general"));
    expect(nav("general").getAttribute("aria-current")).toBe("page");
    await click(view("calendario"));
    await click(cellOf(d));
    expect(all("agenda-day-area", byTest("agenda-calendar-detail"))).toHaveLength(4);
    expect(byTest("agenda-day-projects", byTest("agenda-calendar-detail"))).toBeTruthy();
  });

  it("las flechas siguen moviendo entre días con el rol grid", async () => {
    const p = fivePlan("together");
    await openAgenda(p, "calendario");
    const sel = byTest("agenda-grid").querySelector<HTMLButtonElement>("button[tabindex='0']")!;
    const from = sel.dataset.date!;
    await key(sel, "ArrowRight");
    const next = byTest("agenda-grid").querySelector<HTMLButtonElement>("button[tabindex='0']")!;
    expect(next.dataset.date).not.toBe(from);
    expect(Date.parse(next.dataset.date!) - Date.parse(from)).toBe(86400000);
  });
});

describe("Día por áreas", () => {
  it("una sección por área en el orden fijo (teoría, práctica, proyecto) y, al final, práctica de lenguaje, reto de lógica y proyectos integradores", async () => {
    const p = fivePlan("together");
    await openAgenda(p, "dia");
    await setValue(byTest("agenda-date") as HTMLInputElement, firstStudyDay(p));
    const day = byTest("agenda-day");
    const order = [...day.querySelectorAll("[data-testid=agenda-day-area],[data-testid=agenda-day-language],[data-testid=agenda-day-logic],[data-testid=agenda-day-projects]")].map((s) => s.getAttribute("data-testid") + (s.getAttribute("data-area") ? `:${s.getAttribute("data-area")}` : ""));
    expect(order).toEqual(["agenda-day-area:backend", "agenda-day-area:frontend", "agenda-day-area:databases", "agenda-day-area:tooling", "agenda-day-language", "agenda-day-logic", "agenda-day-projects"]);
    for (const s of all("agenda-day-area", day)) {
      expect(s.querySelector("[data-testid=agenda-day-theory]")!.textContent).toMatch(/^Teoría de /);
      expect(s.querySelector("[data-testid=agenda-day-practice]")!.textContent).toMatch(/Práctica de /);
    }
    // la práctica por área sale del sistema de referencia (o del propio, si existe)
    expect(all("agenda-area-practice", day).length).toBeGreaterThan(0);
    // la cadena diario → semanal → mensual siempre está definida: nunca «por definir» y el estado del proyecto del día no se marca a mano
    expect(byTest("agenda-day-counts").textContent).toMatch(/[0-9]+ entregables?/);
    expect(day.textContent).not.toContain("por definir");
  });
});

describe("Entregables: la cadena diario → semanal → mensual siempre está definida", () => {
  it("la pestaña enseña un entregable por mes con sus semanas y sus piezas, sin «por definir» y sin elegir el estado a mano", async () => {
    await open(fivePlan("together"));
    await section("datos");
    expect(byTest("plan-deliverables-chip").textContent).not.toContain("Por definir");
    await click(tab("entregables"));
    expect(byTest("plan-deliverables-pending")).toBeFalsy();
    expect(host.textContent).not.toContain("por definir");
    const months = all("chain-month");
    expect(months.length).toBeGreaterThan(0);
    expect(months[0]!.querySelectorAll("[data-testid=chain-week]").length).toBeGreaterThan(0);
    expect(months[0]!.querySelectorAll("[data-testid=chain-piece]").length).toBeGreaterThan(0);
    // sin ningún selector de estado
    expect(host.querySelector("#plan-tabs-panel-entregables select[aria-label^='Estado']")).toBeNull();
    expect(host.textContent).toContain("Se completa automáticamente conforme avanzas");
    // el segundo mes queda bloqueado hasta completar el primero
    if (months.length > 1) expect(months[1]!.getAttribute("data-locked")).toBe("true");
  });

  it("el calendario, la semana y el mes cuentan entregables (nunca «por definir»)", async () => {
    await openAgenda(fivePlan("together"), "semana");
    expect(byTest("agenda-week-counts").textContent).toMatch(/[0-9]+ entregables?/);
    expect(host.textContent).not.toContain("por definir");
    await click(view("mes"));
    expect(byTest("agenda-month-counts").textContent).toMatch(/[0-9]+ entregables?/);
  });

  it("con entregables definidos (marca de la ejecución) vuelven los contadores, la lista y la pestaña con su agenda", async () => {
    const p = fivePlan("together", { deliverablesDefinedAt: "2026-10-12T00:00:00Z" });
    await openAgenda(p, "semana");
    expect(byTest("agenda-week-counts").textContent).toMatch(/\d+ entregables/);
    expect(byTest("agenda-week-deliverables")).toBeTruthy();
    expect(byTest("plan-deliverables-chip", host)).toBeFalsy(); // la ficha vive en Mi plan
    await click(tab("plan"));
    await section("datos");
    expect(byTest("plan-deliverables-chip").textContent).not.toContain("Por definir");
    // la decisión antigua pendiente vuelve a poder resolverse
    expect(tab("entregables").textContent).toContain("1 pendiente");
    await click(tab("entregables"));
    expect(byTest("plan-deliverables-pending")).toBeFalsy();
    expect(byTest("plan-global-question").textContent).toContain("por cada área");
    expect(byTest("monthly-deliverables")).toBeTruthy();
  });

  it("un entregable de área o manual también cuenta como definido", async () => {
    const withArea = fivePlan("together");
    withArea.subplans[0] = { ...withArea.subplans[0]!, deliverable: { title: "API REST", description: "d", criteria: ["c"], status: "idea" } };
    await openAgenda(withArea, "semana");
    expect(byTest("agenda-week-counts").textContent).toMatch(/\d+ entregables/);
  });
});

describe("Práctica del área en el día (sistema de práctica propio, si existe)", () => {
  it("cada sección de área muestra el kata propio de esa área ese día y degrada a la práctica de referencia si no hay kata", async () => {
    const { buildPracticeTrack } = await import("../../lib/practiceTrack");
    const { areaPracticeFor } = await import("../../lib/areaPracticeSystem");
    const pre = { ...PRE, practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: false, focus: "rotate" as const } };
    const p = fivePlan("together", { programmingPractice: buildPracticeTrack(pre as never), preconditions: pre as never });
    const withKata = buildSchedule(progressPlan(p as never, { today: TODAY })).days.find((d) => d.week === 2 && d.date >= TODAY && d.study && areaPracticeFor(p as never, d.date).length > 0)!;
    await openAgenda(p, "dia");
    await setValue(byTest("agenda-date") as HTMLInputElement, withKata.date);
    const be = host.querySelector<HTMLElement>("[data-testid=agenda-day-area][data-area=backend]")!;
    const kata = byTest("agenda-area-kata", be);
    expect(kata.textContent).toContain("Kata de Backend de hoy:");
    expect(kata.textContent).toMatch(/nivel \d/);
    expect(byTest("agenda-area-practice", be).getAttribute("data-source")).toBe("system");
  });
});
