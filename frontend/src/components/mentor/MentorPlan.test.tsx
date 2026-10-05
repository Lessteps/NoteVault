// @vitest-environment jsdom
//
// Mentor — Plan: una fila por área, una tarjeta desplegable por subplan (semanas, temas con estado y
// registro, metas requeridas, entregable), solo lectura salvo el estado del entregable, vista "Esta semana",
// estado vacío, borrador pendiente con acciones y la tarjeta plan_draft en el chat del Mentor.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorChatTurn, MentorMonthlyPlan, MentorPlanDraft, MentorPlanGet } from "../../lib/types";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { MentorAssistant } from "./MentorAssistant";
import { MentorModule } from "./MentorModule";
import { MentorPlan, monthNow } from "./MentorPlan";

const MONTH = monthNow();
const FUND = "Programación/Python/1 Fundamentos";
const APIS = "Programación/Python/2 APIs web";

const week = (n: number, topics: string[]) => ({ week: n, start: `${MONTH}-${String(1 + 7 * (n - 1)).padStart(2, "0")}`, end: `${MONTH}-${String(7 * n).padStart(2, "0")}`, topics, minutes: 60 * topics.length, capacityMinutes: 240 });

const plan = (): MentorMonthlyPlan => ({
  month: MONTH,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  hoursPerWeek: 6,
  subplans: [
    {
      id: "s1-programacion", area: "Programación", objective: "Desarrollo Backend", goalId: "g1",
      topics: [
        { folder: FUND, title: "1 Fundamentos", targetWeek: 1, estMinutes: 60, completedAt: "2026-10-03" },
        { folder: APIS, title: "2 APIs web", targetWeek: 2, estMinutes: 60 },
      ],
      weeks: [week(1, [FUND]), week(2, [APIS]), week(3, []), week(4, [])],
      requiredGoals: [{ goalId: "g1", itemId: "i1", note: "submeta diaria" }],
      deliverable: { title: "API de inventario", description: "CRUD con tests", criteria: ["CRUD completo", "tests pasan"], projectId: "p1", status: "en_curso" },
    },
    {
      id: "s2-ingles", area: "Inglés", objective: "Hablar con confianza",
      topics: [], weeks: [week(1, []), week(2, []), week(3, []), week(4, [])], requiredGoals: [],
      deliverable: { title: "Presentación en inglés", description: "", criteria: [], status: "idea" },
    },
  ],
});

const loaded = (over: Partial<Extract<MentorPlanGet, { loading: false }>> = {}): MentorPlanGet => ({
  loading: false,
  month: MONTH,
  today: `${MONTH}-09`,
  plan: plan(),
  derived: {
    subplans: [
      {
        id: "s1-programacion", total: 2, done: 1, pct: 70, currentWeek: 2,
        topics: [
          { ...plan().subplans[0]!.topics[0]!, state: "completo", pct: 100, found: true },
          { ...plan().subplans[0]!.topics[1]!, state: "practicando", pct: 40, found: true },
        ],
      },
      { id: "s2-ingles", total: 0, done: 0, pct: 0, currentWeek: 2, topics: [] },
    ],
    summary: { subplans: 2, topics: 2, done: 1, pct: 70, currentWeek: 2, weeks: 4 },
  },
  goals: { g1: { name: "Desarrollo Backend", pct: 35, items: { i1: { name: "Practicar APIs a diario", pct: 20 } } } },
  projects: { p1: { id: "p1", name: "API de inventario", status: "En curso" } },
  items: [
    { kind: "topic", month: MONTH, subplanId: "s1-programacion", label: "Programación: Desarrollo Backend", area: "Programación", title: "2 APIs web", folder: APIS, estMinutes: 60, targetWeek: 2, overdue: false },
  ],
  months: [MONTH],
  aiConfigured: true,
  ...over,
});

const draft = (): MentorPlanDraft => ({
  month: MONTH, hoursPerWeek: 6, rationale: "Primero bases y luego APIs.", subplans: plan().subplans, warnings: ["No cabe en el mes: harían falta unas 8 h/semana."],
  fits: false, totalMinutes: 120, availableMinutes: 100, requiredHoursPerWeek: 8, from: `${MONTH}-01`, discarded: ["Programación/Django/Inventado"], why: {},
});
const bot = (id: string, content: string, extra: Partial<MentorChatTurn> = {}): MentorChatTurn => ({ id, role: "assistant", content, at: "2026-10-05T10:00:03", ...extra });

