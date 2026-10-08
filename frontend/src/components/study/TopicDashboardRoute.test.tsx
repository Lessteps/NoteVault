// @vitest-environment jsdom
//
// Panel de temas de estudio con la ruta del Mentor: insignia por tema, interruptor «Solo mi ruta» (filtra a core/optional, con recuento),
// orden «por semana del plan» y «Qué estudiar ahora» con los temas exactos de la semana. Los temas fuera de ruta se atenúan, no se esconden.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorPlan, MentorPlanGet, MentorPlanRow } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useRoute } from "../../store/mentorRoute";
import { TopicDashboardView } from "./TopicDashboardView";

const START = "2026-10-05";
const END = "2027-03-28";
const PID = `${START}_${END}`;
const F = (n: number) => `Programación/4 Backend/T0${n} Tema ${n}`;
const item = (n: number) => ({
  folder: F(n), subject: "programming", area: "4 Backend",
  manifest: { title: `Tema ${n}`, skills: [], mastery: { target_difficulty: 3, min_per_skill: 6, exam: "none" } },
  progress: { completenessPct: 0, isComplete: false, examPassed: false, skills: {} },
});
const plan = (): MentorPlan =>
  ({
    id: PID, start: START, end: END, name: "Full stack", createdAt: "", updatedAt: "", structure: "areas",
    subplans: [{ id: "s1", area: "Backend", areaId: "backend", objective: "APIs", weeks: [], requiredGoals: [], groups: [{ id: "core", title: "Conocimientos", kind: "knowledge", order: 1 }],
      topics: [
        { folder: F(1), title: "Tema 1", estMinutes: 60, targetWeek: 6, group: "core" },
        { folder: F(2), title: "Tema 2", estMinutes: 60, targetWeek: 2, group: "core" },
        { folder: F(3), title: "Tema 3", estMinutes: 60, targetWeek: 4, group: "core", route: "skipped", skippedReason: "Ya lo dominas" },
      ] }],
  }) as unknown as MentorPlan;
const row: MentorPlanRow = { id: PID, start: START, end: END, name: "Full stack", period: "", status: "activo", archived: false, auto: false, subplans: 1, topics: 3, completed: 0, pct: 0, minutesPerDay: 240 };
const get: MentorPlanGet = { loading: false, id: PID, month: "2026-10", today: "2026-10-28", status: "activo", plan: plan(), derived: { subplans: [], summary: { subplans: 1, topics: 3, done: 0, pct: 0, currentWeek: 2, weeks: 26 } }, goals: {}, projects: {}, items: [], months: [], plans: [row], aiConfigured: true };

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
};
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
const cards = () => [...host.querySelectorAll("[data-route]")].filter((e) => e.tagName === "DIV");

beforeEach(async () => {
  localStorage.clear();
  useRoute.getState().reset();
  useRoute.getState().setOnly(false);
  useRoute.getState().setSortByWeek(false);
  useMentor.setState({ planVersion: 0 });
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([row]);
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue(get);
  vi.spyOn(api, "studyTopicDashboard").mockResolvedValue({ loading: false, topics: [item(1), item(2), item(3), item(9)], areas: ["4 Backend"], subjects: ["programming"] } as never);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<TopicDashboardView />); });
  await settle();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("panel de temas con ruta", () => {
  it("cada tema del plan lleva su insignia, el fuera de ruta se atenúa y sigue visible; hay «Qué estudiar ahora»", () => {
    const badges = [...host.querySelectorAll("[data-testid=route-badge]")].map((b) => b.textContent);
    expect(badges).toEqual(expect.arrayContaining(["En tu ruta · sem. 6", "En tu ruta · sem. 2", "Fuera de ruta"]));
    const skipped = cards().find((c) => c.getAttribute("data-route") === "skipped")!;
    expect(skipped.className).toContain("opacity-60");
    expect(skipped.textContent).toContain("Tema 3");
    expect(host.textContent).toContain("Tema 9"); // un tema que no es del plan sigue ahí
    expect(byTest("route-now").textContent).toContain("Tema 2");
  });

  it("«Solo mi ruta» filtra a los temas core/optional del plan y «Mostrar todo» los devuelve", async () => {
    await click(byTest("route-switch"));
    expect(byTest("route-switch").getAttribute("aria-checked")).toBe("true");
    const titles = [...host.querySelectorAll("h4")].map((h) => h.textContent);
    expect(titles).toEqual(["Tema 1", "Tema 2"]);
    await click(byTest("route-show-all"));
    expect([...host.querySelectorAll("h4")].map((h) => h.textContent)).toHaveLength(4);
  });

  it("el orden «por semana del plan» agrupa por semana, de la más próxima a la más lejana", async () => {
    const sort = byTest("route-sort") as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sort, "week");
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    const heads = [...host.querySelectorAll("h3")].map((h) => h.textContent);
    expect(heads.filter((h) => h?.startsWith("Semana")).map((h) => h!.split(" · ")[0])).toEqual(["Semana 2", "Semana 4", "Semana 6"]);
    expect(heads.at(-1)).toBe("Sin semana en el plan");
  });
});
