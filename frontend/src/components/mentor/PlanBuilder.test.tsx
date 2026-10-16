// @vitest-environment jsdom
//
// Mentor — constructor guiado (línea de etapas, tarjeta de pregunta con chips / texto libre / saltar, borrador creciendo, historial con
// «Cambiar respuesta», «Generar ya», abandonar, revisión → plan propuesto), estado de espera con contador y cancelar, «en construcción» en la
// barra lateral, el resumen y el chat, plan propuesto («Mantener» / «Borrar»), «Pedir cambios al plan» con historial y «Deshacer», y las
// ramas / preset «Full stack» del formulario.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { BuildAnswer, BuildQuestion } from "../../lib/planBuild";
import { addDays } from "../../lib/planTime";
import type { MentorBuildResult, MentorBuildSummary, MentorChangeEntry, MentorPlan as PlanData, MentorPlanBuild, MentorPlanGet, MentorPlanOptions, MentorPlanRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { planModeKey } from "./planShared";

const ui = vi.hoisted(() => ({ askText: vi.fn(), confirmAction: vi.fn() }));
vi.mock("../ui", async (orig) => ({ ...(await orig<typeof import("../ui")>()), askText: ui.askText, confirmAction: ui.confirmAction }));

import { MentorAssistant } from "./MentorAssistant";
import { MentorModule } from "./MentorModule";
import { MentorPlan } from "./MentorPlan";
import { PlanBuilder } from "./PlanBuilder";
import { PlanForm } from "./PlanForm";

const two = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
const START = "2026-10-06";
const END = "2026-11-05";
const PID = `${START}_${END}`;

const pre = { start: START, end: END, minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5, 6], pace: "normal" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask" as const };
const STEPS = (current: number, summaries: Record<number, string> = {}): MentorPlanBuild["steps"] =>
  (["alcance", "esqueleto", "temas", "capacidad", "practica", "entregables", "revision"] as const).map((stage, i) => ({ stage, state: i < current ? "done" : i === current ? "current" : "pending", summary: summaries[i] ?? "" }));

const q = (over: Partial<BuildQuestion> = {}): BuildQuestion => ({
  id: "level:Programación", stage: "alcance", kind: "level", text: "¿Qué nivel tienes en Programación?", why: "Ajusta lo que tarda cada tema.", allowText: false, defaultChoice: "skip", mentorChoice: "no_se", by: "rules",
  options: [{ id: "empezando", label: "Empezando" }, { id: "basico", label: "Básico" }, { id: "intermedio", label: "Intermedio" }, { id: "avanzado", label: "Avanzado" }, { id: "no_se", label: "No sé" }],
  ...over,
});
const subplan = (id: string, area: string) => ({
  id, area, objective: `Avanzar en ${area}`, topics: [{ folder: `${area}/A`, title: "A", targetWeek: 1, estMinutes: 60 }, { folder: `${area}/B`, title: "B", targetWeek: 2, estMinutes: 60 }], weeks: [], requiredGoals: [],
});
const draft = (over: Record<string, unknown> = {}) => ({
  month: "2026-10", hoursPerWeek: 10, rationale: "x", subplans: [subplan("s1", "Programación"), subplan("s2", "Matemáticas")], warnings: [], fits: true, totalMinutes: 240, availableMinutes: 600, requiredHoursPerWeek: null, from: START, discarded: [],
  why: {}, coverage: "Lo elegido necesita ~4 h y tienes 10 h: sobran 6 h.", ...over,
});
const build = (over: Partial<MentorPlanBuild> = {}): MentorPlanBuild => ({
  id: "b1", createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z", pre, effective: pre, stage: "alcance", steps: STEPS(0), answers: [], draft: null, skeleton: null, openQuestion: q(), source: "rules",
  questionCount: 0, maxQuestions: 6, status: "building", finishing: false, name: "Programación · 6 oct–5 nov", ...over,
});
const result = (b: MentorPlanBuild): MentorBuildResult => ({ loading: false, build: b, summary: summary(b) });
const summary = (b: MentorPlanBuild): MentorBuildSummary => ({ id: b.id, name: b.name, period: "6 oct – 5 nov", stage: b.stage, stageNumber: b.steps.findIndex((s) => s.state === "current") + 1 || 7, stages: 7, status: b.status, question: b.openQuestion?.text ?? null, updatedAt: b.updatedAt, source: b.source, ...(b.openQuestion ? { questionId: b.openQuestion.id, options: b.openQuestion.options, allowText: b.openQuestion.allowText } : {}) });
const answerOf = (over: Partial<BuildAnswer> = {}): BuildAnswer => ({ questionId: "level:Programación", stage: "alcance", kind: "level", question: "¿Qué nivel tienes en Programación?", choice: "basico", label: "Básico", at: "t", ...over });

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
// «Mi plan» enseña una sub-vista a la vez: elige la que la prueba necesita
const section = async (id: string) => {
  const b = host.querySelector<HTMLElement>(`[data-testid=subnav-${id}]`);
  expect(b, `sub-vista ${id}`).toBeTruthy();
  await act(async () => { b!.click(); });
  await flush();
};
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label) : label.test(b.textContent ?? "")))!;
const click = async (el: Element | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
};

