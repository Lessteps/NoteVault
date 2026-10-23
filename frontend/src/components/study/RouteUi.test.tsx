// @vitest-environment jsdom
//
// La RUTA del Mentor dentro de NoteVault: el mapa carpeta → ruta se calcula UNA vez por plan (sin llamadas por fila); insignias con texto e icono
// en el árbol de notas (los temas fuera de ruta atenuados, no escondidos); interruptor «Solo mi ruta (Mentor)» (role=switch, recuento aria-live,
// deshabilitado sin plan activo y con vista previa del propuesto); banner de la nota con enlace a la Agenda y «Añadir a mi ruta» deshacible.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorPlan, MentorPlanGet, MentorPlanRow, TreeEntry } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useRoute } from "../../store/mentorRoute";
import { useNavState } from "../../store/navState";
import { FileTree } from "../notes/FileTree";
import { RouteBadge, RouteBanner, RouteNow, RouteToggle } from "./RouteUi";

const START = "2026-10-05";
const END = "2027-03-28";
const PID = `${START}_${END}`;
const B = "Programación/4 Backend";
const T = (n: number) => `${B}/T0${n} Tema ${n}`;

const plan = (proposed = false): MentorPlan =>
  ({
    id: PID, start: START, end: END, name: "Full stack", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", structure: "areas", ...(proposed ? { proposed: true } : {}),
    preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no" },
    subplans: [
      {
        id: "s1", area: "Backend", areaId: "backend", objective: "APIs", weeks: [], requiredGoals: [], phase: { fromWeek: 1, toWeek: 20 }, groups: [{ id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }],
        topics: [
          { folder: T(1), title: "Tema 1", estMinutes: 60, targetWeek: 1, group: "core" },
          { folder: T(2), title: "Tema 2", estMinutes: 60, targetWeek: 4, group: "core", route: "optional" },
          { folder: T(3), title: "Tema 3", estMinutes: 60, targetWeek: 4, group: "core", route: "skipped", skippedReason: "Ya lo dominas (80 %)" },
          { folder: T(4), title: "Tema 4", estMinutes: 60, targetWeek: 5, group: "core" },
        ],
      },
    ],
  }) as unknown as MentorPlan;
