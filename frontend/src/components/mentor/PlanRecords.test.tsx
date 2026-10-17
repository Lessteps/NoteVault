// @vitest-environment jsdom
//
// Sub-vista «Registros»: las sesiones con su nota, el dominio, los patrones y «Repensar el plan con mis registros» (propone; aplicar siempre pasa
// por una confirmación que dice qué se crea o cambia).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { buildSessionRecord, type ProposalView, type RecordsList } from "../../lib/sessionRecords";
import { useApp } from "../../store/app";
import { DialogHost } from "../ui";
import { PlanRecords } from "./PlanRecords";

const HTTP = "Programación/4 Backend/4.2 HTTP in depth";
const today = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const rec = (id: string, date: string, area = "backend", name = "Backend") =>
  buildSessionRecord({
    id, planId: "p1", areaKey: area, areaName: name, date, startedAtMs: new Date(`${date}T14:30:00`).getTime(), minutes: 50, mode: "timer",
    assigned: [{ kind: "topic", folder: HTTP, title: "4.2 HTTP in depth", status: "partial" }],
    assessment: { understanding: 2, focus: 4, practiced: true, learned: "Cómo validar", doubt: "El token expira", errors: "PUT vs PATCH" },
    errors: [{ category: "conceptual", skill: "design", topic: "4.2", folder: HTTP, repeat: 2 }], now: `${date}T16:00:00Z`,
  })!;

const proposal = (o: Partial<ProposalView>): ProposalView => ({
  id: "pr-1", kind: "bridge_note", folder: HTTP, title: "Nota puente para 4.2 HTTP in depth", why: "Quedó a medias en 3 sesiones.", evidence: [{ recordId: "r1", date: daysAgo(1), note: "El token expira" }],
  cost: { aiCalls: 1, files: 1 }, status: "open", source: "rules", createdAt: "2026-10-16T10:00:00Z", needsConfirmation: true, followUp: null, ...o,
});

