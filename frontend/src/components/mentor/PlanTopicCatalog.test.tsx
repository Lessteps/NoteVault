// @vitest-environment jsdom
//
// Sub-vista «Temas» de «Mi plan»: todos los temas de la vault con lo que existe de cada uno, contadores, búsqueda, filtros y apertura del tema.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { PlanTopicRow } from "../../lib/planTopicCatalog";

const openTopic = vi.fn();
vi.mock("./openTopic", () => ({ openTopic: (f: string) => openTopic(f) }));
import { PlanTopicCatalog } from "./PlanTopicCatalog";

const row = (o: Partial<PlanTopicRow> & { folder: string }): PlanTopicRow => ({
  title: o.folder.split("/").pop()!, branch: "Backend", inPlan: false, exists: true, topicType: "unknown",
  theory: true, contract: true, canvas: true, manifest: true, skills: 3, exercises: 5, score: 100, complete: true, gaps: 0, ...o,
});
const ROWS: PlanTopicRow[] = [
  row({ folder: "P/4 Backend/4.1 HTTP", inPlan: true, area: "Backend", targetWeek: 2 }),
  row({ folder: "P/4 Backend/4.2 REST", inPlan: true, area: "Backend", targetWeek: 1, canvas: false, complete: false, score: 70, gaps: 2 }),
  row({ folder: "P/5 Frontend/5.1 DOM", branch: "Frontend", theory: false, contract: null, canvas: false, manifest: false, skills: 0, exercises: 0, complete: false, score: 20, gaps: 5 }),
];

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const titles = () => [...host.querySelectorAll("[data-testid=catalog-open]")].map((e) => e.textContent);
const click = async (id: string) => { await act(async () => { byTest(id)!.click(); }); };

beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanTopicCatalog").mockResolvedValue({ loading: false, rows: ROWS });
  await act(async () => { root.render(<PlanTopicCatalog planId="p1" />); });
  await flush();
  await flush();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  openTopic.mockClear();
});

describe("PlanTopicCatalog", () => {
  it("cuenta los temas y enseña cada uno con texto (no solo color) y marca los de fuera del plan", () => {
    const n = (k: string) => byTest(`catalog-count-${k}`)!.querySelector("dd")!.textContent;
    expect([n("topics"), n("withNote"), n("withCanvas"), n("withPractica"), n("withExercises"), n("complete")]).toEqual(["3", "2", "1", "2", "2", "1"]);
    expect(titles()).toEqual(["4.2 REST", "4.1 HTTP", "5.1 DOM"]); // por semana del plan, los de fuera al final
    const dom = host.querySelectorAll("[data-testid=catalog-row]")[2]!;
    expect(dom.textContent).toContain("Sin nota");
    expect(dom.textContent).toContain("Sin mapa");
    expect(dom.textContent).toContain("Sin .practica");
    expect(dom.textContent).toContain("Sin ejercicios");
    expect(dom.textContent).toContain("Fuera del plan");
    expect(host.querySelectorAll("[data-testid=catalog-row]")[0]!.textContent).toContain("semana 1");
  });

  it("filtra por rama, por lo que falta y por texto, y abre el tema", async () => {
    // solo hay chips de las ramas conectadas a la ruta: Frontend no tiene ningún tema en el plan
    expect(byTest("catalog-branch-Frontend")).toBeNull();
    await click("catalog-branch-Backend");
    expect(titles()).toEqual(["4.2 REST", "4.1 HTTP"]);
    expect(byTest("catalog-branch-Backend")!.getAttribute("aria-pressed")).toBe("true");
    await click("catalog-branch-all");
    await click("catalog-filter-sin-mapa");
    expect(titles()).toEqual(["4.2 REST", "5.1 DOM"]);
    await click("catalog-filter-completos");
    expect(titles()).toEqual([]);
    expect(byTest("catalog-empty")).toBeTruthy();
    await click("catalog-filter-completos");
    await click("catalog-filter-sin-mapa");
    expect(titles()).toHaveLength(3);
    await click("catalog-sort");
    await click("catalog-open");
    expect(openTopic).toHaveBeenCalledWith("P/4 Backend/4.2 REST");
  });
});
