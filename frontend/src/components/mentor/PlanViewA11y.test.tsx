// @vitest-environment jsdom
//
// Mentor — sub-interfaz de un plan: la estructura por pestañas y su accesibilidad (patrón WAI-ARIA tabs con teclado, la pestaña
// activa se recuerda por plan, banner «¿lo mantienes?» visible en todas, acciones de entregables, sugerencias que rellenan
// el cuadro de cambios, enlace «Saltar al contenido», región aria-live y jerarquía de encabezados).

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

const ui = vi.hoisted(() => ({ askText: vi.fn(), confirmAction: vi.fn() }));
vi.mock("../ui", async (orig) => ({ ...(await orig<typeof import("../ui")>()), askText: ui.askText, confirmAction: ui.confirmAction }));

import { gotoSection, navTab, navView } from "./mentorTestNav";
import { PlanWorkspace } from "./PlanWorkspace";

const START = "2026-10-06";
const END = "2027-04-05";
const PID = `${START}_${END}`;
const F1 = "Programación/1 Fundamentals/1.1 What programming is";
const F2 = "Programación/2.1 Python/2.1.1 Project structure";

const week = (n: number, topics: string[]) => ({ week: n, start: START, end: END, topics, minutes: 60 * topics.length, capacityMinutes: 240 });
const sub = (id: string, objective: string, folder: string, over: Record<string, unknown> = {}) => ({
  id, area: "Programación", objective, notes: "Temas en el orden natural de la materia.",
  topics: [{ folder, title: folder.split("/").pop()!, targetWeek: 1, estMinutes: 60 }], weeks: [week(1, [folder]), week(2, [])], requiredGoals: [], ...over,
});
const plan = (over: Partial<PlanData> = {}): PlanData => ({
  id: PID, start: START, end: END, name: "Reforzar bases +9 · 6 oct–5 abr", createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z", proposed: true,
  hoursPerWeek: 37, rationale: "Se prioriza lo que pidió el estudiante.",
  preconditions: { start: START, end: END, minutesPerDay: 420, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask", branchExcluded: ["3 Desktop Apps (Electron)", "8 Mobile"], notes: "Rotativo", freeObjective: "Quiero ser full stack" } as never,
  subplans: [sub("s1", "Reforzar bases", F1), sub("s2", "Consolidar Python", F2)] as never,
  openQuestions: [
    { id: "deliverables", subplanId: "s1", text: "¿Quieres un entregable para Programación: Reforzar bases…?", options: ["Sí", "No", "Después"] },
    { id: "deliverables", subplanId: "s2", text: "¿Quieres un entregable para Programación: Consolidar Python…?", options: ["Sí", "No", "Después"] },
  ],
  ...over,
});
const row = (): MentorPlanRow => ({ id: PID, start: START, end: END, name: "Reforzar bases +9 · 6 oct–5 abr", period: "6 oct – 5 abr", status: "propuesto", archived: false, auto: false, subplans: 2, topics: 2, completed: 0, pct: 0, minutesPerDay: 420 });
const loaded = (p: PlanData = plan()): MentorPlanGet => ({
  loading: false, id: PID, month: "2026-10", today: "2026-10-12", status: "propuesto", plan: p,
  derived: {
    subplans: p.subplans.map((s) => ({ id: s.id, total: s.topics.length, done: 0, pct: 0, currentWeek: 1, topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: true })) })),
    summary: { subplans: p.subplans.length, topics: p.subplans.length, done: 0, pct: 0, currentWeek: 1, weeks: 26 },
  },
  goals: {}, projects: {}, items: [], months: [], plans: [row()], aiConfigured: true,
});

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
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const tab = (id: string) => navTab(host, id) as HTMLButtonElement;
/** ¿está la pestaña activa? (el ítem de la barra lateral o, en «Mi plan» y «Agenda», una de sus sub-vistas) */
const tabOn = (id: string): boolean => {
  const el = tab(id);
  return el.getAttribute("aria-current") === "page";
};
const panelsVisible = () => [...host.querySelectorAll("[id^=plan-tabs-panel-]")].filter((p) => !(p as HTMLElement).hidden).map((p) => p.id.replace("plan-tabs-panel-", ""));

