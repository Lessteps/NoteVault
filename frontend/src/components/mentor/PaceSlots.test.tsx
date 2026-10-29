// @vitest-environment jsdom
//
// Mentor — «Ritmo diario» y temas/práctica extra cableados: el botón de la cabecera de cada página de Planeación (abre el control del ritmo y sube
// `planVersion`), «+ Tema» en cada día, la marca «Extra» con su ×, y en Ejecución «Añadir tema» / «Añadir práctica». Un tema extra de hoy sale igual
// en la Agenda (Día) y en «Temas de hoy» de la Ejecución.

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
import { MODE_KEY } from "./mentorNav";
import { PlanWorkspace } from "./PlanWorkspace";

const START = "2026-10-05";
const END = "2027-01-03";
const PID = `${START}_${END}`;
const TODAY = "2026-10-14";
const topics = (branch: string, n: number, week: number) => Array.from({ length: n }, (_, i) => ({ folder: `P/${branch}/T${i + 1}`, title: `${branch} ${i + 1}`, estMinutes: 60, targetWeek: week }));
const basePlan = (): PlanData => ({
  id: PID, start: START, end: END, name: "Plan", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 20, structure: "areas",
  preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6], pace: "intenso", goalIds: [], subjects: [], levels: {}, deliverables: "no" } as never,
  subplans: [
    { id: "s-be", area: "Backend", areaId: "backend", objective: "APIs", topics: topics("Back", 30, 2), weeks: [], requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 }, groups: [{ id: "core", title: "Backend", kind: "knowledge", order: 100 }] },
    { id: "s-db", area: "Databases", areaId: "databases", objective: "SQL", topics: topics("Data", 10, 2), weeks: [], requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 }, groups: [{ id: "core", title: "BD", kind: "knowledge", order: 100 }] },
  ] as never,
});
const row = (): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Plan", period: "5 oct – 3 ene", status: "activo", archived: false, auto: false, subplans: 2, topics: 0, completed: 0, pct: 0, minutesPerDay: 240 });
const loaded = (p: PlanData): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: TODAY, status: "activo", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 2, topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: true })) })),
    summary: { subplans: p.subplans.length, topics: 40, done: 0, pct: 0, currentWeek: 2, weeks: 14 },
  },
  goals: {}, projects: {}, items: [], months: [], plans: [row()], aiConfigured: true,
});

let host: HTMLDivElement;
let root: Root;
/** el plan «guardado»: lo que devuelve cada lectura; las operaciones simuladas lo actualizan */
let saved: PlanData;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string, within: ParentNode = host) => within.querySelector<HTMLElement>(`[data-testid=${id}]`);
const all = (id: string, within: ParentNode = host) => [...within.querySelectorAll<HTMLElement>(`[data-testid=${id}]`)];
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const nav = (id: string) => host.querySelector<HTMLElement>(`[data-testid='nav-pl:${id}']`);
const runTab = (id: string) => host.querySelector<HTMLElement>(`[data-testid="nav-ej:${id}"]`);
const version = () => useMentor.getState().planVersion;
const titles = (list: HTMLElement[]) => list.map((e) => e.textContent ?? "").join(" | ");
const workTopics = () => all("board-topic", byTest("work-list") ?? host);

const open = async (mode: "planeacion" | "ejecucion", p: PlanData = basePlan()) => {
  saved = p;
  useNavState.setState({ values: { [MODE_KEY]: mode } });
  vi.spyOn(api, "mentorPlanGet").mockImplementation(async () => loaded(saved));
  await mountEl(<PlanWorkspace planId={PID} />);
};

