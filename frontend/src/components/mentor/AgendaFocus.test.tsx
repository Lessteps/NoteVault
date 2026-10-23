// @vitest-environment jsdom
//
// Mentor — Plan, Agenda por ENFOQUE: la vista Día en secciones ordenadas (cabecera con enfoque → Teoría → Práctica → Reto de lógica → Proyectos
// al final), Semana y Mes con la estructura por enfoque y los proyectos, el Calendario con el enfoque de cada día, el botón «Generar la práctica
// del plan con el Mentor» (progreso, cancelar, sin IA) y la accesibilidad (encabezados, listas reales, aria-live).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { sanitizeCurriculum, scopeOfPlan } from "../../lib/planCurriculum";
import { buildSchedule, progressPlan } from "../../lib/planSchedule";
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
    deliverablesDefinedAt: "2026-10-02T00:00:00Z", // entregables ya definidos (si no, la Agenda los enseña «por definir»)
    subplans: [
      { id: "s1-backend", area: "Backend", areaId: "backend", objective: "Servicios", topics: be, weeks: slices(be), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 },
        groups: [{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "lang-python", title: "Lenguaje: Python", kind: "language", order: 10 }, { id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }] },
      { id: "s2-databases", area: "Databases", areaId: "databases", objective: "Datos", topics: db, weeks: slices(db), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 }, groups: [{ id: "core", title: "Conocimientos de bases de datos", kind: "knowledge", order: 100 }] },
    ],
    ...extra,
  } as PlanData;
}
const legacyPlan = (): PlanData => {
  const p = areasPlan();
  const { structure: _s, ...rest } = p;
  return { ...rest, subplans: p.subplans.map((s) => ({ ...s, topics: s.topics.map(({ group: _g, ...t }) => t) })) } as PlanData;
};

const row = (): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Backend + Databases · 5 oct–3 ene", period: "5 oct – 3 ene", status: "activo", archived: false, auto: false, subplans: 2, topics: 0, completed: 0, pct: 0, minutesPerDay: 360, programmingPractice: true });
const loaded = (p: PlanData, exercisesOf: (folder: string) => number = () => 0): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 2, topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: true, ...(exercisesOf(t.folder) ? { exercises: exercisesOf(t.folder) } : {}) })) })),
    summary: { subplans: p.subplans.length, topics: p.subplans.reduce((n, s) => n + s.topics.length, 0), done: 0, pct: 0, currentWeek: 2, weeks: 14 },
  },
  goals: {}, projects: {}, items: [], practiceItems: [], practice: { ppReady: true, kata: null, kataDoneDates: [], weeks: [] }, months: [], plans: [row()], aiConfigured: true,
});

const areaSection = (areaId: string): HTMLElement => host.querySelector<HTMLElement>(`[data-testid=agenda-day-area][data-area=${areaId}]`)!;
const focusDay = (): string => buildSchedule(progressPlan(areasPlan() as never, { today: TODAY })).days.find((d) => d.week >= 2 && d.focus && d.practice.kata && (d.blocks ?? []).every((b) => b.status === "topic"))!.date;

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
const all = (id: string, within: ParentNode = host) => [...within.querySelectorAll<HTMLElement>(`[data-testid=${id}]`)];
const tab = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid='nav-pl:${id}']`)!;
const view = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid='nav-pl:agenda/${id}']`)!;
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "") || label.test(b.getAttribute("aria-label") ?? "")))!;
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