beforeEach(() => {
  localStorage.clear();
  ui.askText.mockReset();
  ui.confirmAction.mockReset();
  useNavState.setState({ values: { [planModeKey(PID)]: "plan" } }); // las pruebas de la vista de plan abren la cara «plan»
  useMentor.setState({ panels: null, turns: [], pending: null, chatId: null, chatTitle: "Nueva conversación", chats: [], historyOpen: false, chatLoaded: false, sending: false, notice: null, planMode: false, composerSeed: "", acceptingPlan: false, planVersion: 0, plans: [], plansLoaded: false, generatingPlan: false, builds: [] });
  useApp.setState({ module: "mentor" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorChatLoad").mockResolvedValue({ turns: [], pending: null });
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([]);
  vi.spyOn(api, "mentorPlanBuildList").mockResolvedValue([]);
  vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: false, label: "", elapsed: 0 });
  vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("PlanBuilder: etapas y pregunta", () => {
  it("línea de etapas (la actual resaltada, las hechas marcadas), pregunta con chips, texto libre, saltar y «que decida»", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build({ stage: "esqueleto", steps: STEPS(1, { 0: "Niveles — Programación: básico" }), openQuestion: q({ id: "priority", stage: "esqueleto", kind: "priority", text: "¿Cuál va primero?", options: [{ id: "first:k", label: "«Programación» primero" }, { id: "equal", label: "Repartimos a partes iguales" }] }) })));
    await mountEl(<PlanBuilder buildId="b1" />);
    const stages = [...host.querySelectorAll("[data-testid=build-stages] li")];
    expect(stages.map((s) => s.getAttribute("data-state"))).toEqual(["done", "current", "pending", "pending", "pending", "pending", "pending"]);
    expect(stages[1]!.getAttribute("aria-current")).toBe("step");
    expect(stages[0]!.textContent).toContain("Alcance");
    expect(stages[0]!.textContent).toContain("Niveles — Programación: básico");
    const card = host.querySelector("[data-testid=build-question]")!;
    expect(card.getAttribute("aria-live")).toBe("polite");
    expect(card.textContent).toContain("¿Cuál va primero?");
    expect([...card.querySelectorAll("[role=group] button")].map((b) => b.textContent)).toEqual(["«Programación» primero", "Repartimos a partes iguales"]);
    expect(card.querySelector("input[aria-label='Respuesta libre']")).toBeTruthy();
    expect(button("Saltar", card)).toBeTruthy();
    expect(button("Que decida el Mentor", card)).toBeTruthy();
    expect(host.querySelector("h1")!.textContent).toContain("Programación · 6 oct–5 nov");
  });

  it("un chip responde con la opción; un doble clic no duplica la llamada; la pantalla pasa a la siguiente pregunta", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build()));
    let done: (r: MentorBuildResult) => void = () => undefined;
    const answer = vi.spyOn(api, "mentorPlanBuildAnswer").mockImplementation(() => new Promise((ok) => (done = ok)));
    await mountEl(<PlanBuilder buildId="b1" />);
    const chip = button("Intermedio");
    await click(chip);
    await click(chip);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith({ id: "b1", questionId: "level:Programación", choice: "intermedio" });
    expect(host.querySelector("[data-testid=ai-thinking]")).toBeTruthy(); // mientras tanto, «pensando»
    expect(host.querySelector("[data-testid=build-question]")).toBeNull();
    await act(async () => { done(result(build({ stage: "esqueleto", steps: STEPS(1), openQuestion: q({ id: "skeleton", stage: "esqueleto", kind: "skeleton", text: "¿Lo ajustamos?", options: [{ id: "ok", label: "Está bien" }] }), answers: [answerOf({ choice: "intermedio", label: "Intermedio" })] }))); });
    await flush();
    expect(host.querySelector("[data-testid=build-question]")!.textContent).toContain("¿Lo ajustamos?");
    expect(host.querySelector("[data-testid=ai-thinking]")).toBeNull();
  });

  it("texto libre, saltar y delegar mandan lo que toca", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build()));
    const answer = vi.spyOn(api, "mentorPlanBuildAnswer").mockResolvedValue(result(build()));
    await mountEl(<PlanBuilder buildId="b1" />);
    await type(host.querySelector<HTMLInputElement>("input[aria-label='Respuesta libre']")!, "avanzado");
    await click(button("Responder"));
    expect(answer).toHaveBeenLastCalledWith({ id: "b1", questionId: "level:Programación", answer: "avanzado" });
    await click(button("Saltar"));
    expect(answer).toHaveBeenLastCalledWith({ id: "b1", questionId: "level:Programación", skip: true });
    await click(button("Que decida el Mentor"));
    expect(answer).toHaveBeenLastCalledWith({ id: "b1", questionId: "level:Programación", delegate: true });
  });
});