beforeEach(() => {
  localStorage.clear();
  ui.askText.mockReset();
  ui.confirmAction.mockReset();
  useNavState.setState({ values: {} });
  useMentor.setState({ planVersion: 0, plans: [], plansLoaded: false });
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

describe("pestañas del plan (barra lateral)", () => {
  it("la barra lista la Vista general, un ítem por área y «Más», con su estado actual (aria-current); solo el panel activo es visible y las pestañas son las de la página", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    // las únicas pestañas (role=tab) son las de la página del plan, con su nombre
    expect(host.querySelector("[role=tablist]")!.getAttribute("aria-label")).toContain("Secciones de");
    // sin pista Programming practice no hay «Práctica»
    expect([...host.querySelectorAll("aside nav > div > button")].map((t) => t.getAttribute("data-testid")!.replace("nav-pl:", ""))).toEqual(["general", "area/s1", "area/s2", "entregables", "registros", "preparar", "cambios"]);
    expect(tabOn("plan")).toBe(true);
    expect(tabOn("entregables")).toBe(false);
    expect(panelsVisible()).toEqual(["plan"]);
    // los entregables quedan «por definir»: la decisión pendiente no se enseña como insignia hasta que haya entregables definidos
    expect(tab("entregables").textContent).toBe("Entregables");
    await click(tab("entregables"));
    expect(tabOn("entregables")).toBe(true);
    expect(panelsVisible()).toEqual(["entregables"]);
    await click(host.querySelector("[data-testid='nav-pl:area/s1']"));
    expect(host.querySelector("[data-testid='nav-pl:area/s1']")!.getAttribute("aria-current")).toBe("page");
    expect(panelsVisible()).toEqual(["agenda"]);
  });

  it("recuerda la pestaña activa por plan y un enlace interno puede abrir otra", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    expect(useNavState.getState().values[`mentor.planTab.${PID}`]).toBe("entregables");
    act(() => root.unmount());
    root = createRoot(host);
    await mountEl(<PlanWorkspace planId={PID} />);
    expect(tabOn("entregables")).toBe(true);
    // enlace profundo interno
    const { openPlanTab } = await import("./planShared");
    await act(async () => { openPlanTab(PID, "cambios"); });
    await flush();
    expect(tabOn("cambios")).toBe(true);
    expect(useNavState.getState().values["mentor.view"]).toBe(`plan:${PID}`);
    // una pestaña recordada que ya no existe vuelve a «Mi plan»
    useNavState.getState().set(`mentor.planTab.${PID}`, "inventada");
    await flush();
    expect(tabOn("plan")).toBe(true);
  });

  it("el estado de la pestaña «Cambios» (texto a medias) sobrevive al cambiar de pestaña", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("cambios"));
    const ta = host.querySelector<HTMLTextAreaElement>("[data-testid=plan-changes] textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, "Hazlo más ligero");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(tab("plan"));
    await click(tab("cambios"));
    expect(host.querySelector<HTMLTextAreaElement>("[data-testid=plan-changes] textarea")!.value).toBe("Hazlo más ligero");
  });
});

describe("plan propuesto", () => {
  it("el banner «¿lo mantienes?» está en todas las pestañas y «Mantener plan» lo anuncia en la región aria-live", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const keep = vi.spyOn(api, "mentorPlanKeep").mockResolvedValue(plan({ proposed: false }));
    await mountEl(<PlanWorkspace planId={PID} />);
    for (const t of ["plan", "agenda", "entregables", "cambios"]) {
      await click(t === "agenda" ? host.querySelector("[data-testid='nav-pl:area/s1']") : tab(t));
      const bar = host.querySelector("[data-testid=plan-proposed-bar]")!;
      expect(bar).toBeTruthy();
      expect(bar.textContent).toContain("¿lo mantienes?");
      expect(button("Mantener plan", bar)).toBeTruthy();
      expect(button("Borrar", bar)).toBeTruthy();
    }
    const live = host.querySelector("[data-testid=plan-live]")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    await click(button("Mantener plan", host.querySelector("[data-testid=plan-proposed-bar]")!));
    expect(keep).toHaveBeenCalledWith(PID);
    expect(live.textContent).toContain("Plan mantenido");
  });

  it("«Borrar» pide confirmación y manda el plan a la papelera", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const del = vi.spyOn(api, "mentorPlanDelete").mockResolvedValue({ id: PID, plans: [] });
    ui.confirmAction.mockResolvedValue(true);
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(button("Borrar", host.querySelector("[data-testid=plan-proposed-bar]")!));
    expect(ui.confirmAction).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(PID);
  });

  it("la Agenda de un plan propuesto muestra su propia semana (no la de los planes activos) y no ofrece «Planear mi día»", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("agenda"));
    const week = host.querySelector("[data-testid=agenda-week]")!;
    expect(week.querySelector("h2")!.textContent).toContain("Semana 1");
    expect(week.textContent).toContain("1.1 What programming is");
    expect(host.querySelector("[data-testid=plan-this-week]")).toBeNull();
    await click(navView(host, "dia"));
    expect(button("Planear mi día con esto")).toBeUndefined();
  });

  it("«Preguntar o ajustar» está siempre visible junto a las pestañas: abre «Cambios» y deja el cursor en el cuadro", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    for (const t of ["plan", "agenda", "entregables"]) {
      await click(tab(t));
      const ask = host.querySelector<HTMLButtonElement>("[data-testid=plan-ask-changes]")!;
      expect(ask.textContent).toContain("Preguntar o ajustar");
      expect(ask.closest("[data-testid=plan-sticky]")).toBeTruthy();
    }
    await click(host.querySelector("[data-testid=plan-ask-changes]"));
    expect(tabOn("cambios")).toBe(true);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 5)); });
    expect(document.activeElement).toBe(host.querySelector("[data-testid=plan-changes] textarea"));
  });
});