describe("vista Día: secciones en orden", () => {
  it("cabecera con fecha, chip «Enfoque: Backend» y la línea «Hoy: …»; luego Teoría, Práctica, Reto de lógica y Proyectos AL FINAL", async () => {
    const d = focusDay();
    await openDay(d);
    const day = byTest("agenda-day");
    expect(byTest("agenda-focus-chip").textContent).toBe("Enfoque: Backend");
    expect(byTest("agenda-day-today-line").textContent).toBe("Hoy: teoría de backend + práctica de Python + teoría y práctica de SQL");
    expect(byTest("agenda-purpose-text").textContent).toContain("Enfoque Backend");
    // una sección por ÁREA (teoría y práctica de cada una), luego práctica de lenguaje, reto de lógica y los proyectos integradores
    const order = [...day.querySelectorAll("[data-testid=agenda-day-area],[data-testid=agenda-day-language],[data-testid=agenda-day-logic],[data-testid=agenda-day-projects]")].map((s) => s.getAttribute("data-testid") + (s.getAttribute("data-area") ? `:${s.getAttribute("data-area")}` : ""));
    expect(order).toEqual(["agenda-day-area:backend", "agenda-day-area:databases", "agenda-day-language", "agenda-day-logic", "agenda-day-projects"]);
    const areaOrder = [...day.querySelectorAll("[data-testid=agenda-day-area] > h3")].map((h) => h.textContent);
    expect(areaOrder[0]).toContain("Backend");
    expect(areaOrder[1]).toContain("Databases");
    // las secciones son los últimos hijos del artículo, en ese orden, y los proyectos cierran la vista
    const sections = [...day.children].filter((c) => c.tagName === "SECTION");
    expect(sections.at(-1)!.getAttribute("data-testid")).toBe("agenda-day-projects");
    // cabecera y propósito van antes que la teoría
    const kids = [...day.children].map((c) => c.getAttribute("data-testid") ?? c.tagName);
    expect(kids.indexOf("agenda-purpose")).toBeLessThan(kids.indexOf("agenda-day-area"));
    expect(byTest("agenda-day-theory").textContent).toContain("Teoría de Backend");
    expect(byTest("agenda-day-practice").textContent).toContain("Práctica de Backend");
    expect(byTest("agenda-day-logic").textContent).toContain("Reto de lógica");
  });

  it("los 4 bloques obligatorios de Backend están el mismo día: teoría de backend, práctica de Python, teoría de BD y práctica de BD", async () => {
    await openDay(focusDay());
    const theory = all("agenda-day-theory").flatMap((s) => all("agenda-block", s)).map((b) => b.getAttribute("data-block"));
    const practice = all("agenda-day-practice").flatMap((s) => all("agenda-block", s)).map((b) => b.getAttribute("data-block"));
    expect(theory).toEqual(["backend-theory", "db-theory"]);
    expect(practice).toEqual(["backend-lang", "db-practice"]);
    expect(areaSection("backend").textContent).toContain("Práctica de lenguaje (Python)");
    expect(areaSection("databases").textContent).toContain("Práctica de bases de datos (SQL)");
    // cada tema con minutos y «Ver tema»; los fundamentos intercalados se rotulan como lógica aplicada
    for (const t of all("agenda-topic")) expect(t.querySelector("[data-testid=agenda-topic-minutes]")!.textContent).toMatch(/\d+ min|[\d,.]+ h/);
    // los fundamentos NO van dentro de un área: tienen su propia sección «Bases»
    expect(areaSection("backend").textContent).not.toContain("Lógica aplicada (fundamentos)");
    expect(byTest("agenda-day-bases").textContent).toContain("Lógica aplicada (fundamentos)");
    expect(host.querySelector("button[aria-label^='Ver tema']")).toBeTruthy();
  });

  it("la práctica enseña ejercicios concretos: automáticos (plantilla) por defecto, los de la vault si el tema ya los tiene y los del Mentor si hay currículo", async () => {
    const d = focusDay();
    await openDay(d);
    const ex = all("agenda-day-practice").flatMap((s) => all("agenda-exercise", s));
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.some((e) => /Practica .* en Python: 3 ejercicios del tema/.test(e.textContent!))).toBe(true);
    expect(ex.every((e) => e.textContent!.includes("Automático"))).toBe(true);
    expect(ex[0]!.querySelector("button")!.getAttribute("aria-label")).toMatch(/^Abrir los ejercicios del tema/);
    act(() => root.unmount());
    host.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    // la vault ya tiene ejercicios de Databases: se priorizan y se enlazan
    await openDay(d, areasPlan(), (f) => (f.includes("6 Databases") ? 3 : 0));
    const dbBlock = areaSection("databases").querySelector("[data-block=db-practice]")!;
    expect(dbBlock.textContent).toContain("En tu vault");
    expect(dbBlock.textContent).toContain("3 en tu vault");
    expect(dbBlock.textContent).not.toContain("Automático");
  });

  it("con currículo del Mentor, el ejercicio del tema lleva la marca «Del Mentor» y el reto de lógica es el suyo", async () => {
    const d = focusDay();
    const p0 = areasPlan();
    const day = buildSchedule(progressPlan(p0 as never, { today: TODAY })).byDate.get(d)!;
    const first = day.blocks!.find((b) => b.id === "db-practice")!.items[0]!.folder;
    const cur = sanitizeCurriculum({ weeks: [{ week: day.week, source: "ai", exercises: [{ topic: first, practice: "database", title: "Diseña la tabla clientes y escribe la consulta con JOIN que liste sus pedidos" }], logic: [{ title: "Agrupa pedidos por cliente" }] }] }, scopeOfPlan(p0 as never))!;
    await openDay(d, areasPlan({ practiceCurriculum: cur }));
    expect(areaSection("databases").textContent).toContain("Diseña la tabla clientes y escribe la consulta con JOIN");
    expect(areaSection("databases").textContent).toContain("Del Mentor");
    expect(byTest("agenda-practice-kata").textContent).toContain("Agrupa pedidos por cliente");
    expect(byTest("agenda-practice-kata").textContent).not.toContain("Automático");
  });
});