describe("PlanBuilder: borrador creciendo, historial y acciones", () => {
  it("con el esqueleto se ven los subplanes con su reparto y lo pendiente como «se decidirá en la etapa X»", async () => {
    const skeleton = [{ key: "k1", area: "Programación", objective: "Avanzar en Programación", topics: 8, minutes: 480, hours: 6, sharePct: 60 }, { key: "k2", area: "Matemáticas", objective: "Avanzar en Matemáticas", topics: 5, minutes: 300, hours: 4, sharePct: 40 }];
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build({ stage: "esqueleto", steps: STEPS(1), skeleton, openQuestion: q({ id: "skeleton", stage: "esqueleto", kind: "skeleton", text: "¿Lo ajustamos?" }) })));
    await mountEl(<PlanBuilder buildId="b1" />);
    const cards = [...host.querySelectorAll("[data-testid=build-subplan]")];
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("~6 h para temas");
    expect(cards[0]!.textContent).toContain("60 %");
    expect(cards[0]!.textContent).toContain("Los temas se eligen en la etapa Temas");
    expect([...host.querySelectorAll("[data-testid=build-pending]")].some((p) => p.textContent?.includes("Se decidirá en la etapa Temas"))).toBe(true);
    expect([...host.querySelectorAll("[data-testid=build-pending]")].map((p) => p.textContent).join()).toContain("etapa Entregables");
  });

  it("con el borrador de temas se ven los temas por semana, la cobertura y los entregables por decidir", async () => {
    const skeleton = [{ key: "k1", area: "Programación", objective: "Avanzar en Programación", topics: 2, minutes: 120, hours: 6, sharePct: 50 }, { key: "k2", area: "Matemáticas", objective: "Avanzar en Matemáticas", topics: 2, minutes: 120, hours: 4, sharePct: 50 }];
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build({ stage: "entregables", steps: STEPS(5), skeleton, draft: draft({ openQuestions: [{ id: "deliverables", subplanId: "s1", text: "?", options: [] }] }) as never, openQuestion: q({ id: "deliverable:k1", stage: "entregables", kind: "deliverable", text: "¿Entregable?", options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }, { id: "later", label: "Después" }] }) })));
    await mountEl(<PlanBuilder buildId="b1" />);
    expect(host.querySelector("[data-testid=build-subplan]")!.textContent).toContain("Sem. 1 · A");
    expect(host.querySelector("[data-testid=build-coverage]")!.textContent).toContain("sobran 6 h");
    expect(host.querySelector("[data-testid=build-open-deliverables]")!.textContent).toContain("1");
  });

  it("historial plegable con «Cambiar respuesta»: rehace desde la etapa de esa respuesta", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build({ stage: "esqueleto", steps: STEPS(1), answers: [answerOf()], openQuestion: q({ id: "skeleton", stage: "esqueleto", kind: "skeleton", text: "?" }) })));
    const back = vi.spyOn(api, "mentorPlanBuildBack").mockResolvedValue(result(build()));
    await mountEl(<PlanBuilder buildId="b1" />);
    expect(host.querySelector("[data-testid=build-answer]")).toBeNull(); // plegado
    await click(button("Ver las respuestas dadas"));
    const a = host.querySelector("[data-testid=build-answer]")!;
    expect(a.textContent).toContain("Básico");
    await click(button("Cambiar respuesta", a));
    expect(back).toHaveBeenCalledWith("b1", "alcance");
    expect(host.querySelector("[data-testid=build-question]")!.textContent).toContain("¿Qué nivel tienes");
  });

  it("«Generar ya con lo que hay» pasa a la revisión; «Crear plan» crea el plan propuesto y navega a su sub-interfaz", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build()));
    const review = build({ stage: "revision", steps: STEPS(6), status: "review", openQuestion: undefined, finishing: true, draft: draft() as never, skeleton: [] });
    const fin = vi.spyOn(api, "mentorPlanBuildFinishNow").mockResolvedValue(result(review));
    const accept = vi.spyOn(api, "mentorPlanBuildAccept").mockResolvedValue({ id: PID, month: "2026-10", start: START, end: END, subplans: 2, topics: 4, warnings: [], fits: true });
    await mountEl(<PlanBuilder buildId="b1" />);
    await click(button("Generar ya con lo que hay"));
    expect(fin).toHaveBeenCalledWith("b1");
    expect(host.querySelector("[data-testid=build-review]")).toBeTruthy();
    expect(button("Generar ya con lo que hay")).toBeUndefined(); // ya en revisión
    await click(button("Crear plan"));
    expect(accept).toHaveBeenCalledWith("b1");
    expect(useNavState.getState().values["mentor.view"]).toBe(`plan:${PID}`);
  });

  it("la revisión ofrece «Volver a una etapa»", async () => {
    const review = build({ stage: "revision", steps: STEPS(6), status: "review", openQuestion: undefined, draft: draft() as never, skeleton: [] });
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(review));
    const back = vi.spyOn(api, "mentorPlanBuildBack").mockResolvedValue(result(build()));
    await mountEl(<PlanBuilder buildId="b1" />);
    await click(button("Capacidad", host.querySelector("[aria-label='Volver a una etapa']")!));
    expect(back).toHaveBeenCalledWith("b1", "capacidad");
  });

  it("abandonar pide confirmación, manda el estado a la papelera y vuelve al resumen", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build()));
    const abandon = vi.spyOn(api, "mentorPlanBuildAbandon").mockResolvedValue({ id: "b1", builds: [] });
    ui.confirmAction.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mountEl(<PlanBuilder buildId="b1" />);
    await click(button("Abandonar"));
    expect(abandon).not.toHaveBeenCalled();
    await click(button("Abandonar"));
    expect(ui.confirmAction).toHaveBeenCalledTimes(2);
    expect(abandon).toHaveBeenCalledWith("b1");
    expect(useNavState.getState().values["mentor.view"]).toBe("plan");
  });

  it("un plan en construcción que ya no existe lo dice y ofrece volver", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockRejectedValue(new Error("Ese plan en construcción ya no existe."));
    await mountEl(<PlanBuilder buildId="zz" />);
    expect(host.querySelector("[data-testid=build-missing]")).toBeTruthy();
  });
});

