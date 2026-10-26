// @vitest-environment jsdom
//
// Mentor — «Áreas»: la barra (ítem bajo el selector de plan), la ruta, los tres niveles con migas de pan, filtros, insignia «En tu plan» y
// que funcione sin ningún plan.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { MentorModule } from "./MentorModule";
import { resolveRoute } from "./mentorNav";

const SPACES = [
  { space: "Matemáticas", areas: 1, pct: 20, topics: 3, completed: 0, started: 1, exercisesDone: 2, exercisesTotal: 9, reviewsDue: 0, lastActivity: "2026-10-01" },
  { space: "Programación", areas: 2, pct: 60, topics: 10, completed: 4, started: 6, exercisesDone: 30, exercisesTotal: 50, reviewsDue: 2, lastActivity: "2026-10-25" },
];
const AREAS = [
  { space: "Programación", area: "Programación/1 Backend", name: "1 Backend", pct: 70, topics: 6, completed: 3, started: 5, exercisesDone: 20, exercisesTotal: 30, reviewsDue: 1, lastActivity: "", state: "en_curso" },
  { space: "Programación", area: "Programación/2 Frontend", name: "2 Frontend", pct: 10, topics: 4, completed: 0, started: 1, exercisesDone: 1, exercisesTotal: 20, reviewsDue: 0, lastActivity: "", state: "en_curso" },
];
const topic = (code: string, title: string, state: string, due = false) => ({
  space: "Programación", area: "Programación/1 Backend", folder: `Programación/1 Backend/${code} ${title}`, title, code, pct: state === "completo" ? 100 : 0, state,
  exercisesDone: 1, exercisesTotal: 4, nextReview: due ? "2026-10-20" : "", reviewDue: due, lastActivity: "",
});
const TOPICS = [topic("1.1", "HTTP", "completo"), topic("1.2", "REST", "en_curso", true), topic("1.3", "JSON", "sin_tratar")];

let host: HTMLDivElement;
let root: Root;
let overview: ReturnType<typeof vi.spyOn>;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
async function mount(view = "areas", path = "") {
  useNavState.setState({ values: { "mentor.view": view, ...(path ? { "mentor.areas.path": path } : {}) } });
  await act(async () => { root.render(<MentorModule />); });
  await flush();
}
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useMentor.setState({ plans: [], plansLoaded: true, builds: [] });
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanBuildList").mockResolvedValue([] as never);
  overview = vi.spyOn(api, "mentorAreasOverview").mockImplementation((async (o: { level?: string }) =>
    o.level === "areas" ? { level: "areas", rows: AREAS } : o.level === "topics" ? { level: "topics", rows: TOPICS } : { level: "spaces", rows: SPACES }) as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Áreas: ruta y barra", () => {
  it("«areas» es una ruta propia y no rompe las demás", () => {
    const base = { plans: [{ id: "p1", status: "activo" as const }], plansLoaded: true, builds: [], buildsLoaded: true };
    expect(resolveRoute({ stored: "areas", ...base })).toEqual({ kind: "areas" });
    expect(resolveRoute({ stored: "plan:p1", ...base })).toEqual({ kind: "plan", planId: "p1" });
    expect(resolveRoute({ stored: "plan", ...base })).toEqual({ kind: "overview", creating: false });
  });

  it("el ítem «Áreas» va justo debajo del selector de plan y lleva a la ruta", async () => {
    await mount("plan");
    const link = byId("mentor-areas-link")!;
    expect(link).toBeTruthy();
    const selector = byId("mentor-plan-selector")!;
    expect(selector.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selector.parentElement).toBe(link.parentElement);
    expect(selector.nextElementSibling).toBe(link);
    await click(link);
    expect(useNavState.getState().values["mentor.view"]).toBe("areas");
    expect(byId("areas-overview")).toBeTruthy();
  });
});

