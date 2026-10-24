// @vitest-environment jsdom
//
// Renombrar un fichero o una carpeta reetiqueta las pestañas abiertas. Estos
// tests fijan que la pestaña activa siga siendo la misma nota: un fallo aquí
// salta a otra nota sin avisar, y el usuario pierde lo que estaba leyendo.

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string, args?: unknown[]): Promise<unknown> => {
  if (method === "read_note") {
    const p = String(args?.[0] ?? "");
    return {
      path: p,
      title: (p.split("/").pop() ?? p).replace(/\.md$/, ""),
      kind: "note" as const,
      raw: "x",
      frontmatter: {},
      modified: 1,
      bookmarked: false,
    };
  }
  return { ok: true, conflict: false, modified: 2 };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { useApp } from "./app";

const app = () => useApp.getState();

function reset() {
  invoke.mockClear();
  localStorage.clear();
  useApp.setState({
    vault: "C:/v", module: "home", openTabs: [], activeTabId: null, active: null,
    tabs: [], pinnedTabIds: new Set<string>(), notes: {}, toasts: [],
  });
}

beforeEach(reset);

describe("renombrar un fichero abierto", () => {
  it("la nota activa sigue activa con su ruta nueva", async () => {
    await app().openNote("a.md", { pin: true });
    await app().openNote("b.md", { pin: true });
    await app().openNote("c.md", { pin: true });
    app().setActiveTab("note:b.md");

    app().pathRenamed("b.md", "b2.md");

    expect(app().activeTabId).toBe("note:b2.md");
    expect(app().active).toBe("b2.md");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["note:a.md", "note:b2.md", "note:c.md"]);
    expect(app().notes["b.md"]).toBeUndefined();
    expect(app().notes["b2.md"]).toBeDefined();
  });

  it("renombrar otra nota no mueve la activa", async () => {
    await app().openNote("a.md", { pin: true });
    await app().openNote("b.md", { pin: true });
    app().setActiveTab("note:b.md");

    app().pathRenamed("a.md", "a2.md");

    expect(app().activeTabId).toBe("note:b.md");
    expect(app().active).toBe("b.md");
  });

  it("una sola nota abierta se renombra bien", async () => {
    await app().openNote("unica.md");
    app().pathRenamed("unica.md", "nuevo.md");
    expect(app().activeTabId).toBe("note:nuevo.md");
    expect(Object.keys(app().notes)).toEqual(["nuevo.md"]);
  });
});

describe("renombrar una carpeta", () => {
  it("mueve la activa al archivo con la misma ruta dentro de la carpeta nueva", async () => {
    await app().openNote("curso/a.md", { pin: true });
    await app().openNote("curso/b.md", { pin: true });
    app().setActiveTab("note:curso/b.md");

    app().pathRenamed("curso", "2026");

    expect(app().activeTabId).toBe("note:2026/b.md");
    expect(app().active).toBe("2026/b.md");
    expect(Object.keys(app().notes).sort()).toEqual(["2026/a.md", "2026/b.md"]);
  });

  it("el título de la nota renombrada se recalcula", async () => {
    await app().openNote("curso/Tema viejo.md");
    app().pathRenamed("curso/Tema viejo.md", "curso/Tema nuevo.md");
    expect(app().notes["curso/Tema nuevo.md"]?.title).toBe("Tema nuevo");
  });

  it("una carpeta con un nombre que es prefijo no mueve nada", async () => {
    await app().openNote("curso2/a.md");
    app().pathRenamed("curso", "2026");
    expect(app().activeTabId).toBe("note:curso2/a.md");
  });
});

describe("tipos de pestaña", () => {
  it("un canvas activo sigue activo al renombrar su carpeta", async () => {
    app().openTab({ kind: "canvas", path: "curso/mapa.canvas" });
    app().pathRenamed("curso", "2026");
    expect(app().activeTabId).toBe("canvas:2026/mapa.canvas");
  });

  it("un módulo activo no se ve afectado por un renombrado de nota", () => {
    app().openTab({ kind: "module", id: "calendario" });
    app().pathRenamed("cualquier.md", "otro.md");
    expect(app().activeTabId).toBe("module:calendario");
  });

  it("los pines siguen a la nota renombrada y se van con la borrada", async () => {
    await app().openNote("a.md", { pin: true });
    await app().openNote("curso/b.md", { pin: true });
    app().pinTab("note:a.md");
    app().pinTab("note:curso/b.md");

    app().pathRenamed("curso", "2026");
    expect(app().pinnedTabIds.has("note:2026/b.md")).toBe(true);
    expect(app().pinnedTabIds.has("note:curso/b.md")).toBe(false);

    app().pathDeleted("a.md");
    expect(app().pinnedTabIds.has("note:a.md")).toBe(false);
    expect(app().pinnedTabIds.has("note:2026/b.md")).toBe(true);
  });
});
