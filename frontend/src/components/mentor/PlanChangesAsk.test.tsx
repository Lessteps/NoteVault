// @vitest-environment jsdom
//
// Mentor — «Preguntas, correcciones y ajustes»: las tres intenciones (preguntar · corregir · ajustar), la detección con IA simulada y la
// aclaración «¿Solo quieres saber X o quieres que lo cambie?», que preguntar NO modifica el plan, el hilo con preguntas y respuestas y
// que «Deshacer» solo aparece en los cambios aplicados. Mantiene atajos, estado de espera con cancelar y accesibilidad.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorChangeEntry, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { PlanChanges } from "./PlanChanges";

const PID = "2026-10-06_2027-04-05";
const planData = { id: PID, start: "2026-10-06", end: "2027-04-05", createdAt: "", updatedAt: "", subplans: [] } as unknown as MentorPlan;
const entry = (over: Partial<MentorChangeEntry> = {}): MentorChangeEntry => ({ n: 1, at: "2026-10-06T10:00:00Z", comment: "Quita lo de desktop", status: "applied", source: "ai", summary: "Quité Desktop.", delta: { added: 0, removed: 4, moved: 0, deliverables: 0 }, changed: [], warnings: [], fixOptions: [], ...over });
const answered = (over: Partial<MentorChangeEntry> = {}): MentorChangeEntry => entry({ n: 2, comment: "¿Por qué este orden?", status: "answered", kind: "question", answer: "Backend va primero porque lo demás se apoya en él.", summary: "Pregunta respondida: el plan no cambió.", delta: { added: 0, removed: 0, moved: 0, deliverables: 0 }, ...over });