describe("pestaña «Entregables» sin entregables definidos", () => {
  it("dice «Aún sin definir» y no ofrece elegir ni «a discutir» aunque el plan tenga decisiones antiguas pendientes", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    const pend = host.querySelector("[data-testid=plan-deliverables-pending]")!;
    expect(pend).toBeTruthy();
    expect(pend.textContent).toContain("Aún sin definir");
    expect(host.querySelector("[data-testid=plan-deliverables-pending-text]")!.textContent).toBe("Aún sin definir: se definen al ejecutar el plan (o puedes pedirlos en «Preguntas y ajustes»).");
    expect(host.querySelector("[data-testid=plan-open-questions]")).toBeNull();
    expect(host.querySelector("[data-testid=plan-open-question]")).toBeNull();
    expect(button("Añadir a todos")).toBeUndefined();
    expect(button("Decidir después")).toBeUndefined();
    expect(host.querySelector("[data-testid=plan-deliverables-agenda]")).toBeNull();
    // ofrece pedirlos en «Preguntas y ajustes»
    await click(host.querySelector("[data-testid=plan-deliverables-ask]"));
    expect(tabOn("cambios")).toBe(true);
  });
});

describe("pestaña «Entregables»: acciones masivas", () => {
  it("una fila por subplan con su nombre; «Añadir entregable» y «No lo quiero» responden a ese subplan", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" })));
    const ans = vi.spyOn(api, "mentorPlanAnswer").mockResolvedValue(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" }));
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    const rows = host.querySelectorAll("[data-testid=plan-open-question]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Reforzar bases");
    expect(rows[0]!.textContent).toContain("Fundamentals");
    await click(button("Añadir entregable a Reforzar bases", rows[0]!));
    expect(ans).toHaveBeenLastCalledWith({ id: PID, subplanId: "s1", answer: "yes" });
    await click(button("No quiero entregable en Consolidar Python", rows[1]!));
    expect(ans).toHaveBeenLastCalledWith({ id: PID, subplanId: "s2", answer: "no" });
  });

  it("«Añadir a todos» confirma y responde «sí» en cada subplan pendiente", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" })));
    const ans = vi.spyOn(api, "mentorPlanAnswer").mockResolvedValue(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" }));
    ui.confirmAction.mockResolvedValue(true);
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    await click(button("Añadir a todos"));
    expect(ui.confirmAction).toHaveBeenCalledTimes(1);
    expect(ans.mock.calls.map((c) => c[0])).toEqual([
      { id: PID, subplanId: "s1", answer: "yes" },
      { id: PID, subplanId: "s2", answer: "yes" },
    ]);
    expect(host.querySelector("[data-testid=plan-live]")!.textContent).toContain("Se añadió un entregable a 2 subplanes");
  });

  it("«No quiero ninguno» responde «no» en todos; si no se confirma no se llama a nada", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" })));
    const ans = vi.spyOn(api, "mentorPlanAnswer").mockResolvedValue(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" }));
    ui.confirmAction.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    await click(button("No quiero ninguno"));
    expect(ans).not.toHaveBeenCalled();
    await click(button("No quiero ninguno"));
    expect(ans.mock.calls.map((c) => c[0].answer)).toEqual(["no", "no"]);
  });

  it("«Decidir después» no escribe nada: pliega la lista y deja pendientes las decisiones", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" })));
    const ans = vi.spyOn(api, "mentorPlanAnswer").mockResolvedValue(plan({ deliverablesDefinedAt: "2026-10-07T00:00:00Z" }));
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    await click(button("Decidir después"));
    expect(ans).not.toHaveBeenCalled();
    expect(host.querySelectorAll("[data-testid=plan-open-question]")).toHaveLength(0);
    expect(host.querySelector("[data-testid=plan-open-deferred]")!.textContent).toContain("Lo decidirás después");
    expect(host.querySelector("[data-testid=plan-live]")!.textContent).toContain("2 decisiones pendientes");
    await click(button("Revisar las 2 decisiones"));
    expect(host.querySelectorAll("[data-testid=plan-open-question]")).toHaveLength(2);
  });

  it("lista los entregables ya definidos con estado, criterios y enlace al proyecto", async () => {
    const withDel = plan({
      openQuestions: [],
      subplans: [sub("s1", "Reforzar bases", F1, { deliverable: { title: "API de inventario", description: "CRUD con tests", criteria: ["CRUD completo"], projectId: "p1", status: "en_curso" } })] as never,
    });
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue({ ...(loaded(withDel) as Extract<MentorPlanGet, { loading: false }>), projects: { p1: { id: "p1", name: "Inventario", status: "En curso" } } });
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("entregables"));
    const card = host.querySelector("[data-testid=plan-deliverable-card]")!;
    expect(card.textContent).toContain("API de inventario");
    expect(card.textContent).toContain("En curso");
    expect(card.textContent).toContain("CRUD completo");
    expect(button("Abrir en Proyectos: Inventario", card)).toBeTruthy();
    expect(host.querySelector("[data-testid=plan-open-questions]")).toBeNull();
    // el estado NO se edita: se calcula solo (el proyecto de área sale en «Otros entregables», en solo lectura)
    const row = [...host.querySelectorAll("[data-testid=deliverable-row]")].find((r) => r.textContent?.includes("API de inventario"))!;
    expect(row.querySelector("select")).toBeNull();
    expect(row.textContent).toContain("Proyecto de área");
  });
});