describe("proyectos diario, semanal y mensual al final del día", () => {
  it("tres proyectos conectados con los temas de hoy: diario (aplica los temas), semanal (qué parte avanza hoy) y mensual (estado)", async () => {
    const d = focusDay();
    await openDay(d);
    const proj = byTest("agenda-day-projects");
    expect(proj.querySelectorAll("li[data-testid^=agenda-project]")).toHaveLength(3);
    const daily = byTest("agenda-project-daily");
    expect(daily.textContent).toContain("Proyecto diario");
    expect(daily.textContent).toContain("Mini-endpoint");
    expect(daily.textContent).toMatch(/Conectado con:/);
    expect(daily.textContent).toMatch(/Pieza \d+ de \d+ del proyecto semanal/);
    const weekly = byTest("agenda-project-weekly");
    expect(weekly.textContent).toMatch(/Hoy avanza:/);
    expect(weekly.textContent).toMatch(/\d+ de \d+ mini-proyectos de la semana \d+ hechos/);
    expect(weekly.querySelector("[role=progressbar]")).toBeTruthy();
    expect(byTest("agenda-project-monthly").textContent).toMatch(/Proyecto mensual/);
    expect(byTest("agenda-project-monthly").textContent).toMatch(/Integra \d+ proyectos? semanales?/);
    // los temas conectados son los del día
    const dayTopics = all("agenda-topic").map((t) => t.querySelector("span")!.textContent!);
    const connected = daily.textContent!.split("Conectado con:")[1]!;
    expect(dayTopics.some((t) => connected.includes(t.replace(/^[\d.\s]+/, "")))).toBe(true);
  });

  it("marcar el proyecto diario guarda su estado con el id del entregable y los proyectos cuentan como entregables del día", async () => {
    const d = focusDay();
    const upd = vi.spyOn(api, "mentorPlanUpdateDeliverable").mockResolvedValue(areasPlan());
    await openDay(d);
    expect(byTest("agenda-day-counts").textContent).toMatch(/\d+ entregables?/);
    await click(button(/Marcar en curso: /, byTest("agenda-project-daily")));
    expect(upd).toHaveBeenCalledWith({ id: PID, deliverableId: `dp:${d}`, status: "en_curso" });
  });
});

