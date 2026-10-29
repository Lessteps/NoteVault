// @vitest-environment jsdom
//
// Mentor — controles reutilizables del ritmo diario y de los extras: «Ritmo diario» (temas por día y mínimo, ritmo propio por área, efecto en el
// fin del plan), «Añadir tema» (rutas por delante y temas de la vault) y «Añadir práctica».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorPlan, MentorTopicCandidates } from "../../lib/types";
import { useApp } from "../../store/app";
import { AddExtraPractice } from "./AddExtraPractice";
import { AddExtraTopic } from "./AddExtraTopic";
import { DailyPaceControl } from "./DailyPaceControl";

let host: HTMLDivElement;
let root: Root;
const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const render = async (el: React.ReactElement): Promise<void> => {
  await act(async () => root.render(el));
  await flush();
};
const click = async (el: Element | null | undefined): Promise<void> => {
  if (!el) throw new Error("elemento no encontrado");
  await act(async () => (el as HTMLElement).click());
  await flush();
};
const byLabel = (label: string): HTMLElement => {
  const el = document.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`sin «${label}»`);
  return el as HTMLElement;
};

const mkTopics = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ folder: `${prefix}/${i + 1}`, title: `${prefix} ${i + 1}`, estMinutes: 40, targetWeek: 1 }));
function plan(over: Partial<MentorPlan> = {}): MentorPlan {
  return {
    id: "2026-10-05_2026-10-30", start: "2026-10-05", end: "2026-10-30", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    preconditions: { minutesPerDay: 200, studyDays: [1, 2, 3, 4, 5], pace: "intenso" } as never,
    subplans: [
      { id: "s-a", area: "Alfa", objective: "", topics: mkTopics("A", 12), weeks: [], requiredGoals: [] },
      { id: "s-b", area: "Beta", objective: "", topics: mkTopics("B", 12), weeks: [], requiredGoals: [] },
    ],
    ...over,
  } as MentorPlan;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useApp.setState({ toasts: [] } as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("DailyPaceControl", () => {
  it("sube y baja los temas por día, guarda de forma optimista y avisa al padre con el plan nuevo", async () => {
    const saved = plan({ pace: { perDay: 1 } });
    const set = vi.spyOn(api, "mentorPlanPaceSet").mockResolvedValue(saved);
    const onChanged = vi.fn();
    await render(<DailyPaceControl planId="p" plan={plan()} today="2026-10-05" onChanged={onChanged} />);
    expect(byLabel("Temas por día: Automático")).toBeTruthy();
    await click(byLabel("Más: Temas por día"));
    expect(set).toHaveBeenCalledWith({ id: "p", pace: { perDay: 1 } });
    expect(onChanged).toHaveBeenCalledWith(saved);
    expect(byLabel("Temas por día: 1")).toBeTruthy(); // optimista: ya se ve el valor
  });

  it("el mínimo arrastra los temas por día (nunca los supera) y el mínimo 0 se muestra como «Sin mínimo»", async () => {
    const set = vi.spyOn(api, "mentorPlanPaceSet").mockImplementation(async ({ pace }) => plan({ ...(pace ? { pace } : {}) }));
    await render(<DailyPaceControl planId="p" plan={plan()} today="2026-10-05" onChanged={() => {}} />);
    expect(byLabel("Mínimo diario: Sin mínimo")).toBeTruthy();
    await click(byLabel("Más: Mínimo diario"));
    expect(set).toHaveBeenLastCalledWith({ id: "p", pace: { minPerDay: 1 } }); // solo mínimo: el reparto automático con suelo
    await click(byLabel("Más: Temas por día"));
    await click(byLabel("Más: Mínimo diario"));
    expect(set).toHaveBeenLastCalledWith({ id: "p", pace: { perDay: 2, minPerDay: 2 } });
    await click(byLabel("Menos: Temas por día"));
    expect(set).toHaveBeenLastCalledWith({ id: "p", pace: { perDay: 1, minPerDay: 1 } });
  });

  it("enseña el efecto en el fin del plan: a tiempo, o cuántos temas no caben y el ritmo que hace falta", async () => {
    vi.spyOn(api, "mentorPlanPaceSet").mockResolvedValue(plan());
    await render(<DailyPaceControl planId="p" plan={plan({ pace: { perDay: 3 } })} today="2026-10-05" onChanged={() => {}} />);
    expect(document.querySelector('[data-testid="pace-impact"]')!.textContent).toMatch(/Terminas el 8 oct, a tiempo/);
    // 12 temas por área a 1 por día no caben en la semana: se dice cuántos y el ritmo que hace falta
    await render(<DailyPaceControl planId="p" plan={plan({ end: "2026-10-09", pace: { perDay: 1 } })} today="2026-10-05" onChanged={() => {}} />);
    expect(document.querySelector('[data-testid="pace-impact"]')!.textContent).toMatch(/No caben [0-9]+ temas antes del 9 oct/);
  });

  it("ritmo propio por área: lo activa, edita solo esa área y lo quita sin tocar el general", async () => {
    const set = vi.spyOn(api, "mentorPlanPaceSet").mockImplementation(async ({ pace }) => plan({ ...(pace ? { pace } : {}) }));
    const base = plan({ pace: { perDay: 3 } });
    await render(<DailyPaceControl planId="p" plan={base} subplanId="s-a" today="2026-10-05" onChanged={() => {}} />);
    const own = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(own.checked).toBe(false);
    expect(byLabel("Temas por día: 3")).toBeTruthy(); // ve el general
    await click(own);
    expect(set).toHaveBeenLastCalledWith({ id: "p", pace: { perDay: 3, areas: { "s-a": { perDay: 3, minPerDay: 0 } } } });
    await click(byLabel("Más: Temas por día"));
    expect(set).toHaveBeenLastCalledWith({ id: "p", pace: { perDay: 3, areas: { "s-a": { perDay: 4, minPerDay: 0 } } } });
    await click(own);
    expect(set).toHaveBeenLastCalledWith({ id: "p", pace: { perDay: 3 } });
  });

  it("si el guardado falla, vuelve al valor anterior y avisa con un error", async () => {
    vi.spyOn(api, "mentorPlanPaceSet").mockRejectedValue(new Error("El mínimo diario (3) no puede superar los temas por día (2)."));
    const onChanged = vi.fn();
    await render(<DailyPaceControl planId="p" plan={plan()} today="2026-10-05" onChanged={onChanged} />);
    await click(byLabel("Más: Temas por día"));
    expect(onChanged).not.toHaveBeenCalled();
    expect(byLabel("Temas por día: Automático")).toBeTruthy();
    expect(useApp.getState().toasts.some((t) => t.kind === "error" && /no puede superar/.test(t.text))).toBe(true);
  });
});

describe("AddExtraTopic", () => {
  const cands: MentorTopicCandidates = {
    loading: false,
    ahead: [{ folder: "A/5", title: "A 5", inPlan: true, area: "Alfa", subplanId: "s-a", position: 5, total: 12, estMinutes: 40, addedDates: [], week: 2, state: "pendiente" }],
    vault: [],
    weeks: { "2": { from: "2026-10-12", to: "2026-10-18" } },
    plannedByArea: { "s-a": 0 },
  };

  it("abre el diálogo con los temas de las siguientes semanas y añade el elegido a la fecha", async () => {
    const list = vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(cands);
    const add = vi.spyOn(api, "mentorPlanExtraTopicAdd").mockResolvedValue(plan({ extraTopics: [{ date: "2026-10-06", folder: "A/5", addedAt: "x", source: "manual" }] }));
    const onChanged = vi.fn();
    await render(<AddExtraTopic planId="p" date="2026-10-06" onChanged={onChanged} />);
    await click(document.querySelector('[data-testid="add-extra-topic"]'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(list).toHaveBeenCalledWith({ id: "p", upcoming: true, date: "2026-10-06" });
    const rows = [...document.querySelectorAll('[data-testid="extra-topic-candidate"]')].map((r) => r.textContent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/A 5/);
    await click(byLabel("Adelantar A 5"));
    expect(add).toHaveBeenCalledWith({ id: "p", folder: "A/5", date: "2026-10-06" });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("permite filtrar por esta área o todas las áreas y cambiar el día", async () => {
    const list = vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(cands);
    await render(<AddExtraTopic planId="p" date="2026-10-06" area="s-a" minDate="2026-10-05" maxDate="2026-10-30" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-topic"]'));
    expect(list).toHaveBeenCalledWith({ id: "p", upcoming: true, date: "2026-10-06", area: "s-a" });
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Todas las áreas"));
    expect(list).toHaveBeenLastCalledWith({ id: "p", upcoming: true, date: "2026-10-06" });
  });

  it("agrupa por semana y por área en el orden de la ruta, desactiva los que no son los siguientes y no ofrece temas de la vault", async () => {
    const row = (folder: string, title: string, subplanId: string, area: string, position: number, week: number, over: Record<string, unknown> = {}) => ({ folder, title, inPlan: true, area, subplanId, position, total: 9, estMinutes: 30, addedDates: [], week, state: "pendiente", ...over });
    vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue({
      loading: false,
      ahead: [
        row("A/4", "A 4", "s-a", "Alfa", 4, 3),
        row("A/5", "A 5", "s-a", "Alfa", 5, 3, { blockedBy: "A 4" }),
        row("B/2", "B 2", "s-b", "Beta", 2, 3),
        row("A/6", "A 6", "s-a", "Alfa", 6, 4, { blockedBy: "A 4" }),
      ],
      vault: [],
      weeks: { "3": { from: "2026-10-26", to: "2026-11-01" }, "4": { from: "2026-11-02", to: "2026-11-08" } },
      plannedByArea: { "s-a": 2, "s-b": 0 },
    } as never);
    await render(<AddExtraTopic planId="p" date="2026-10-26" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-topic"]'));
    const weeks = [...document.querySelectorAll('[data-testid="next-topics-week"]')];
    expect(weeks.map((w) => w.querySelector("h4")!.textContent)).toEqual(["Semana 3 · 26 oct – 1 nov", "Semana 4 · 2 nov – 8 nov"]);
    expect([...weeks[0]!.querySelectorAll('[data-testid="next-topics-area"]')].map((a) => a.getAttribute("data-area"))).toEqual(["s-a", "s-b"]);
    expect([...weeks[0]!.querySelectorAll('[data-testid="extra-topic-candidate"]')].map((r) => r.getAttribute("data-folder"))).toEqual(["A/4", "A/5", "B/2"]);
    expect((byLabel("Adelantar A 4") as HTMLButtonElement).disabled).toBe(false);
    const blocked = byLabel("Adelantar A 5") as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(document.querySelector('[data-folder="A/5"]')!.textContent).toContain("Sigue a: A 4");
    expect(document.querySelector('[data-testid="next-topics-planned"]')!.textContent).toContain("Alfa 2");
    const text = document.querySelector('[role="dialog"]')!.textContent!;
    expect(text).not.toMatch(/vault/i);
    expect(document.querySelector('input[type="search"]')).toBeNull();
  });

  it("muestra el error si falla el alta", async () => {
    vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(cands);
    vi.spyOn(api, "mentorPlanExtraTopicAdd").mockRejectedValue(new Error("Ese tema ya está añadido a ese día."));
    await render(<AddExtraTopic planId="p" date="2026-10-06" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-topic"]'));
    await click(byLabel("Adelantar A 5"));
    expect(useApp.getState().toasts.some((t) => /ya está añadido/.test(t.text))).toBe(true);
  });
});

describe("AddExtraPractice", () => {
  const cands = {
    loading: false as const,
    exercises: [{ subplanId: "s-a", area: "Alfa", folder: "A/1", topic: "Variables", rel: "A/1/ej1.md", title: "Ejercicios de Variables", difficulty: 2, addedDates: [] }],
  };

  it("abre el diálogo con los ejercicios planificados de la ruta y adelanta el elegido a la fecha", async () => {
    const list = vi.spyOn(api, "mentorPlanExerciseCandidates").mockResolvedValue(cands);
    const add = vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockResolvedValue(plan());
    const onChanged = vi.fn();
    await render(<AddExtraPractice planId="p" date="2026-10-06" area="s-a" onChanged={onChanged} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(list).toHaveBeenCalledWith({ id: "p", area: "s-a" });
    const rows = [...document.querySelectorAll('[data-testid="extra-practice-candidate"]')].map((r) => r.textContent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/Ejercicios de Variables/);
    await click(byLabel("Adelantar Ejercicios de Variables"));
    expect(add).toHaveBeenCalledWith({ id: "p", title: "Ejercicios de Variables", kind: "exercise", date: "2026-10-06", area: "s-a", folder: "A/1", rel: "A/1/ej1.md" });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("lista los katas planeados del área, los adelanta ligados a su fecha y no tiene formulario de texto libre", async () => {
    vi.spyOn(api, "mentorPlanExerciseCandidates").mockResolvedValue(cands);
    const kata = { areaId: "backend", subplanId: "s-a", area: "Alfa", day: 8, date: "2026-10-12", title: "Endpoint design - loans", skill: "Endpoints", level: 1, minutes: 25, addedDates: [] };
    vi.spyOn(api, "mentorAreaKatasAhead").mockResolvedValue({ katas: [kata] });
    const add = vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockResolvedValue(plan());
    await render(<AddExtraPractice planId="p" date="2026-10-06" area="s-a" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    const dlg = document.querySelector('[role="dialog"]')!;
    expect(dlg.querySelector("textarea")).toBeNull();
    expect(dlg.querySelector('input[type="text"], input[type="number"], input[type="search"]')).toBeNull();
    expect(dlg.querySelector('[data-testid="next-practice-katas"]')!.textContent).toContain("Endpoint design - loans");
    expect(byLabel("Abrir Endpoint design - loans")).toBeTruthy();
    await click(byLabel("Adelantar Endpoint design - loans"));
    expect(add).toHaveBeenCalledWith({ id: "p", title: "Endpoint design - loans", kind: "kata", date: "2026-10-06", area: "s-a", kataDate: "2026-10-12", minutes: 25 });
  });

  it("si no hay más práctica planificada lo dice", async () => {
    vi.spyOn(api, "mentorPlanExerciseCandidates").mockResolvedValue({ loading: false, exercises: [] });
    vi.spyOn(api, "mentorAreaKatasAhead").mockResolvedValue({ katas: [] });
    await render(<AddExtraPractice planId="p" date="2026-10-06" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    expect(document.querySelector('[data-testid="next-practice-empty"]')!.textContent).toMatch(/No hay más práctica planificada/);
  });

  it("muestra el error si falla el alta", async () => {
    vi.spyOn(api, "mentorPlanExerciseCandidates").mockResolvedValue(cands);
    vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockRejectedValue(new Error("Esa práctica ya está añadida a ese día."));
    await render(<AddExtraPractice planId="p" date="2026-10-06" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    await click(byLabel("Adelantar Ejercicios de Variables"));
    expect(useApp.getState().toasts.some((t) => /ya está añadida/.test(t.text))).toBe(true);
  });
});
