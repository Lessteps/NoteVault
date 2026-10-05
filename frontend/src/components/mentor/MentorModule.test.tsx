// @vitest-environment jsdom
//
// La pestaña Mentor: pinta el plan propuesto (con su razón y fuente), lo acepta, marca bloques
// y avisa cuando el plan es el automático porque la IA no está configurada.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorOverview, MentorProposeResult, MentorSessionRecord } from "../../lib/types";
import { MentorModule } from "./MentorModule";

const overview = (over: Partial<Extract<MentorOverview, { loading: false }>> = {}): MentorOverview => ({
  loading: false,
  date: "2026-10-05",
  weekday: "lunes",
  sections: [{ id: "study_pending", title: "Pendiente de estudio", summary: "3 repasos vencidos", signals: ["Sueles dejar álgebra para el final"] }],
  adherence: { sessions: 2, overall: { total: 4, done: 2, partial: 0, skipped: 2, planned: 0, pct: 50 }, bySubject: {}, byKind: {}, skippedSubjects: ["historia"], typicalSessionMinutes: 75 },
  today: null,
  aiConfigured: true,
  ...over,
});

const proposal = (source: "ai" | "fallback" = "ai"): Extract<MentorProposeResult, { loading: false }> => ({
  loading: false,
  availableMinutes: 120,
  source,
  ...(source === "fallback" ? { error: "La IA no está configurada (falta la API key)." } : {}),
  candidates: [],
  plan: {
    summary: "Hoy toca repasar y avanzar álgebra",
    blocks: [
      { candidateId: "srs:mathematics", minutes: 20, reason: "3 repasos vencidos", kind: "srs_review", subject: "mathematics" },
      { candidateId: "topic:Mat/Álgebra", minutes: 30, reason: "tema a medias (40%)", kind: "continue_topic", subject: "mathematics", topicFolder: "Mat/Álgebra" },
    ],
  },
});

const record = (statuses: Array<"planned" | "done" | "skipped" | "partial"> = ["planned", "planned"]): MentorSessionRecord => ({
  date: "2026-10-05",
  availableMinutes: 120,
  createdAt: "2026-10-05T08:00:00",
  acceptedAt: "2026-10-05T08:01:00",
  blocks: [
    { candidateId: "srs:mathematics", kind: "srs_review", subject: "mathematics", minutes: 20, status: statuses[0]!, reason: "3 repasos vencidos" },
    { candidateId: "topic:Mat/Álgebra", kind: "continue_topic", subject: "mathematics", topicFolder: "Mat/Álgebra", minutes: 30, status: statuses[1]!, reason: "tema a medias (40%)" },
  ],
});

