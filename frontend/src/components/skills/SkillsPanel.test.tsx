// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { SkillInfo } from "../../lib/types";
import { SkillsPanel } from "./SkillsPanel";

const info = (kind: SkillInfo["kind"], past: SkillInfo["past"] = []): SkillInfo => ({ subject: "Programación", kind, label: kind, file: `Programación/_skills/${kind}.md`, version: "abcdef12", words: 120, updatedAt: null, past });
let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = async (el: HTMLElement | null) => { await act(async () => { el!.click(); }); await flush(); };

beforeEach(async () => {
  vi.spyOn(api, "skillsList").mockResolvedValue({ maxPast: 3, subjects: [{ subject: "Programación", skills: [info("theory", [{ id: "20261029-1000_deadbeef", savedAt: "20261029-1000", version: "deadbeef", words: 90 }]), info("canvas"), info("practica")] }] });
  vi.spyOn(api, "skillsGet").mockImplementation(async (o) => ({ text: o.versionId ? "VIEJA" : "ACTUAL", info: info("theory") }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<SkillsPanel />); });
  await flush(); await flush();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("panel Skills", () => {
  it("muestra las tres skills con su versión y carga el texto actual", () => {
    expect(["theory", "canvas", "practica"].every((k) => q(`skill-tab-${k}`))).toBe(true);
    expect(q("skill-tab-theory")!.textContent).toContain("abcdef12");
    expect((q("skill-editor") as HTMLTextAreaElement).value).toBe("ACTUAL");
    expect(q("skill-save")!.hasAttribute("disabled")).toBe(true); // sin cambios no se guarda
  });

  it("editar activa «Guardar»; guardar manda el texto y recarga la lista", async () => {
    const save = vi.spyOn(api, "skillsSave").mockResolvedValue(info("theory"));
    await type(q("skill-editor") as HTMLTextAreaElement, "NUEVA");
    expect(q("skill-save")!.hasAttribute("disabled")).toBe(false);
    await click(q("skill-save"));
    expect(save).toHaveBeenCalledWith({ subject: "Programación", kind: "theory", text: "NUEVA" });
    expect(api.skillsList).toHaveBeenCalledTimes(2);
  });

  it("las versiones anteriores se pueden ver (queda como borrador) y restaurar", async () => {
    expect(host.querySelectorAll("[data-testid=skill-past]")).toHaveLength(1);
    await click(q("skill-past-view"));
    expect((q("skill-editor") as HTMLTextAreaElement).value).toBe("VIEJA");
    expect(q("skill-note")!.textContent).toContain("borrador");
    const restore = vi.spyOn(api, "skillsRestore").mockResolvedValue(info("theory"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await click(q("skill-past-restore"));
    expect(restore).toHaveBeenCalledWith({ subject: "Programación", kind: "theory", versionId: "20261029-1000_deadbeef" });
  });

  it("pedir un cambio: con la IA deja un BORRADOR (no guarda); como prompt lo copia para Antigravity", async () => {
    const ai = vi.spyOn(api, "skillsAiEdit").mockResolvedValueOnce({ mode: "app", prompt: "P", proposal: "PROPUESTA" }).mockResolvedValueOnce({ mode: "prompt", prompt: "PROMPT-ANTIGRAVITY" });
    const save = vi.spyOn(api, "skillsSave");
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    expect(q("skill-ask-app")!.hasAttribute("disabled")).toBe(true); // sin petición escrita
    await type(q("skill-instruction") as HTMLTextAreaElement, "módulos de 100 palabras como máximo");
    await click(q("skill-ask-app"));
    expect(ai).toHaveBeenLastCalledWith({ subject: "Programación", kind: "theory", instruction: "módulos de 100 palabras como máximo", mode: "app" });
    expect((q("skill-editor") as HTMLTextAreaElement).value).toBe("PROPUESTA");
    expect(save).not.toHaveBeenCalled();
    await click(q("skill-ask-prompt"));
    expect(write).toHaveBeenCalledWith("PROMPT-ANTIGRAVITY");
  });
});