describe("estado de espera: pensando, contador, cancelar y reanudar", () => {
  it("muestra qué hace, los segundos y «Cancelar»; pasados ~90 s sugiere seguir sin IA", async () => {
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build()));
    vi.spyOn(api, "mentorPlanBuildAnswer").mockImplementation(() => new Promise(() => undefined));
    let thinking = false;
    vi.spyOn(api, "mentorAiStatus").mockImplementation(async () => (thinking ? { busy: true, label: "Eligiendo temas de Programación…", elapsed: 95 } : { busy: false, label: "", elapsed: 0 }));
    const cancel = vi.spyOn(api, "mentorAiCancel").mockResolvedValue({ cancelled: true });
    await mountEl(<PlanBuilder buildId="b1" />);
    thinking = true;
    await click(button("Básico"));
    await flush();
    const th = host.querySelector("[data-testid=ai-thinking]")!;
    // solo «Pensando… + qué hace» se anuncia (aria-live); el contador de segundos va aparte para no repetirse cada segundo
    expect(th.querySelector("[role=status][aria-live=polite]")!.textContent).toContain("Pensando…");
    expect(host.querySelector("[data-testid=ai-elapsed]")!.closest("[aria-live]")).toBeNull();
    expect(th.textContent).toContain("Pensando…");
    expect(th.textContent).toContain("Eligiendo temas de Programación…");
    expect(host.querySelector("[data-testid=ai-elapsed]")!.textContent).toMatch(/^9[5-9] s$/);
    expect(host.querySelector("[data-testid=ai-slow]")!.textContent).toContain("Está tardando más de lo normal");
    await click(button("Cancelar", th));
    expect(cancel).toHaveBeenCalledWith("build:b1", "abort");
    await click(button("Seguir con el plan automático", th));
    expect(cancel).toHaveBeenLastCalledWith("build:b1", "auto");
  });

  it("si vuelves al panel mientras el Mentor sigue pensando, retoma el estado y al terminar muestra el resultado", async () => {
    let calls = 0;
    const get = vi.spyOn(api, "mentorPlanBuildGet").mockImplementation(async () => result(calls++ < 1 ? build() : build({ stage: "esqueleto", steps: STEPS(1), openQuestion: q({ id: "skeleton", stage: "esqueleto", kind: "skeleton", text: "Pregunta nueva" }) })));
    let polls = 0;
    vi.spyOn(api, "mentorAiStatus").mockImplementation(async () => (polls++ < 1 ? { busy: true, label: "Aplicando tu respuesta…", elapsed: 12 } : { busy: false, label: "", elapsed: 0 }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await mountEl(<PlanBuilder buildId="b1" />);
      expect(host.querySelector("[data-testid=ai-thinking]")).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      await flush();
      expect(get).toHaveBeenCalledTimes(2);
      expect(host.querySelector("[data-testid=ai-thinking]")).toBeNull();
      expect(host.querySelector("[data-testid=build-question]")!.textContent).toContain("Pregunta nueva");
    } finally {
      vi.useRealTimers();
    }
  });

  it("generar el plan completo desde el formulario también muestra «Pensando…» con contador y cancelar", async () => {
    vi.spyOn(api, "mentorPlanOptions").mockResolvedValue({ loading: false, today: TODAY, aiConfigured: true, goals: [], areas: [], topics: [] });
    vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: true, label: "Eligiendo temas de Programación…", elapsed: 40 });
    const cancel = vi.spyOn(api, "mentorAiCancel").mockResolvedValue({ cancelled: true });
    useMentor.setState({ generatingPlan: true });
    await mountEl(<PlanForm onClose={() => undefined} />);
    const th = host.querySelector("[data-testid=ai-thinking]")!;
    expect(th.textContent).toContain("Eligiendo temas de Programación…");
    expect(host.querySelector("[data-testid=ai-slow]")).toBeNull();
    await click(button("Cancelar", th));
    expect(cancel).toHaveBeenCalledWith("generate", "abort");
  });
});

