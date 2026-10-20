// @vitest-environment jsdom
//
// Hub de proyectos: lo que hay en la carpeta de la ruta por área y tipo, su avance y «Ver carpeta» con sus dos caminos.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { ProjectsListing } from "../../lib/projectTemplates";
import { useApp } from "../../store/app";
import { ProjectsHub } from "./ProjectsHub";

let host: HTMLDivElement;
let root: Root;
const BASE = "Programación/Mentor/Ruta X";
const item = (name: string, dir: string, done: number, total: number) => ({ name, dir, readme: `${dir}/README.md`, files: ["README.md", "01 Especificación.md"], done, total, status: (done === 0 ? "new" : done >= total ? "done" : "doing") as "new" | "doing" | "done", modified: 1 });
const listing = (exists = true): ProjectsListing => ({
  route: BASE, exists,
  areas: [
    { areaKey: "backend", area: "Backend", dir: `${BASE}/1. Backend`, kinds: [
      { kind: "daily", label: "Diarios", dir: `${BASE}/1. Backend/1.1 Proyectos diarios`, projects: [item("2026-10-19 Feature", `${BASE}/1. Backend/1.1 Proyectos diarios/2026-10-19 Feature`, 1, 4)] },
      { kind: "weekly", label: "Semanales", dir: "w", projects: [item("Semana 02 - Vertical", `${BASE}/1. Backend/1.2 Proyectos semanales/Semana 02 - Vertical`, 0, 0)] },
      { kind: "monthly", label: "Mensuales", dir: "m", projects: [] },
    ] },
    { areaKey: "frontend", area: "Frontend", dir: `${BASE}/2. Frontend`, kinds: [
      { kind: "daily", label: "Diarios", dir: "d", projects: [item("2026-10-19 Pantalla", `${BASE}/2. Frontend/2.1 Proyectos diarios/2026-10-19 Pantalla`, 3, 3)] },
      { kind: "weekly", label: "Semanales", dir: "w", projects: [] },
      { kind: "monthly", label: "Mensuales", dir: "m", projects: [] },
    ] },
  ],
});
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const click = (id: string) => act(async () => { host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(); await Promise.resolve(); });
const names = () => [...host.querySelectorAll('[data-testid="hub-project"] h4')].map((h) => h.textContent);

beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("ProjectsHub", () => {
  it("sin carpeta ofrece crear la estructura", async () => {
    vi.spyOn(api, "mentorProjectsList").mockResolvedValue({ ...listing(false), areas: listing().areas });
    const scaffold = vi.spyOn(api, "mentorProjectsScaffold").mockResolvedValue({ route: BASE, skeleton: [], projects: [], created: [], existed: [] });
    useApp.setState({ toast: vi.fn() } as never);
    act(() => root.render(<ProjectsHub planId="p1" />));
    await flush();
    expect(host.querySelector('[data-testid="hub-empty"]')).not.toBeNull();
    await click("hub-prepare");
    expect(scaffold).toHaveBeenCalledWith({ id: "p1", areaKeys: [] });
  });

  it("filtra por área y por tipo, y enseña el avance y el estado", async () => {
    vi.spyOn(api, "mentorProjectsList").mockResolvedValue(listing());
    act(() => root.render(<ProjectsHub planId="p1" />));
    await flush();
    expect(names()).toEqual(["2026-10-19 Feature", "2026-10-19 Pantalla"]);
    expect(host.textContent).toContain("1 de 4 casillas");
    await click("hub-area-frontend");
    expect(names()).toEqual(["2026-10-19 Pantalla"]);
    expect(host.querySelector('[data-testid="hub-project"]')!.getAttribute("data-status")).toBe("done");
    await click("hub-area-all");
    await click("hub-kind-weekly");
    expect(names()).toEqual(["Semana 02 - Vertical"]);
    await click("hub-kind-monthly");
    expect(host.querySelector('[data-testid="hub-none"]')).not.toBeNull();
  });

  it("abre un archivo en NoteVault y la carpeta por los dos caminos", async () => {
    vi.spyOn(api, "mentorProjectsList").mockResolvedValue(listing());
    const reveal = vi.spyOn(api, "revealPath").mockResolvedValue({ ok: true, folder: true });
    const open = vi.fn(async () => {});
    const showFolder = vi.fn();
    useApp.setState({ openNote: open, showFolder } as never);
    act(() => root.render(<ProjectsHub planId="p1" />));
    await flush();
    const dir = `${BASE}/1. Backend/1.1 Proyectos diarios/2026-10-19 Feature`;
    await click("hub-file");
    expect(open).toHaveBeenCalledWith(`${dir}/README.md`);
    const toggle = host.querySelector('[data-testid="hub-project"] [data-testid="hub-folder-toggle"]') as HTMLElement;
    await act(async () => { toggle.click(); });
    await click("hub-folder-vault");
    expect(showFolder).toHaveBeenCalledWith(dir);
    await act(async () => { (host.querySelector('[data-testid="hub-project"] [data-testid="hub-folder-toggle"]') as HTMLElement).click(); });
    await click("hub-folder-windows");
    expect(reveal).toHaveBeenCalledWith(dir);
  });
});