describe("Semana, Mes y Calendario con enfoque", () => {
  it("Semana: estructura por enfoque (días por enfoque, horas de teoría y de práctica), proyectos de la semana y el enfoque de cada día", async () => {
    await openAgenda();
    const focus = byTest("agenda-focus-structure");
    expect(focus.querySelector("h3")!.textContent).toBe("Estructura por enfoque");
    expect(all("agenda-focus-count", focus).map((x) => x.textContent)).toEqual([expect.stringMatching(/Backend 3 días/)]);
    const hours = all("agenda-focus-hours", focus).map((x) => x.textContent!);
    expect(hours[0]).toMatch(/Teoría.*\d+(,\d+)? h|Teoría.*\d+ min/);
    expect(hours[1]).toContain("Práctica");
    const wp = byTest("agenda-week-projects");
    expect(wp.querySelectorAll("ol[aria-label='Mini-proyectos diarios de la semana'] li")).toHaveLength(3); // hoy es miércoles: el reparto por avance empieza hoy (miércoles a viernes)
    expect(byTest("agenda-project-weekly", wp).textContent).toMatch(/0 de 3 mini-proyectos diarios hechos/);
    expect(all("agenda-week-day-focus")[0]!.textContent).toBe("Enfoque: Backend");
    expect(byTest("agenda-week-counts").textContent).toMatch(/\d+ entregables/);
  });

  it("Mes: estructura por enfoque, proyecto mensual con su progreso y los semanales del mes", async () => {
    await openAgenda();
    await click(view("mes"));
    expect(byTest("agenda-focus-structure").textContent).toContain("Backend");
    const mp = byTest("agenda-month-projects");
    expect(byTest("agenda-project-monthly", mp).textContent).toMatch(/Proyecto mensual/);
    expect(all("agenda-month-weekly", mp).length).toBeGreaterThanOrEqual(3);
    expect(byTest("agenda-month-deliverables").textContent).toMatch(/proyecto(s)? mensual/);
  });

  it("Calendario: cada día muestra su enfoque en texto y la etiqueta lo dice («enfoque Backend, 2 teorías, 2 prácticas, proyecto diario»)", async () => {
    await openAgenda();
    await click(view("calendario"));
    const cell = byTest("agenda-grid").querySelector<HTMLButtonElement>("button[data-date='2026-10-14']")!;
    // la etiqueta da el desglose POR ÁREA, en el orden fijo
    expect(cell.getAttribute("aria-label")).toMatch(/^miércoles 14 de octubre: Backend \d+ temas? y práctica; Databases \d+ temas? y práctica, proyecto diario, \d+ entregables?/);
    // cada día enseña un indicador por área, con texto (Back, BD): el color nunca va solo
    expect([...cell.querySelectorAll("[data-testid=agenda-cell-area]")].map((a) => a.getAttribute("data-area"))).toEqual(["backend", "databases"]);
    expect(cell.querySelector("[data-testid=agenda-cell-area]")!.textContent).toMatch(/^Back\d+t P/);
    // un sábado (sin estudio) no lleva áreas
    const sat = byTest("agenda-grid").querySelector<HTMLButtonElement>("button[data-date='2026-10-10']")!;
    expect(sat.getAttribute("aria-label")).not.toContain("Backend");
    expect(sat.querySelector("[data-testid=agenda-cell-area]")).toBeNull();
    expect(byTest("agenda-calendar").textContent).toContain("Cada línea es un área");
  });
});

describe("accesibilidad", () => {
  it("encabezados por sección enlazados con su sección, listas reales y aria-live al cambiar de día con el enfoque", async () => {
    await openAgenda();
    await click(view("dia"));
    const day = byTest("agenda-day");
    for (const s of day.querySelectorAll("section")) {
      const labelled = s.getAttribute("aria-labelledby");
      expect(labelled, s.getAttribute("data-testid") ?? "").toBeTruthy();
      expect(host.querySelector(`#${labelled}`)!.tagName).toMatch(/^H[2-4]$/);
    }
    expect(day.querySelectorAll("section ul li").length).toBeGreaterThan(5);
    expect(host.querySelector("h2")!.textContent).toBeTruthy();
    await click(host.querySelector("[data-testid=agenda-next]"));
    expect(byTest("agenda-live").textContent).toMatch(/enfoque Backend, 2 teorías, 2 prácticas, \d+ temas?, \d+ entregables?/);
  });
});