describe("«en construcción» en la barra lateral, el resumen y el chat", () => {
  const b = summary(build({ stage: "esqueleto", steps: STEPS(1), openQuestion: q({ id: "skeleton", stage: "esqueleto", kind: "skeleton", text: "¿Lo ajustamos?" }) }));

  it("sub-ítem bajo Plan con el indicador, tarjeta destacada con «Continuar» y el constructor al elegirlo", async () => {
    vi.mocked(api.mentorPlanBuildList).mockResolvedValue([b]);
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue({ loading: false, id: null, month: "2026-10", today: TODAY, plan: null, derived: null, goals: {}, projects: {}, items: [], months: [], plans: [], aiConfigured: true } as MentorPlanGet);
    vi.spyOn(api, "mentorPlanBuildGet").mockResolvedValue(result(build({ stage: "esqueleto", steps: STEPS(1) })));
    useNavState.setState({ values: { "mentor.view": "plan" } });
    await mountEl(<MentorModule />);
    const sub = [...host.querySelectorAll("aside nav [role=group] button")].find((x) => x.textContent?.includes("Programación · 6 oct–5 nov"))!;
    expect(sub.textContent).toContain("en construcción · etapa 2/7");
    const card = host.querySelector("[data-testid=plan-build-card]")!;
    expect(card.textContent).toContain("En construcción · etapa 2/7");
    expect(card.textContent).toContain("Te pregunto: ¿Lo ajustamos?");
    expect(card.textContent).toContain("Continuar");
    await click(sub);
    expect(useNavState.getState().values["mentor.view"]).toBe("build:b1");
    expect(host.querySelector("[data-testid=build-stages]")).toBeTruthy();
    expect(sub.getAttribute("aria-current")).toBe("page");
  });

  it("tarjeta compacta en el chat «Construyendo … · etapa X · te pregunto …» con «Ir al plan»", async () => {
    vi.mocked(api.mentorPlanBuildList).mockResolvedValue([b]);
    await mountEl(<MentorAssistant />);
    const card = host.querySelector("[data-testid=chat-build-card]")!;
    expect(card.textContent).toContain("Construyendo «Programación · 6 oct–5 nov» · etapa 2/7");
    expect(card.textContent).toContain("Te pregunto: ¿Lo ajustamos?");
    await click(button("Ir al plan", card));
    expect(useNavState.getState().values["mentor.view"]).toBe("build:b1");
  });

  it("lo escrito en el chat es respuesta solo si es claro, y siempre con un botón «Usar como respuesta» (nunca en silencio)", async () => {
    const lvl = summary(build());
    vi.mocked(api.mentorPlanBuildList).mockResolvedValue([lvl]);
    const answer = vi.spyOn(api, "mentorPlanBuildAnswer").mockResolvedValue(result(build()));
    await mountEl(<MentorAssistant />);
    const ta = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mensaje para el Mentor']")!;
    await type(ta, "mmm no sé qué decir");
    expect(host.querySelector("[data-testid=chat-use-as-answer]")).toBeNull();
    await type(ta, "intermedio");
    const use = host.querySelector("[data-testid=chat-use-as-answer]")!;
    expect(use.textContent).toContain("¿Qué nivel tienes en Programación?");
    expect(answer).not.toHaveBeenCalled();
    await click(use);
    expect(answer).toHaveBeenCalledWith({ id: "b1", questionId: "level:Programación", choice: "intermedio" });
  });
});