let host: HTMLDivElement;
let root: Root;

const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const click = async (el: Element | undefined) => {
  expect(el, "botón no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  useMentor.setState({ panels: null, turns: [], pending: null, chatId: null, chatTitle: "Nueva conversación", chats: [], historyOpen: false, chatLoaded: false, sending: false, notice: null, creating: false, createdGoalId: null, warming: false, panelsError: "", planMode: false, composerSeed: "", acceptingPlan: false, planVersion: 0, pendingObjective: null });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorChatLoad").mockResolvedValue({ turns: [], pending: null });
  vi.spyOn(api, "mentorOverview").mockResolvedValue({ loading: true });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Mentor — Plan", () => {
  it("una fila por área con una tarjeta por subplan y el resumen del mes", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan />);
    expect(host.textContent).toContain("Mentor — Plan");
    const rows = [...host.querySelectorAll("section[aria-label='Programación'], section[aria-label='Inglés']")];
    expect(rows).toHaveLength(2);
    const cards = host.querySelectorAll("[data-testid=subplan-card]");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("Desarrollo Backend");
    expect(cards[0]!.textContent).toContain("70 %");
    expect(cards[0]!.textContent).toContain("1/2 temas");
    expect(cards[0]!.textContent).toContain("semana 2");
    expect(cards[0]!.textContent).toContain("Entregable: En curso");
    expect(host.querySelector("[data-testid=plan-summary]")!.textContent).toContain("2 subplanes · 1/2 temas completados · 70% global");
    // plegada: sin detalle
    expect(host.querySelector("[data-testid=subplan-detail]")).toBeNull();
  });

  it("al desplegar muestra semanas, temas con estado y registro, metas requeridas y entregable", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan />);
    await click(button("Expandir Desarrollo Backend"));
    const detail = host.querySelector("[data-testid=subplan-detail]")!;
    expect(detail.querySelectorAll("[data-testid=plan-week]")).toHaveLength(4);
    expect(detail.querySelectorAll("[data-testid=plan-week]")[1]!.className).toContain("border-accent"); // semana actual
    const topics = detail.querySelectorAll("[data-testid=plan-topic]");
    expect(topics[0]!.textContent).toContain("Completo");
    expect(topics[0]!.textContent).toContain("completado el");
    expect(topics[1]!.textContent).toContain("Practicando");
    expect(topics[1]!.textContent).toContain("40 %");
    expect(topics[1]!.textContent).toContain("sin completar");
    expect(detail.querySelector("[data-testid=plan-required-goal]")!.textContent).toContain("Desarrollo Backend");
    expect(detail.querySelector("[data-testid=plan-required-goal]")!.textContent).toContain("20 %");
    expect(button("Abrir en Metas", detail)).toBeTruthy();
    const d = detail.querySelector("[data-testid=plan-deliverable]")!;
    expect(d.textContent).toContain("API de inventario");
    expect(d.textContent).toContain("tests pasan");
    expect(button("Abrir en Proyectos", d)).toBeTruthy();
    expect(button("Ver tema 1 Fundamentos", detail)).toBeTruthy();
    // contraer
    await click(button("Contraer Desarrollo Backend"));
    expect(host.querySelector("[data-testid=subplan-detail]")).toBeNull();
  });

  it("solo es editable el estado del entregable; lo demás no tiene campos de edición", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    const update = vi.spyOn(api, "mentorPlanUpdateDeliverable").mockResolvedValue({ ...plan(), subplans: [{ ...plan().subplans[0]!, deliverable: { ...plan().subplans[0]!.deliverable!, status: "hecho" } }, plan().subplans[1]!] });
    await mountEl(<MentorPlan />);
    await click(button("Expandir Desarrollo Backend"));
    const detail = host.querySelector("[data-testid=subplan-detail]")!;
    expect(detail.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(detail.querySelectorAll("select")).toHaveLength(1);
    const sel = detail.querySelector<HTMLSelectElement>("select[aria-label='Estado del entregable']")!;
    expect([...sel.options].map((o) => o.value)).toEqual(["idea", "en_curso", "hecho"]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "hecho");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(update).toHaveBeenCalledWith({ month: MONTH, subplanId: "s1-programacion", status: "hecho" });
  });

  it("el subplan sin proyecto lo presenta como propuesta de entregable", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan />);
    await click(button("Expandir Hablar con confianza"));
    const d = host.querySelector("[data-testid=plan-deliverable]")!;
    expect(d.textContent).toContain("Propuesta");
    expect(button("Abrir en Proyectos", d)).toBeUndefined();
  });

  it("'Esta semana / Hoy' lista lo que toca y 'Planear mi día con esto' lleva a Hoy con el objetivo del plan", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan />);
    await click(button("Esta semana / Hoy"));
    const items = host.querySelectorAll("[data-testid=plan-week-item]");
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain("2 APIs web");
    expect(items[0]!.textContent).toContain("Plan: Programación: Desarrollo Backend");
    await click(button("Planear mi día con esto"));
    expect(useMentor.getState().pendingObjective).toEqual({ type: "plan" });
    expect(useNavState.getState().values["mentor.view"]).toBe("hoy");
  });

  it("sin plan del mes: estado vacío que explica y ofrece generarlo con el Mentor", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ plan: null, derived: null, items: [], months: [] }));
    await mountEl(<MentorPlan />);
    const empty = host.querySelector("[data-testid=plan-empty]")!;
    expect(empty.textContent).toContain("Aún no hay plan para");
    expect(empty.textContent).toContain("entregable");
    expect(host.querySelectorAll("[data-testid=subplan-card]")).toHaveLength(0);
    expect(button("Generar plan del mes", empty)).toBeTruthy();
  });

  it("sin IA lo avisa en el estado vacío", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ plan: null, derived: null, items: [], aiConfigured: false }));
    await mountEl(<MentorPlan />);
    expect(host.querySelector("[data-testid=plan-empty]")!.textContent).toContain("La IA no está configurada");
  });

  it("navega entre meses y pide ese mes", async () => {
    const get = vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorPlan />);
    await click(button("Mes siguiente"));
    const next = get.mock.calls.at(-1)![0]!;
    expect(next > MONTH).toBe(true);
    await click(button("Este mes"));
    expect(get.mock.calls.at(-1)![0]).toBe(MONTH);
  });

  it("'Generar plan del mes con el Mentor' abre el asistente en una conversación de plan", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    vi.spyOn(api, "mentorChatNew").mockResolvedValue({ id: "c2", title: "", turns: [], pending: null });
    useAssistant.setState({ open: false });
    await mountEl(<MentorPlan />);
    await click(button("Generar plan del mes"));
    expect(useAssistant.getState().open).toBe(true);
    expect(useMentor.getState().planMode).toBe(true);
    expect(useMentor.getState().composerSeed).toContain("plan para este mes");
  });

  it("el borrador pendiente se destaca arriba con calendario plegable y Aceptar / Descartar", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ plan: null, derived: null, items: [], months: [] }));
    const accept = vi.spyOn(api, "mentorPlanDraftAccept").mockResolvedValue({ month: MONTH, subplans: 2, topics: 2, warnings: [], fits: true });
    const discard = vi.spyOn(api, "mentorPlanDraftDiscard").mockResolvedValue({ turns: [], pending: null });
    useMentor.setState({ turns: [bot("a1", "Primero bases y luego APIs.", { planDraft: draft() })], pending: "a1", chatLoaded: true, chatId: "c1" });
    await mountEl(<MentorPlan />);
    const card = host.querySelector("[data-testid=plan-draft]")!;
    expect(card.textContent).toContain("Borrador del plan de");
    expect(card.textContent).toContain("2 subplanes");
    expect(card.textContent).toContain("No cabe en el mes");
    expect(card.textContent).toContain("Programación/Django/Inventado"); // lo descartado se avisa
    expect(host.querySelector("[data-testid=plan-empty]")).toBeNull(); // con borrador no se muestra el vacío
    expect(host.querySelector("[data-testid=draft-calendar]")).toBeNull();
    await click(button("Ver calendario semanal", card));
    expect(card.querySelector("[data-testid=draft-calendar]")!.textContent).toContain("Semana 1");
    expect(card.querySelector("[data-testid=draft-calendar]")!.textContent).toContain("1 Fundamentos");
    await click(button("Aceptar plan", card));
    expect(accept).toHaveBeenCalledWith("a1", "c1");
    expect(discard).not.toHaveBeenCalled();
  });

  it("Descartar el borrador no acepta nada", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded({ plan: null, derived: null, items: [], months: [] }));
    const accept = vi.spyOn(api, "mentorPlanDraftAccept");
    const discard = vi.spyOn(api, "mentorPlanDraftDiscard").mockResolvedValue({ turns: [], pending: null });
    useMentor.setState({ turns: [bot("a1", "x", { planDraft: draft() })], pending: "a1", chatLoaded: true, chatId: "c1" });
    await mountEl(<MentorPlan />);
    await click(button("Descartar", host.querySelector("[data-testid=plan-draft]")!));
    expect(discard).toHaveBeenCalledWith("a1");
    expect(accept).not.toHaveBeenCalled();
    expect(host.querySelector("[data-testid=plan-draft]")).toBeNull();
  });
});

