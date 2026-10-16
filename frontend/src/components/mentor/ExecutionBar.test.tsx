// @vitest-environment jsdom
//
// Barra de progreso de la ejecución del plan en segundo plano (siempre visible en la sub-interfaz del plan) y la elección de la sub-vista
// activa de «Mi plan».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { progressOf, type ExecutionState, type TaskState } from "../../lib/planExecution";
import type { MentorExecutionView } from "../../lib/types";
import { ExecutionBar, etaText } from "./ExecutionBar";
import { activeSectionOf, type PlanSection } from "./PlanSections";

const task = (i: number, status: TaskState["status"]): TaskState =>
  ({ id: `t${i}`, kind: "topic_files", area: "Backend", title: `Tema ${i}`, folder: `P/${i}`, status, attempts: 0, created: status === "done" ? [`P/${i}/ej.md`] : [], skipped: [] }) as unknown as TaskState;
const view = (statuses: TaskState["status"][], over: Partial<ExecutionState> = {}): MentorExecutionView => {
  const state = { version: 1, planId: "p1", id: "e1", status: "running", scope: {}, createdAt: new Date(Date.now() - 10 * 60000).toISOString(), updatedAt: new Date().toISOString(), tasks: statuses.map((s, i) => task(i + 1, s)), log: [], ...over } as unknown as ExecutionState;
  return { state, progress: progressOf(state) };
};

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);

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