describe("pestaña «Preguntas y ajustes»: sugerencias", () => {
  it("los chips rellenan el cuadro (acumulan si ya hay texto) sin enviar nada", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const change = vi.spyOn(api, "mentorPlanChange");
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("cambios"));
    const box = host.querySelector("[data-testid=plan-changes]")!;
    const chips = [...box.querySelectorAll("[data-testid=change-suggestions] button")];
    expect(chips.map((c) => c.textContent)).toEqual(["¿Por qué este orden?", "¿Qué toca esta semana?", "Más SQL antes del backend", "Pasa el frontend a la semana 10", "Quita lo de desktop", "Añade un entregable al área de Backend", "Pasa el lenguaje Python a Automation", "Hazlo más ligero"]);
    const ta = box.querySelector<HTMLTextAreaElement>("textarea")!;
    await click(chips[4]!);
    expect(ta.value).toBe("Quita lo de desktop");
    await click(chips[7]!);
    expect(ta.value).toBe("Quita lo de desktop\nHazlo más ligero");
    expect(change).not.toHaveBeenCalled();
    expect(button("Aplicar cambios", box).hasAttribute("disabled")).toBe(false);
  });

  it("al aplicar cambios se anuncia en la región aria-live", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const entry = { n: 1, at: "2026-10-06T10:00:00Z", comment: "Quita lo de desktop", status: "applied" as const, source: "ai" as const, summary: "Quité Desktop.", delta: { added: 0, removed: 4, moved: 0, deliverables: 0 }, changed: [], warnings: [], fixOptions: [] };
    vi.spyOn(api, "mentorPlanChange").mockResolvedValue({ loading: false, applied: true, plan: plan(), history: [entry], entry });
    await mountEl(<PlanWorkspace planId={PID} />);
    await click(tab("cambios"));
    await click([...host.querySelectorAll("[data-testid=change-suggestions] button")][4]!);
    await click(button("Aplicar cambios"));
    expect(host.querySelector("[data-testid=plan-live]")!.textContent).toContain("Cambios aplicados: −4 temas");
  });
});

