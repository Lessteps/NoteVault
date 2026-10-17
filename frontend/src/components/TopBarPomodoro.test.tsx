// @vitest-environment jsdom
//
// Pomodoro FUERA del Mentor: la barra superior deja empezar un bloque, elegir área y asignarle temas; al detener se guarda en el registro de horas
// y el modal de evaluación (obligatorio) bloquea el siguiente bloque hasta responder.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../lib/bridge";
import { idlePomodoro, startFocus } from "../lib/pomodoro";
import { usePomodoro } from "../store/pomodoro";
import { PomodoroAssessmentModal } from "./mentor/PomodoroAssessmentModal";
import { TopBarPomodoro } from "./TopBarPomodoro";

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const click = async (el: Element | null | undefined) => { expect(el).toBeTruthy(); await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const type = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const PLAN = {
  loading: false, id: "p1", month: "2026-10", today: "2026-10-16", plan: {
    id: "p1", start: "2026-10-06", end: "2027-04-05", subplans: [
      { id: "s1", area: "Backend", areaId: "backend", topics: [{ folder: "P/4.2 HTTP", title: "4.2 HTTP", targetWeek: 2 }, { folder: "P/4.3 REST", title: "4.3 REST", targetWeek: 3 }, { folder: "P/4.1 Hecho", title: "4.1 Hecho", targetWeek: 1, completedAt: "2026-10-07" }] },
      { id: "s2", area: "Frontend", areaId: "frontend", topics: [{ folder: "P/5.1 DOM", title: "5.1 DOM", targetWeek: 2 }] },
    ],
  }, derived: null, goals: {}, projects: {}, items: [], months: [], plans: [], aiConfigured: true,
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  usePomodoro.setState({ p: idlePomodoro(), logVersion: 0, pinned: false });
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([{ id: "p1", name: "Plan", status: "activo", archived: false }] as never);
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue(PLAN as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const mount = async () => {
  await act(async () => { root.render(<><TopBarPomodoro /><PomodoroAssessmentModal /></>); });
  await click(host.querySelector("button[aria-label='Pomodoro global']"));
  await flush(); await flush();
};

describe("Pomodoro de la barra superior", () => {
  it("empieza un bloque fuera del Mentor: elige el área, asigna temas (solo los pendientes) y arranca el foco en esa área", async () => {
    await mount();
    expect(byTest("pomodoro-setup")).toBeTruthy();
    const area = byTest("pomodoro-area") as unknown as HTMLSelectElement;
    expect([...area.options].map((o) => o.textContent)).toEqual(["Sesión libre (cualquier tema)", "Backend", "Frontend", "Bases"]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(area, "backend");
      area.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // el tema completado no se ofrece
    expect([...host.querySelectorAll("[data-testid=pomodoro-option]")].map((o) => o.textContent)).toEqual(["4.2 HTTPBackend", "4.3 RESTBackend"]);
    await click(host.querySelector("[data-testid=pomodoro-option]"));
    expect(usePomodoro.getState().p.assignedTopics.map((t) => t.folder)).toEqual(["P/4.2 HTTP"]);
    expect(byTest("assigned-list")!.textContent).toContain("4.2 HTTP");
    await type(byTest("pomodoro-search") as HTMLInputElement, "rest");
    expect([...host.querySelectorAll("[data-testid=pomodoro-option]")].map((o) => o.textContent)).toEqual(["4.3 RESTBackend"]);
    await click(byTest("pomodoro-begin"));
    expect(usePomodoro.getState().p).toMatchObject({ phase: "focus", running: true, planId: "p1", areaKey: "backend" });
    expect(byTest("pomodoro-setup")).toBeNull(); // ya corre: se ve el reloj
  });

  it("sin plan activo avisa y no deja empezar", async () => {
    vi.mocked(api.mentorPlanList).mockResolvedValue([]);
    await mount();
    expect(byTest("pomodoro-noplan")).toBeTruthy();
    expect(byTest("pomodoro-begin")).toBeNull();
  });

  it("detener guarda los minutos con los temas asignados en la nota y deja la evaluación pendiente", async () => {
    const add = vi.spyOn(api, "mentorTimeLogAdd").mockResolvedValue({ entries: [], entry: {} as never });
    usePomodoro.setState({
      p: { ...startFocus({ ...idlePomodoro("p1", "backend", 25, 5), assignedTopics: [{ folder: "P/4.2 HTTP", title: "4.2 HTTP" }] }, "p1", "backend", Date.now() - 9 * 60_000 - 5_000) },
    });
    await mount();
    await click(byTest("topbar-pomodoro-stop"));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", areaKey: "backend", minutes: 9, kind: "pomodoro", note: "[4.2 HTTP]" }));
    expect(usePomodoro.getState().p.pendingAssessment).toMatchObject({ minutes: 9, areaKey: "backend" });
    expect(byTest("assessment-modal")).toBeTruthy();
  });
});

describe("evaluación obligatoria", () => {
  const pending = () => usePomodoro.setState({
    p: { ...idlePomodoro("p1", "backend", 25, 5), pendingAssessment: { planId: "p1", areaKey: "backend", minutes: 25, topics: [{ folder: "P/4.2 HTTP", title: "4.2 HTTP" }], finishedAt: new Date(2026, 9, 16, 22, 30).getTime(), startedAt: new Date(2026, 9, 16, 22, 5).getTime(), mode: "timer" } },
  });

  it("no se puede enviar sin las dos respuestas; al enviar se guarda COMPLETA con el día local y se desbloquea", async () => {
    const assess = vi.spyOn(api, "mentorTimeLogAssess").mockResolvedValue({ assessments: [], assessment: { id: "as1" } as never });
    const rec = vi.spyOn(api, "mentorRecordSave").mockResolvedValue({ record: {} as never, rel: "Programación/_registro/x.md", duplicate: false });
    pending();
    await act(async () => { root.render(<PomodoroAssessmentModal />); });
    expect(byTest("assess-submit")!.hasAttribute("disabled")).toBe(true);
    await type(byTest("assess-learned") as HTMLTextAreaElement, "Aprendí cómo se valida un 422 con un esquema y por qué no se devuelve un 500.");
    expect(byTest("assess-submit")!.hasAttribute("disabled")).toBe(true);
    await type(byTest("assess-doubt") as HTMLTextAreaElement, "No tengo claro qué pasa cuando el token expira a mitad de la petición.");
    await click(byTest("assess-level-5"));
    await click(byTest("assess-focus-3"));
    await click(byTest("assess-outcome-done"));
    await click(byTest("assess-practiced"));
    await type(byTest("assess-errors") as HTMLTextAreaElement, "Confundí PUT con PATCH.");
    await click(byTest("assess-submit"));
    expect(assess).toHaveBeenCalledWith({
      id: "p1", areaKey: "backend", date: "2026-10-16", minutes: 25, topics: ["4.2 HTTP"], understanding: 5, focus: 3,
      outcomes: [{ title: "4.2 HTTP", status: "done" }], practiced: true, errors: "Confundí PUT con PATCH.",
      learned: "Aprendí cómo se valida un 422 con un esquema y por qué no se devuelve un 500.", doubt: "No tengo claro qué pasa cuando el token expira a mitad de la petición.",
    });
    // y se guarda el REGISTRO de la sesión, unido a la evaluación y con la ventana de tiempo del bloque
    expect(rec).toHaveBeenCalledWith(expect.objectContaining({
      id: "p1", areaKey: "backend", date: "2026-10-16", startedAt: new Date(2026, 9, 16, 22, 5).getTime(), minutes: 25, mode: "timer", assessmentId: "as1",
      assigned: [{ kind: "topic", folder: "P/4.2 HTTP", title: "4.2 HTTP", status: "done" }],
      assessment: expect.objectContaining({ understanding: 5, focus: 3, practiced: true, errors: "Confundí PUT con PATCH." }),
    }));
    expect(usePomodoro.getState().p.pendingAssessment).toBeNull();
    expect(byTest("assessment-modal")).toBeNull();
  });

  it("si el registro de la sesión no se puede guardar, la evaluación ya está a salvo: se desbloquea y se avisa", async () => {
    vi.spyOn(api, "mentorTimeLogAssess").mockResolvedValue({ assessments: [], assessment: { id: "as2" } as never });
    vi.spyOn(api, "mentorRecordSave").mockRejectedValue(new Error("disco lleno"));
    pending();
    await act(async () => { root.render(<PomodoroAssessmentModal />); });
    await type(byTest("assess-learned") as HTMLTextAreaElement, "algo");
    await type(byTest("assess-doubt") as HTMLTextAreaElement, "otra cosa");
    await click(byTest("assess-submit"));
    expect(usePomodoro.getState().p.pendingAssessment).toBeNull();
  });

  it("una sesión registrada a mano también suma sus horas al registro (las de un Pomodoro ya se sumaron al acabar)", async () => {
    vi.spyOn(api, "mentorTimeLogAssess").mockResolvedValue({ assessments: [], assessment: { id: "as3" } as never });
    vi.spyOn(api, "mentorRecordSave").mockResolvedValue({ record: {} as never, rel: "x", duplicate: false });
    const add = vi.spyOn(api, "mentorTimeLogAdd").mockResolvedValue({ entries: [], entry: {} as never });
    usePomodoro.getState().requestAssessment({ planId: "p1", areaKey: "backend", minutes: 40, topics: [{ folder: "P/4.2 HTTP", title: "4.2 HTTP" }], finishedAt: new Date(2026, 9, 16, 20, 0).getTime(), startedAt: new Date(2026, 9, 16, 19, 20).getTime(), mode: "manual" });
    // mientras hay una evaluación pendiente no se abre otra encima
    usePomodoro.getState().requestAssessment({ planId: "p9", areaKey: "x", minutes: 5, topics: [], finishedAt: 1, startedAt: 0, mode: "manual" });
    expect(usePomodoro.getState().p.pendingAssessment!.planId).toBe("p1");
    await act(async () => { root.render(<PomodoroAssessmentModal />); });
    await type(byTest("assess-learned") as HTMLTextAreaElement, "algo");
    await type(byTest("assess-doubt") as HTMLTextAreaElement, "otra cosa");
    await click(byTest("assess-submit"));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", areaKey: "backend", minutes: 40, kind: "manual", date: "2026-10-16", note: "[4.2 HTTP]" }));
  });

  it("si no se puede guardar se queda abierto (no se pierde en silencio) y mientras tanto no se puede empezar otro bloque", async () => {
    vi.spyOn(api, "mentorTimeLogAssess").mockRejectedValue(new Error("disco lleno"));
    pending();
    await act(async () => { root.render(<PomodoroAssessmentModal />); });
    await type(byTest("assess-learned") as HTMLTextAreaElement, "algo");
    await type(byTest("assess-doubt") as HTMLTextAreaElement, "otra cosa");
    await click(byTest("assess-submit"));
    expect(usePomodoro.getState().p.pendingAssessment).not.toBeNull();
    expect(byTest("assessment-modal")).toBeTruthy();
    usePomodoro.getState().start("p1", "backend");
    expect(usePomodoro.getState().p.phase).toBe("idle");
  });

  it("asigna a mano una tarea o un proyecto al bloque (fuera del Mentor) y los quita", async () => {
    await mount();
    await type(byTest("assign-text") as HTMLInputElement, "Terminar el endpoint de login");
    await click(byTest("assign-add"));
    const kind = byTest("assign-kind") as unknown as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(kind, "project");
      kind.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await type(byTest("assign-text") as HTMLInputElement, "Feature del día");
    await click(byTest("assign-add"));
    const items = [...host.querySelectorAll("[data-testid=assigned-item]")].map((i) => i.textContent);
    expect(items).toEqual([expect.stringContaining("Tarea"), expect.stringContaining("Proyecto")]);
    expect(usePomodoro.getState().p.assignedTopics.map((t) => [t.kind, t.title])).toEqual([["task", "Terminar el endpoint de login"], ["project", "Feature del día"]]);
    await click(host.querySelector("[data-testid=assigned-item] button"));
    expect(usePomodoro.getState().p.assignedTopics.map((t) => t.title)).toEqual(["Feature del día"]);
  });
});