describe("ExecutionBar", () => {
  it("muestra el avance real: porcentaje, tarea en curso, archivos creados y lo que queda", async () => {
    vi.spyOn(api, "mentorExecutionStatus").mockResolvedValue({ execution: view(["done", "done", "running", "pending", "pending"]), active: true });
    await mountEl(<ExecutionBar planId="p1" />);
    const bar = byTest("exec-bar")!;
    expect(bar).toBeTruthy();
    expect(bar.getAttribute("role")).toBe("region");
    expect(byTest("exec-bar-pct")!.textContent).toBe("40 %");
    const pb = bar.querySelector("[role=progressbar]")!;
    expect(pb.getAttribute("aria-valuenow")).toBe("40");
    expect(byTest("exec-bar-fill")!.style.width).toBe("40%");
    expect(bar.textContent).toContain("Ejecutando");
    expect(bar.textContent).toContain("2/5 tareas");
    expect(bar.textContent).toContain("2 archivos creados");
    expect(bar.textContent).toContain("quedan");
    expect(bar.textContent).toContain("Pausar");
    expect(bar.textContent).toContain("Cancelar");
  });

  it("pausar llama a la API y refleja el estado en pausa con «Reanudar»", async () => {
    vi.spyOn(api, "mentorExecutionStatus").mockResolvedValue({ execution: view(["done", "running", "pending"]), active: true });
    const pause = vi.spyOn(api, "mentorExecutionPause").mockResolvedValue({ execution: view(["done", "pending", "pending"], { status: "paused" }) });
    await mountEl(<ExecutionBar planId="p1" />);
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Pausar"))!;
    await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    expect(pause).toHaveBeenCalledWith("p1");
    expect(byTest("exec-bar")!.textContent).toContain("En pausa");
    expect(byTest("exec-bar")!.textContent).toContain("Reanudar");
  });

  it("sin ejecución, o con una terminada hace tiempo, no ocupa sitio", async () => {
    vi.spyOn(api, "mentorExecutionStatus").mockResolvedValue({ execution: null, active: false });
    await mountEl(<ExecutionBar planId="p1" />);
    expect(byTest("exec-bar")).toBeNull();
    vi.mocked(api.mentorExecutionStatus).mockResolvedValue({ execution: view(["done", "done"], { status: "done", updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString() }), active: false });
    await mountEl(<ExecutionBar planId="p2" />);
    expect(byTest("exec-bar")).toBeNull();
  });

  it("una ejecución recién terminada se ve con su resultado y se puede cerrar", async () => {
    vi.spyOn(api, "mentorExecutionStatus").mockResolvedValue({ execution: view(["done", "done"], { status: "done" }), active: false });
    await mountEl(<ExecutionBar planId="p1" />);
    expect(byTest("exec-bar")!.textContent).toContain("Terminada");
    expect(byTest("exec-bar-pct")!.textContent).toBe("100 %");
    const close = host.querySelector<HTMLElement>("button[aria-label=Cerrar]")!;
    await act(async () => { close.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(byTest("exec-bar")).toBeNull();
  });
});

describe("etaText", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  it("estima con el ritmo medio y no inventa sin datos", () => {
    expect(etaText("2026-10-12T11:50:00Z", 5, 10, now)).toBe("unos 20 min");
    expect(etaText("2026-10-12T11:59:50Z", 1, 1, now)).toBe("menos de 1 min");
    expect(etaText("2026-10-12T08:00:00Z", 2, 100, now)).toBe("unas 200 h");
    expect(etaText("2026-10-12T11:50:00Z", 0, 10, now)).toBe("");
    expect(etaText("nope", 3, 3, now)).toBe("");
  });
});

describe("sub-barra de «Mi plan»: sub-vista activa", () => {
  const secs = (...ids: string[]): PlanSection[] => ids.map((id) => ({ id, label: id, visible: true, render: () => null }));
  it("es la guardada cuando existe y está visible", () => {
    expect(activeSectionOf(secs("resumen", "datos", "ejecutar"), "ejecutar").id).toBe("ejecutar");
  });
  it("acepta el id con prefijo de ancla («sec-ejecutar»)", () => {
    expect(activeSectionOf(secs("resumen", "ejecutar"), "sec-ejecutar").id).toBe("ejecutar");
  });
  it("una guardada desconocida u oculta vuelve al Resumen", () => {
    expect(activeSectionOf(secs("resumen", "datos"), "fases").id).toBe("resumen");
    expect(activeSectionOf(secs("resumen", "datos"), "").id).toBe("resumen");
  });
  it("sin Resumen cae en la primera", () => {
    expect(activeSectionOf(secs("datos", "areas"), "nope").id).toBe("datos");
  });
});

describe("ExecutionAside (dentro del Resumen)", () => {
  it("enseña el avance, los últimos archivos creados y el registro", async () => {
    const { ExecutionAside, fileLabel } = await import("./ExecutionBar");
    const v = view(["done", "running", "pending"], { log: ["23:49:00 1/3 · Backend: katas", "23:50:00   Ejercicios de pg_classify (dificultad 1)…"] });
    v.state.tasks[0]!.created = ["Programación/1 Fundamentals/1.4 From source code to execution/Ejercicios/pg_classify/ej_pg_classify_d1_1.md"];
    vi.spyOn(api, "mentorExecutionStatus").mockResolvedValue({ execution: v, active: true });
    await mountEl(<ExecutionAside planId="p1" />);
    const aside = byTest("exec-aside")!;
    expect(aside.textContent).toContain("Generación de notas");
    expect(aside.textContent).toContain("Ejecutando");
    expect(byTest("exec-aside-pct")!.textContent).toBe("33 %");
    expect(byTest("exec-aside-files")!.textContent).toContain("ej_pg_classify_d1_1");
    expect(byTest("exec-aside-files")!.textContent).toContain("1.4 From source code to execution/Ejercicios/pg_classify");
    expect(byTest("exec-aside-log")!.textContent).toContain("Ejercicios de pg_classify");
    expect(fileLabel("a/b/c/x.md")).toEqual({ name: "x", where: "a/b/c" });
  });

  it("sin ejecución no ocupa sitio", async () => {
    const { ExecutionAside } = await import("./ExecutionBar");
    vi.spyOn(api, "mentorExecutionStatus").mockResolvedValue({ execution: null, active: false });
    await mountEl(<ExecutionAside planId="p1" />);
    expect(byTest("exec-aside")).toBeNull();
  });
});
