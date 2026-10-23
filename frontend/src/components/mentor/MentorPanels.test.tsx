// @vitest-environment jsdom
//
// El Mentor como espacio de paneles: navegación interna, previsualizaciones de SOLO lectura
// (Metas / Proyectos / Notas con su botón "Abrir en…") y el flujo conversación -> borrador -> "Crear meta".

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { GoalCard, MentorChatTurn, MentorGoalDraft, MentorOverview, MentorPanels, MentorProjectCard } from "../../lib/types";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useGoals } from "../../store/goals";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { useProjects } from "../../store/projects";
import { MentorModule } from "./MentorModule";

const FUND = "Programación/Python/1 Fundamentos";

const draft = (): MentorGoalDraft => ({
  name: "Backend con Python",
  area: "estudio",
  description: "Primero bases y luego APIs.",
  discarded: ["Programación/Django/Inventado"],
  topics: [{ folder: FUND, title: "1 Fundamentos", subject: "programming", skills: [], why: "base del lenguaje", estMinutes: 40 }],
  schedule: {
    start: "2026-10-05",
    end: "2027-01-04",
    weeks: 13,
    hoursPerWeek: 6,
    totalMinutes: 40,
    availableMinutes: 4000,
    fits: true,
    requiredHoursPerWeek: 0.1,
    warnings: ["Te sobra tiempo: a 6 h/semana terminas hacia el 2026-10-12, antes de la fecha final (2027-01-04)."],
    items: [{ name: "1 Fundamentos", folders: [FUND], topic_links: [FUND], minutes: 40, start: "2026-10-05", due: "2026-10-12", weekFrom: 1, weekTo: 1 }],
  },
});

const card = (over: Partial<GoalCard> = {}): GoalCard =>
  ({
    id: "g1", name: "Backend con Python", area: "estudio", status: "activa", status_colour: "#33b679", priority: 2, start: "2026-10-05", end: "2027-01-04",
    icon: "", colour: "#3f51b5", in_overview: true, order: null, created: "2026-10-05", description: "", overdue: false, days_left: 91,
    linked_folder: "", linked_notes: [], progress: 0.25, counts: [1, 4], adherence7: null, daily: [], next: null, overdue_items: 0, habits: [], ...over,
  }) as unknown as GoalCard;

const project = (): MentorProjectCard =>
  ({
    id: "p1", key: "APP", name: "Mi app", status: "En curso", status_colour: "#2383e2", area: "", colour: "#2383e2", icon: "", created: null, start: null,
    deadline: "2026-12-01", columns: [], done_column: "Hecho", in_calendar: false, description: "", days_left: 57, overdue: false, folders: [],
    summary: { total: 10, done: 4, open: 6, overdue: 1, progress: 0.4, estimate_min: 0, estimate_done_min: 0 }, throughput: [], next_due: { key: "APP-3", title: "Login", due: "2026-10-20" },
    issues: [
      { id: "x1", key: "APP-3", title: "Login", status: "En curso", priority: 3, parent: "", due: "2026-10-20", overdue: false, icon: "●", type: "Tarea", type_colour: "#2383e2" },
      { id: "x2", key: "APP-4", title: "Validar formulario", status: "Por hacer", priority: 2, parent: "x1", due: null, overdue: false, icon: "○", type: "Subtarea", type_colour: "#8b8b96" },
    ],
  }) as unknown as MentorProjectCard;