describe("Mentor: la tarjeta plan_draft en el chat", () => {
  async function mountAssistant() {
    await mountEl(<MentorAssistant />);
  }

  it("resume el plan y ofrece Ver en Plan, Aceptar plan y Descartar", async () => {
    const accept = vi.spyOn(api, "mentorPlanDraftAccept").mockResolvedValue({ month: MONTH, subplans: 2, topics: 2, warnings: [], fits: true });
    const discard = vi.spyOn(api, "mentorPlanDraftDiscard").mockResolvedValue({ turns: [], pending: null });
    vi.mocked(api.mentorChatLoad).mockResolvedValue({ id: "c1", title: "plan", turns: [bot("a1", "Primero bases y luego APIs.", { planDraft: draft() })], pending: "a1" });
    await mountAssistant();
    const card = host.querySelector("[data-testid=chat-plan-draft]")!;
    expect(card.textContent).toContain(`Plan de ${MONTH}`);
    expect(card.textContent).toContain("2 subplanes · 2 temas · 6 h/semana");
    expect(host.querySelector("[data-testid=chat-draft]")).toBeNull(); // no es una meta
    expect(button("Crear meta", card)).toBeUndefined();

    await click(button("Ver en Plan", card));
    expect(useNavState.getState().values["mentor.view"]).toBe("plan");
    await click(button("Aceptar plan", card));
    expect(accept).toHaveBeenCalledWith("a1", "c1");
    await click(button("Descartar", card));
    expect(discard).toHaveBeenCalledWith("a1");
  });

  it("un plan ya aceptado o descartado no ofrece acciones", async () => {
    vi.mocked(api.mentorChatLoad).mockResolvedValue({
      id: "c1", title: "plan", pending: null,
      turns: [bot("a1", "x", { planDraft: draft(), acceptedPlan: MONTH }), bot("a2", "y", { planDraft: draft(), discarded: true })],
    });
    await mountAssistant();
    const cards = host.querySelectorAll("[data-testid=chat-plan-draft]");
    expect(cards[0]!.textContent).toContain("Aceptado");
    expect(cards[1]!.textContent).toContain("Descartado");
    expect(button("Aceptar plan", cards[0]!)).toBeUndefined();
    expect(button("Aceptar plan", cards[1]!)).toBeUndefined();
  });

  it("una conversación de plan siembra el campo de mensaje y envía con mode=plan", async () => {
    const chat = vi.spyOn(api, "mentorChat").mockResolvedValue({ loading: false, kind: "question", text: "¿Horas?", pending: null, id: "c1", title: "t", turns: [{ id: "u1", role: "user", content: "Quiero un plan para este mes: backend", at: "x" }, bot("a1", "¿Horas?")] });
    vi.spyOn(api, "mentorChatNew").mockResolvedValue({ id: "c2", title: "", turns: [], pending: null });
    await mountAssistant();
    await act(async () => { await useMentor.getState().startPlanChat(); });
    await flush();
    const area = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mensaje para el Mentor']")!;
    expect(area.value).toBe("Quiero un plan para este mes: ");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "Quiero un plan para este mes: backend");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(host.querySelector("button[aria-label='Enviar al Mentor']")!);
    expect(chat).toHaveBeenCalledWith("Quiero un plan para este mes: backend", undefined, "plan");
  });
});

describe("MentorModule: sección Plan", () => {
  it("aparece entre Hoy y Metas y muestra el panel", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded());
    await mountEl(<MentorModule />);
    const nav = [...host.querySelectorAll("aside nav button")].map((b) => b.textContent ?? "");
    expect(nav.findIndex((t) => t.includes("Plan"))).toBe(nav.findIndex((t) => t.includes("Hoy")) + 1);
    await click([...host.querySelectorAll("aside nav button")].find((b) => b.textContent?.includes("Plan")));
    expect(host.textContent).toContain("Mentor — Plan");
  });
});