let host: HTMLDivElement;
let root: Root;
const announce = vi.fn();
const onApplied = vi.fn();
const flush = () => act(async () => { await Promise.resolve(); });
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
const button = (label: string | RegExp, within: ParentNode = host) => [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? "")))!;
const type = async (el: HTMLTextAreaElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const ta = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
const radio = (label: string) => [...host.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((r) => r.closest("label")?.textContent?.includes(label))!;
const mount = async () => {
  await act(async () => { root.render(<PlanChanges planId={PID} onApplied={onApplied} announce={announce} />); });
  await flush();
  await flush();
};

beforeEach(() => {
  announce.mockReset();
  onApplied.mockReset();
  useMentor.setState({ planVersion: 0 });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("pestaña «Preguntas, correcciones y ajustes»", () => {
  it("el título y el selector de intención son accesibles: grupo de radios con 4 opciones y «detectar» por defecto", async () => {
    await mount();
    expect(host.querySelector("h2")!.textContent).toContain("Preguntas, correcciones y ajustes");
    const group = host.querySelector("[role=radiogroup]")!;
    expect(group.getAttribute("aria-label")).toBeTruthy();
    expect([...group.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Que el Mentor lo detecte", "Preguntar", "Corregir", "Ajustar"]);
    expect([...group.querySelectorAll<HTMLInputElement>("input")].map((r) => r.checked)).toEqual([true, false, false, false]);
    expect(host.querySelector("fieldset legend")!.textContent).toContain("¿Qué quieres hacer?");
  });

  it("detecta una pregunta: el botón dice «Preguntar», responde con texto, NO llama a cambiar el plan y la respuesta queda visible en el hilo", async () => {
    const ask = vi.spyOn(api, "mentorPlanAsk").mockResolvedValue({ loading: false, answer: answered().answer!, source: "ai", understood: true, entry: answered(), history: [answered()] });
    const change = vi.spyOn(api, "mentorPlanChange");
    await mount();
    await type(ta(), "¿Por qué este orden?");
    expect(byTest("change-submit").textContent).toBe("Preguntar");
    expect(byTest("intent-hint").textContent).toContain("una pregunta: no cambia el plan");
    await click(byTest("change-submit"));
    expect(ask).toHaveBeenCalledWith(PID, "¿Por qué este orden?");
    expect(change).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    expect(byTest("ask-answer").textContent).toContain("Backend va primero");
    expect(byTest("ask-answer").textContent).toContain("el plan no cambió");
    expect(byTest("ask-answer").getAttribute("aria-live")).toBe("polite");
    expect(announce.mock.calls.at(-1)![0]).toContain("Respuesta del Mentor");
    // el historial muestra la pregunta con su respuesta, sin «Deshacer»
    const item = byTest("change-entry");
    expect(item.getAttribute("data-kind")).toBe("question");
    expect(item.textContent).toContain("Pregunta");
    expect(item.textContent).toContain("Respondida");
    expect(item.textContent).toContain("¿Por qué este orden?");
    expect(byTest("entry-answer").textContent).toContain("Backend va primero");
    expect(button("Deshacer", item)).toBeUndefined();
    expect(ta().value).toBe("");
  });

  it("un ajuste claro se aplica como siempre; una corrección elegida a mano manda `intent: fix`", async () => {
    const change = vi.spyOn(api, "mentorPlanChange").mockResolvedValue({ loading: false, applied: true, plan: planData, history: [entry()], entry: entry() });
    await mount();
    await type(ta(), "Quita lo de desktop");
    expect(byTest("change-submit").textContent).toBe("Aplicar cambios");
    await click(byTest("change-submit"));
    expect(change).toHaveBeenLastCalledWith({ id: PID, comment: "Quita lo de desktop" });
    await click(radio("Corregir"));
    expect(byTest("change-submit").textContent).toBe("Aplicar corrección");
    await type(ta(), "La semana 4 no cuadra con mis días libres");
    await click(byTest("change-submit"));
    expect(change).toHaveBeenLastCalledWith({ id: PID, comment: "La semana 4 no cuadra con mis días libres", intent: "fix" });
  });

  it("elegir «Preguntar» a mano pregunta aunque el texto parezca un ajuste", async () => {
    const ask = vi.spyOn(api, "mentorPlanAsk").mockResolvedValue({ loading: false, answer: "Sí.", source: "rules", understood: true, entry: answered({ comment: "Quita Docker" }), history: [] });
    const change = vi.spyOn(api, "mentorPlanChange");
    await mount();
    await click(radio("Preguntar"));
    await type(ta(), "Quita Docker");
    await click(byTest("change-submit"));
    expect(ask).toHaveBeenCalledWith(PID, "Quita Docker");
    expect(change).not.toHaveBeenCalled();
  });

  it("en la duda pregunta a la IA (simulada) y, si sigue sin estar claro, aclara: «¿Solo quieres saber…?» con dos salidas", async () => {
    const intent = vi.spyOn(api, "mentorPlanIntent").mockResolvedValue({ intent: "adjust", confident: false, ask: "¿Solo quieres saber «¿Puedes quitar Docker?» o quieres que lo cambie en el plan?", source: "ai" });
    const ask = vi.spyOn(api, "mentorPlanAsk").mockResolvedValue({ loading: false, answer: "Docker está en la semana 9.", source: "ai", understood: true, entry: answered({ comment: "¿Puedes quitar Docker?" }), history: [] });
    const change = vi.spyOn(api, "mentorPlanChange").mockResolvedValue({ loading: false, applied: true, plan: planData, history: [entry()], entry: entry() });
    await mount();
    await type(ta(), "¿Puedes quitar Docker?");
    expect(byTest("change-submit").textContent).toBe("Enviar");
    expect(byTest("intent-hint").textContent).toContain("te lo preguntaré");
    await click(byTest("change-submit"));
    expect(intent).toHaveBeenCalledWith(PID, "¿Puedes quitar Docker?");
    const box = byTest("intent-clarify");
    expect(box.textContent).toContain("¿Solo quieres saber");
    expect(box.getAttribute("role")).toBe("group");
    expect(ask).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await click(byTest("clarify-question"));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    // la otra salida cambia el plan
    await type(ta(), "¿Puedes quitar Docker?");
    await click(byTest("change-submit"));
    await click(byTest("clarify-change"));
    expect(change).toHaveBeenCalledWith({ id: PID, comment: "¿Puedes quitar Docker?" });
  });

  it("si la IA clasifica con confianza, se usa su resultado sin molestar al estudiante", async () => {
    vi.spyOn(api, "mentorPlanIntent").mockResolvedValue({ intent: "question", confident: true, source: "ai" });
    const ask = vi.spyOn(api, "mentorPlanAsk").mockResolvedValue({ loading: false, answer: "Sí.", source: "ai", understood: true, entry: answered(), history: [] });
    await mount();
    await type(ta(), "¿Puedes quitar Docker?");
    await click(byTest("change-submit"));
    expect(host.querySelector("[data-testid=intent-clarify]")).toBeNull();
    expect(ask).toHaveBeenCalled();
  });

  it("mientras el Mentor piensa muestra «Pensando…» con cancelar (clave ask:<plan>) y un doble envío no duplica la llamada; Ctrl+Enter envía", async () => {
    vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: true, label: "Pensando la respuesta sobre tu plan…", elapsed: 3 });
    const cancel = vi.spyOn(api, "mentorAiCancel").mockResolvedValue({ cancelled: true });
    const ask = vi.spyOn(api, "mentorPlanAsk").mockImplementation(() => new Promise(() => undefined));
    await mount();
    await type(ta(), "¿Cuánto falta para terminar?");
    await act(async () => { ta().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); });
    await flush();
    await click(byTest("change-submit"));
    expect(ask).toHaveBeenCalledTimes(1);
    const th = byTest("ai-thinking");
    expect(th.textContent).toContain("Pensando la respuesta sobre tu plan…");
    await click(button("Cancelar", th));
    expect(cancel).toHaveBeenCalledWith(`ask:${PID}`, "abort");
  });

  it("el historial mezcla preguntas y cambios: «Deshacer» solo en el último cambio aplicado, nunca en una pregunta", async () => {
    vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([entry({ n: 1 }), answered({ n: 2 }), entry({ n: 3, comment: "Hazlo más ligero", kind: "adjust" }), answered({ n: 4, comment: "¿Cuánto falta?", answer: "Faltan 12 semanas." })]);
    const undo = vi.spyOn(api, "mentorPlanChangeUndo").mockResolvedValue({ plan: planData, history: [] });
    await mount();
    const items = [...host.querySelectorAll("[data-testid=change-entry]")];
    expect(items.map((i) => i.getAttribute("data-kind"))).toEqual(["question", "adjust", "question", "adjust"]);
    expect(items.map((i) => !!button("Deshacer", i))).toEqual([false, true, false, false]);
    expect(items[0]!.textContent).toContain("Faltan 12 semanas.");
    await click(button("Deshacer", items[1]!));
    expect(undo).toHaveBeenCalledWith(PID);
  });

  it("las sugerencias siguen a la intención (preguntas frecuentes) y rellenan el cuadro sin enviar", async () => {
    const ask = vi.spyOn(api, "mentorPlanAsk");
    await mount();
    await click(radio("Preguntar"));
    const chips = [...host.querySelectorAll("[data-testid=change-suggestions] button")].map((b) => b.textContent);
    expect(chips).toEqual(["¿Por qué este orden?", "¿Qué toca esta semana?", "¿Cuánto falta para terminar?", "¿Cuántas semanas ocupa Backend?"]);
    await click(host.querySelectorAll("[data-testid=change-suggestions] button")[1]);
    expect(ta().value).toBe("¿Qué toca esta semana?");
    expect(ask).not.toHaveBeenCalled();
  });
});
