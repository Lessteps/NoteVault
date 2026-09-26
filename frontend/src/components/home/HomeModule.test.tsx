// @vitest-environment jsdom

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HomeModule } from "./HomeModule";
import { api } from "../../lib/bridge";

describe("HomeModule", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    vi.spyOn(api, "homeOverview").mockResolvedValue({
      today: "2026-09-26",
      habits: [
        { id: "h1", name: "Tomar un vaso de agua", icon: "💧", done: false, subs: [0, 0] },
        { id: "h2", name: "Sin celular al despertar", icon: "📵", done: true, subs: [0, 0] },
      ],
      exercise: {
        day: "sabado",
        rows: [
          {
            id: "e1",
            name: "Towel / Barbell Hang",
            series_reps: "3 × 15-20 seg",
            how_to: "Agarre y descompresión escapular",
            entry: { done: false },
          },
        ],
      },
      tasks: {
        today: [{ id: "t1", name: "Revisar arquitectura", status: "Por hacer", subject: "Review", priority: 1, due: "2026-09-26", done: false }],
        overdue: [],
      },
      projects: {
        issues: [{ project: { id: "p1", name: "NoteVault", colour: "#8b7cf6", done_column: "Done", first_column: "Backlog" }, id: "i1", key: "NV-1", title: "Issue 1", due: "2026-09-26", done: false }],
        active: [{ id: "p1", name: "NoteVault", icon: "⚡", colour: "#8b7cf6", progress: 0.5 }],
      },
      finance: {
        day: { gasto: 0, ingreso: 0, ahorro: 0, retiro: 0, balance: 0 },
        month: { gasto: 100, ingreso: 500, ahorro: 100, retiro: 0, balance: 342000 },
        prev: { gasto: 80, ingreso: 400, ahorro: 50, retiro: 0, balance: 250000 },
        checks: [],
      },
      goals: {
        list: [{ id: "g1", name: "Maestría Código", icon: "🎯", colour: "#22d3ee", progress: 0.75 }],
        items: [],
        any: true,
      },
    });

    vi.spyOn(api, "habitsStats").mockResolvedValue({
      today: "2026-09-26",
      day: 1,
      week: 1,
      month: 1,
      year: 1,
      streak: 14,
      habits: {},
    });

    vi.spyOn(api, "habitsRange").mockResolvedValue([
      { date: "2026-09-21", active: ["h1"], done: ["h1"], pct: 100 },
      { date: "2026-09-22", active: ["h1"], done: ["h1"], pct: 100 },
      { date: "2026-09-23", active: ["h1"], done: ["h1"], pct: 100 },
      { date: "2026-09-24", active: ["h1"], done: ["h1"], pct: 100 },
      { date: "2026-09-25", active: ["h1"], done: ["h1"], pct: 100 },
      { date: "2026-09-26", active: ["h1", "h2"], done: ["h2"], pct: 50 },
      { date: "2026-09-27", active: [], done: [], pct: 0 },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.removeChild(container);
  });

  it("renders header, focus engine banner, stat cards, and panels", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<HomeModule />);
    });

    // Verify Title & Subtitle
    expect(container.textContent).toContain("Vista General");
    expect(container.textContent).toContain("Sprint v2.4");
    expect(container.textContent).toContain("NOTEVAULT FOCUS ENGINE");
    expect(container.textContent).toContain("14 Días de Racha activa");

    // Verify Stat Cards
    expect(container.textContent).toContain("HÁBITOS DE HOY");
    expect(container.textContent).toContain("EJERCICIO");
    expect(container.textContent).toContain("PROYECTOS");
    expect(container.textContent).toContain("TAREAS PARA HOY");
    expect(container.textContent).toContain("FINANZAS");

    // Verify Habit and Exercise Panels
    expect(container.textContent).toContain("Hábitos de hoy");
    expect(container.textContent).toContain("Tomar un vaso de agua");
    expect(container.textContent).toContain("Towel / Barbell Hang");

    // Verify Bottom Row Panels
    expect(container.textContent).toContain("Analítica Semanal");
    expect(container.textContent).toContain("Progreso de Objetivos");

    act(() => {
      root.unmount();
    });
  });

  it("toggles habit completion optimistically", async () => {
    const habitsSetDoneSpy = vi.spyOn(api, "habitsSetDone").mockResolvedValue({ ok: true, pct: 100 });
    const root = createRoot(container);
    await act(async () => {
      root.render(<HomeModule />);
    });

    // Find the button for "Tomar un vaso de agua"
    const habitButton = container.querySelector('button[aria-label="Tomar un vaso de agua"]') as HTMLButtonElement;
    expect(habitButton).not.toBeNull();

    await act(async () => {
      habitButton.click();
    });

    expect(habitsSetDoneSpy).toHaveBeenCalledWith("2026-09-26", "h1", true);

    act(() => {
      root.unmount();
    });
  });

  it("toggles exercise completion optimistically (A2)", async () => {
    const exMarkSpy = vi.spyOn(api, "exMark").mockResolvedValue({ ok: true, pct: 100 });
    const root = createRoot(container);
    await act(async () => {
      root.render(<HomeModule />);
    });

    const exButton = container.querySelector('button[aria-label="Towel / Barbell Hang"]') as HTMLButtonElement;
    expect(exButton).not.toBeNull();

    await act(async () => {
      exButton.click();
    });

    expect(exMarkSpy).toHaveBeenCalledWith("2026-09-26", "e1", true, 0, 0, "");

    act(() => {
      root.unmount();
    });
  });
});