describe("estructura accesible", () => {
  it("«Saltar al contenido» es el primer elemento enfocable y lleva el foco al contenido", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    const link = host.querySelector<HTMLAnchorElement>("[data-testid=plan-view] a[href='#plan-content']")!;
    expect(link.textContent).toBe("Saltar al contenido");
    expect(host.querySelector("[data-testid=plan-view]")!.querySelector("a,button")).toBe(link);
    await click(link);
    expect(document.activeElement).toBe(host.querySelector("#plan-content"));
  });

  it("un solo h1 y los encabezados nunca saltan de nivel; las regiones tienen nombre", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    for (const t of ["plan", "agenda", "entregables", "cambios"]) {
      await click(t === "agenda" ? host.querySelector("[data-testid='nav-pl:area/s1']") : tab(t));
      const hs = [...host.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => !h.closest("[hidden]"));
      expect(hs.filter((h) => h.tagName === "H1")).toHaveLength(1);
      let prev = 0;
      for (const h of hs) {
        const lvl = Number(h.tagName[1]);
        expect(lvl - prev, `${t}: «${h.textContent}» salta de h${prev} a h${lvl}`).toBeLessThanOrEqual(1);
        prev = lvl;
      }
    }
    for (const r of host.querySelectorAll("section")) {
      expect(r.getAttribute("aria-label") || r.getAttribute("aria-labelledby"), `sección sin nombre: ${r.outerHTML.slice(0, 80)}`).toBeTruthy();
    }
    expect(host.querySelector("aside nav[aria-label='Mentor']")).toBeTruthy();
  });

  it("los datos clave son una lista de definiciones y los días activos se leen completos", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("datos");
    const dl = host.querySelector("[data-testid=plan-preconditions] dl")!;
    expect([...dl.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(expect.arrayContaining(["Periodo", "Dedicación", "Días activos", "Ritmo", "Entregables"]));
    expect(dl.textContent).toContain("7 h/día");
    expect(dl.textContent).toContain("Por definir");
    expect(dl.querySelector("ul[aria-label='Días de estudio']")!.querySelectorAll(".sr-only")).toHaveLength(7);
  });

  it("los desplegables llevan aria-expanded + aria-controls y la barra de progreso un nombre", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("areas");
    const toggle = button("Reforzar bases")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(`#${toggle.getAttribute("aria-controls")}`)).toBeTruthy();
    for (const p of host.querySelectorAll("[role=progressbar]")) expect(p.getAttribute("aria-label")).toBeTruthy();
    await section("resumen");
    expect(host.querySelector("[role=progressbar][aria-label='Avance global del plan']")).toBeTruthy();
  });

  it("no hay métricas inventadas (solo datos reales del plan)", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<PlanWorkspace planId={PID} />);
    for (const t of ["plan", "agenda", "entregables", "cambios"]) {
      await click(t === "agenda" ? host.querySelector("[data-testid='nav-pl:area/s1']") : tab(t));
      for (const fake of ["Auditoría IA", "Mentor IA", "Latencia IA", "Sistemas operativos", "CM-8842", "sub-hitos", "Factibilidad"]) expect(host.textContent).not.toContain(fake);
    }
  });

  it("«Añadir Desktop Apps y Mobile» pide el cambio al Mentor y lleva a la pestaña «Cambios»", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const change = vi.spyOn(api, "mentorPlanChange").mockImplementation(() => new Promise(() => undefined));
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("alcance");
    const excl = host.querySelector("[data-testid=plan-branch-note]")!;
    expect(excl.querySelector("h2")!.textContent).toBe("Exclusiones del alcance");
    await click(button("Añadir Desktop Apps (Electron) y Mobile", excl));
    expect(change).toHaveBeenCalledWith({ id: PID, comment: "Añade las ramas excluidas: Desktop Apps (Electron), Mobile" });
    expect(tabOn("cambios")).toBe(true);
    expect(host.querySelector("[data-testid=plan-changes] [data-testid=ai-thinking]")).toBeTruthy();
  });

  it("los subplanes pintan los temas por tandas con «Mostrar N más»", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ folder: `Programación/Tema ${i + 1}`, title: `Tema ${i + 1}`, targetWeek: 1, estMinutes: 30 }));
    const p = plan({ openQuestions: [], subplans: [{ ...sub("s1", "Muchos temas", F1), topics: many, weeks: [week(1, many.map((t) => t.folder))] }] as never });
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(p));
    await mountEl(<PlanWorkspace planId={PID} />);
    await section("areas");
    await click(button("Muchos temas"));
    expect(host.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(15);
    await click(button("Mostrar 15 más"));
    expect(host.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(30);
    await click(button("Mostrar 10 más"));
    expect(host.querySelectorAll("[data-testid=plan-topic]")).toHaveLength(40);
    expect(button("Mostrar")).toBeUndefined();
  });
});
