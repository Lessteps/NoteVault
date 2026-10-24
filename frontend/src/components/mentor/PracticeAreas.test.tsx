// @vitest-environment jsdom
//
// Mentor — pestaña «Práctica» por área: resumen de Programming practice arriba, selector (pestañas WAI-ARIA) «Todas las áreas · Backend · Frontend…»,
// la vista de cada área (kata diario con seguimiento L–D, habilidades, proyecto de la semana, proyectos por semana y mensual), «Todas las áreas»
// con una tarjeta compacta por área, el estado «carpeta aún no creada» y la compatibilidad con planes sin áreas.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { deriveAreaPractice } from "../../lib/areaPracticeDerive";
import { api } from "../../lib/bridge";
import { buildPracticeTrack } from "../../lib/practiceTrack";
import type { MentorAreaPractice, MentorPracticeStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useNavState } from "../../store/navState";
import { usePracticeDialog } from "../practice/PracticeProjectDialog";
import { PracticeRow } from "./PracticeCard";

const START = "2026-10-05";
const END = "2026-11-29";
const PID = `${START}_${END}`;
const TODAY = "2026-10-08";
const pre = { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5], pace: "normal" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask" as const, practice: { kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 90, monthly: true, focus: "rotate" as const } };
const track = buildPracticeTrack(pre)!;
const KPLAN = { id: PID, start: START, end: END, programmingPractice: track, preconditions: { levels: { Programación: "basico" } }, subplans: [{ area: "Backend", areaId: "backend" }, { area: "Frontend", areaId: "frontend" }, { area: "Databases", areaId: "databases" }] };
const att = (area: string, ...dates: string[]) => ({ note_id: area, note_path: `Programación/programming_practice/${area}/katas/001 x.md`, attempts: dates.map((d) => ({ at: `${d}T10:00:00`, skill: "pp_kata", mode: "pp_kata", verdict: "correct", score: 90 })) });

/** Datos reales derivados (backend con carpeta y katas; frontend sin carpeta). */
function areaData(over: { marks?: Record<string, Record<string, "done" | "skipped">>; folders?: string[]; backendDays?: string[] } = {}): MentorAreaPractice {
  const folders = new Set(over.folders ?? ["backend"]);
  const files = new Set<string>();
  const areas = deriveAreaPractice({ plan: KPLAN as never, today: TODAY, attempts: { b: att("backend", ...(over.backendDays ?? ["2026-10-05", "2026-10-06"])) }, marks: over.marks ?? {}, existing: { folders, files } });
  // el kata de hoy de Backend ya tiene archivo
  const b = areas.find((a) => a.areaId === "backend")!;
  if (b.kata.next) b.kata.next.fileReady = true;
  return { today: TODAY, ppReady: true, ppBase: "Programación/programming_practice", areas };
}
const status: MentorPracticeStatus = { ppReady: true, kata: { plannedDays: 4, doneDays: 2, streak: 1, todayPlanned: true, todayDone: false }, weeks: [{ week: 1, phases: { build: "hecho", construct: "en_curso", defend: "pendiente", postmortem: "pendiente" }, current: true, source: "pp" }] };

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); await flush(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
  await flush();
};
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const areaTab = (id: string) => host.querySelector<HTMLButtonElement>(`#pr-area-tab-${id}`)!;
const mountRow = () => mountEl(<PracticeRow track={track} status={status} today={TODAY} planId={PID} onExecute={executeSpy} />);
const executeSpy = vi.fn();

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  usePracticeDialog.setState({ open: false });
  executeSpy.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("cabecera: resumen general de Programming practice", () => {
  it("explica qué es (entrevistas técnicas, lógica y resolución de procesos) y abre la práctica", async () => {
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue(areaData());
    await mountRow();
    const head = host.querySelector("[data-testid=practice-header]")!;
    expect(head.querySelector("#pr-title")!.textContent).toBe("Programming practice");
    const blurb = head.querySelector("[data-testid=practice-blurb]")!.textContent!;
    expect(blurb).toContain("práctica diaria");
    expect(blurb).toContain("entrevistas técnicas");
    expect(blurb).toContain("lógica");
    expect(blurb).toContain("resolución de procesos");
    expect(blurb).toContain("propia práctica diaria");
    // no inventa métricas: solo lo que el plan tiene
    expect(head.textContent).toContain("kata diario de 30 min");
    expect(head.textContent).toContain("3 áreas con katas propios");
    expect(head.textContent).not.toMatch(/Mentor IA activo|Fase 1/);
    await click(button("Abrir práctica", head));
    expect(usePracticeDialog.getState().open).toBe(true);
  });
});