const panels = (over: Partial<Extract<MentorPanels, { loading: false }>> = {}): MentorPanels => ({
  loading: false,
  areas: [{ id: "estudio", name: "Estudio", icon: "📚", colour: "#3f51b5" }],
  goals: [
    {
      card: card(),
      items: [
        {
          id: "i1", parent: "", name: "1 Fundamentos", status: "En curso", due: "2026-10-12", start: "2026-10-05", is_leaf: true, progress: 0.5, late: false, topic_links: [FUND],
          priority: 2, category: "", schedule: "", is_priority: false, counts: [0, 1], done_today: false,
          topic_progress: { done: false, pct: 50, broken: [], missing: [], links: [{ link: FUND, topic: FUND, title: "1 Fundamentos", skills: [], broken: false, done: false, pct: 50 }] },
        },
        {
          id: "i2", parent: "", name: "Tema borrado", status: "Pendiente", due: null, start: null, is_leaf: true, progress: 0, late: false, topic_links: ["X/Y"],
          priority: 2, category: "", schedule: "", is_priority: false, counts: [0, 1], done_today: false,
          topic_progress: { done: false, pct: 0, broken: ["X/Y"], missing: [], links: [{ link: "X/Y", topic: "X/Y", title: "Y", skills: [], broken: true, done: false, pct: 0 }] },
        },
      ],
    },
  ],
  projects: [project()],
  study: {
    topics: {
      total: 5, inProgress: 2, untreated: 1, complete: 2,
      inProgressList: [{ folder: FUND, title: "1 Fundamentos", subject: "programming", completenessPct: 40, lastAttemptDays: 9, pendingSkills: ["debug"] }],
      untreatedList: [{ folder: "Mat/Límites", title: "Límites", subject: "mathematics", completenessPct: 0, lastAttemptDays: null, pendingSkills: [] }],
      recentList: [],
    },
    areas: [
      {
        id: "Programación", name: "Programación", icon: "💻", colour: "#3f51b5", lifeArea: "programacion",
        total: 3, inProgress: 1, untreated: 1, complete: 1, examPending: 1, avgPct: 47, srsDue: 2, errors: 1,
        next: { kind: "continue", title: "1 Fundamentos", folder: FUND },
        groups: [
          {
            key: "Python", title: "Python",
            topics: [
              { folder: FUND, title: "1 Fundamentos", group: "Python", status: "in_progress", examPending: false, completenessPct: 40, lastAttemptDays: 9, weakSkills: ["debug"] },
              { folder: "Programación/Python/2 Funciones", title: "2 Funciones", group: "Python", status: "in_progress", examPending: true, completenessPct: 90, lastAttemptDays: 0, weakSkills: [] },
              { folder: "Programación/Python/3 Clases", title: "3 Clases", group: "Python", status: "untreated", examPending: false, completenessPct: 0, lastAttemptDays: null, weakSkills: [] },
            ],
          },
        ],
      },
      {
        id: "Matemáticas", name: "Matemáticas", icon: "📚", colour: "#2383e2", lifeArea: "",
        total: 1, inProgress: 0, untreated: 0, complete: 1, examPending: 0, avgPct: 100, srsDue: 0, errors: 0, next: null,
        groups: [{ key: "", title: "General", topics: [{ folder: "Matemáticas/Límites", title: "Límites", group: "", status: "complete", examPending: false, completenessPct: 100, lastAttemptDays: 3, weakSkills: [] }] }],
      },
    ],
    srs: { dueTotal: 3, bySubject: [{ subject: "mathematics", count: 3, oldestOverdueDays: 4, lapses: 0 }] },
    errors: { unresolved: 1, repeaters: [{ id: "e1", subject: "mathematics", topic: "Límites", skill: "solve", category: "calc", repeatCount: 3, lastSeenDays: 2 }] },
  },
  ...over,
});

const overview: MentorOverview = {
  loading: false, date: "2026-10-05", weekday: "lunes", sections: [], today: null, aiConfigured: true,
  adherence: { sessions: 0, overall: { total: 0, done: 0, partial: 0, skipped: 0, planned: 0, pct: null }, bySubject: {}, byKind: {}, skippedSubjects: [], typicalSessionMinutes: null },
};

let host: HTMLDivElement;
let root: Root;

