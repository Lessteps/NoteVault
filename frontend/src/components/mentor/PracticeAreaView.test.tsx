// @vitest-environment jsdom
//
// Mentor — Práctica, página de UN área: cabecera, aviso descartable, teoría de hoy (= el selector compartido de la Agenda), sistema + kata
// (rejilla de definición, plantilla copiable, pistas y solución ocultas hasta abrirlas), práctica de lenguaje, vault de ejercicios y progreso.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { deriveAreaPractice } from "../../lib/areaPracticeDerive";
import { api } from "../../lib/bridge";
import { weekRangesOf } from "../../lib/planTime";
import { clampToPlan } from "../../lib/planSchedule";
import { dayByArea } from "../../lib/planTopicsByArea";
import { buildPracticeTrack } from "../../lib/practiceTrack";
import type { MentorAreaPractice, MentorPlan as PlanData } from "../../lib/types";
import { useNavState } from "../../store/navState";
import { scheduleOf } from "./agendaKit";
import { PracticeRow } from "./PracticeCard";
import type { Loaded } from "./planShared";

const START = "2026-10-05";
const END = "2027-01-03";
const PID = `${START}_${END}`;
const TODAY = "2026-10-14";
const PRE = { start: START, end: END, minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "yes" as const, practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" as const } };
const WEEKS = weekRangesOf(START, END);
const mk = (branch: string, n: number, group: string, first: number, step: number) =>
  Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60, targetWeek: Math.min(WEEKS.length, first + Math.floor(i / step)), group }));
const slices = (topics: Array<{ folder: string; targetWeek: number }>) => WEEKS.map((w) => ({ week: w.week, start: w.start, end: w.end, topics: topics.filter((t) => t.targetWeek === w.week).map((t) => t.folder), minutes: 0, capacityMinutes: 0 }));
const be = [...mk("1 Fundamentals", 6, "bases", 1, 2), ...mk("2.1 Python", 5, "lang-python", 1, 2), ...mk("4 Backend", 8, "core", 1, 2)];
const PLAN = {
  id: PID, start: START, end: END, name: "Backend", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 20, preconditions: PRE, structure: "areas",
  programmingPractice: buildPracticeTrack(PRE as never),
  subplans: [{ id: "s1-backend", area: "Backend", areaId: "backend", objective: "Servicios", topics: be, weeks: slices(be), requiredGoals: [], phase: { fromWeek: 1, toWeek: 10 },
    groups: [{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "lang-python", title: "Lenguaje: Python", kind: "language", order: 10 }, { id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }] }],
} as unknown as PlanData;
const LOADED = {
  loading: false, today: TODAY, plan: PLAN, practice: null,
  derived: { subplans: [{ id: "s1-backend", total: be.length, done: 0, pct: 0, currentWeek: 1, topics: be.map((t) => ({ ...t, state: "sin_tratar", pct: 0, found: true, exercises: 24 })) }], summary: {} },
} as unknown as Loaded;

function areaData(): MentorAreaPractice {
  const areas = deriveAreaPractice({ plan: PLAN as never, today: TODAY, attempts: {}, marks: {}, existing: { folders: new Set(["backend"]), files: new Set<string>() } });
  const b = areas.find((a) => a.areaId === "backend")!;
  if (b.kata.next) b.kata.next.fileReady = true;
  return { today: TODAY, ppReady: true, ppBase: "Programación/programming_practice", areas };
}

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const q = (sel: string) => host.querySelector<HTMLElement>(`[data-testid=${sel}]`);