describe("selector por área (pestañas WAI-ARIA)", () => {
  it("«Todas las áreas» + una pestaña por área del plan; la primera está seleccionada", async () => {
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue(areaData());
    await mountRow();
    const list = host.querySelector("[role=tablist][aria-label='Área de la práctica']")!;
    expect([...list.querySelectorAll("[role=tab]")].map((t) => t.getAttribute("aria-selected") === "true" ? `*${t.textContent}` : t.textContent)).toEqual(["*Todas las áreas", "Backend", "Frontend", "Databases"]);
    expect([...list.querySelectorAll("[role=tab]")].map((t) => (t as HTMLElement).tabIndex)).toEqual([0, -1, -1, -1]);
    for (const t of list.querySelectorAll("[role=tab]")) expect(host.querySelector(`#${t.getAttribute("aria-controls")}`)!.getAttribute("role")).toBe("tabpanel");
    // las flechas mueven la selección
    await act(async () => { areaTab("all").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    await flush();
    expect(areaTab("backend").getAttribute("aria-selected")).toBe("true");
    expect(useNavState.getState().values[`mentor.practiceArea.${PID}`]).toBe("backend");
  });

  it("«Todas las áreas»: una tarjeta compacta por área con su kata de hoy y su estado, y la pista general del plan", async () => {
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue(areaData());
    await mountRow();
    const all = host.querySelector("[data-testid=practice-all]")!;
    const cards = [...all.querySelectorAll("[data-testid=area-compact]")];
    expect(cards.map((c) => c.querySelector("h4")!.textContent)).toEqual(["Backend", "Frontend", "Databases"]);
    expect(cards[0]!.textContent).toContain("Kata de hoy");
    expect(cards[0]!.textContent).toContain("Hoy: pendiente");
    expect(cards[0]!.textContent).toContain("2/4 días hechos");
    expect(cards[0]!.textContent).toContain("Carpeta creada: programming_practice/backend/");
    // área sin carpeta: lo dice claro
    expect(cards[1]!.textContent).toContain("Carpeta aún no creada: se crea al ejecutar el plan.");
    expect(cards[2]!.textContent).toContain("Carpeta aún no creada");
    // la pista general (kata de lógica, proyecto de la semana, semanas, mensual) sigue estando
    expect(all.querySelector("[data-testid=practice-kata]")!.textContent).toContain("Kata de lógica · 30 min");
    expect(all.querySelector("[data-testid=practice-project]")!.textContent).toContain("Proyecto de la semana 1");
    expect(all.querySelector("[data-testid=practice-weeks]")).toBeTruthy();
    expect(all.querySelector("[data-testid=practice-monthly]")).toBeTruthy();
    // «Ver Frontend» cambia de pestaña
    await click(button("Ver la práctica de Frontend", cards[1]!));
    expect(areaTab("frontend").getAttribute("aria-selected")).toBe("true");
  });
});

describe("vista de un área", () => {
  const openBackend = async () => {
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue(areaData());
    useNavState.setState({ values: { [`mentor.practiceArea.${PID}`]: "backend" } });
    await mountRow();
    return host.querySelector("[data-testid=practice-area-view]")!;
  };

  it("kata diario del área: semana L–D con estados, hechos y racha, kata de hoy con enunciado y «Abrir kata»", async () => {
    const view = await openBackend();
    const kata = view.querySelector("[data-testid=area-kata]")!;
    expect(kata.textContent).toContain("Reto diario · Backend");
    expect(kata.querySelector("h3")!.textContent).toContain("Kata de hoy");
    const days = [...kata.querySelectorAll("[data-testid=area-kata-week] li")];
    expect(days).toHaveLength(7);
    expect(days.map((d) => /sin kata|hecho|saltado|pendiente/.exec(d.querySelector(".sr-only")!.textContent!)![0])).toEqual(["hecho", "hecho", "pendiente", "pendiente", "pendiente", "sin kata", "sin kata"]);
    expect(days[3]!.querySelector(".sr-only")!.textContent).toContain("hoy");
    expect(kata.querySelector("[data-testid=area-kata-count]")!.textContent).toBe("2/4 días hechos");
    expect(kata.textContent).toContain("racha 0"); // el miércoles no se hizo: la racha está cortada
    const today = kata.querySelector("[data-testid=area-kata-today]")!;
    expect(today.textContent).toContain("Principiante");
    expect(today.querySelector("[data-testid=area-kata-summary]")!.textContent!.length).toBeGreaterThan(20);
    const open = vi.spyOn(useApp.getState(), "openNote").mockResolvedValue(undefined);
    useApp.setState({ openNote: open });
    await click(kata.querySelector("[data-testid=area-kata-open]"));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^Programación\/programming_practice\/backend\/katas\/003 .+\.md$/));
    expect(kata.querySelector("[data-testid=area-folder-ready]")!.textContent).toContain("programming_practice/backend/");
  });

  it("habilidades clave con progreso real, proyecto de la semana con fases y sesiones, proyectos por semana y mensual", async () => {
    const view = await openBackend();
    const skills = [...view.querySelectorAll("[data-testid=area-skill]")];
    expect(skills.length).toBeGreaterThanOrEqual(5);
    expect(skills[0]!.textContent).toContain("Endpoint design");
    expect(skills[0]!.textContent).toContain("1/1 katas");
    expect(skills[0]!.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("100");
    expect(skills[2]!.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("0");
    expect(view.querySelector("[data-testid=area-skills]")!.textContent).toContain("Nivel actual: Principiante");
    const proj = view.querySelector("[data-testid=area-project]")!;
    expect(proj.textContent).toContain("Proyecto de la semana 1");
    expect(proj.textContent).toContain("Fases requeridas");
    expect(proj.textContent).toContain("Agenda de sesiones");
    for (const f of ["Especificación", "Construcción", "Defensa", "Postmortem"]) expect(proj.textContent).toContain(f);
    const weeks = [...view.querySelectorAll("[data-testid=area-weeks] ol > li")];
    expect(weeks.length).toBeGreaterThanOrEqual(8);
    expect(weeks[0]!.textContent).toContain("esta semana");
    expect(weeks[0]!.textContent).toContain("katas");
    const monthly = view.querySelector("[data-testid=area-monthly]")!;
    expect(monthly.textContent).toContain("Proyecto mensual");
    expect(monthly.querySelectorAll("ol[aria-label='Hitos del proyecto mensual'] > li").length).toBeGreaterThan(0);
  });

  it("«Marcar hecho» guarda la marca y la vista se actualiza con lo que devuelve la API", async () => {
    const mark = vi.spyOn(api, "mentorAreaKataMark").mockResolvedValue(areaData({ backendDays: ["2026-10-05", "2026-10-06", "2026-10-07"], marks: { backend: { [TODAY]: "done" } } }));
    const view = await openBackend();
    await click(view.querySelector("[data-testid=area-kata-done]"));
    expect(mark).toHaveBeenCalledWith(PID, "backend", TODAY, "done");
    const kata = host.querySelector("[data-testid=area-kata]")!;
    expect(kata.textContent).toContain("Hoy: hecho");
    expect(kata.querySelector("[data-testid=area-kata-done]")).toBeNull();
    // al estar hecho, el siguiente kata ya no es el de hoy: pasa a «Siguiente», no se adelanta solo
    expect(kata.querySelector("h3")!.textContent).toContain("Kata siguiente");
  });

  it("área sin carpeta: «Carpeta aún no creada: se crea al ejecutar el plan», sin «Abrir kata» y con acceso a «Ejecutar plan»", async () => {
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue(areaData());
    useNavState.setState({ values: { [`mentor.practiceArea.${PID}`]: "frontend" } });
    await mountRow();
    const kata = host.querySelector("[data-testid=area-kata]")!;
    const missing = kata.querySelector("[data-testid=area-folder-missing]")!;
    expect(missing.textContent).toContain("Carpeta aún no creada: se crea al ejecutar el plan.");
    expect(missing.textContent).toContain("programming_practice/frontend/");
    expect(kata.querySelector("[data-testid=area-kata-open]")).toBeNull();
    expect(kata.querySelector("[data-testid=area-kata-nofile]")).toBeTruthy();
    // el kata de hoy sigue visible (se deriva de la plantilla) aunque su archivo aún no exista
    expect(kata.querySelector("[data-testid=area-kata-today]")!.textContent).toContain("Component composition");
    await click(missing.querySelector("[data-testid=area-open-execution]"));
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("compatibilidad", () => {
  it("un plan sin áreas con sistema de práctica (o sin la API) muestra solo la pista general, sin selector", async () => {
    vi.spyOn(api, "mentorAreaPractice").mockResolvedValue({ today: TODAY, ppReady: false, ppBase: "", areas: [] });
    await mountRow();
    expect(host.querySelector("[role=tablist]")).toBeNull();
    expect(host.querySelector("[data-testid=practice-general] [data-testid=practice-kata]")).toBeTruthy();
    expect(host.querySelector("[data-testid=practice-header]")!.textContent).not.toContain("áreas con katas propios");
    act(() => root.unmount());
    root = createRoot(host);
    vi.spyOn(api, "mentorAreaPractice").mockRejectedValue(new Error("no disponible"));
    await mountRow();
    expect(host.querySelector("[data-testid=practice-kata]")).toBeTruthy();
    expect(host.querySelector("[role=alert]")!.textContent).toContain("no disponible");
  });
});
