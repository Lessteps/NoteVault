// @vitest-environment jsdom
//
// «Abrir nota» de un tema (Mentor → Notas): Teoría abre el apunte .md de la carpeta; Ejercicios, el archivo de práctica.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { TopicNoteLinks } from "./TopicNoteLinks";
import { DayTopicRow } from "./PlanRunGeneral";
import type { BoardRow } from "./PlanBoard";

let host: HTMLDivElement;
let root: Root;
const tick = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const q = (sel: string) => host.querySelector<HTMLElement>(sel)!;
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await tick(); };

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("TopicNoteLinks", () => {
  it("Teoría abre el apunte de la carpeta (mismo nombre que ella)", async () => {
    vi.spyOn(api, "readNote").mockResolvedValue({} as never);
    const openNote = vi.spyOn(useApp.getState(), "openNote").mockResolvedValue(undefined as never);
    act(() => root.render(<TopicNoteLinks folder="Programación/Back/Tema X" title="Tema X" />));
    expect(q("[data-testid=topic-note-links]").getAttribute("aria-label")).toBe("Abrir nota de Tema X");
    await click(q("[data-testid=topic-note-theory]"));
    expect(openNote).toHaveBeenCalledWith("Programación/Back/Tema X/Tema X.md");
  });

  it("Ejercicios abre el archivo de práctica del tema", async () => {
    vi.spyOn(api, "studyViewEnsure").mockResolvedValue({ path: "Programación/Back/Tema X/Tema X.practica.md" } as never);
    const openNote = vi.spyOn(useApp.getState(), "openNote").mockResolvedValue(undefined as never);
    act(() => root.render(<TopicNoteLinks folder="Programación/Back/Tema X" title="Tema X" />));
    await click(q("[data-testid=topic-note-practice]"));
    expect(openNote).toHaveBeenCalledWith("Programación/Back/Tema X/Tema X.practica.md");
  });

  it("sin apunte avisa con un aviso, no abre nada; `practice={false}` solo ofrece la Teoría", async () => {
    vi.spyOn(api, "readNote").mockRejectedValue(new Error("no existe"));
    const openNote = vi.spyOn(useApp.getState(), "openNote").mockResolvedValue(undefined as never);
    const toast = vi.spyOn(useApp.getState(), "toast").mockImplementation(() => undefined);
    act(() => root.render(<TopicNoteLinks folder="F/T" title="T" practice={false} />));
    expect(host.querySelector("[data-testid=topic-note-practice]")).toBeNull();
    await click(q("[data-testid=topic-note-theory]"));
    expect(openNote).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("info", expect.stringContaining("no tiene apunte"));
  });

  it("aparece en las filas de Hoy salvo que el tema esté bloqueado", () => {
    const row = (over: Partial<BoardRow>): BoardRow => ({ folder: "F/T", title: "T", week: 1, state: "sin_tratar", done: false, exercises: 0, ...over }) as BoardRow;
    act(() => root.render(<ul><DayTopicRow r={row({})} colour="#000" /><DayTopicRow r={row({ unlockOn: "2026-10-20" })} colour="#000" /></ul>));
    expect(host.querySelectorAll("[data-testid=topic-note-links]")).toHaveLength(1);
  });
});