describe("plan propuesto: barra «¿lo mantienes?»", () => {
  const plan = (over: Partial<PlanData> = {}): PlanData => ({
    id: PID, start: START, end: END, name: "Full stack · 6 oct–5 nov", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hoursPerWeek: 10, proposed: true,
    preconditions: { ...pre, branches: { Programación: ["4 Backend"] }, branchPreset: "fullstack", branchExcluded: ["3 Desktop Apps", "8 Mobile"] },
    subplans: [{ id: "s1", area: "Programación", objective: "Full stack", topics: [{ folder: "Programación/4 Backend/A", title: "A", targetWeek: 1, estMinutes: 60 }], weeks: [], requiredGoals: [] }], ...over,
  });
  const loaded = (p: PlanData): MentorPlanGet => ({
    loading: false, id: p.id, month: "2026-10", today: "2026-10-12", status: p.proposed ? "propuesto" : "activo", plan: p,
    derived: { subplans: [{ id: "s1", total: 1, done: 0, pct: 0, currentWeek: 1, topics: [{ ...p.subplans[0]!.topics[0]!, state: "sin_tratar", pct: 0, found: true }] }], summary: { subplans: 1, topics: 1, done: 0, pct: 0, currentWeek: 1, weeks: 5 } },
    goals: {}, projects: {}, items: [], months: [], plans: [{ id: p.id, start: START, end: END, name: p.name!, period: "6 oct – 5 nov", status: p.proposed ? "propuesto" : "activo", archived: false, auto: false, subplans: 1, topics: 1, completed: 0, pct: 0, minutesPerDay: 120 } as MentorPlanRow], aiConfigured: true,
  });

  it("muestra la barra con «Mantener plan» y «Borrar»; mantener llama a la API; borrar pide confirmación", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan()));
    const keep = vi.spyOn(api, "mentorPlanKeep").mockResolvedValue(plan({ proposed: undefined }));
    const del = vi.spyOn(api, "mentorPlanDelete").mockResolvedValue({ id: PID, plans: [] });
    ui.confirmAction.mockResolvedValueOnce(true);
    await mountEl(<MentorPlan planId={PID} />);
    const bar = host.querySelector("[data-testid=plan-proposed-bar]")!;
    expect(bar.textContent).toContain("Plan propuesto por el Mentor — ¿lo mantienes?");
    expect(host.querySelector("[data-testid=plan-header]")!.textContent).toContain("Propuesto");
    await click(button("Mantener plan", bar));
    expect(keep).toHaveBeenCalledWith(PID);
    await click(button("Borrar", bar));
    expect(ui.confirmAction).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(PID);
  });

  it("un plan mantenido no muestra la barra; la sub-interfaz explica las ramas excluidas y permite añadirlas con un comentario", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(loaded(plan({ proposed: undefined })));
    const change = vi.spyOn(api, "mentorPlanChange").mockResolvedValue({ loading: false, plan: plan(), applied: true, history: [], entry: { n: 1, at: "2026-10-06T10:00:00Z", comment: "x", status: "applied", source: "rules", summary: "", delta: { added: 6, removed: 0, moved: 0, deliverables: 0 }, changed: [], warnings: [], fixOptions: [] } });
    await mountEl(<MentorPlan planId={PID} />);
    await section("alcance");
    expect(host.querySelector("[data-testid=plan-proposed-bar]")).toBeNull();
    const note = host.querySelector("[data-testid=plan-branch-note]")!;
    expect(note.textContent).toContain("Excluí Desktop Apps y Mobile porque pediste full stack. Añádelos si los quieres.");
    await click(button("Añadir Desktop Apps y Mobile", note));
    expect(change).toHaveBeenCalledWith({ id: PID, comment: "Añade las ramas excluidas: Desktop Apps, Mobile" });
  });
});

