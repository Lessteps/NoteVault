// @vitest-environment jsdom
//
// El Mentor como espacio de paneles: navegación interna, previsualizaciones de SOLO lectura
// (Metas / Proyectos / Notas con su botón "Abrir en…") y el flujo conversación -> borrador -> "Crear meta".

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { GoalCard, MentorChatResult, MentorChatTurn, MentorGoalDraft, MentorOverview, MentorPanels, ProjectCard } from "../../lib/types";
import { useApp } from "../../store/app";
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

const project = (): ProjectCard =>
  ({
    id: "p1", key: "APP", name: "Mi app", status: "En curso", status_colour: "#2383e2", area: "", colour: "#2383e2", icon: "", created: null, start: null,
    deadline: "2026-12-01", columns: [], done_column: "Hecho", in_calendar: false, description: "", days_left: 57, overdue: false, folders: [],
    summary: { total: 10, done: 4, open: 6, overdue: 1, progress: 0.4, estimate_min: 0, estimate_done_min: 0 }, throughput: [], next_due: { key: "APP-3", title: "Login", due: "2026-10-20" },
  }) as unknown as ProjectCard;

const panels = (over: Partial<Extract<MentorPanels, { loading: false }>> = {}): MentorPanels => ({
  loading: false,
  areas: [{ id: "estudio", name: "Estudio", icon: "📚" }],
  goals: [
    {
      card: card(),
      items: [
        {
          id: "i1", parent: "", name: "1 Fundamentos", status: "todo", due: "2026-10-12", start: "2026-10-05", is_leaf: true, progress: 0.5, late: false, topic_links: [FUND],
          topic_progress: { done: false, pct: 50, broken: [], missing: [], links: [{ link: FUND, topic: FUND, title: "1 Fundamentos", skills: [], broken: false, done: false, pct: 50 }] },
        },
        {
          id: "i2", parent: "", name: "Tema borrado", status: "todo", due: null, start: null, is_leaf: true, progress: 0, late: false, topic_links: ["X/Y"],
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
const go = (label: string) => click([...host.querySelectorAll("aside nav button")].find((b) => b.textContent?.includes(label)));
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  useMentor.setState({ panels: null, turns: [], pending: null, chatLoaded: false, sending: false, notice: null, creating: false, createdGoalId: null, warming: false, panelsError: "" });
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
  it("navega entre Hoy, Metas, Proyectos, Notas y Conversación; arranca en Hoy", async () => {
    await mount();
    const nav = [...host.querySelectorAll("aside nav button")].map((b) => b.textContent ?? "");
    expect(nav.map((t) => ["Hoy", "Metas", "Proyectos", "Notas y estudio", "Conversación"].find((l) => t.includes(l)))).toEqual(["Hoy", "Metas", "Proyectos", "Notas y estudio", "Conversación"]);
    expect(host.textContent).toContain("Mentor — Hoy");

    await go("Metas");
    expect(host.textContent).toContain("Mentor — Metas");
    await go("Proyectos");
    expect(host.textContent).toContain("Mentor — Proyectos");
    await go("Notas y estudio");
    expect(host.textContent).toContain("Mentor — Notas y estudio");
    await go("Conversación");
    expect(host.textContent).toContain("Mentor — Conversación");
    await go("Hoy");
    expect(host.textContent).toContain("Mentor — Hoy");
  });

  it("Metas: previsualización de solo lectura con área, fechas, avance, submetas, temas enlazados y enlaces rotos", async () => {
    await mount();
    await go("Metas");
    const g = host.querySelector("[data-testid=goal-card]")!;
    expect(g.textContent).toContain("Backend con Python");
    expect(g.textContent).toContain("Estudio");
    expect(g.textContent).toContain("25 %");
    expect(g.textContent).toContain("91 d restantes");
    expect(g.textContent).toContain("1/4 submetas");
    const items = g.querySelectorAll("[data-testid=goal-item]");
    expect(items[0]!.textContent).toContain("📚 1 Fundamentos");
    expect(items[0]!.textContent).toContain("50 %");
    expect(items[1]!.textContent).toContain("enlace roto");
    // sin controles de edición
    expect(host.querySelectorAll("input, textarea, select")).toHaveLength(0);
    const labels = [...host.querySelectorAll("main button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Editar");
    expect(labels).not.toContain("Borrar");
  });

  it("'Abrir en Metas' abre esa meta en su módulo", async () => {
    const open = vi.spyOn(useGoals.getState(), "open").mockResolvedValue();
    await mount();
    await go("Metas");
    await click(button("Abrir en Metas"));
    expect(open).toHaveBeenCalledWith("g1");
    expect(useApp.getState().module).toBe("metas");
  });

  it("Proyectos: estado, plazo e issues abiertos, y 'Abrir en Proyectos'", async () => {
    const open = vi.spyOn(useProjects.getState(), "open").mockResolvedValue();
    await mount();
    await go("Proyectos");
    const p = host.querySelector("[data-testid=project-card]")!;
    expect(p.textContent).toContain("Mi app");
    expect(p.textContent).toContain("En curso");
    expect(p.textContent).toContain("57 d restantes");
    expect(p.textContent).toContain("6 issues abiertos de 10");
    expect(p.textContent).toContain("1 vencidos");
    expect(host.querySelectorAll("input, textarea, select")).toHaveLength(0);
    await click(button("Abrir en Proyectos"));
    expect(open).toHaveBeenCalledWith("p1");
    expect(useApp.getState().module).toBe("proyectos");
  });

  it("Notas y estudio: texto compacto, sin anillos, con 'ver tema'", async () => {
    const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValue({ path: "" } as never);
    await mount();
    await go("Notas y estudio");
    expect(host.querySelector("[data-testid=study-summary]")!.textContent).toContain("5 temas: 2 a medias, 1 sin tratar, 2 completos");
    expect(host.textContent).toContain("pendiente: debug");
    expect(host.textContent).toContain("último intento hace 9 d");
    expect(host.textContent).toContain("mathematics: 3 (el más antiguo, 4 d de retraso)");
    expect(host.textContent).toContain("repetido 3 veces");
    expect(host.querySelector("svg circle[stroke-dasharray]")).toBeNull();
    await click(button("ver tema", host.querySelectorAll("[data-testid=topic-row]")[0]!));
    expect(ensure).toHaveBeenCalledWith(FUND);
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

describe("Mentor: conversación -> borrador -> Crear meta", () => {
  const turnsAfter = (replies: MentorChatTurn[]) => replies;
  const user = (id: string, content: string): MentorChatTurn => ({ id, role: "user", content, at: "2026-10-05T10:00:00" });

  it("la pregunta del Mentor aparece en el chat y la respuesta del usuario genera el borrador en Metas", async () => {
    const q: MentorChatResult = {
      loading: false, kind: "question", text: "¿Cuántas horas por semana tienes?", pending: null,
      turns: turnsAfter([user("u1", "backend en Python en 3 meses"), { id: "a1", role: "assistant", content: "¿Cuántas horas por semana tienes?", at: "x" }]),
    };
    const d = draft();
    const draftTurns = [...q.turns, user("u2", "6 horas"), { id: "a2", role: "assistant" as const, content: "Primero bases y luego APIs.", at: "x", draft: d }];
    const chat = vi.spyOn(api, "mentorChat").mockResolvedValueOnce(q).mockResolvedValueOnce({ loading: false, kind: "draft", text: "Primero bases y luego APIs.", draft: d, turns: draftTurns, pending: "a2" });
    await mount();
    await go("Conversación");
    const field = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mensaje para el Mentor']")!;
    await type(field, "backend en Python en 3 meses");
    await click(button("Enviar"));
    expect(chat).toHaveBeenLastCalledWith("backend en Python en 3 meses");
    expect(host.textContent).toContain("¿Cuántas horas por semana tienes?");

    await type(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mensaje para el Mentor']")!, "6 horas");
    await click(button("Enviar"));
    expect(host.textContent).toContain("Borrador «Backend con Python»");

    await click(button("Ver en Metas"));
    expect(host.textContent).toContain("Borrador de meta");
    const dr = host.querySelector("[data-testid=goal-draft]")!;
    expect(dr.textContent).toContain("Backend con Python");
    expect(dr.textContent).toContain("6 h/semana");
    expect(dr.textContent).toContain("Semana 1");
    expect(dr.textContent).toContain("1 Fundamentos");
    expect(dr.textContent).toContain("Te sobra tiempo");
    expect(dr.textContent).toContain("Programación/Django/Inventado");
    expect(dr.textContent).toContain("Hasta que la crees no se escribe nada");
  });

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

  it("sin IA el chat lo dice con claridad y no hay borrador", async () => {
    vi.spyOn(api, "mentorChat").mockResolvedValue({ loading: false, kind: "no_ai", text: "La IA no está configurada (falta la API key).", turns: [user("u1", "hola")], pending: null });
    await mount();
    await go("Conversación");
    await type(host.querySelector<HTMLTextAreaElement>("textarea")!, "hola");
    await click(button("Enviar"));
    const notice = host.querySelector("[data-testid=chat-notice]")!;
    expect(notice.textContent).toContain("Sin IA disponible no puedo proponerte una meta");
    expect(notice.textContent).toContain("falta la API key");
    expect(host.textContent).not.toContain("Borrador «");
  });
});