const list = (over: Partial<RecordsList> = {}): RecordsList => ({
  records: [rec("r1", daysAgo(1)), rec("r2", daysAgo(2), "frontend", "Frontend"), rec("old", daysAgo(60))],
  overview: {
    mastery: [{ folder: HTTP, title: "4.2 HTTP in depth", sessions: 3, openSessions: 3, avgUnderstanding: 2, avgFocus: 4, attempts: 2, avgScore: 40, errors: 4, mastery: 31 }],
    patterns: [{ kind: "repeated_error", folder: HTTP, title: "4.2 HTTP in depth", detail: "4 errores de tipo «conceptual» en 14 días", recordIds: ["r1"] }],
    weeks: [{ week: "2026-W23", sessions: 4, minutes: 200, avgUnderstanding: 3, avgFocus: 4, attempts: 5, errors: 2, byArea: [], topics: [] }],
  },
  proposals: [proposal({})], lastReviewAt: "", space: "Programación", noteDir: "Programación/_registro", retentionDays: 90, aiConfigured: true, ...over,
});

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const all = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid=${id}]`)];
const click = async (el: Element | null | undefined) => { expect(el, "elemento no encontrado").toBeTruthy(); await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); await flush(); };
const mount = async () => { await act(async () => { root.render(<><PlanRecords planId="p1" /><DialogHost /></>); }); await flush(); await flush(); };
const dialogConfirm = async () => { await click([...document.querySelectorAll("button")].find((b) => /Crear la nota|Mover|Aligerar/.test(b.textContent ?? ""))); };

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  void today;
  vi.spyOn(api, "mentorRecordsList").mockResolvedValue(list());
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("PlanRecords", () => {
  it("lista las sesiones del rango (30 días por defecto), el dominio y los patrones; la carpeta de registros se abre con un botón", async () => {
    const reveal = vi.spyOn(api, "revealPath").mockResolvedValue({ ok: true, folder: true });
    await mount();
    expect(all("record-row")).toHaveLength(2); // la de hace 60 días queda fuera del rango
    expect(all("mastery-row")[0]!.textContent).toContain("31 %");
    expect(all("pattern-row")[0]!.textContent).toContain("4 errores");
    expect(all("week-row")[0]!.textContent).toContain("2026-W23");
    await click(byTest("records-folder"));
    expect(reveal).toHaveBeenCalledWith("Programación/_registro");
  });

  it("filtra por área y por días; cada sesión se despliega con lo que escribió y abre su nota", async () => {
    const note = vi.fn(async () => undefined);
    useApp.setState({ openNote: note as never });
    await mount();
    await act(async () => {
      const sel = byTest("records-area") as unknown as HTMLSelectElement;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "frontend");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(all("record-row").map((r) => r.dataset.id)).toEqual(["r2"]);
    await act(async () => {
      const sel = byTest("records-area") as unknown as HTMLSelectElement;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      const d = byTest("records-days") as unknown as HTMLSelectElement;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(d, "90");
      d.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(all("record-row")).toHaveLength(3);
    await click(all("record-row")[0]!.querySelector("button"));
    const detail = byTest("record-detail")!;
    expect(detail.textContent).toContain("Duda pendiente: El token expira");
    expect(detail.textContent).toContain("PUT vs PATCH");
    await click(byTest("record-open-note"));
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/^Programación\/_registro\/\d{4}-\d{2}-\d{2}\/1430 Backend\.md$/));
  });

  it("sin sesiones lo explica y no deja repensar", async () => {
    vi.mocked(api.mentorRecordsList).mockResolvedValue(list({ records: [], proposals: [], overview: { mastery: [], patterns: [], weeks: [] } }));
    await mount();
    expect(byTest("records-empty")!.textContent).toContain("Aún no hay sesiones registradas");
    expect(byTest("rethink")!.hasAttribute("disabled")).toBe(true);
  });

  it("«Repensar» pide la revisión y enseña las propuestas con su evidencia y su coste", async () => {
    const rethink = vi.spyOn(api, "mentorRecordsRethink").mockResolvedValue({ proposals: [proposal({ id: "pr-1" }), proposal({ id: "pr-2", kind: "reinforce", title: "Reforzar 4.2 (design)", source: "ai", cost: { aiCalls: 1, files: 1 } })], source: "ai" });
    vi.mocked(api.mentorRecordsList).mockResolvedValue(list({ proposals: [] }));
    await mount();
    expect(byTest("proposals-open")).toBeNull();
    await click(byTest("rethink"));
    expect(rethink).toHaveBeenCalledWith("p1", false);
    const cards = all("proposal");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("Nota puente");
    expect(cards[0]!.textContent).toContain("El token expira"); // la evidencia citada
    expect(cards[0]!.textContent).toContain("1 llamada de IA");
    expect(cards[1]!.textContent).toContain("Propuesta de la IA");
    await click(byTest("rethink-rules"));
    expect(rethink).toHaveBeenLastCalledWith("p1", true);
  });

  it("aplicar una nota enseña ANTES qué se creará (y dónde), pide confirmar y no hace nada si se cancela", async () => {
    const apply = vi.spyOn(api, "mentorProposalApply").mockImplementation(async (_id, _p, preview) => ({ rel: `${HTTP}/_Nota puente — 4.2 HTTP in depth.md`, created: !preview, source: "rules", aiCalls: 1 }));
    useApp.setState({ openNote: vi.fn(async () => undefined) as never });
    await mount();
    await click(byTest("proposal-apply"));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("p1", "pr-1", true); // solo la vista previa
    expect(document.body.textContent).toContain("_Nota puente — 4.2 HTTP in depth.md");
    expect(document.body.textContent).toContain("No se sobrescribe nada");
    // cancelar: no se crea nada
    await click([...document.querySelectorAll("button")].find((b) => /Cancelar/.test(b.textContent ?? "")));
    expect(apply).toHaveBeenCalledTimes(1);
    // confirmar: se crea
    await click(byTest("proposal-apply"));
    await dialogConfirm();
    expect(apply).toHaveBeenCalledTimes(3);
    expect(apply).toHaveBeenLastCalledWith("p1", "pr-1");
  });

  it("descartar marca la propuesta y la manda a «aplicadas y descartadas»", async () => {
    const set = vi.spyOn(api, "mentorProposalSet").mockResolvedValue({ proposals: [proposal({ status: "dismissed" })] });
    await mount();
    await click(byTest("proposal-dismiss"));
    expect(set).toHaveBeenCalledWith("p1", "pr-1", "dismissed");
    expect(byTest("proposals-open")).toBeNull();
    expect(all("proposal")[0]!.dataset.status).toBe("dismissed");
  });

  it("adelantar un repaso lo mueve a mañana; si el tema no tiene repaso lo dice sin cambiar nada", async () => {
    vi.mocked(api.mentorRecordsList).mockResolvedValue(list({ proposals: [proposal({ id: "pr-3", kind: "move_review", title: "Repasar 4.2 mañana", cost: { aiCalls: 0, files: 0 } })] }));
    vi.spyOn(api, "studyReviewsList").mockResolvedValue({ today: iso(new Date()), items: [] });
    const resched = vi.spyOn(api, "studyReviewReschedule").mockResolvedValue({} as never);
    const toasts = vi.fn();
    useApp.setState({ toast: toasts as never });
    await mount();
    await click(byTest("proposal-apply"));
    expect(resched).not.toHaveBeenCalled();
    expect(toasts).toHaveBeenCalledWith("info", expect.stringContaining("todavía no tiene un repaso"));
    vi.mocked(api.studyReviewsList).mockResolvedValue({ today: iso(new Date()), items: [{ path: "Programación/Repaso/4.2.md", topic: "4.2", topicPath: HTTP, subject: "programming", subjectFolder: "Programación", next: "2026-10-17", last: "2026-10-14", level: 1, inDays: 1, skills: [], practicedDays: 1, upcoming: [] }] as never });
    vi.spyOn(api, "mentorProposalSet").mockResolvedValue({ proposals: [proposal({ id: "pr-3", kind: "move_review", status: "applied" })] });
    await click(byTest("proposal-apply"));
    await dialogConfirm();
    expect(resched).toHaveBeenCalledWith("Programación/Repaso/4.2.md", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("lo aplicado muestra su seguimiento", async () => {
    vi.mocked(api.mentorRecordsList).mockResolvedValue(list({ proposals: [proposal({ status: "applied", followUp: { verdict: "improved", days: 20, detail: "Dominio 31 % → 62 % · errores 4 → 1" } })] }));
    await mount();
    const done = byTest("proposals-done")!;
    expect(done.textContent).toContain("Mejoró");
    expect(done.textContent).toContain("31 % → 62 %");
  });
});