const row = (status: MentorPlanRow["status"]): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Full stack", period: "5 oct – 28 mar", status, archived: false, auto: false, subplans: 1, topics: 4, completed: 0, pct: 0, minutesPerDay: 240 });
const loaded = (status: MentorPlanRow["status"], p: MentorPlan, currentWeek = 4): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: "2026-10-28", status, plan: p,
  derived: { subplans: [], summary: { subplans: 1, topics: 4, done: 0, pct: 0, currentWeek, weeks: 26 } },
  goals: {}, projects: {}, items: [], months: [], plans: [row(status)], aiConfigured: true,
});
const folder = (path: string): TreeEntry => ({ path, name: path.split("/").pop()!, type: "folder", kind: "folder", has_children: true }) as unknown as TreeEntry;

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const settle = async () => { await flush(); await flush(); await flush(); };
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await settle(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
};
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`)!;

/** Prepara el plan: `activo` = mantenido, `propuesto` = solo vista previa. */
const setup = (status: MentorPlanRow["status"]) => {
  const list = vi.spyOn(api, "mentorPlanList").mockResolvedValue([row(status)]);
  const get = vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(status, plan(status === "propuesto")));
  return { list, get };
};

beforeEach(() => {
  localStorage.clear();
  useRoute.getState().reset();
  useRoute.getState().setOnly(false);
  useRoute.getState().setPreviewOn(false);
  useRoute.getState().setSortByWeek(false);
  useNavState.setState({ values: {} });
  useMentor.setState({ planVersion: 0 });
  useApp.setState({ module: "notas" } as never);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("insignia de ruta", () => {
  const info = (route: "core" | "optional" | "skipped") => ({ route, week: 4, weekStart: "2026-10-26", title: "T", area: "Backend", subplanId: "s1", done: false, ...(route === "skipped" ? { reason: "Ya lo dominas" } : {}) });
  it("lleva texto e icono (nunca solo color) y un nombre accesible completo, también en su versión compacta", () => {
    act(() => root.render(<><RouteBadge info={info("core")} /><RouteBadge info={info("optional")} /><RouteBadge info={info("skipped")} /><RouteBadge info={info("core")} compact /><RouteBadge info={info("core")} preview /></>));
    const badges = [...host.querySelectorAll("[data-testid=route-badge]")];
    expect(badges.map((b) => b.textContent)).toEqual(["En tu ruta · sem. 4", "Opcional · sem. 4", "Fuera de ruta", "Ruta s4En tu ruta · sem. 4", "Vista previa · en la ruta · sem. 4"]);
    expect(badges.every((b) => b.querySelector("svg"))).toBe(true);
    expect(badges[3]!.querySelector(".sr-only")!.textContent).toBe("En tu ruta · sem. 4");
    expect(badges[2]!.getAttribute("title")).toContain("Ya lo dominas");
    expect(badges[4]!.className).toContain("border-dashed");
  });
});

describe("interruptor «Solo mi ruta (Mentor)»", () => {
  it("con plan activo es un switch accesible con recuento aria-live y el atajo «Mostrar todo»", async () => {
    setup("activo");
    await mountEl(<RouteToggle showSort />);
    const sw = byTest("route-switch");
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.hasAttribute("disabled")).toBe(false);
    expect(sw.textContent).toContain("Solo mi ruta (Mentor)");
    const count = byTest("route-count");
    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.textContent).toBe("3 en tu ruta · 1 fuera de ruta de 4");
    await click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(count.textContent).toBe("3 temas en tu ruta · 1 fuera de ruta ocultos");
    await click(byTest("route-show-all"));
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(host.querySelector("[data-testid=route-show-all]")).toBeNull();
    expect((byTest("route-sort") as HTMLSelectElement).value).toBe("area");
  });

  it("sin plan activo (solo propuesto) está deshabilitado y explica «Mantén un plan para ver tu ruta»; permite previsualizar el propuesto", async () => {
    setup("propuesto");
    await mountEl(<RouteToggle />);
    const sw = byTest("route-switch");
    expect(sw.hasAttribute("disabled")).toBe(true);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(byTest("route-why").textContent).toContain("Mantén un plan para ver tu ruta");
    const prev = byTest("route-preview");
    expect(prev.getAttribute("aria-pressed")).toBe("false");
    await click(prev);
    expect(prev.getAttribute("aria-pressed")).toBe("true");
    expect(sw.hasAttribute("disabled")).toBe(false);
    await click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(byTest("route-count").textContent).toContain("3 temas en tu ruta");
  });

  it("sin ningún plan: deshabilitado con la misma explicación", async () => {
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([]);
    await mountEl(<RouteToggle />);
    expect(byTest("route-switch").hasAttribute("disabled")).toBe(true);
    expect(byTest("route-why").textContent).toContain("Mantén un plan para ver tu ruta");
  });
});

describe("árbol de notas con insignias y filtro", () => {
  const listDir = (path: string): TreeEntry[] =>
    path === "" ? [folder("Inglés"), folder("Programación")] : path === "Programación" ? [folder(B)] : path === B ? [1, 2, 3, 4, 5].map((n) => folder(T(n))) : [];
  const mountTree = async () => {
    localStorage.setItem("nv.tree.expanded", JSON.stringify(["Programación", B]));
    vi.spyOn(api, "listDir").mockImplementation(async (p?: string) => listDir(p ?? ""));
    vi.spyOn(api, "noteIndex").mockResolvedValue([]);
    await mountEl(<div style={{ height: 600 }}><FileTree filter="" /></div>);
  };
  const rows = () => [...host.querySelectorAll("[role=treeitem]")];
  const rowOf = (name: string) => rows().find((r) => r.textContent?.includes(name));

  it("cada tema de la ruta lleva su insignia; los fuera de ruta se atenúan sin esconderse; los demás temas no llevan nada", async () => {
    const { get, list } = setup("activo");
    await mountTree();
    expect(rowOf("T01")!.querySelector("[data-testid=route-badge]")!.textContent).toContain("En tu ruta · sem. 1");
    expect(rowOf("T02")!.querySelector("[data-testid=route-badge]")!.textContent).toContain("Opcional · sem. 4");
    const skipped = rowOf("T03")!;
    expect(skipped.querySelector("[data-testid=route-badge]")!.textContent).toContain("Fuera de ruta");
    expect(skipped.className).toContain("opacity-60");
    expect(rowOf("T05")).toBeTruthy(); // un tema que no es del plan sigue ahí
    expect(rowOf("T05")!.querySelector("[data-testid=route-badge]")).toBeNull();
    expect(rowOf("Inglés")).toBeTruthy();
    // el mapa se calculó una sola vez: ninguna fila llama al Mentor
    expect(list).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("«Solo mi ruta» deja solo los temas core/optional del plan (y lo que los contiene); nada se borra, al quitarlo todo vuelve", async () => {
    const { get } = setup("activo");
    await mountTree();
    await act(async () => { useRoute.getState().setOnly(true); });
    await settle();
    const names = rows().map((r) => r.textContent ?? "");
    expect(names.some((t) => t.includes("Inglés"))).toBe(false);
    expect(names.some((t) => t.includes("T03"))).toBe(false); // fuera de ruta: oculto, no borrado
    expect(names.some((t) => t.includes("T05"))).toBe(false);
    expect(["Programación", "4 Backend", "T01", "T02", "T04"].every((n) => names.some((t) => t.includes(n)))).toBe(true);
    await act(async () => { useRoute.getState().setOnly(false); });
    await settle();
    expect(rowOf("T03")).toBeTruthy();
    expect(rowOf("Inglés")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("con un plan solo propuesto no hay insignias hasta pedir la vista previa; entonces llevan la marca «Vista previa»", async () => {
    setup("propuesto");
    await mountTree();
    expect(host.querySelector("[data-testid=route-badge]")).toBeNull();
    await act(async () => { useRoute.getState().setPreviewOn(true); });
    await settle();
    expect(rowOf("T01")!.querySelector("[data-testid=route-badge]")!.textContent).toContain("Vista previa");
  });
});

describe("banner de la nota", () => {
  it("«Mentor: este tema está en tu ruta · semana N · área Backend» con «Ver en Agenda» que abre la Agenda del Mentor", async () => {
    setup("activo");
    const setModule = vi.spyOn(useApp.getState(), "setModule").mockImplementation(() => undefined);
    await mountEl(<RouteBanner path={`${T(1)}/Tema 1.practica.md`} />);
    const b = byTest("route-banner");
    expect(b.getAttribute("role")).toBe("note");
    expect(b.getAttribute("aria-label")).toBe("Ruta del Mentor");
    const text = byTest("route-banner-text").textContent!;
    expect(text).toContain("Mentor: este tema está en tu ruta · semana 1");
    expect(text).toContain("área Backend");
    await click(byTest("route-agenda-link"));
    expect(setModule).toHaveBeenCalledWith("mentor");
    const nav = useNavState.getState().values;
    expect(nav[`mentor.agendaView.${PID}`]).toBe("dia");
    expect(String(nav[`mentor.agendaDate.${PID}`])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nav[`mentor.planTab.${PID}`]).toBe("agenda");
    expect(nav["mentor.view"]).toBe(`plan:${PID}`);
    expect(nav["mentor.mode"]).toBe("planeacion");
  });

  it("enseña fecha prevista y estado, y «Ver en Ejecución» abre la vista de su área en modo Ejecución", async () => {
    setup("activo");
    const setModule = vi.spyOn(useApp.getState(), "setModule").mockImplementation(() => undefined);
    await mountEl(<RouteBanner path={`${T(1)}/Tema 1.practica.md`} />);
    expect(byTest("route-banner-text").textContent).toMatch(/previsto el /);
    expect(byTest("route-status").textContent).toBe("pendiente");
    expect(byTest("route-agenda-link").textContent).toBe("Ver en Agenda");
    await click(byTest("route-run-link"));
    expect(setModule).toHaveBeenCalledWith("mentor");
    const nav = useNavState.getState().values;
    expect(nav["mentor.mode"]).toBe("ejecucion");
    expect(nav[`mentor.runTab.${PID}`]).toBe("area:s1");
    expect(nav["mentor.view"]).toBe(`plan:${PID}`);
  });

  it("en la vista previa de un plan propuesto no ofrece «Ver en Ejecución»", async () => {
    setup("propuesto");
    useRoute.getState().setPreviewOn(true);
    await mountEl(<RouteBanner path={`${T(1)}/nota.md`} />);
    expect(host.querySelector("[data-testid=route-run-link]")).toBeNull();
    expect(byTest("route-agenda-link")).toBeTruthy();
  });

  it("no aparece en una nota que no es de la ruta", async () => {
    setup("activo");
    await mountEl(<RouteBanner path="Inglés/Grammar/nota.md" />);
    expect(host.querySelector("[data-testid=route-banner]")).toBeNull();
  });

  it("un tema fuera de ruta dice «fuera de tu ruta (motivo)» y «Añadir a mi ruta» lo devuelve (deshacible)", async () => {
    setup("activo");
    const add = vi.spyOn(api, "mentorPlanRouteSet").mockResolvedValue({ plan: plan(), changed: 1 });
    const undo = vi.spyOn(api, "mentorPlanChangeUndo").mockResolvedValue({ plan: plan(), history: [] });
    await mountEl(<RouteBanner path={`${T(3)}/nota.md`} />);
    const text = byTest("route-banner-text").textContent!;
    expect(text).toContain("Mentor: fuera de tu ruta (Ya lo dominas (80 %))");
    await click(byTest("route-add"));
    expect(add).toHaveBeenCalledWith({ id: PID, folders: [T(3)], route: "core", label: "Añadir a mi ruta: Tema 3" });
    expect(byTest("route-banner").textContent).toContain("añadido a tu ruta");
    await click(byTest("route-undo"));
    expect(undo).toHaveBeenCalledWith(PID);
    expect(useMentor.getState().planVersion).toBeGreaterThanOrEqual(2);
  });

  it("la vista previa de un plan propuesto lo dice en el banner", async () => {
    setup("propuesto");
    useRoute.getState().setPreviewOn(true);
    await mountEl(<RouteBanner path={`${T(1)}/nota.md`} />);
    expect(byTest("route-banner-text").textContent).toContain("Vista previa del plan propuesto");
  });
});

describe("«Qué estudiar ahora»", () => {
  it("lista los temas exactos de la semana de la ruta (sin los fuera de ruta ni los hechos) y abre cada tema", async () => {
    setup("activo");
    const open = vi.fn();
    await mountEl(<RouteNow onOpen={open} />);
    const items = [...host.querySelectorAll("[data-testid=route-now-item]")];
    expect(host.querySelector("section")!.getAttribute("aria-label")).toContain("Qué estudiar ahora");
    // semana actual 4: Tema 2 (opcional); el Tema 3 de esa semana está fuera de ruta y no sale
    expect(items.map((i) => i.querySelector("button")!.textContent)).toEqual(["Tema 2"]);
    await click(items[0]!.querySelector("button"));
    expect(open).toHaveBeenCalledWith(T(2));
  });

  it("sin ruta (sin plan) no se muestra", async () => {
    vi.spyOn(api, "mentorPlanList").mockResolvedValue([]);
    await mountEl(<RouteNow onOpen={() => undefined} />);
    expect(host.querySelector("[data-testid=route-now]")).toBeNull();
  });
});
