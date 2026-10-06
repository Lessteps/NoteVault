// @vitest-environment jsdom
//
// Mentor — formulario de precondiciones del plan: periodo (presets + personalizado), tiempo diario 1–8 h + libre,
// días de estudio, fechas bloqueadas, metas/materias, nivel por área, ritmo y entregables; cálculo en vivo de la
// capacidad y de lo pendiente; «Generar plan» y la persistencia de los últimos valores.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { addDays } from "../../lib/planTime";
import type { MentorPlanOptions } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { PlanForm, PLAN_PRE_KEY } from "./PlanForm";

const two = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;

const options = (over: Partial<Extract<MentorPlanOptions, { loading: false }>> = {}): MentorPlanOptions => ({
  loading: false,
  today: TODAY,
  aiConfigured: true,
  goals: [
    { id: "g1", name: "Desarrollo Backend", area: "", end: addDays(TODAY, 45), topics: 3, minutes: 180 },
    { id: "g2", name: "Meta sin temas", area: "", end: null, topics: 0, minutes: 0 },
  ],
  areas: [
    { id: "Programación", name: "Programación", total: 4, pending: 4, minutes: 240 },
    { id: "Matemáticas", name: "Matemáticas", total: 2, pending: 2, minutes: 120 },
  ],
  topics: [
    { folder: "Programación/A", area: "Programación", minutes: 60, goalIds: ["g1"] },
    { folder: "Programación/B", area: "Programación", minutes: 60, goalIds: ["g1"] },
    { folder: "Programación/C", area: "Programación", minutes: 60, goalIds: ["g1"] },
    { folder: "Programación/D", area: "Programación", minutes: 60, goalIds: [] },
    { folder: "Matemáticas/A", area: "Matemáticas", minutes: 60, goalIds: [] },
    { folder: "Matemáticas/B", area: "Matemáticas", minutes: 60, goalIds: [] },
  ],
  ...over,
});

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

const flush = () => act(async () => { await Promise.resolve(); });
const mountForm = async () => { await act(async () => { root.render(<PlanForm onClose={onClose} />); }); await flush(); await flush(); };
const group = (label: string) => host.querySelector(`[role=group][aria-label='${label}']`)!;
const chip = (g: string, text: string | RegExp) =>
  [...group(g).querySelectorAll("button")].find((b) => (typeof text === "string" ? b.textContent?.trim() === text || b.textContent?.includes(text) : text.test(b.textContent ?? "")))!;
