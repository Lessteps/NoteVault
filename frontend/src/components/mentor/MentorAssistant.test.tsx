// @vitest-environment jsdom
//
// La conversación con el Mentor vive en el panel del asistente: con la pestaña Mentor activa el panel
// se pone en contexto Mentor (cabecera, bienvenida, chat y historial propios) y fuera de ella vuelve al
// chat normal sin perder nada. Los borradores se ven en el chat como tarjeta con sus acciones.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorChatMeta, MentorChatResult, MentorChatTurn, MentorGoalDraft } from "../../lib/types";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { AssistantPanel } from "../notes/AssistantPanel";

const FUND = "Programación/Python/1 Fundamentos";
const draft = (): MentorGoalDraft => ({
  name: "Backend con Python",
  area: "",
  description: "",
  discarded: [],
  topics: [{ folder: FUND, title: "1 Fundamentos", subject: "programming", skills: [], why: "base", estMinutes: 40 }],
  schedule: {
    start: "2026-10-05", end: "2027-01-04", weeks: 13, hoursPerWeek: 6, totalMinutes: 40, availableMinutes: 4000, fits: true, requiredHoursPerWeek: 0.1, warnings: [],
    items: [{ name: "1 Fundamentos", folders: [FUND], topic_links: [FUND], minutes: 40, start: "2026-10-05", due: "2026-10-12", weekFrom: 1, weekTo: 1 }],
  },
});
const user = (id: string, content: string): MentorChatTurn => ({ id, role: "user", content, at: "2026-10-05T10:00:00" });
const bot = (id: string, content: string, extra: Partial<MentorChatTurn> = {}): MentorChatTurn => ({ id, role: "assistant", content, at: "2026-10-05T10:00:03", ...extra });

let host: HTMLDivElement;
let root: Root;