describe("«Pedir cambios al plan»", () => {
  const entry = (over: Partial<MentorChangeEntry> = {}): MentorChangeEntry => ({ n: 1, at: "2026-10-06T10:00:00Z", comment: "Quita lo de desktop", status: "applied", source: "ai", summary: "Quité Desktop.", delta: { added: 0, removed: 4, moved: 0, deliverables: 0 }, changed: [], warnings: [], fixOptions: [], ...over });
  const planData: PlanData = { id: PID, start: START, end: END, createdAt: "", updatedAt: "", subplans: [], preconditions: pre as never, proposed: true };
  const getResult = (): MentorPlanGet => ({
    loading: false, id: PID, month: "2026-10", today: "2026-10-12", status: "propuesto", plan: { ...planData, subplans: [{ id: "s1", area: "Programación", objective: "Full stack", topics: [{ folder: "P/A", title: "A", targetWeek: 1, estMinutes: 60 }], weeks: [], requiredGoals: [] }] },
    derived: { subplans: [{ id: "s1", total: 1, done: 0, pct: 0, currentWeek: 1, topics: [{ folder: "P/A", title: "A", targetWeek: 1, estMinutes: 60, state: "sin_tratar", pct: 0, found: true }] }], summary: { subplans: 1, topics: 1, done: 0, pct: 0, currentWeek: 1, weeks: 5 } },
    goals: {}, projects: {}, items: [], months: [], plans: [], aiConfigured: true,
  });

  it("cuadro fijo con ejemplos, Ctrl/Cmd+Enter aplica, muestra el resumen del cambio y resalta lo cambiado", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(getResult());
    const change = vi.spyOn(api, "mentorPlanChange").mockResolvedValue({ loading: false, applied: true, plan: planData, history: [entry()], entry: entry({ changed: ["P/A"] }) });
    await mountEl(<MentorPlan planId={PID} />);
    const box = host.querySelector("[data-testid=plan-changes]")!;
    const ta = box.querySelector<HTMLTextAreaElement>("textarea")!;
    // el cuadro tiene una etiqueta visible asociada y los ejemplos son chips clicables
    expect(box.querySelector(`label[for='${ta.id}']`)!.textContent).toContain("Tu comentario para el Mentor");
    expect(ta.placeholder).toContain("Ej.:");
    expect([...box.querySelectorAll("[data-testid=change-suggestions] button")].map((b) => b.textContent)).toContain("Pasa el frontend a la semana 10");
    expect(button("Aplicar cambios", box).hasAttribute("disabled")).toBe(true);
    await type(ta, "Quita lo de desktop");
    await act(async () => { ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); });
    await flush();
    expect(change).toHaveBeenCalledWith({ id: PID, comment: "Quita lo de desktop" });
    expect(box.querySelector("[data-testid=change-notice]")!.textContent).toContain("Cambio aplicado: −4 temas");
    expect(ta.value).toBe("");
    // lo cambiado se resalta (el subplan se abre solo y el tema queda marcado)
    await section("areas");
    expect(host.querySelector("[data-testid=plan-topic][data-changed=true]")).toBeTruthy();
  });

  it("historial con fecha y resumen, «Deshacer» solo en el último aplicado, pendientes y aviso de capacidad con opciones", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(getResult());
    vi.spyOn(api, "mentorPlanChanges").mockResolvedValue([entry({ n: 1 }), entry({ n: 2, comment: "Más SQL", delta: { added: 5, removed: 3, moved: 0, deliverables: 1 } }), entry({ n: 3, comment: "hazlo bonito", status: "pending", source: "none", summary: "No pude aplicar este comentario: queda guardado como pendiente." })]);
    const undo = vi.spyOn(api, "mentorPlanChangeUndo").mockResolvedValue({ plan: planData, history: [] });
    await mountEl(<MentorPlan planId={PID} />);
    const items = [...host.querySelectorAll("[data-testid=change-entry]")];
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain("hazlo bonito");
    expect(items[0]!.textContent).toContain("Pendiente");
    expect(items[0]!.textContent).toContain("queda guardado como pendiente");
    expect(items[1]!.textContent).toContain("+5 temas, −3 temas, +1 entregable");
    expect(items.map((i) => !!button("Deshacer", i))).toEqual([false, true, false]);
    await click(button("Deshacer", items[1]!));
    expect(undo).toHaveBeenCalledWith(PID);
  });

  it("si el cambio no cabe muestra el aviso y las opciones calculadas, que se mandan como ajustes", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(getResult());
    const fix = { id: "trim", label: "Recortar los últimos temas para que quepa", op: { op: "trim_to_fit" } };
    const change = vi.spyOn(api, "mentorPlanChange")
      .mockResolvedValueOnce({ loading: false, applied: true, plan: planData, history: [], entry: entry({ warnings: ["El cambio no cabe del todo: necesitas 90 h y hay 70 h de capacidad."], fixOptions: [fix] }) })
      .mockResolvedValueOnce({ loading: false, applied: true, plan: planData, history: [], entry: entry({ n: 2, comment: fix.label }) });
    await mountEl(<MentorPlan planId={PID} />);
    await type(host.querySelector<HTMLTextAreaElement>("[data-testid=plan-changes] textarea")!, "añade todo lo de tooling");
    await click(button("Aplicar cambios"));
    expect(host.querySelector("[data-testid=change-notice]")!.textContent).toContain("no cabe del todo");
    await click(button("Recortar los últimos temas", host.querySelector("[aria-label='Cómo ajustarlo']")!));
    expect(change).toHaveBeenLastCalledWith({ id: PID, ops: [fix.op], label: fix.label });
  });

  it("mientras la IA piensa muestra «Pensando…» con contador y cancelar, y un doble envío no duplica la llamada", async () => {
    vi.spyOn(api, "mentorPlanGet").mockResolvedValue(getResult());
    vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: true, label: "Aplicando tu comentario al plan…", elapsed: 7 });
    const cancel = vi.spyOn(api, "mentorAiCancel").mockResolvedValue({ cancelled: true });
    const change = vi.spyOn(api, "mentorPlanChange").mockImplementation(() => new Promise(() => undefined));
    await mountEl(<MentorPlan planId={PID} />);
    await type(host.querySelector<HTMLTextAreaElement>("[data-testid=plan-changes] textarea")!, "hazlo más ligero");
    const apply = button("Aplicar cambios");
    await click(apply);
    await click(apply);
    expect(change).toHaveBeenCalledTimes(1);
    const th = host.querySelector("[data-testid=plan-changes] [data-testid=ai-thinking]")!;
    expect(th.textContent).toContain("Aplicando tu comentario al plan…");
    await click(button("Cancelar", th));
    expect(cancel).toHaveBeenCalledWith(`change:${PID}`, "abort");
  });
});