describe("Áreas: niveles", () => {
  it("funciona sin ningún plan: lista los espacios con anillo y cuentas, en una sola llamada", async () => {
    await mount();
    expect(overview).toHaveBeenCalledTimes(1);
    expect(overview).toHaveBeenCalledWith({ level: "spaces", space: "", area: "" });
    expect(byId("space-Programación")!.textContent).toContain("2 áreas");
    expect(byId("space-Programación")!.textContent).toContain("4/10 temas");
    expect(byId("space-Programación")!.textContent).toContain("30/50 ejercicios");
    expect(byId("space-Programación")!.textContent).toContain("2 repasos");
    expect(byId("space-Matemáticas")).toBeTruthy();
    expect(host.querySelectorAll("[data-testid=ring]").length).toBeGreaterThanOrEqual(2);
  });

  it("espacio -> área -> temas con migas de pan, y recuerda la ruta", async () => {
    await mount();
    await click(byId("space-Programación"));
    expect(useNavState.getState().values["mentor.areas.path"]).toBe("Programación");
    expect(byId("area-1 Backend")!.textContent).toContain("3/6 temas");
    await click(byId("area-1 Backend"));
    expect(useNavState.getState().values["mentor.areas.path"]).toBe("Programación|Programación/1 Backend");
    expect(host.querySelectorAll("[data-testid=topic-card]")).toHaveLength(3);
    const crumbs = [...byId("areas-crumbs")!.querySelectorAll("button")].map((b) => b.textContent);
    expect(crumbs).toEqual(["Áreas", "Programación", "1 Backend"]);
    await click(byId("areas-crumbs")!.querySelectorAll("button")[1]);
    expect(byId("area-1 Backend")).toBeTruthy();
    await click(byId("areas-crumbs")!.querySelectorAll("button")[0]);
    expect(byId("space-Matemáticas")).toBeTruthy();
  });

  it("reabre donde se quedó el desglose", async () => {
    await mount("areas", "Programación|Programación/1 Backend");
    expect(host.querySelectorAll("[data-testid=topic-card]")).toHaveLength(3);
    expect(overview).toHaveBeenCalledWith({ level: "topics", space: "Programación", area: "Programación/1 Backend" });
  });

  it("áreas: busca y ordena por avance", async () => {
    await mount("areas", "Programación");
    const names = () => [...host.querySelectorAll("[data-testid^=area-]")].map((e) => e.getAttribute("data-testid"));
    expect(names()).toEqual(["area-1 Backend", "area-2 Frontend"]);
    const sort = host.querySelector("select[aria-label='Ordenar áreas']") as HTMLSelectElement;
    await act(async () => {
      sort.value = "avance";
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(names()).toEqual(["area-1 Backend", "area-2 Frontend"]);
    const q = host.querySelector("input[aria-label='Buscar área']") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(q, "front");
      q.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(names()).toEqual(["area-2 Frontend"]);
  });

  it("temas: filtros Todos / Sin tratar / En curso / Completos / Con repaso pendiente", async () => {
    await mount("areas", "Programación|Programación/1 Backend");
    const titles = () => [...host.querySelectorAll("[data-testid=topic-card]")].map((c) => c.querySelector("p.font-semibold")?.textContent);
    expect(titles()).toEqual(["HTTP", "REST", "JSON"]);
    await click(byId("filter-sin_tratar"));
    expect(titles()).toEqual(["JSON"]);
    await click(byId("filter-en_curso"));
    expect(titles()).toEqual(["REST"]);
    await click(byId("filter-completo"));
    expect(titles()).toEqual(["HTTP"]);
    await click(byId("filter-repaso"));
    expect(titles()).toEqual(["REST"]);
    expect(host.textContent).toContain("Repaso pendiente");
    await click(byId("filter-todos"));
    expect(titles()).toHaveLength(3);
  });

  it("insignia «En tu plan» solo en lo que pertenece al plan activo", async () => {
    useMentor.setState({ plans: [{ id: "p1", name: "Plan octubre", status: "activo" } as never], plansLoaded: true });
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([{ id: "p1", name: "Plan octubre", status: "activo" } as never]);
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue({
      loading: false,
      plan: { subplans: [{ topics: [{ folder: "Programación/1 Backend/1.1 HTTP" }] }] },
    } as never);
    await mount("areas", "Programación|Programación/1 Backend");
    const cards = [...host.querySelectorAll("[data-testid=topic-card]")];
    expect(cards[0]!.textContent).toContain("En tu plan: Plan octubre");
    expect(cards[1]!.textContent).not.toContain("En tu plan");
    await click(byId("areas-crumbs")!.querySelectorAll("button")[1]);
    expect(byId("area-1 Backend")!.textContent).toContain("En tu plan: Plan octubre");
    expect(byId("area-2 Frontend")!.textContent).not.toContain("En tu plan");
  });

  it("más de 100 temas: pinta por tandas", async () => {
    const many = Array.from({ length: 130 }, (_, i) => topic(`1.${i + 1}`, `T${i + 1}`, "sin_tratar"));
    overview.mockImplementation((async () => ({ level: "topics", rows: many })) as never);
    await mount("areas", "Programación|Programación/1 Backend");
    expect(host.querySelectorAll("[data-testid=topic-card]")).toHaveLength(100);
    await click(byId("topics-more"));
    expect(host.querySelectorAll("[data-testid=topic-card]")).toHaveLength(130);
  });

  it("sin espacios: mensaje vacío", async () => {
    overview.mockImplementation((async () => ({ level: "spaces", rows: [] })) as never);
    await mount();
    expect(byId("areas-empty")).toBeTruthy();
  });
});