const flush = () => act(async () => { await Promise.resolve(); });
const mount = async () => { await act(async () => { root.render(<AssistantPanel />); }); await flush(); };
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? "")))!;
const click = async (el: Element | undefined) => {
  expect(el, "botón no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const setModule = (module: "mentor" | "notas" | "home") => act(async () => { useApp.setState({ module }); });

const META: MentorChatMeta[] = [
  { id: "c1", title: "Backend con Python desde cero", createdAt: "2026-10-05T10:00:00", updatedAt: "2026-10-05T10:05:00", count: 4, active: true },
  { id: "c2", title: "Repasar álgebra", createdAt: "2026-10-01T10:00:00", updatedAt: "2026-10-01T10:05:00", count: 2, active: false },
];

beforeEach(() => {
  localStorage.clear();
  useNavState.setState({ values: {} });
  useApp.setState({ module: "mentor" });
  useAssistant.setState({ open: true, messages: [], historyOpen: false });
  useMentor.setState({
    turns: [], pending: null, chatId: null, chatTitle: "Nueva conversación", chats: [], historyOpen: false, chatLoaded: false,
    sending: false, notice: null, creating: false, createdGoalId: null, panels: null, focusSeq: 0,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorChatLoad").mockResolvedValue({ id: null, title: "", turns: [], pending: null });
  vi.spyOn(api, "mentorPanels").mockResolvedValue({ loading: true });
  vi.spyOn(api, "conversationList").mockResolvedValue([]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Asistente: contexto Mentor", () => {
  it("en la pestaña Mentor muestra la etiqueta, la bienvenida y el placeholder del Mentor", async () => {
    await mount();
    expect(host.querySelector("[data-context=mentor]")).toBeTruthy();
    expect(host.querySelector("[data-testid=mentor-badge]")!.textContent).toBe("Mentor");
    expect(host.textContent).toContain("Cuéntale al Mentor qué quieres lograr");
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mensaje para el Mentor']")!.placeholder).toContain("Cuéntale al Mentor qué quieres lograr");
    // no es el chat normal
    expect(host.textContent).not.toContain("Pregunta sobre la nota abierta");
    expect(host.querySelector("textarea[aria-label='Pregunta al asistente']")).toBeNull();
  });

  it("fuera de la pestaña Mentor vuelve al asistente normal, sin perder su conversación, y al volver recupera la del Mentor", async () => {
    useAssistant.setState({ messages: [{ id: "m1", role: "user", content: "pregunta normal sobre la nota", at: 1 }] });
    vi.mocked(api.mentorChatLoad).mockResolvedValue({ id: "c1", title: "Backend", turns: [user("u1", "backend en Python"), bot("a1", "¿Cuántas horas por semana tienes?")], pending: null });
    await mount();
    expect(host.textContent).toContain("¿Cuántas horas por semana tienes?");
    expect(host.textContent).not.toContain("pregunta normal sobre la nota"); // no se mezclan

    await setModule("notas");
    expect(host.querySelector("[data-context=mentor]")).toBeNull();
    expect(host.textContent).toContain("pregunta normal sobre la nota");
    expect(host.textContent).not.toContain("¿Cuántas horas por semana tienes?");
    expect(host.querySelector("textarea[aria-label='Pregunta al asistente']")).toBeTruthy();
    expect(useAssistant.getState().messages).toHaveLength(1);

    await setModule("mentor");
    expect(host.textContent).toContain("¿Cuántas horas por semana tienes?");
    expect(useMentor.getState().turns).toHaveLength(2);
  });

  it("envía por mentor_chat (no por el chat normal) y muestra la pregunta del Mentor", async () => {
    const q: MentorChatResult = {
      loading: false, kind: "question", text: "¿Cuántas horas por semana tienes?", pending: null, id: "c1", title: "backend en Python en 3 meses",
      turns: [user("u1", "backend en Python en 3 meses"), bot("a1", "¿Cuántas horas por semana tienes?")],
    };
    const chat = vi.spyOn(api, "mentorChat").mockResolvedValue(q);
    const stream = vi.spyOn(api, "aiChatStream");
    await mount();
    await type(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mensaje para el Mentor']")!, "backend en Python en 3 meses");
    await click(button("Enviar", host) ?? host.querySelector("button[aria-label='Enviar al Mentor']")!);
    expect(chat).toHaveBeenCalledWith("backend en Python en 3 meses", undefined);
    expect(stream).not.toHaveBeenCalled();
    expect(host.textContent).toContain("¿Cuántas horas por semana tienes?");
    expect(useAssistant.getState().messages).toHaveLength(0);
    expect(host.querySelector("[data-testid=mentor-badge]")!.nextElementSibling!.textContent).toContain("backend en Python en 3 meses");
  });

  it("sin IA lo dice con claridad y no hay borrador", async () => {
    vi.spyOn(api, "mentorChat").mockResolvedValue({ loading: false, kind: "no_ai", text: "La IA no está configurada (falta la API key).", turns: [user("u1", "hola")], pending: null });
    await mount();
    await type(host.querySelector<HTMLTextAreaElement>("textarea")!, "hola");
    await click(host.querySelector("button[aria-label='Enviar al Mentor']")!);
    const notice = host.querySelector("[data-testid=chat-notice]")!;
    expect(notice.textContent).toContain("Sin IA disponible no puedo proponerte una meta");
    expect(notice.textContent).toContain("falta la API key");
    expect(host.querySelector("[data-testid=chat-draft]")).toBeNull();
  });
});

describe("Asistente (Mentor): borrador en el chat", () => {
  const withDraft = (over: Partial<MentorChatTurn> = {}, pending: string | null = "a2") => {
    vi.mocked(api.mentorChatLoad).mockResolvedValue({
      id: "c1", title: "Backend", pending,
      turns: [user("u1", "backend"), bot("a2", "Primero bases y luego APIs.", { draft: draft(), ...over })],
    });
  };

  it("muestra una tarjeta compacta con 'Crear meta', 'Ver en Metas' y 'Descartar'", async () => {
    withDraft();
    await mount();
    const card = host.querySelector("[data-testid=chat-draft]")!;
    expect(card.textContent).toContain("Backend con Python");
    expect(card.textContent).toContain("1 submetas");
    expect(card.textContent).toContain("6 h/semana");
    for (const label of ["Crear meta", "Ver en Metas", "Descartar"]) expect(button(label, card)).toBeTruthy();
  });

  it("'Ver en Metas' lleva al panel Metas del Mentor", async () => {
    withDraft();
    await mount();
    await click(button("Ver en Metas"));
    expect(useNavState.getState().values["mentor.view"]).toBe("metas");
  });

  it("'Crear meta' y 'Descartar' usan la API del Mentor", async () => {
    withDraft();
    const create = vi.spyOn(api, "mentorGoalCreate").mockResolvedValue({ goalId: "g1", name: "Backend con Python", items: 1, schedule: draft().schedule });
    await mount();
    await click(button("Crear meta"));
    expect(create).toHaveBeenCalledWith(draft(), "a2");

    const discard = vi.spyOn(api, "mentorDraftDiscard").mockResolvedValue({ turns: [user("u1", "backend"), bot("a2", "x", { draft: draft(), discarded: true })], pending: null });
    withDraft();
    useMentor.setState({ chatLoaded: false });
    await act(async () => { await useMentor.getState().loadChat(); });
    await click(button("Descartar"));
    expect(discard).toHaveBeenCalledWith("a2");
    expect(host.querySelector("[data-testid=chat-draft]")!.textContent).toContain("Descartado");
  });

  it("un borrador ya creado no ofrece acciones de creación", async () => {
    withDraft({ createdGoalId: "g1" }, null);
    await mount();
    const card = host.querySelector("[data-testid=chat-draft]")!;
    expect(card.textContent).toContain("Creada");
    expect(button("Crear meta", card)).toBeUndefined();
  });
});

describe("Asistente (Mentor): historial propio", () => {
  it("'Historial' abre el historial DEL MENTOR, no el del asistente", async () => {
    const list = vi.spyOn(api, "mentorChatsList").mockResolvedValue(META);
    await mount();
    await click(host.querySelector("button[title=Historial]")!);
    expect(list).toHaveBeenCalled();
    expect(api.conversationList).not.toHaveBeenCalled();
    const h = host.querySelector("[aria-label='Historial del Mentor']")!;
    expect(h.textContent).toContain("Backend con Python desde cero");
    expect(h.textContent).toContain("Repasar álgebra");
    expect(h.textContent).toContain("4 mensajes");
  });

  it("abre, renombra y elimina conversaciones del Mentor", async () => {
    vi.spyOn(api, "mentorChatsList").mockResolvedValue(META);
    const open = vi.spyOn(api, "mentorChatOpen").mockResolvedValue({ id: "c2", title: "Repasar álgebra", turns: [user("u9", "álgebra"), bot("a9", "Dime tu nivel")], pending: null });
    await mount();
    await click(host.querySelector("button[title=Historial]")!);
    await click([...host.querySelectorAll("[aria-label='Historial del Mentor'] button[title]")].find((b) => b.getAttribute("title") === "Repasar álgebra"));
    expect(open).toHaveBeenCalledWith("c2");
    expect(host.querySelector("[aria-label='Historial del Mentor']")).toBeNull();
    expect(host.textContent).toContain("Dime tu nivel");
    expect(useMentor.getState().chatTitle).toBe("Repasar álgebra");

    // renombrar y eliminar desde el store (los diálogos de confirmación son globales)
    const rename = vi.spyOn(api, "mentorChatRename").mockResolvedValue({ id: "c2", title: "Álgebra lineal" });
    await act(async () => { await useMentor.getState().renameChat("c2", "Álgebra lineal"); });
    expect(rename).toHaveBeenCalledWith("c2", "Álgebra lineal");
    expect(useMentor.getState().chatTitle).toBe("Álgebra lineal");
    const del = vi.spyOn(api, "mentorChatDelete").mockResolvedValue({ id: "c1", title: "Backend", turns: [user("u1", "x")], pending: null });
    await act(async () => { await useMentor.getState().deleteChat("c2"); });
    expect(del).toHaveBeenCalledWith("c2");
    expect(useMentor.getState().chatId).toBe("c1");
  });

  it("'Nueva conversación' crea una conversación del Mentor (no del asistente)", async () => {
    vi.mocked(api.mentorChatLoad).mockResolvedValue({ id: "c1", title: "Backend", turns: [user("u1", "backend")], pending: null });
    const created = vi.spyOn(api, "mentorChatNew").mockResolvedValue({ id: "c3", title: "", turns: [], pending: null });
    await mount();
    await click(host.querySelector("button[title='Nueva conversación']")!);
    expect(created).toHaveBeenCalled();
    expect(useMentor.getState().turns).toEqual([]);
    expect(useMentor.getState().chatId).toBe("c3");
    expect(host.textContent).toContain("Cuéntale al Mentor qué quieres lograr");
  });
});
