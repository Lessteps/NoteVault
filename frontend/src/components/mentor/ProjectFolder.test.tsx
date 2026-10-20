// @vitest-environment jsdom
//
// Botón «Crear carpeta del proyecto»: llama al scaffold con el área y el proyecto, avisa de lo que pasó y ofrece abrir el README y la carpeta.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { ProjectFolder } from "./ProjectFolder";

let host: HTMLDivElement;
let root: Root;
const DIR = "Programación/Mentor/Ruta X/1. Backend/1.1 Proyectos diarios/2026-10-19 Feature";
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const click = (id: string) => act(async () => { host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(); await Promise.resolve(); await Promise.resolve(); });
const result = (created: string[]) => ({ route: "Programación/Mentor/Ruta X", skeleton: [], projects: [{ areaKey: "backend", area: "Backend", dir: DIR, readme: `${DIR}/README.md`, created, existed: [] }], created, existed: [] });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("ProjectFolder", () => {
  it("crea la carpeta con el proyecto, avisa y ofrece abrir el README y la carpeta", async () => {
    const scaffold = vi.spyOn(api, "mentorProjectsScaffold").mockResolvedValue(result([`${DIR}/README.md`]));
    const reveal = vi.spyOn(api, "revealPath").mockResolvedValue({ ok: true, folder: true });
    const open = vi.fn(async () => {});
    const toast = vi.fn();
    useApp.setState({ openNote: open, toast } as never);
    act(() => root.render(<ProjectFolder planId="p1" areaKeys={["backend"]} project={{ kind: "daily", title: "Feature" }} testid="pf" />));
    expect(host.textContent).toContain("Crear carpeta del proyecto");
    expect(host.querySelector('[data-testid="pf-readme"]')).toBeNull();
    await click("pf-create");
    await flush();
    expect(scaffold).toHaveBeenCalledWith({ id: "p1", areaKeys: ["backend"], project: { kind: "daily", title: "Feature" } });
    expect(toast).toHaveBeenCalledWith("info", expect.stringContaining("Carpeta creada"));
    await click("pf-readme");
    expect(open).toHaveBeenCalledWith(`${DIR}/README.md`);
    await click("pf-reveal");
    expect(reveal).toHaveBeenCalledWith(DIR);
  });

  it("si la carpeta ya existía lo dice y no cuenta como creada", async () => {
    vi.spyOn(api, "mentorProjectsScaffold").mockResolvedValue(result([]));
    const toast = vi.fn();
    useApp.setState({ toast } as never);
    act(() => root.render(<ProjectFolder planId="p1" areaKeys={["backend"]} project={{ kind: "daily", title: "Feature" }} testid="pf" />));
    await click("pf-create");
    await flush();
    expect(toast).toHaveBeenCalledWith("info", expect.stringContaining("ya existía"));
    expect(host.textContent).toContain("no se sobrescribió");
  });

  it("sin proyecto solo prepara la estructura de la ruta", async () => {
    const scaffold = vi.spyOn(api, "mentorProjectsScaffold").mockResolvedValue({ route: "Programación/Mentor/Ruta X", skeleton: ["a"], projects: [], created: [], existed: [] });
    const toast = vi.fn();
    useApp.setState({ toast } as never);
    act(() => root.render(<ProjectFolder planId="p1" areaKeys={[]} testid="pf" label="Crear la estructura" />));
    await click("pf-create");
    await flush();
    expect(scaffold).toHaveBeenCalledWith({ id: "p1", areaKeys: [] });
    expect(toast).toHaveBeenCalledWith("info", expect.stringContaining("Estructura de la ruta"));
  });

  it("si falla muestra el error", async () => {
    vi.spyOn(api, "mentorProjectsScaffold").mockRejectedValue(new Error("Ese plan ya no existe."));
    const toast = vi.fn();
    useApp.setState({ toast } as never);
    act(() => root.render(<ProjectFolder planId="p1" areaKeys={["backend"]} project={{ kind: "daily", title: "F" }} testid="pf" />));
    await click("pf-create");
    await flush();
    expect(toast).toHaveBeenCalledWith("error", "Ese plan ya no existe.");
  });
});