let host: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<MentorModule />);
  });
}
const flush = () => act(async () => { await Promise.resolve(); });
const button = (label: string | RegExp, within: ParentNode = host) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? "")))!;
const click = async (el: Element | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorOverview").mockResolvedValue(overview());
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("MentorModule", () => {
  it("muestra la cabecera, el tiempo y 'Lo que sé de ti' en texto", async () => {
    await mount();
    expect(host.textContent).toContain("Mentor — Hoy");
    for (const h of ["1 h", "2 h", "3 h", "4 h"]) expect(host.textContent).toContain(h);
    expect(host.textContent).toContain("Sueles saltarte: historia");
    expect(host.textContent).toContain("3 repasos vencidos");
    expect(host.querySelector("svg circle[stroke-dasharray]")).toBeNull(); // sin anillos
  });

  it("propone el plan: bloques con materia, minutos, tipo, razón y fuente", async () => {
    const propose = vi.spyOn(api, "mentorPlanPropose").mockResolvedValue(proposal("ai"));
    await mount();
    await click(button("3 h"));
    await click(button("Proponer plan"));
    expect(propose).toHaveBeenCalledWith(expect.objectContaining({ availableMinutes: 180 }));
    const blocks = host.querySelectorAll("[data-testid=plan-block]");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.textContent).toContain("mathematics");
    expect(blocks[0]!.textContent).toContain("20 min");
    expect(blocks[0]!.textContent).toContain("Repaso");
    expect(blocks[0]!.textContent).toContain("3 repasos vencidos");
    expect(host.textContent).toContain("Propuesto por la IA");
    // el bloque con tema enlaza; el repaso no
    expect(button("Ver tema", blocks[1]!)).toBeTruthy();
    expect(button("Ver tema", blocks[0]!)).toBeUndefined();
  });

  it("quitar un bloque lo retira del plan", async () => {
    vi.spyOn(api, "mentorPlanPropose").mockResolvedValue(proposal());
    await mount();
    await click(button("Proponer plan"));
    await click(button("Quitar", host.querySelectorAll("[data-testid=plan-block]")[0]!));
    expect(host.querySelectorAll("[data-testid=plan-block]")).toHaveLength(1);
  });

  it("aceptar guarda la sesión y deja marcar los bloques como hecho/saltado/parcial", async () => {
    vi.spyOn(api, "mentorPlanPropose").mockResolvedValue(proposal());
    const accept = vi.spyOn(api, "mentorPlanAccept").mockResolvedValue(record());
    const status = vi.spyOn(api, "mentorBlockStatus").mockResolvedValue(record(["done", "planned"]));
    await mount();
    await click(button("Proponer plan"));
    await click(button("Aceptar plan"));
    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ availableMinutes: 120, blocks: expect.arrayContaining([expect.objectContaining({ candidateId: "srs:mathematics" })]) }));
    const sessionBlocks = host.querySelectorAll("[data-testid=session-block]");
    expect(sessionBlocks).toHaveLength(2);
    await click(button("Hecho", sessionBlocks[0]!));
    expect(status).toHaveBeenCalledWith("2026-10-05", "srs:mathematics", "done");
    const first = host.querySelectorAll("[data-testid=session-block]")[0]!;
    expect(button("Hecho", first).getAttribute("aria-pressed")).toBe("true");
  });

  it("si ya hay un plan aceptado hoy lo muestra directamente", async () => {
    vi.mocked(api.mentorOverview).mockResolvedValue(overview({ today: record(["done", "skipped"]) }));
    await mount();
    expect(host.textContent).toContain("Plan de hoy (aceptado)");
    expect(button("Saltado", host.querySelectorAll("[data-testid=session-block]")[1]!).getAttribute("aria-pressed")).toBe("true");
  });

  it("sin IA configurada avisa y muestra el plan automático con el motivo", async () => {
    vi.mocked(api.mentorOverview).mockResolvedValue(overview({ aiConfigured: false }));
    vi.spyOn(api, "mentorPlanPropose").mockResolvedValue(proposal("fallback"));
    await mount();
    expect(host.textContent).toContain("La IA no está configurada");
    await click(button("Proponer plan"));
    expect(host.textContent).toContain("Plan automático");
    expect(host.textContent).toContain("falta la API key");
    expect(host.querySelectorAll("[data-testid=plan-block]").length).toBeGreaterThan(0);
  });

  it("el ajuste en lenguaje natural vuelve a proponer con la nota", async () => {
    const propose = vi.spyOn(api, "mentorPlanPropose").mockResolvedValue(proposal());
    await mount();
    await click(button("Proponer plan"));
    const field = host.querySelector<HTMLInputElement>("input[aria-label='Ajustar el plan']")!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(field, "hoy no quiero mates");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Re-proponer"));
    expect(propose).toHaveBeenLastCalledWith(expect.objectContaining({ userNote: "hoy no quiero mates" }));
  });

  it("muestra el error de la API y el estado vacío", async () => {
    vi.spyOn(api, "mentorPlanPropose").mockRejectedValueOnce(new Error("fallo de red")).mockResolvedValueOnce({ ...proposal(), plan: { summary: "Nada", blocks: [] } });
    await mount();
    await click(button("Proponer plan"));
    expect(host.querySelector("[role=alert]")?.textContent).toContain("fallo de red");
    await click(button("Proponer plan"));
    await flush();
    expect(host.textContent).toContain("No hay nada pendiente");
    expect(host.querySelector("[role=alert]")).toBeNull();
  });
});