const flush = () => act(async () => { await Promise.resolve(); });
const mount = async () => { await act(async () => { root.render(<MentorModule />); }); await flush(); };
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? "")))!;
const click = async (el: Element | undefined) => {
  expect(el, "botón no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
// Plan / Cierre del día / Metas / Proyectos / Notas ya no están en la barra lateral: se abren como rutas ocultas (botones de otras vistas, enlaces profundos)
const ROUTES: Record<string, string> = { Metas: "metas", Proyectos: "proyectos", "Notas y estudio": "notas", "Cierre del día": "cierre" };
const go = async (label: string) => { await act(async () => { useNavState.getState().set("mentor.view", Object.entries(ROUTES).find(([k]) => k.includes(label))![1]); }); await flush(); };

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  useMentor.setState({ panels: null, turns: [], pending: null, chatId: null, chatTitle: "Nueva conversación", chats: [], historyOpen: false, chatLoaded: false, sending: false, notice: null, creating: false, createdGoalId: null, warming: false, panelsError: "" });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorOverview").mockResolvedValue(overview);
  vi.spyOn(api, "mentorPanels").mockResolvedValue(panels());
  vi.spyOn(api, "mentorChatLoad").mockResolvedValue({ turns: [], pending: null });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Mentor: espacio de paneles", () => {
  it("la barra ya no lista Plan, Cierre del día, Metas, Proyectos ni Notas; sus rutas siguen abriéndose y se vuelve con «Volver a mi plan»", async () => {
    await mount();
    const nav = [...host.querySelectorAll("aside nav button")].map((b) => b.textContent ?? "");
    for (const l of ["Plan", "Cierre del día", "Metas", "Proyectos", "Notas y estudio", "Conversación"]) expect(nav.some((t) => t.includes(l))).toBe(false);
    // sin ningún plan la barra solo lleva el interruptor de modo y el selector de plan, y el panel el estado vacío
    expect(nav).toEqual([]);
    expect(host.querySelector("[data-testid=mentor-mode]")).toBeTruthy();
    expect(host.querySelector("[data-testid=mentor-plan-selector]")).toBeTruthy();
    expect(host.textContent).toContain("Mentor — Planes");

    await go("Metas");
    expect(host.textContent).toContain("Mentor — Metas");
    await go("Proyectos");
    expect(host.textContent).toContain("Mentor — Proyectos");
    await go("Notas y estudio");
    expect(host.textContent).toContain("Mentor — Notas y estudio");
    await go("Cierre del día");
    expect(host.querySelector("[data-testid=today-back]")).toBeTruthy();
  });

  it("«Planear mi día» abre el panel Hoy con un enlace para volver al plan", async () => {
    await mount();
    await act(async () => { useNavState.getState().set("mentor.view", "hoy"); });
    await flush();
    expect(host.textContent).toContain("Mentor — Hoy");
    const back = host.querySelector<HTMLElement>("[data-testid=today-back]")!;
    expect(back).toBeTruthy();
    await act(async () => { back.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    expect(host.textContent).not.toContain("Mentor — Hoy");
  });

  it("Metas: tarjeta desplegable como en el módulo Metas; colapsada resume y expandida muestra submetas, temas y enlaces rotos", async () => {
    await mount();
    await go("Metas");
    const g = host.querySelector("[data-testid=goal-card]")!;
    // colapsada: icono/nombre/área/fechas/avance/días restantes, pero ninguna submeta
    expect(g.textContent).toContain("Backend con Python");
    expect(host.textContent).toContain("Estudio");
    expect(g.textContent).toContain("25 %");
    expect(g.textContent).toContain("faltan 91 días");
    expect(g.textContent).toContain("1/4 submetas");
    expect(g.querySelectorAll("[data-testid=goal-item]")).toHaveLength(0);
    expect(g.querySelector("button[aria-expanded]")!.getAttribute("aria-expanded")).toBe("false");

    // expandida: el árbol de submetas
    await click(g.querySelector("button[aria-expanded]")!);
    expect(g.querySelector("button[aria-expanded]")!.getAttribute("aria-expanded")).toBe("true");
    const items = g.querySelectorAll("[data-testid=goal-item]");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("📚 1 Fundamentos");
    expect(items[0]!.textContent).toContain("50 %");
    expect(items[0]!.textContent).toContain("En curso");
    expect(items[1]!.textContent).toContain("enlace roto");

    // solo lectura: ni campos ni acciones de edición
    expect(host.querySelectorAll("input, textarea, select")).toHaveLength(0);
    const labels = [...host.querySelectorAll("main button")].map((b) => b.textContent?.trim() ?? "");
    for (const forbidden of ["Editar", "Borrar", "Eliminar", "Nueva submeta"]) expect(labels.some((l) => l.includes(forbidden))).toBe(false);

    // y se pliega otra vez
    await click(g.querySelector("button[aria-expanded]")!);
    expect(g.querySelectorAll("[data-testid=goal-item]")).toHaveLength(0);
  });

  it("'＋ Nueva meta con el Mentor' abre el asistente en contexto Mentor (arriba y en el estado vacío)", async () => {
    useAssistant.setState({ open: false });
    await mount();
    await go("Metas");
    expect(button("Nueva meta con el Mentor")).toBeTruthy();
    await click(button("Nueva meta con el Mentor"));
    expect(useAssistant.getState().open).toBe(true);
    expect(useMentor.getState().focusSeq).toBeGreaterThan(0);

    useAssistant.setState({ open: false });
    vi.mocked(api.mentorPanels).mockResolvedValue(panels({ goals: [] }));
    useMentor.setState({ panels: null });
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await mount();
    await go("Metas");
    const empty = host.querySelector("[data-testid=goals-empty]")!;
    expect(empty.textContent).toContain("No tienes metas activas");
    await click(button("Nueva meta con el Mentor", empty));
    expect(useAssistant.getState().open).toBe(true);
  });

  it("'Abrir en Metas' abre esa meta en su módulo", async () => {
    const open = vi.spyOn(useGoals.getState(), "open").mockResolvedValue();
    await mount();
    await go("Metas");
    await click(host.querySelector("[data-testid=goal-card] button[aria-expanded]")!);
    await click(button("Abrir en Metas"));
    expect(open).toHaveBeenCalledWith("g1");
    expect(useApp.getState().module).toBe("metas");
  });

  it("Proyectos: tarjeta desplegable de solo lectura con estado, plazo e issues abiertos, y 'Abrir en Proyectos'", async () => {
    const open = vi.spyOn(useProjects.getState(), "open").mockResolvedValue();
    await mount();
    await go("Proyectos");
    const p = host.querySelector("[data-testid=project-card]")!;
    expect(p.textContent).toContain("Mi app");
    expect(p.textContent).toContain("En curso");
    expect(p.textContent).toContain("57 días a la entrega");
    expect(p.textContent).toContain("4/10 issues");
    expect(p.textContent).toContain("6 abiertas");
    expect(p.textContent).toContain("1 vencidas");
    expect(p.querySelectorAll("[data-testid=project-issue]")).toHaveLength(0);

    await click(p.querySelector("button[aria-expanded]")!);
    const issues = p.querySelectorAll("[data-testid=project-issue]");
    expect(issues).toHaveLength(2);
    expect(issues[0]!.textContent).toContain("APP-3");
    expect(issues[0]!.textContent).toContain("Login");
    expect(issues[1]!.textContent).toContain("Validar formulario");
    expect(host.querySelectorAll("input, textarea, select")).toHaveLength(0);

    await click(button("Abrir en Proyectos"));
    expect(open).toHaveBeenCalledWith("p1");
    expect(useApp.getState().module).toBe("proyectos");
  });

  describe("Notas y estudio", () => {
    const enter = async () => { await mount(); await go("Notas y estudio"); };
    const cards = () => [...host.querySelectorAll("[data-testid=area-card]")];
    const type = async (el: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    it("áreas como tarjetas colapsadas: color, chips, % medio, alertas y siguiente paso; sin temas hasta desplegar", async () => {
      await enter();
      expect(host.querySelector("[data-testid=study-summary]")!.textContent).toContain("5 temas");
      expect(host.querySelector("[data-testid=study-summary]")!.textContent).toContain("3 repasos vencidos");
      expect(cards()).toHaveLength(2);
      const prog = cards()[0] as HTMLElement;
      expect(prog.style.borderTop).toContain("3px solid");
      expect(prog.textContent).toContain("💻");
      expect(prog.textContent).toContain("Programación");
      expect(prog.textContent).toContain("1 a medias");
      expect(prog.textContent).toContain("1 sin tratar");
      expect(prog.textContent).toContain("1 examen pendiente");
      expect(prog.textContent).toContain("2 repasos vencidos");
      expect(prog.textContent).toContain("1 error");
      expect(prog.textContent).toContain("47 %");
      expect(prog.textContent).toContain("Continúa: 1 Fundamentos");
      expect(host.querySelectorAll("[data-testid=topic-row]")).toHaveLength(0);
      expect(host.querySelector("svg circle[stroke-dasharray]")).toBeNull();
    });

    it("al desplegar muestra los grupos y los temas con estado, skills débiles y 'ver tema'; es de solo lectura", async () => {
      const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValue({ path: "" } as never);
      await enter();
      await click(cards()[0]!.querySelector("button[aria-expanded]")!);
      const rows = cards()[0]!.querySelectorAll("[data-testid=topic-row]");
      expect(rows).toHaveLength(3);
      expect(cards()[0]!.textContent).toContain("Python");
      expect(rows[0]!.textContent).toContain("A medias");
      expect(rows[0]!.textContent).toContain("debug");
      expect(rows[0]!.textContent).toContain("último intento hace 9 d");
      expect(rows[1]!.textContent).toContain("Examen pendiente");
      expect(rows[1]!.textContent).toContain("último intento hoy");
      expect(rows[2]!.textContent).toContain("Sin tratar");
      expect(host.querySelectorAll("textarea, select")).toHaveLength(0);
      expect(host.querySelectorAll("input")).toHaveLength(1); // solo el buscador
      await click(button("ver tema", rows[0]!));
      expect(ensure).toHaveBeenCalledWith(FUND);
      await click(button("Abrir en Estudio", cards()[0]!));
      expect(ensure).toHaveBeenCalledWith("Programación");
    });

    it("Expandir todas / Contraer todas", async () => {
      await enter();
      await click(button("Expandir todas"));
      expect(host.querySelectorAll("[data-testid=topic-row]")).toHaveLength(4);
      await click(button("Contraer todas"));
      expect(host.querySelectorAll("[data-testid=topic-row]")).toHaveLength(0);
    });

    it("filtra por texto y por estado y desaparecen las áreas sin coincidencias", async () => {
      await enter();
      await type(host.querySelector("input[type=search]")!, "limites");
      expect(cards()).toHaveLength(1);
      expect(cards()[0]!.textContent).toContain("Matemáticas");
      await type(host.querySelector("input[type=search]")!, "zzz");
      expect(host.querySelector("[data-testid=study-no-match]")).toBeTruthy();
      await type(host.querySelector("input[type=search]")!, "");

      await click(button("Sin tratar", host.querySelector("[role=group]")!));
      expect(cards()).toHaveLength(1);
      await click(button("Expandir todas"));
      expect([...host.querySelectorAll("[data-testid=topic-row]")].map((r) => r.textContent)).toEqual([expect.stringContaining("3 Clases")]);

      await click(button("Examen pendiente", host.querySelector("[role=group]")!));
      expect([...host.querySelectorAll("[data-testid=topic-row]")].map((r) => r.textContent)).toEqual([expect.stringContaining("2 Funciones")]);

      await click(button("Completos", host.querySelector("[role=group]")!));
      expect(cards()[0]!.textContent).toContain("Matemáticas");
    });

    it("estado vacío cuidado cuando no hay temas", async () => {
      const p = panels();
      vi.mocked(api.mentorPanels).mockResolvedValue({ ...p, study: { ...(p as any).study, areas: [], topics: { ...(p as any).study.topics, total: 0 } } } as MentorPanels);
      await enter();
      expect(host.querySelector("[data-testid=study-empty]")).toBeTruthy();
      expect(host.querySelector("input")).toBeNull();
    });
  });

  describe("filas horizontales de tarjetas compactas por área", () => {
    const rows = () => [...host.querySelectorAll("[data-testid=card-row]")];

    it("una sola área = una sola fila horizontal con sus tarjetas", async () => {
      await mount();
      await go("Metas");
      expect(rows()).toHaveLength(1);
      expect(rows()[0]!.querySelectorAll("[data-testid=goal-card]")).toHaveLength(1);
      expect(rows()[0]!.querySelector("[role=group]")!.className).toContain("overflow-x-auto");
      expect(rows()[0]!.querySelector("[data-testid=goal-card]")!.className).toContain("w-[300px]");
    });

    it("áreas distintas = una fila por área, cada una con su cabecera y su recuento; expandir no ensancha ni toca a las demás", async () => {
      const p = panels() as Extract<MentorPanels, { loading: false }>;
      const g0 = p.goals[0]!;
      vi.mocked(api.mentorPanels).mockResolvedValue({
        ...p,
        areas: [...p.areas, { id: "salud", name: "Salud", icon: "💪", colour: "#33b679" }],
        goals: [g0, { ...g0, card: card({ id: "g2", name: "Correr 10 km", area: "salud" }), items: [] }, { ...g0, card: card({ id: "g3", name: "Leer más", area: "estudio" }), items: [] }],
      } as MentorPanels);
      await mount();
      await go("Metas");
      expect(rows()).toHaveLength(2);
      expect(rows()[0]!.querySelectorAll("[data-testid=goal-card]")).toHaveLength(2);
      expect(rows()[1]!.querySelectorAll("[data-testid=goal-card]")).toHaveLength(1);
      expect([...host.querySelectorAll("h2")].find((h) => h.textContent?.includes("Salud"))!.textContent).toContain("1 meta");
      const first = rows()[0]!.querySelectorAll("[data-testid=goal-card]")[0]!;
      await click(first.querySelector("button[aria-expanded]")!);
      expect(first.querySelectorAll("[data-testid=goal-item]")).toHaveLength(2);
      expect(rows()[0]!.querySelectorAll("[data-testid=goal-card]")[1]!.querySelectorAll("[data-testid=goal-item]")).toHaveLength(0);
      expect(first.className).toContain("w-[300px]");
      expect(host.querySelectorAll("input, textarea, select")).toHaveLength(0);
    });

    it("Proyectos agrupa por área y Notas y estudio pone las materias en una fila", async () => {
      const p = panels() as Extract<MentorPanels, { loading: false }>;
      vi.mocked(api.mentorPanels).mockResolvedValue({
        ...p,
        areas: [...p.areas, { id: "salud", name: "Salud", icon: "💪", colour: "#33b679" }],
        projects: [{ ...project(), area: "estudio" }, { ...project(), id: "p2", key: "GYM", name: "Gimnasio", area: "salud" }],
      } as MentorPanels);
      await mount();
      await go("Proyectos");
      expect(rows()).toHaveLength(2);
      await go("Notas");
      expect(rows()).toHaveLength(1);
      expect(rows()[0]!.querySelectorAll("[data-testid=area-card]")).toHaveLength(2);
    });

    it("el borrador sigue visible con su calendario desplegable y sus acciones", async () => {
      useMentor.setState({ turns: [{ id: "t1", role: "assistant", text: "ok", draft: draft() } as unknown as MentorChatTurn], pending: "t1", chatLoaded: true });
      await mount();
      await go("Metas");
      const d = host.querySelector("[data-testid=goal-draft]")!;
      expect(d.querySelectorAll("[data-testid=draft-item]")).toHaveLength(0);
      expect(button("Crear meta", d)).toBeTruthy();
      expect(button("Descartar", d)).toBeTruthy();
      await click(button("Calendario por semanas", d));
      expect(d.querySelectorAll("[data-testid=draft-item]")).toHaveLength(1);
    });
  });

  it("avisa de la vault fría y reintenta al cargar los paneles", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.mentorPanels).mockResolvedValueOnce({ loading: true }).mockResolvedValue(panels());
      await mount();
      await act(async () => { await go("Proyectos"); });
      expect(host.textContent).toContain("Leyendo tu vault por primera vez");
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
      expect(host.textContent).not.toContain("Leyendo tu vault");
      expect(host.querySelector("[data-testid=project-card]")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Mentor: borrador -> Crear meta (la conversación vive en el asistente)", () => {
  const user = (id: string, content: string): MentorChatTurn => ({ id, role: "user", content, at: "2026-10-05T10:00:00" });

  it("'Crear meta' escribe vía mentor_goal_create y la tarjeta pasa a ser la real, con 'Abrir en Metas'", async () => {
    const d = draft();
    const turns: MentorChatTurn[] = [user("u1", "x"), { id: "a1", role: "assistant", content: "ok", at: "x", draft: d }];
    vi.mocked(api.mentorChatLoad).mockResolvedValueOnce({ turns, pending: "a1" }).mockResolvedValue({ turns: [turns[0]!, { ...turns[1]!, createdGoalId: "g1" }], pending: null });
    const create = vi.spyOn(api, "mentorGoalCreate").mockResolvedValue({ goalId: "g1", name: d.name, items: 1, schedule: d.schedule });
    await mount();
    await go("Metas");
    expect(host.querySelector("[data-testid=goal-draft]")).toBeTruthy();
    expect(host.querySelectorAll("[data-testid=goal-card]")).toHaveLength(1); // la meta real que ya existía

    await click(button("Crear meta"));
    expect(create).toHaveBeenCalledWith(d, "a1");
    // el borrador desaparece y la tarjeta real aparece marcada como recién creada
    expect(host.querySelector("[data-testid=goal-draft]")).toBeNull();
    expect(host.textContent).toContain("Recién creada");
    expect(button("Abrir en Metas")).toBeTruthy();
  });

  it("'Descartar' no crea nada", async () => {
    const d = draft();
    const turns: MentorChatTurn[] = [user("u1", "x"), { id: "a1", role: "assistant", content: "ok", at: "x", draft: d }];
    vi.mocked(api.mentorChatLoad).mockResolvedValue({ turns, pending: "a1" });
    const create = vi.spyOn(api, "mentorGoalCreate");
    const discard = vi.spyOn(api, "mentorDraftDiscard").mockResolvedValue({ turns: [turns[0]!, { ...turns[1]!, discarded: true }], pending: null });
    await mount();
    await go("Metas");
    await click(button("Descartar"));
    expect(discard).toHaveBeenCalledWith("a1");
    expect(create).not.toHaveBeenCalled();
    expect(host.querySelector("[data-testid=goal-draft]")).toBeNull();
  });

});