const pressed = (el: Element) => el.getAttribute("aria-pressed") === "true";
const click = async (el: Element | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const setValue = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
};
const byLabel = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label='${label}']`)!;
const capacity = () => host.querySelector("[data-testid=plan-capacity]")!.textContent!;
const generateBtn = () => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Generar plan"))! as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  onClose.mockReset();
  useNavState.setState({ values: {} });
  useMentor.setState({ generatingPlan: false, planVersion: 0, turns: [], pending: null });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanOptions").mockResolvedValue(options());
  vi.spyOn(api, "mentorChatLoad").mockResolvedValue({ turns: [], pending: null });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("PlanForm — precondiciones", () => {
  it("vacío: valores por defecto, periodo de 1 mes desde hoy, chips 1–8 h, lunes a sábado y las metas con temas", async () => {
    await mountForm();
    expect(host.querySelector("[data-testid=plan-form]")).toBeTruthy();
    // periodo
    expect(["1 semana", "2 semanas", "1 mes", "2 meses", "3 meses", "6 meses", "Personalizado"].map((t) => !!chip("Periodo del plan", t))).toEqual(Array(7).fill(true));
    expect(pressed(chip("Periodo del plan", "1 mes"))).toBe(true);
    expect(byLabel("Inicio del plan").value).toBe(TODAY);
    expect(host.querySelector("[data-testid=plan-period-summary]")!.textContent).toMatch(/^Del .+ – .+ · 4,\d semanas/);
    // tiempo diario: 1 h … 8 h
    const times = [...group("Tiempo diario").querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(times).toEqual(["1 h", "2 h", "3 h", "4 h", "5 h", "6 h", "7 h", "8 h"]);
    expect(pressed(chip("Tiempo diario", "2 h"))).toBe(true);
    // días
    const days = [...group("Días de estudio").querySelectorAll("button")];
    expect(days.map((d) => d.textContent)).toEqual(["L", "M", "X", "J", "V", "S", "D"]);
    expect(days.map(pressed)).toEqual([true, true, true, true, true, true, false]);
    // metas: solo la que tiene temas queda elegida
    expect(pressed(chip("Metas", "Desarrollo Backend"))).toBe(true);
    expect(pressed(chip("Metas", "Meta sin temas"))).toBe(false);
    expect(chip("Metas", "Desarrollo Backend").textContent).toContain("3 temas");
    expect(pressed(chip("Ritmo", "Normal"))).toBe(true);
    expect((host.querySelector("input[aria-label='Incluir entregables']") as HTMLInputElement).checked).toBe(true);
    expect(generateBtn().disabled).toBe(false);
  });

  it("los presets mueven el fin; el personalizado deja elegir inicio y fin", async () => {
    await mountForm();
    await click(chip("Periodo del plan", "2 semanas"));
    expect(byLabel("Fin del plan").value).toBe(addDays(TODAY, 13));
    expect(host.querySelector("[data-testid=plan-period-summary]")!.textContent).toContain("2 semanas");
    await click(chip("Periodo del plan", "1 semana"));
    expect(byLabel("Fin del plan").value).toBe(addDays(TODAY, 6));
    await click(chip("Periodo del plan", "6 meses"));
    expect(host.querySelector("[data-testid=plan-period-summary]")!.textContent).toContain("26 semanas");
    await setValue(byLabel("Fin del plan"), addDays(TODAY, 20));
    expect(pressed(chip("Periodo del plan", "Personalizado"))).toBe(true);
    expect(host.querySelector("[data-testid=plan-period-summary]")!.textContent).toContain("3 semanas");
    // «hasta el final de la meta»
    await click([...host.querySelectorAll("[aria-label='Hasta una meta'] button")][0]);
    expect(byLabel("Fin del plan").value).toBe(addDays(TODAY, 45));
  });

  it("un fin anterior al inicio lo avisa y no deja generar", async () => {
    await mountForm();
    await setValue(byLabel("Fin del plan"), addDays(TODAY, -3));
    expect(capacity()).toContain("anterior");
    expect(generateBtn().disabled).toBe(true);
  });

  it("el cálculo en vivo cambia con el tiempo diario (chips y libre en minutos), los días y el ritmo", async () => {
    await mountForm();
    await click(chip("Periodo del plan", "1 semana"));
    const base = capacity();
    expect(base).toContain("Capacidad total");
    expect(base).toMatch(/\d+ días de estudio × 2 h × 85 %/);
    await click(chip("Tiempo diario", "4 h"));
    expect(capacity()).toContain("× 4 h ×");
    expect(pressed(chip("Tiempo diario", "4 h"))).toBe(true);
    await setValue(byLabel("Tiempo diario libre en minutos"), "90");
    expect(capacity()).toContain("× 1,5 h ×");
    expect([...group("Tiempo diario").querySelectorAll("button")].some(pressed)).toBe(false);
    await click(chip("Ritmo", "Suave"));
    expect(capacity()).toContain("× 70 %");
    await click(chip("Ritmo", "Intenso"));
    expect(capacity()).toContain("× 100 %");
  });

  it("los días de estudio se marcan y desmarcan, pero siempre queda al menos uno", async () => {
    await mountForm();
    await click(chip("Periodo del plan", "1 semana"));
    const before = capacity();
    await click(chip("Días de estudio", "S"));
    expect(pressed(chip("Días de estudio", "S"))).toBe(false);
    expect(capacity()).not.toBe(before);
    await click(chip("Días de estudio", "D"));
    expect(pressed(chip("Días de estudio", "D"))).toBe(true);
    for (const d of ["L", "M", "X", "J", "V", "D"]) await click(chip("Días de estudio", d));
    expect([...group("Días de estudio").querySelectorAll("button")].filter(pressed)).toHaveLength(1);
  });

  it("las fechas bloqueadas (un rango) se añaden, restan capacidad y se pueden quitar", async () => {
    await mountForm();
    await click(chip("Periodo del plan", "2 semanas"));
    const before = capacity();
    await setValue(byLabel("Bloquear desde"), addDays(TODAY, 1));
    await setValue(byLabel("Bloquear hasta"), addDays(TODAY, 3));
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Bloquear"));
    const chips = host.querySelectorAll("[aria-label='Fechas bloqueadas'] button");
    expect(chips).toHaveLength(3);
    expect(capacity()).not.toBe(before);
    await click(chips[0]);
    expect(host.querySelectorAll("[aria-label='Fechas bloqueadas'] button")).toHaveLength(2);
  });

  it("qué cubrir: metas y materias; lo pendiente se cuenta sin repetir temas y avisa si sobra o falta tiempo", async () => {
    await mountForm();
    await click(chip("Periodo del plan", "1 semana"));
    // solo la meta: 3 temas, 3 h
    expect(capacity()).toContain("3 temas · ~3 h");
    expect(host.querySelector("[data-testid=plan-coverage]")!.textContent).toContain("sobran");
    // + la materia Programación (4 temas, 3 de ellos ya de la meta): 4 temas, no 7
    await click(chip("Materias", "Programación"));
    expect(capacity()).toContain("4 temas · ~4 h");
    await click(chip("Materias", "Matemáticas"));
    expect(capacity()).toContain("6 temas · ~6 h");
    // poco tiempo: 5 min al día no cabe
    await setValue(byLabel("Tiempo diario libre en minutos"), "5");
    expect(host.querySelector("[data-testid=plan-coverage]")!.textContent).toContain("faltan");
    expect(host.querySelector("[data-testid=plan-coverage]")!.className).toContain("text-warn");
  });

  it("nivel por área: aparece para las áreas elegidas y 'No sé' queda marcado", async () => {
    await mountForm();
    expect(group("Nivel en Programación")).toBeTruthy(); // por la meta elegida
    expect(host.querySelector("[role=group][aria-label='Nivel en Matemáticas']")).toBeNull();
    await click(chip("Materias", "Matemáticas"));
    const g = "Nivel en Matemáticas";
    expect([...group(g).querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Empezando", "Básico", "Intermedio", "Avanzado", "No sé (proponme un diagnóstico)"]);
    await click(chip(g, "No sé"));
    expect(pressed(chip(g, "No sé"))).toBe(true);
    await click(chip(g, "Avanzado"));
    expect(pressed(chip(g, "No sé"))).toBe(false);
    await click(chip(g, "Avanzado")); // volver a pulsar lo quita
    expect([...group(g).querySelectorAll("button")].some(pressed)).toBe(false);
  });

  it("sin nada elegido no deja generar y lo explica", async () => {
    await mountForm();
    await click(chip("Metas", "Desarrollo Backend"));
    expect(generateBtn().disabled).toBe(true);
    expect(capacity()).toContain("Elige qué quieres cubrir");
    await setValue(host.querySelector<HTMLInputElement>("input[placeholder^='Ej.: cerrar']")!, "repasar límites");
    expect(generateBtn().disabled).toBe(false);
  });

  it("Generar plan manda las precondiciones, guarda las últimas y deja el borrador en el resumen", async () => {
    const gen = vi.spyOn(api, "mentorPlanGenerate").mockResolvedValue({
      loading: false, kind: "plan_draft", source: "auto", text: "x", chatId: "c1", id: "c1", title: "t", pending: "a1", turns: [],
      planDraft: { month: "2026-10", hoursPerWeek: 6, rationale: "", subplans: [], warnings: [], fits: true, totalMinutes: 0, availableMinutes: 0, requiredHoursPerWeek: null, from: TODAY, discarded: [], why: {} },
    });
    await mountForm();
    await click(chip("Periodo del plan", "2 semanas"));
    await click(chip("Tiempo diario", "4 h"));
    await click(chip("Ritmo", "Suave"));
    await click(chip("Días de estudio", "S"));
    await click(chip("Materias", "Matemáticas"));
    await click(chip("Nivel en Matemáticas", "Básico"));
    await click(generateBtn());
    expect(gen).toHaveBeenCalledTimes(1);
    const pre = gen.mock.calls[0]![0];
    expect(pre).toMatchObject({
      start: TODAY,
      end: addDays(TODAY, 13),
      minutesPerDay: 240,
      studyDays: [1, 2, 3, 4, 5],
      pace: "suave",
      goalIds: ["g1"],
      subjects: ["Matemáticas"],
      levels: { Matemáticas: "basico" },
      deliverables: true,
    });
    const saved = JSON.parse(localStorage.getItem(PLAN_PRE_KEY)!);
    expect(saved).toMatchObject({ minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5], pace: "suave", preset: "2s", deliverables: true });
    expect(onClose).toHaveBeenCalled();
    expect(useNavState.getState().values["mentor.view"]).toBe("plan");
  });

  it("recuerda los últimos valores al abrirlo otra vez", async () => {
    localStorage.setItem(PLAN_PRE_KEY, JSON.stringify({ minutesPerDay: 90, studyDays: [2, 4], pace: "intenso", deliverables: false, preset: "3m" }));
    await mountForm();
    expect(pressed(chip("Periodo del plan", "3 meses"))).toBe(true);
    expect(pressed(chip("Ritmo", "Intenso"))).toBe(true);
    expect(byLabel("Tiempo diario libre en minutos").value).toBe("90");
    expect([...group("Días de estudio").querySelectorAll("button")].map(pressed)).toEqual([false, true, false, true, false, false, false]);
    expect((host.querySelector("input[aria-label='Incluir entregables']") as HTMLInputElement).checked).toBe(false);
  });

  it("sin IA lo dice y sin metas ni materias sigue funcionando", async () => {
    vi.spyOn(api, "mentorPlanOptions").mockResolvedValue(options({ aiConfigured: false, goals: [], areas: [], topics: [] }));
    await mountForm();
    expect(host.textContent).toContain("La IA no está configurada: se generará un plan automático");
    expect(host.textContent).toContain("No tienes metas activas con temas enlazados");
    expect(host.textContent).toContain("Aún no hay temas de estudio");
  });

  it("Cancelar y cerrar", async () => {
    await mountForm();
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Cancelar"));
    await click(host.querySelector("button[aria-label='Cerrar formulario']")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