beforeEach(() => {
  localStorage.clear();
  useMentor.setState({ planVersion: 0, plans: [], plansLoaded: false, pendingObjective: null });
  useApp.setState({ module: "mentor", toasts: [] } as never);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([row()]);
  vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: false, label: "", elapsed: 0 });
  vi.spyOn(api, "mentorPlanTopicCatalog").mockResolvedValue({ loading: false, rows: [] });
  vi.spyOn(api, "mentorProjectsList").mockResolvedValue({ route: "x", exists: false, areas: [] });
  vi.spyOn(api, "mentorAreaPractice").mockResolvedValue({ today: TODAY, ppReady: false, ppBase: "", areas: [] } as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("PaceSlot: «Ritmo diario» en la cabecera de cada página", () => {
  it("enseña el ritmo actual, abre el panel, guarda y sube planVersion; la Vista general edita el ritmo general", async () => {
    await open("planeacion");
    const btn = () => byTest("pace-button")!;
    expect(btn().textContent).toContain("Ritmo diario: Automático");
    expect(byTest("pace-panel")).toBeNull();
    await click(btn());
    expect(byTest("pace-panel")).toBeTruthy();
    expect(byTest("pace-panel")!.querySelector('input[type="checkbox"]')).toBeNull(); // Vista general: sin «ritmo propio»
    const set = vi.spyOn(api, "mentorPlanPaceSet").mockImplementation(async ({ pace }) => (saved = { ...basePlan(), ...(pace ? { pace } : {}) }));
    const v0 = version();
    await click(byLabel("Más: Temas por día"));
    expect(set).toHaveBeenCalledWith({ id: PID, pace: { perDay: 1 } });
    expect(version()).toBeGreaterThan(v0);
    await click(byLabel("Más: Temas por día"));
    await click(byLabel("Más: Mínimo diario"));
    expect(set).toHaveBeenLastCalledWith({ id: PID, pace: { perDay: 2, minPerDay: 1 } });
    expect(btn().textContent).toContain("2 temas/día · mín. 1");
  });

  it("en la página de un área ofrece el ritmo propio de esa área y lo guarda con su subplan", async () => {
    await open("planeacion");
    await click(nav("area/s-be"));
    await click(byTest("pace-button"));
    const own = byTest("pace-panel")!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(own).toBeTruthy();
    const set = vi.spyOn(api, "mentorPlanPaceSet").mockImplementation(async ({ pace }) => (saved = { ...basePlan(), ...(pace ? { pace } : {}) }));
    await click(own);
    expect(set).toHaveBeenLastCalledWith({ id: PID, pace: { areas: { "s-be": { perDay: 0, minPerDay: 0 } } } });
    await click(byLabel("Más: Temas por día"));
    expect(set).toHaveBeenLastCalledWith({ id: PID, pace: { areas: { "s-be": { perDay: 1, minPerDay: 0 } } } });
    expect(byTest("pace-button")!.textContent).toContain("1 tema/día");
    // y la línea bajo las tarjetas de la semana lo explica
    await click(byTest("pace-button")); // cierra
    expect(byTest("pace-panel")).toBeNull();
    expect(byTest("week-pace-line")!.textContent).toMatch(/^Ritmo: 1 tema\/día · termina el /);
  });

  it("Escape cierra el panel", async () => {
    await open("planeacion");
    await click(byTest("pace-button"));
    await act(async () => { byTest("pace-panel")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(byTest("pace-panel")).toBeNull();
  });
});

const candidates = (folder: string, title: string) => ({ loading: false, ahead: [{ folder, title, inPlan: true, area: "Backend", subplanId: "s-be", position: 20, total: 30, estMinutes: 60, targetWeek: 2, addedDates: [] }], vault: [] }) as never;

describe("AddTopicSlot: «+ Tema» en cada día", () => {
  it("cada fila de día tiene «+ Tema»; añade a ESE día, con el área de la página, y sube planVersion", async () => {
    await open("planeacion");
    await click(nav("area/s-be"));
    const rows = all("agenda-week-day");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.querySelector("[data-testid=add-extra-topic]"))).toBe(true);
    // el día de hoy tiene «Ver día» como su primer botón
    const todayRow = rows.find((r) => r.dataset.date === TODAY)!;
    expect(todayRow.querySelector("button")!.textContent).toBe("Ver día");
    vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(candidates("P/Back/T25", "Back 25"));
    const add = vi.spyOn(api, "mentorPlanExtraTopicAdd").mockImplementation(async (o) => (saved = { ...basePlan(), extraTopics: [{ date: o.date!, folder: o.folder, addedAt: "x", source: "manual" }] }));
    const date = rows[2]!.dataset.date!;
    await click(rows[2]!.querySelector("[data-testid=add-extra-topic]"));
    const v0 = version();
    await click(byLabel("Adelantar Back 25"));
    expect(add).toHaveBeenCalledWith({ id: PID, folder: "P/Back/T25", date });
    expect(version()).toBeGreaterThan(v0);
  });

  it("en la Vista general también está, sin área", async () => {
    await open("planeacion");
    expect(all("agenda-week-day").every((r) => r.querySelector("[data-testid=add-extra-topic]"))).toBe(true);
  });
});

describe("temas extra: marca «Extra», × y mismo resultado en Agenda y Ejecución", () => {
  const withExtra = (): PlanData => ({ ...basePlan(), extraTopics: [
    { date: TODAY, folder: "P/Back/T25", addedAt: "2026-10-14T08:00:00Z", source: "manual" },
    { date: TODAY, folder: "Vault/Redis", area: "s-be", title: "Redis básico", estMinutes: 30, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
    { date: TODAY, folder: "Vault/Suelto", title: "Tema suelto", estMinutes: 30, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
  ] });

  it("Agenda (Día): los extras salen con «Extra» y su ×; quitar uno llama a la API y sube planVersion", async () => {
    await open("planeacion", withExtra());
    const dayRow = all("agenda-week-day").find((r) => r.dataset.date === TODAY)!;
    expect(dayRow.textContent).toMatch(/Extra 3/);
    await click(dayRow.querySelector("button")); // Ver día
    const tagged = all("agenda-topic").filter((t) => t.querySelector("[data-testid=extra-tag]"));
    expect(titles(tagged)).toContain("Back 25");
    expect(titles(tagged)).toContain("Redis básico");
    expect(titles(tagged)).toContain("Tema suelto");
    const remove = vi.spyOn(api, "mentorPlanExtraTopicRemove").mockImplementation(async () => (saved = basePlan()));
    const v0 = version();
    await click(tagged.find((t) => t.textContent!.includes("Redis"))!.querySelector("[data-testid=extra-remove]"));
    expect(remove).toHaveBeenCalledWith({ id: PID, folder: "Vault/Redis", date: TODAY });
    expect(version()).toBeGreaterThan(v0);
  });

  it("Ejecución: «Temas de hoy» del área incluye los mismos extras (el suelto va al cubo «Extra» del Hoy general) y se pueden quitar", async () => {
    await open("ejecucion", withExtra());
    const fold = all("area-fold").find((x) => x.textContent!.startsWith("Extra"))!;
    expect(fold).toBeTruthy();
    await click(fold.querySelector("button"));
    expect(all("area-fold").find((x) => x.textContent!.startsWith("Extra"))!.textContent).toContain("Tema suelto");
    await click(runTab("area:s-be"));
    const list = workTopics();
    expect(titles(list)).toContain("Back 25");
    expect(titles(list)).toContain("Redis básico");
    expect(list.filter((t) => t.querySelector("[data-testid=extra-tag]"))).toHaveLength(2);
    expect(titles(list)).not.toContain("Tema suelto");
    const remove = vi.spyOn(api, "mentorPlanExtraTopicRemove").mockImplementation(async () => (saved = basePlan()));
    await click(list.find((t) => t.textContent!.includes("Redis"))!.querySelector("[data-testid=extra-remove]"));
    expect(remove).toHaveBeenCalledWith({ id: PID, folder: "Vault/Redis", date: TODAY });
    expect(titles(workTopics())).not.toContain("Redis básico");
  });
});

describe("Ejecución: añadir tema y práctica", () => {
  it("«Temas de hoy» ofrece «Añadir más temas» (hoy, esta área) y «Práctica diaria» ofrece «Añadir más práctica» con lista, hecho y quitar", async () => {
    await open("ejecucion");
    await click(runTab("area:s-be"));
    const addT = byTest("work-add-topic")!.querySelector<HTMLElement>("[data-testid=add-extra-topic]")!;
    expect(addT.textContent).toContain("Añadir más temas");
    vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(candidates("P/Back/T26", "Back 26"));
    const addTopic = vi.spyOn(api, "mentorPlanExtraTopicAdd").mockImplementation(async (o) => (saved = { ...basePlan(), extraTopics: [{ date: o.date!, folder: o.folder, addedAt: "x", source: "manual" }] }));
    await click(addT);
    const v0 = version();
    await click(byLabel("Adelantar Back 26"));
    expect(addTopic).toHaveBeenCalledWith({ id: PID, folder: "P/Back/T26", date: TODAY });
    expect(version()).toBeGreaterThan(v0);
    await click(document.querySelector("[role=dialog] button[title=Cerrar]"));
    expect(titles(workTopics())).toContain("Back 26");
    // práctica
    const block = byTest("extra-practice")!;
    expect(block.textContent).toContain("Práctica diaria");
    vi.spyOn(api, "mentorPlanExerciseCandidates").mockResolvedValue({ loading: false, exercises: [{ subplanId: "s-be", area: "Backend", folder: "P/Back/T1", topic: "Back 1", rel: "P/Back/T1/e1.md", title: "Kata de listas", difficulty: 1, addedDates: [] }] });
    const addP = vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockImplementation(async (o) => (saved = { ...basePlan(), extraPractice: [{ id: "xp-1", date: o.date!, title: o.title, kind: o.kind ?? "exercise", area: o.area } as never] }));
    await click(block.querySelector("[data-testid=add-extra-practice]"));
    await click(byLabel("Adelantar Kata de listas"));
    expect(addP).toHaveBeenCalledWith({ id: PID, title: "Kata de listas", kind: "exercise", date: TODAY, area: "s-be", folder: "P/Back/T1", rel: "P/Back/T1/e1.md" });
    const rowEl = byTest("extra-practice-row")!;
    expect(rowEl.textContent).toContain("Kata de listas");
    const upd = vi.spyOn(api, "mentorPlanExtraPracticeUpdate").mockImplementation(async () => (saved = { ...saved, extraPractice: [{ ...saved.extraPractice![0]!, done: true }] }));
    await click(rowEl.querySelector("[data-testid=extra-practice-check]"));
    expect(upd).toHaveBeenCalledWith({ id: PID, practiceId: "xp-1", done: true });
    expect(byTest("extra-practice-row")!.dataset.done).toBe("true");
    const rm = vi.spyOn(api, "mentorPlanExtraPracticeRemove").mockImplementation(async () => (saved = basePlan()));
    await click(byTest("extra-practice-remove"));
    expect(rm).toHaveBeenCalledWith({ id: PID, practiceId: "xp-1" });
    expect(byTest("extra-practice-row")).toBeNull();
  });

  it("el Hoy general también deja adelantar tema y práctica (sin área)", async () => {
    await open("ejecucion");
    const box = byTest("run-extras")!;
    expect(box.querySelector("[data-testid=add-extra-topic]")!.textContent).toContain("Próximos temas");
    expect(box.querySelector("[data-testid=add-extra-practice]")!.textContent).toContain("Añadir más práctica");
  });
});
