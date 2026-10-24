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
const typeInto = async (el: HTMLElement, value: string): Promise<void> => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
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
    ahead: [{ folder: "A/5", title: "A 5", inPlan: true, area: "Alfa", subplanId: "s-a", position: 5, total: 12, estMinutes: 40, addedDates: [] }],
    vault: [{ folder: "Vault/Rust/Ownership", title: "Ownership", inPlan: false, subject: "programming", addedDates: [] }],
  };

  it("abre el diálogo con los siguientes de la ruta y los temas de la vault, y añade el elegido a la fecha", async () => {
    const list = vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(cands);
    const add = vi.spyOn(api, "mentorPlanExtraTopicAdd").mockResolvedValue(plan({ extraTopics: [{ date: "2026-10-06", folder: "A/5", addedAt: "x", source: "manual" }] }));
    const onChanged = vi.fn();
    await render(<AddExtraTopic planId="p" date="2026-10-06" onChanged={onChanged} />);
    await click(document.querySelector('[data-testid="add-extra-topic"]'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(list).toHaveBeenCalledWith({ id: "p" });
    const rows = [...document.querySelectorAll('[data-testid="extra-topic-candidate"]')].map((r) => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/A 5.*Alfa · tema 5 de 12/);
    await click(byLabel("Añadir A 5"));
    expect(add).toHaveBeenCalledWith({ id: "p", folder: "A/5", date: "2026-10-06" });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="extra-topic-candidate"]')!.textContent).toMatch(/Añadido/);
  });

  it("busca con el texto escrito, atribuye al área los temas de la vault y permite cambiar el día", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const list = vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(cands);
      const add = vi.spyOn(api, "mentorPlanExtraTopicAdd").mockResolvedValue(plan());
      await render(<AddExtraTopic planId="p" date="2026-10-06" area="s-a" minDate="2026-10-05" maxDate="2026-10-30" onChanged={() => {}} />);
      await click(document.querySelector('[data-testid="add-extra-topic"]'));
      await typeInto(byLabel("Buscar tema"), "owner");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      await flush();
      expect(list).toHaveBeenLastCalledWith({ id: "p", query: "owner", area: "s-a" });
      await typeInto(byLabel("Día"), "2026-10-08");
      await click(byLabel("Añadir Ownership"));
      expect(add).toHaveBeenCalledWith({ id: "p", folder: "Vault/Rust/Ownership", date: "2026-10-08", area: "s-a" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("muestra el error si falla la búsqueda o el alta", async () => {
    vi.spyOn(api, "mentorPlanTopicCandidates").mockResolvedValue(cands);
    vi.spyOn(api, "mentorPlanExtraTopicAdd").mockRejectedValue(new Error("Ese tema ya está añadido a ese día."));
    await render(<AddExtraTopic planId="p" date="2026-10-06" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-topic"]'));
    await click(byLabel("Añadir A 5"));
    expect(useApp.getState().toasts.some((t) => /ya está añadido/.test(t.text))).toBe(true);
  });
});

describe("AddExtraPractice", () => {
  it("añade una práctica libre con minutos y nota a la fecha", async () => {
    const add = vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockResolvedValue(plan());
    const onChanged = vi.fn();
    await render(<AddExtraPractice planId="p" date="2026-10-06" area="s-a" onChanged={onChanged} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    await typeInto(byLabel("Título de la práctica"), "Repasar SQL");
    await typeInto(byLabel("Minutos"), "25");
    await typeInto(byLabel("Nota"), "joins");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Añadir práctica" && b.closest('[role="dialog"]')));
    expect(add).toHaveBeenCalledWith({ id: "p", title: "Repasar SQL", kind: "custom", date: "2026-10-06", minutes: 25, note: "joins", area: "s-a" });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("un ejercicio de un tema se liga a su carpeta y toma el título del tema", async () => {
    const add = vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockResolvedValue(plan());
    await render(<AddExtraPractice planId="p" date="2026-10-06" topics={[{ folder: "A/1", title: "Variables" }]} onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    await click([...document.querySelectorAll('input[type="radio"]')].find((r) => r.parentElement?.textContent === "Ejercicio de un tema"));
    const sel = byLabel("Tema del ejercicio") as HTMLSelectElement;
    await act(async () => {
      sel.value = "A/1";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Añadir práctica" && b.closest('[role="dialog"]')));
    expect(add).toHaveBeenCalledWith({ id: "p", title: "Ejercicios de Variables", kind: "exercise", date: "2026-10-06", folder: "A/1" });
  });

  it("no envía sin título ni con minutos inválidos", async () => {
    const add = vi.spyOn(api, "mentorPlanExtraPracticeAdd").mockResolvedValue(plan());
    await render(<AddExtraPractice planId="p" date="2026-10-06" onChanged={() => {}} />);
    await click(document.querySelector('[data-testid="add-extra-practice"]'));
    const submit = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "Añadir práctica" && b.closest('[role="dialog"]'));
    await click(submit());
    expect(document.querySelector('[role="alert"]')!.textContent).toMatch(/título/);
    await typeInto(byLabel("Título de la práctica"), "x");
    await typeInto(byLabel("Minutos"), "0");
    await click(submit());
    expect(document.querySelector('[role="alert"]')!.textContent).toMatch(/minutos/);
    expect(add).not.toHaveBeenCalled();
  });
});
