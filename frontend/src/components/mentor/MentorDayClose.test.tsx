// @vitest-environment jsdom
//
// Mentor — Cierre del día: el registro sin IA se ve al abrir, cerrar manda lo que escribió el estudiante, la revisión y las correcciones se
// muestran, y una corrección se convierte en tarea solo al pulsar «Crear tarea».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { MentorDayView, MentorMemory } from "../../lib/types";
import { MentorDayClose } from "./MentorDayClose";

const record = {
  date: "2026-10-12",
  builtAt: "t",
  planned: { topics: 3, minutes: 180, done: 1, pending: [{ folder: "P/b", title: "Rutas" }, { folder: "P/c", title: "JOINs" }] },
  completed: ["Fundamentos"],
  attempts: { total: 4, counted: 3, avgScore: 55, minutes: 20, wrong: 2 },
  weak: [{ key: "sql:joins", discipline: "sql", skill: "joins", attempts: 2, avgScore: 40, errors: 2 }],
  errorsByCategory: { conceptual: 2 },
  katas: { done: 1, skipped: 0 },
};
const emptyMem: MentorMemory = { version: 1, updatedAt: "", closedDays: [], observations: [], studentSaid: [], corrections: [] };
const withMem = (over: Partial<MentorMemory>): MentorMemory => ({ ...emptyMem, ...over });
const open = (over: Partial<MentorDayView & { loading: false }> = {}): Extract<MentorDayView, { loading: false }> => ({
  loading: false, date: record.date, record, student: null, review: null, closedAt: null, memory: emptyMem, ...over,
});
const correction = { id: "c-1", title: "Repasar JOINs", why: "Falló 2 veces", kind: "review" as const, date: "2026-10-12", status: "open" as const, topic: "P/c" };

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const mountEl = async (el: React.ReactNode) => { await act(async () => { root.render(el); }); await flush(); await flush(); };
const click = async (el: Element | null | undefined) => {
  expect(el, "elemento no encontrado").toBeTruthy();
  await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
};
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "mentorAiStatus").mockResolvedValue({ busy: false, label: "", elapsed: 0 } as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Cierre del día", () => {
  it("al abrir muestra el registro del día calculado sin IA y los temas sin terminar", async () => {
    const rec = vi.spyOn(api, "mentorDayRecord").mockResolvedValue(open());
    const close = vi.spyOn(api, "mentorDayClose");
    await mountEl(<MentorDayClose />);
    expect(rec).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    const stats = byTest("close-record")!.textContent!;
    expect(stats).toContain("1/3");
    expect(stats).toContain("Rutas");
    expect(byTest("close-weak")!.textContent).toContain("joins");
    expect(byTest("close-empty")).toBeTruthy();
  });

  it("cerrar el día manda lo que escribió el estudiante y enseña la revisión y las correcciones", async () => {
    vi.spyOn(api, "mentorDayRecord").mockResolvedValue(open());
    const close = vi.spyOn(api, "mentorDayClose").mockResolvedValue(
      open({
        closedAt: "t",
        source: "ai",
        review: { source: "ai", summary: "Día flojo en SQL.", observations: ["Se confunde con los JOIN"], studentSaid: ["No entiende las rutas"], corrections: [] },
        memory: withMem({ corrections: [correction], studentSaid: [{ date: "2026-10-12", text: "No entiende las rutas" }] }),
      }),
    );
    await mountEl(<MentorDayClose />);
    await type(byTest("close-feeling") as HTMLTextAreaElement, "No entendí las rutas");
    await click(byTest("close-run"));
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ date: expect.any(String), feeling: "No entendí las rutas" }));
    expect(byTest("close-review")!.textContent).toContain("Día flojo en SQL.");
    expect(byTest("close-review")!.textContent).toContain("Se confunde con los JOIN");
    expect(byTest("close-correction")!.textContent).toContain("Repasar JOINs");
    expect(byTest("close-said")!.textContent).toContain("No entiende las rutas");
  });

  it("«Cerrar sin IA» lo pide así y una corrección solo se vuelve tarea al pulsar «Crear tarea»", async () => {
    vi.spyOn(api, "mentorDayRecord").mockResolvedValue(open({ memory: withMem({ corrections: [correction] }) }));
    const close = vi.spyOn(api, "mentorDayClose").mockResolvedValue(open({ closedAt: "t", source: "rules", note: "Revisión sin IA por petición tuya.", memory: withMem({ corrections: [correction] }) }));
    const task = vi.spyOn(api, "mentorCorrectionTask").mockResolvedValue({ taskId: "t1", memory: withMem({ corrections: [{ ...correction, status: "task", taskId: "t1" }] }) });
    await mountEl(<MentorDayClose />);
    expect(task).not.toHaveBeenCalled();
    await click(byTest("close-run-rules"));
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ noAi: true }));
    expect(byTest("close-note")!.textContent).toContain("sin IA");
    await click(byTest("close-to-task"));
    expect(task).toHaveBeenCalledWith("c-1");
    expect(byTest("close-correction")!.textContent).toContain("Tarea creada");
    expect(byTest("close-to-task")).toBeNull();
  });
});