describe("«Generar la práctica del plan con el Mentor»", () => {
  const result = (p: PlanData) => ({ loading: false as const, plan: p, entry: { n: 2, at: "", comment: "Generar la práctica del plan", status: "applied" as const, source: "ai" as const, summary: "Práctica del plan: 14 semanas con el Mentor.", delta: { added: 0, removed: 0, moved: 0, deliverables: 0 }, changed: [], warnings: [], fixOptions: [] }, history: [], aiUsed: true, calls: 5 });

  it("sin currículo explica que la agenda usa plantillas automáticas; al pulsar llama a la API, anuncia el resultado y muestra el estado", async () => {
    const cur = sanitizeCurriculum({ generatedAt: "2026-10-14T10:00:00Z", weeks: [{ week: 2, source: "ai", logic: [{ title: "Dos sumas" }] }] }, scopeOfPlan(areasPlan() as never))!;
    const gen = vi.spyOn(api, "mentorPlanPracticeGenerate").mockResolvedValue(result(areasPlan({ practiceCurriculum: cur })));
    await openAgenda();
    const bar = byTest("practice-curriculum-bar");
    expect(byTest("practice-curriculum-state").textContent).toContain("plantillas automáticas por tipo de tema");
    expect(button("Generar la práctica del plan con el Mentor", bar)).toBeTruthy();
    // el servidor devolverá el plan con su currículo al recargar
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(areasPlan({ practiceCurriculum: cur })));
    await click(byTest("practice-curriculum-generate"));
    expect(gen).toHaveBeenCalledWith(PID, {});
    expect(byTest("practice-curriculum-note").textContent).toContain("Práctica del plan: 14 semanas con el Mentor.");
    expect(byTest("practice-curriculum-note").textContent).toContain("Puedes deshacerlo en «Preguntas y ajustes»");
    expect(byTest("practice-curriculum-state").textContent).toMatch(/Generada con el Mentor/);
    expect(button("Regenerar la práctica del plan con el Mentor", bar)).toBeTruthy();
  });

  it("«Solo plantillas (sin IA)» no usa la IA", async () => {
    const gen = vi.spyOn(api, "mentorPlanPracticeGenerate").mockResolvedValue({ ...result(areasPlan()), aiUsed: false });
    await openAgenda();
    await click(byTest("practice-curriculum-templates"));
    expect(gen).toHaveBeenCalledWith(PID, { noAi: true });
  });

  it("mientras trabaja enseña el progreso («Pensando…», qué hace) con «Cancelar», que mata la llamada; el aviso no guarda nada", async () => {
    let finish!: (v: ReturnType<typeof result>) => void;
    vi.spyOn(api, "mentorPlanPracticeGenerate").mockReturnValue(new Promise((ok) => (finish = ok as never)));
    vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: true, label: "Práctica del plan: 1/4 bloques de semanas", elapsed: 12 });
    const cancel = vi.spyOn(api, "mentorAiCancel").mockResolvedValue({ cancelled: true });
    await openAgenda();
    await click(byTest("practice-curriculum-generate"));
    const thinking = byTest("ai-thinking");
    expect(thinking.textContent).toContain("Pensando…");
    expect(thinking.textContent).toContain("Práctica del plan: 1/4 bloques de semanas");
    expect((byTest("practice-curriculum-generate") as HTMLButtonElement).disabled).toBe(true);
    await click(button("Cancelar", thinking));
    expect(cancel).toHaveBeenCalledWith(`practice:${PID}`, "abort");
    await act(async () => { finish(result(areasPlan())); });
  });
});

describe("planes de estructura antigua", () => {
  it("conservan la vista Día de siempre (temas, ruta por áreas, entregables) y no ofrecen la práctica del plan", async () => {
    await openAgenda(legacyPlan());
    expect(byTest("practice-curriculum-bar")).toBeFalsy();
    await click(view("dia"));
    expect(byTest("agenda-day-topics")).toBeTruthy();
    expect(byTest("agenda-day-deliverables")).toBeTruthy();
    expect(byTest("agenda-focus-chip")).toBeFalsy();
  });
});