beforeEach(async () => {
  localStorage.clear();
  useNavState.setState({ values: { [`mentor.practiceArea.${PID}`]: "backend" } });
  vi.spyOn(api, "mentorAreaPractice").mockResolvedValue(areaData());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const track = PLAN.programmingPractice!;
  await act(async () => { root.render(<PracticeRow track={track} status={null} today={TODAY} planId={PID} plan={PLAN} loaded={LOADED} />); });
  await flush(); await flush(); await flush();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("página individual de un área", () => {
  it("cabecera, aviso descartable y secciones en orden", () => {
    expect(q("area-page-title")!.textContent).toMatch(/^Backend · \d+ temas y práctica$/);
    expect(q("area-page-meta")!.textContent).toMatch(/h estimadas · \d+ colecciones en tu vault · kata/);
    expect(q("area-tip")!.textContent).toContain("Ruta de aprendizaje activa");
    const labels = [...host.querySelectorAll("[data-testid=practice-area-view] h4")].map((h) => h.textContent!.replace(/\s+/g, " ").toUpperCase());
    expect(labels[0]).toMatch(/^TEORÍA DE BACKEND/);
    expect(labels.some((l) => l.startsWith("PRÁCTICA DE BACKEND"))).toBe(true);
    expect(labels.some((l) => /^VAULT DE EJERCICIOS · \d+ RETOS?$/.test(l))).toBe(true);
    expect(q("area-session-progress")!.textContent).toMatch(/Progreso de sesión: 0 de \d+ completados/);
  });

  it("el aviso se cierra con un botón con nombre", async () => {
    const close = q("area-tip-close")!;
    expect(close.getAttribute("aria-label")).toContain("Ruta de aprendizaje activa");
    await click(close);
    expect(q("area-tip")).toBeNull();
  });

  it("los temas de teoría de hoy son EXACTAMENTE los del selector compartido (dayByArea)", () => {
    const { schedule } = scheduleOf(PLAN as never, TODAY, []);
    const day = schedule.byDate.get(clampToPlan(TODAY, PLAN as never))!;
    const entry = dayByArea(PLAN as never, day, []).find((e) => e.areaId === "backend")!;
    const expected = [...new Map((entry.blocks ?? []).filter((b) => b.kind === "theory").flatMap((b) => b.items).map((i) => [`${i.folder}:${i.part}`, i.folder] as const)).values()];
    expect(expected.length).toBeGreaterThan(0);
    const got = [...host.querySelectorAll("[data-testid=area-theory-row]")].map((r) => r.getAttribute("data-folder"));
    expect(got).toEqual(expected);
    const first = host.querySelector("[data-testid=area-theory-row]")!;
    expect(first.textContent).toContain("Sin tratar");
    expect(first.textContent).toContain("Backend");
    expect(first.querySelector("button")!.getAttribute("aria-label")).toMatch(/^Ver tema: /);
  });

  it("kata de hoy: rejilla Context / Task / Deliverable / Time box, plantilla copiable y acciones", async () => {
    const kata = q("area-kata")!;
    expect(kata.querySelector("h5")!.textContent).toContain("Kata de Backend de hoy: ");
    const terms = [...kata.querySelectorAll("[data-testid=area-kata-def-row] dt")].map((d) => d.textContent!.replace(/\s*\(.*\)/, ""));
    expect(terms).toEqual(["Context", "Task", "Deliverable", "Time box"]);
    expect(kata.textContent).toContain("Nivel 1");
    expect(kata.querySelector("[data-testid=area-kata-template] pre")!.textContent).toContain("TODO: your answer");
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    await click(q("area-kata-copy"));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Checklist"));
    expect(kata.textContent).toContain("Copiada");
    expect(q("area-kata-open")!.textContent).toContain("Abrir Kata");
    expect(q("area-kata-done")!.textContent).toContain("Marcar como lista");
  });

  it("pistas y solución ocultas hasta abrirlas", async () => {
    expect(q("area-kata-help")).toBeNull();
    expect(q("area-kata-solution")).toBeNull();
    const t = q("area-kata-help-toggle")!;
    expect(t.getAttribute("aria-expanded")).toBe("false");
    await click(t);
    expect(q("area-kata-help")!.querySelectorAll("ol li").length).toBeGreaterThan(0);
    expect(q("area-kata-solution")).toBeNull();
    await click(q("area-kata-solution-toggle"));
    expect(q("area-kata-solution")!.textContent!.length).toBeGreaterThan(10);
  });

  it("sistema de práctica plegable con «Ver arquitectura de tests»", async () => {
    expect(q("area-arch")).toBeNull();
    await click(q("area-system-toggle"));
    await click(q("area-arch-toggle"));
    expect(q("area-arch")!.textContent).toContain("katas/");
  });

  it("vault de ejercicios: una fila por tema con su cuenta y «Abrir ejercicios»", () => {
    const heads = [...host.querySelectorAll("[data-testid=area-language-table] th[scope=col]")].map((h) => h.textContent);
    if (heads.length) expect(heads).toEqual(["Tema", "Módulo", "Progreso", "Tiempo", "Estado", "Acción"]);
    const rows = [...host.querySelectorAll("[data-testid=area-vault-row]")];
    expect(rows.length).toBe(host.querySelectorAll("[data-testid=area-theory-row]").length);
    expect(rows[0]!.textContent).toContain("Haz los ejercicios del tema «");
    expect(rows[0]!.textContent).toContain("24 en tu vault");
    expect(rows[0]!.textContent).toContain("Abrir ejercicios");
  });
});
