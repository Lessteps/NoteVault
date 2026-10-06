// @vitest-environment jsdom
//
// Hoy: el tiempo diario que declara el plan activo se SUGIERE (pre-rellena el selector), sin forzarlo.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorOverview } from "../../lib/types";
import { MentorToday } from "./MentorToday";

const overview = (minutesPerDay: number | null): MentorOverview => ({
  loading: false,
  date: "2026-10-12",
  weekday: "lunes",
  sections: [],
  adherence: { sessions: 0, overall: { total: 0, done: 0, partial: 0, skipped: 0, planned: 0, pct: null }, bySubject: {}, byKind: {}, skippedSubjects: [], typicalSessionMinutes: null },
  today: null,
  aiConfigured: true,
  objectives: { goals: [], subjects: [], tasksPending: 0, plan: minutesPerDay === null ? null : { month: "2026-10", id: "p", start: "2026-10-06", end: "2026-11-05", items: 2, minutesPerDay } },
});

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mount = async () => { await act(async () => { root.render(<MentorToday />); }); await flush(); await flush(); };
const chip = (text: string) => [...host.querySelectorAll("[role=group][aria-label='Tiempo disponible'] button")].find((b) => b.textContent?.trim() === text)!;
const pressed = (el: Element) => el.getAttribute("aria-pressed") === "true";

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Hoy: tiempo sugerido por el plan activo", () => {
  it("si el plan activo declara 4 h/día, Hoy sugiere 4 h (aunque lo último guardado fuera otro tiempo)", async () => {
    localStorage.setItem("nv.mentor.minutes", "60");
    vi.spyOn(api, "mentorOverview").mockResolvedValue(overview(240));
    await mount();
    expect(pressed(chip("4 h"))).toBe(true);
    expect(pressed(chip("1 h"))).toBe(false);
    expect(host.querySelector("[data-testid=plan-time-hint]")!.textContent).toContain("4 h/día");
  });

  it("un tiempo que no es un chip va al campo libre", async () => {
    vi.spyOn(api, "mentorOverview").mockResolvedValue(overview(90));
    await mount();
    expect([...host.querySelectorAll("[role=group][aria-label='Tiempo disponible'] button")].some(pressed)).toBe(false);
    expect(host.querySelector<HTMLInputElement>("input[type=number]")!.value).toBe("90");
  });

  it("sin forzarlo: lo que el estudiante elige antes de que cargue el plan se respeta", async () => {
    let release: (o: MentorOverview) => void = () => {};
    vi.spyOn(api, "mentorOverview").mockReturnValue(new Promise((ok) => { release = ok; }));
    await mount();
    await act(async () => { chip("6 h").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { release(overview(240)); });
    await flush();
    expect(pressed(chip("6 h"))).toBe(true);
    expect(host.querySelector("[data-testid=plan-time-hint]")!.textContent).toContain("4 h/día");
  });

  it("sin plan activo no hay sugerencia", async () => {
    vi.spyOn(api, "mentorOverview").mockResolvedValue(overview(null));
    await mount();
    expect(host.querySelector("[data-testid=plan-time-hint]")).toBeNull();
    expect(pressed(chip("2 h"))).toBe(true);
  });
});

describe("Hoy: objetivo «Programming practice (kata + proyecto)»", () => {
  const withPractice = (items: number | null): MentorOverview => {
    const o = overview(120) as Extract<MentorOverview, { loading: false }>;
    return { ...o, objectives: { ...o.objectives!, programmingPractice: items === null ? null : { items } } };
  };
  const objectiveChip = (text: string) => [...host.querySelectorAll("[role=group][aria-label='Objetivo de la sesión'] button")].find((b) => b.textContent?.includes(text));

  it("aparece cuando un plan activo tiene práctica y se puede elegir", async () => {
    vi.spyOn(api, "mentorOverview").mockResolvedValue(withPractice(2));
    await mount();
    const c = objectiveChip("Programming practice (kata + proyecto)")!;
    expect(c).toBeTruthy();
    expect(c.getAttribute("title")).toContain("2 de hoy");
    await act(async () => { c.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(c.getAttribute("aria-pressed")).toBe("true");
  });

  it("sin práctica en los planes activos no hay chip", async () => {
    vi.spyOn(api, "mentorOverview").mockResolvedValue(withPractice(null));
    await mount();
    expect(objectiveChip("Programming practice")).toBeUndefined();
    expect(objectiveChip("Lo que toca de mis planes")).toBeTruthy();
  });
});