describe("formulario: ramas, presets y detección «full stack»", () => {
  const BR = (name: string, pending: number, kind: string) => ({ name, total: pending, pending, kind });
  const options = (): MentorPlanOptions => ({
    loading: false, today: TODAY, aiConfigured: true, goals: [{ id: "g1", name: "Ser Full Stack developer", area: "", end: addDays(TODAY, 90), topics: 0, minutes: 0 }],
    areas: [{ id: "Programación", name: "Programación", total: 11, pending: 11, minutes: 600, branches: [BR("1 Fundamentals", 2, "fundamentals"), BR("2.1 Python", 2, "language"), BR("3 Desktop Apps (Electron)", 2, "desktop"), BR("4 Backend", 2, "backend"), BR("5 Frontend", 1, "frontend"), BR("6 Databases", 1, "databases"), BR("8 Mobile", 1, "mobile")] }],
    topics: [],
  });
  const group = (label: string) => host.querySelector(`[role=group][aria-label='${label}']`)!;
  const chip = (g: string, text: string) => [...group(g).querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
  const pressed = (el: Element) => el.getAttribute("aria-pressed") === "true";

  beforeEach(() => {
    vi.spyOn(api, "mentorPlanOptions").mockResolvedValue(options());
  });

  it("al elegir una materia con ramas salen los presets y las ramas con sus temas pendientes; «Full stack web» excluye Desktop y Mobile", async () => {
    await mountEl(<PlanForm onClose={() => undefined} />);
    expect(host.querySelector("[data-testid=branch-picker]")).toBeNull();
    await click(chip("Materias", "Programación"));
    const picker = host.querySelector("[data-testid=branch-picker]")!;
    expect([...group("Preset de ramas de Programación").querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Full stack web", "Backend", "Frontend", "Desktop", "Mobile", "Todo"]);
    expect(pressed(chip("Preset de ramas de Programación", "Todo"))).toBe(true);
    await click(chip("Preset de ramas de Programación", "Full stack web"));
    expect(pressed(chip("Ramas de Programación", "4 Backend"))).toBe(true);
    expect(pressed(chip("Ramas de Programación", "3 Desktop"))).toBe(false);
    expect(pressed(chip("Ramas de Programación", "8 Mobile"))).toBe(false);
    expect(chip("Ramas de Programación", "5 Frontend").textContent).toContain("· 1");
    expect(picker.textContent).toContain("Ramas de Programación");
    expect(host.querySelector("[data-testid=branch-note]")!.textContent).toContain("Excluí Desktop Apps (Electron) y Mobile porque pediste full stack");
  });

  it("detecta «full stack» en el nombre de las metas y preselecciona ese preset; las ramas excluidas viajan en las precondiciones", async () => {
    const gen = vi.spyOn(api, "mentorPlanGenerateNow").mockResolvedValue({ loading: false, kind: "plan_created", planId: "p1", source: "auto", text: "x", chatId: "c1", id: "c1", title: "t", pending: null, turns: [], planDraft: draft() as never });
    // el nombre de la meta y el objetivo libre mencionan full stack
    await mountEl(<PlanForm onClose={() => undefined} />);
    await click(chip("Materias", "Programación"));
    await type(host.querySelector<HTMLInputElement>("input[placeholder^='Ej.: cerrar']")!, "quiero ser full stack");
    expect(pressed(chip("Preset de ramas de Programación", "Full stack web"))).toBe(true);
    expect(chip("Ramas de Programación", "8 Mobile").getAttribute("aria-pressed")).toBe("false");
    await click(button("Generar plan"));
    const sent = gen.mock.calls[0]![0];
    expect(sent.branches).toEqual({ Programación: ["1 Fundamentals", "2.1 Python", "4 Backend", "5 Frontend", "6 Databases"] });
    expect(sent.branchPreset).toBe("fullstack");
    expect(sent.branchExcluded).toEqual(["3 Desktop Apps (Electron)", "8 Mobile"]);
    // el último preset se recuerda
    expect(JSON.parse(localStorage.getItem("nv.mentor.planPre")!).branchPreset).toBe("fullstack");
  });

  it("si nombras móvil de forma explícita, esa rama entra (el estudiante manda) y «Añadir» reañade las excluidas", async () => {
    await mountEl(<PlanForm onClose={() => undefined} />);
    await click(chip("Materias", "Programación"));
    await type(host.querySelector<HTMLInputElement>("input[placeholder^='Ej.: cerrar']")!, "full stack con apps móviles");
    expect(pressed(chip("Ramas de Programación", "8 Mobile"))).toBe(true);
    expect(pressed(chip("Ramas de Programación", "3 Desktop"))).toBe(false);
    await click(button("Añadir Desktop Apps (Electron)", host.querySelector("[data-testid=branch-note]")!));
    expect(pressed(chip("Ramas de Programación", "3 Desktop"))).toBe(true);
    expect(host.querySelector("[data-testid=branch-note]")).toBeNull();
  });

  it("dos botones: «Generar plan» (principal, plan completo) y «Armar paso a paso (con preguntas)» que inicia el constructor y navega a él", async () => {
    const start = vi.spyOn(api, "mentorPlanBuildStart").mockResolvedValue(result(build({ id: "bnew" })));
    await mountEl(<PlanForm onClose={() => undefined} />);
    await click(chip("Materias", "Programación"));
    expect(button("Generar plan")).toBeTruthy();
    expect(button("Armar paso a paso")).toBeTruthy();
    await click(button("Armar paso a paso"));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]![0].subjects).toEqual(["Programación"]);
    expect(start.mock.calls[0]![1]).toMatch(/^b\d{14}-/); // el id lo genera el cliente para poder seguir el progreso
    expect(useNavState.getState().values["mentor.view"]).toBe("build:bnew");
  });
});
