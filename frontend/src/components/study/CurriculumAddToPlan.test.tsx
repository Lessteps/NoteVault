// @vitest-environment jsdom
//
// «Añadir al plan» del panel de la tarea: solo planes no archivados, un botón con el nombre del plan, resultado, idempotencia visible y «Ver en el plan».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorAddTopicsResult, MentorPlanRow } from "../../lib/types";
import { useNavState } from "../../store/navState";
import type { CurriculumHandoffState } from "../../store/curriculum";
import { CurriculumHandoffPanel, problemsMessage, selectablePlans } from "./CurriculumHandoffPanel";

const entry = (id: string, state: "created" | "pending" = "created") => ({
  entryId: id, title: `Tema ${id}`, category: "Base", importance: "esencial", number: "11.1", name: id, folder: `Programación/11 HTML/11.1 ${id}`, state, problems: [], warnings: [],
  progress: { folder: true, note: true, manifest: true, map: true, exercises: 0, temario: true },
});
const handoff = (over: Partial<CurriculumHandoffState> = {}): CurriculumHandoffState => ({
  id: "h1", kind: "curriculum", areaId: "html", areaTitle: "HTML", space: "Programación", areaFolder: "11 HTML", withExercises: false, createdAt: "2026-10-26T10:00:00Z",
  taskPath: "_handoff/x.md", taskAbs: "C:/v/_handoff/x.md", folder: "_handoff", shortPrompt: "p", prompt: "p", status: "validated", entries: [entry("a"), entry("b")], log: [], ready: { found: 2, expected: 2 }, ...over,
});
const plan = (id: string, over: Partial<MentorPlanRow> = {}): MentorPlanRow => ({ id, start: "2026-10-01", end: "2027-01-01", name: `Plan ${id}`, period: "", status: "activo", archived: false, auto: false, subplans: 2, topics: 10, completed: 0, pct: 0, minutesPerDay: 120, ...over });

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element | null) => {
  expect(el).toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const result = (over: Partial<MentorAddTopicsResult> = {}): MentorAddTopicsResult => ({ plan: {} as never, added: ["Programación/11 HTML/11.1 a", "Programación/11 HTML/11.1 b"], addedTo: ["frontend"], skipped: [], changed: 2, message: "Se añadieron 2 temas de referencia (HTML) al área Frontend, al final de su ruta.", ...over });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const mount = async (h = handoff()) => {
  await act(async () => { root.render(<CurriculumHandoffPanel handoff={h} onUpdate={() => undefined} onClose={() => undefined} />); });
  await flush();
};

describe("Añadir al plan", () => {
  it("solo ofrece planes no archivados ni terminados", () => {
    expect(selectablePlans([plan("a"), plan("b", { archived: true }), plan("c", { status: "terminado" }), plan("d", { status: "propuesto" })]).map((p) => p.id)).toEqual(["a", "d"]);
  });

  it("añade los temas validados al plan activo y deja «Ver en el plan»", async () => {
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([plan("p1", { name: "Mi plan" }), plan("p2", { archived: true, name: "Viejo" })]);
    const add = vi.spyOn(api, "mentorPlanAddTopics").mockResolvedValue(result());
    await mount();
    const btn = byId("curriculum-add-to-plan-btn")!;
    expect(btn.textContent).toContain("Añadir al plan «Mi plan»");
    expect(byId("curriculum-add-plan-select")).toBeNull();
    expect(byId("curriculum-add-view-plan")).toBeNull();
    await click(btn);
    expect(add).toHaveBeenCalledWith({ planId: "p1", folders: ["Programación/11 HTML/11.1 a", "Programación/11 HTML/11.1 b"] });
    expect(byId("curriculum-add-result")!.textContent).toContain("Se añadieron 2 temas");
    await click(byId("curriculum-add-view-plan"));
    const nav = useNavState.getState().values;
    expect(nav["mentor.view"]).toBe("plan:p1");
    expect(nav["mentor.agendaArea.p1"]).toBe("frontend");
    expect(nav["mentor.pageTab.p1.frontend"]).toBe("temas");
    expect(nav["mentor.planTab.p1"]).toBe("agenda");
  });

  it("solo manda los temas validados y avisa si ya estaban", async () => {
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([plan("p1")]);
    const add = vi.spyOn(api, "mentorPlanAddTopics").mockResolvedValue(result({ added: [], addedTo: [], changed: 0, skipped: [{ folder: "x", reason: "ya está en el plan" }], message: "Esos temas ya estaban en el plan: no hay nada que añadir." }));
    await mount(handoff({ status: "failed", entries: [entry("a"), entry("b", "pending")] }));
    await click(byId("curriculum-add-to-plan-btn"));
    expect(add).toHaveBeenCalledWith({ planId: "p1", folders: ["Programación/11 HTML/11.1 a"] });
    expect(byId("curriculum-add-result")!.textContent).toContain("ya estaban");
    expect(byId("curriculum-add-view-plan")).toBeNull();
  });

  it("el mensaje de correcciones lista cada problema y limita el trabajo del agente", () => {
    const bad = handoff({ status: "failed", entries: [entry("a"), { ...entry("b", "pending"), state: "error" as const, problems: ["Falta el manifiesto «b.practica.md»."] }] });
    const msg = problemsMessage(bad);
    expect(msg).toContain("C:/v/_handoff/x.md");
    expect(msg).toContain("- Programación/11 HTML/11.1 b\n  * Falta el manifiesto «b.practica.md».");
    expect(msg).not.toContain("11.1 a");
    expect(msg).toContain("change nothing else");
  });

  it("sin planes disponibles lo dice y no ofrece el botón", async () => {
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([plan("p2", { archived: true })]);
    await mount();
    expect(byId("curriculum-add-to-plan-btn")).toBeNull();
    expect(byId("curriculum-add-noplan")).toBeTruthy();
  });
});
