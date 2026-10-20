// @vitest-environment jsdom
//
// The right-click menu of the explorer: the groups, the labels, and the three
// ways of spelling a path. Built away from the tree so it can be checked
// without a vault.

import { describe, expect, it, vi } from "vitest";
import { fileMenuItems, pathFlavors, treeRootMenuItems, type FileMenuActions } from "./fileMenu";
import type { MenuItem } from "../ui";

function actions(): FileMenuActions {
  return {
    openInNewTab: vi.fn(),
    openToTheRight: vi.fn(),
    openInNewWindow: vi.fn(),
    makeCopy: vi.fn(),
    moveToFolder: vi.fn(),
    toggleBookmark: vi.fn(),
    copyPath: vi.fn(),
    versionHistory: vi.fn(),
    openInDefaultApp: vi.fn(),
    revealInExplorer: vi.fn(),
    rename: vi.fn(),
    trash: vi.fn(),
    newNoteHere: vi.fn(),
    newFolderHere: vi.fn(),
    newCanvasHere: vi.fn(),
  };
}

const labels = (items: MenuItem[]) => items.map((i) => (i.separator ? "—" : i.label));

describe("the file menu", () => {
  it("groups the actions in the order of the reference", () => {
    const items = fileMenuItems({ entry: { type: "note", path: "a/b.md", kind: "note" } }, actions());
    expect(labels(items)).toEqual([
      "Abrir en una pestaña nueva",
      "Abrir a la derecha",
      "Abrir en una ventana nueva",
      "Añadir al chat de IA",
      "—",
      "Hacer una copia",
      "Mover a otra carpeta…",
      "Marcador",
      "—",
      "Copiar ruta",
      "—",
      "Ver el historial de versiones",
      "—",
      "Abrir con la aplicación predeterminada",
      "Mostrar en el Explorador de archivos",
      "—",
      "Renombrar…",
      "Mover a la papelera",
    ]);
  });

  it("offers the three flavours of the path under one entry", () => {
    const items = fileMenuItems({ entry: { type: "note", path: "a/b.md" } }, actions());
    const copy = items.find((i) => i.label === "Copiar ruta")!;
    expect(copy.items?.map((i) => i.label)).toEqual([
      "como URL de Obsidian",
      "desde la carpeta del vault",
      "desde la raíz del sistema",
    ]);
  });

  it("tells a bookmarked file apart and leaves Delete in danger red", () => {
    const items = fileMenuItems({ entry: { type: "note", path: "a/b.md" }, bookmarked: true }, actions());
    expect(items.some((i) => i.label === "Quitar marcador")).toBe(true);
    expect(items.find((i) => i.label === "Mover a la papelera")?.danger).toBe(true);
  });

  it("offers creation instead of opening for a folder, and no copy", () => {
    const items = fileMenuItems({ entry: { type: "folder", path: "a" } }, actions());
    expect(labels(items).slice(0, 3)).toEqual(["Nueva nota aquí", "Nueva carpeta aquí", "Nuevo canvas aquí"]);
    expect(items.some((i) => i.label === "Hacer una copia")).toBe(false);
    expect(items.some((i) => i.label === "Abrir a la derecha")).toBe(false);
    // A folder can still be moved, revealed and sent to the trash.
    expect(labels(items)).toContain("Mover a otra carpeta…");
    expect(labels(items)).toContain("Mostrar en el Explorador de archivos");
    expect(labels(items)).toContain("Mover a la papelera");
  });

  it("hides the split for a canvas, which has no half to spare", () => {
    const items = fileMenuItems({ entry: { type: "note", path: "mapa.canvas", kind: "canvas" } }, actions());
    expect(labels(items)).not.toContain("Abrir a la derecha");
    expect(labels(items)).toContain("Abrir en una pestaña nueva");
    expect(labels(items)).toContain("Abrir en una ventana nueva");
  });

  it("runs the action it was given, once", () => {
    const a = actions();
    const items = fileMenuItems({ entry: { type: "note", path: "a/b.md" } }, a);
    items.find((i) => i.label === "Hacer una copia")!.onSelect?.();
    expect(a.makeCopy).toHaveBeenCalledTimes(1);
  });
});

describe("path flavours", () => {
  it("writes the Obsidian URL without the extension", () => {
    const f = pathFlavors("Matemáticas/1 Aritmética/nota.md", "C:\\PROGRAMMING", "PROGRAMMING");
    expect(f.obsidian).toBe(
      `obsidian://open?vault=PROGRAMMING&file=${encodeURIComponent("Matemáticas/1 Aritmética/nota")}`,
    );
  });

  it("keeps the vault-relative path as the vault spells it", () => {
    const f = pathFlavors("Matemáticas/nota.md", "C:/PROGRAMMING", "PROGRAMMING");
    expect(f.vault).toBe("Matemáticas/nota.md");
  });

  it("joins the system path with the separator the vault root uses", () => {
    expect(pathFlavors("a/b.md", "C:\\PROGRAMMING", "PROGRAMMING").system).toBe("C:\\PROGRAMMING\\a\\b.md");
    expect(pathFlavors("a/b.md", "C:/PROGRAMMING/", "PROGRAMMING").system).toBe("C:/PROGRAMMING/a/b.md");
  });
});

describe("treeRootMenuItems", () => {
  it("provides root creation, reload, collapse and explorer actions", () => {
    const a = {
      newNote: vi.fn(),
      newFolder: vi.fn(),
      newCanvas: vi.fn(),
      refresh: vi.fn(),
      collapseAll: vi.fn(),
      revealInExplorer: vi.fn(),
    };
    const items = treeRootMenuItems(a);
    expect(labels(items)).toEqual([
      "Nueva nota",
      "Nueva carpeta",
      "Nuevo canvas",
      "—",
      "Recargar explorador",
      "Colapsar carpetas",
      "—",
      "Mostrar en el Explorador de archivos",
    ]);

    items.find((i) => i.label === "Nueva nota")!.onSelect?.();
    expect(a.newNote).toHaveBeenCalledTimes(1);

    items.find((i) => i.label === "Nueva carpeta")!.onSelect?.();
    expect(a.newFolder).toHaveBeenCalledTimes(1);

    items.find((i) => i.label === "Nuevo canvas")!.onSelect?.();
    expect(a.newCanvas).toHaveBeenCalledTimes(1);

    items.find((i) => i.label === "Recargar explorador")!.onSelect?.();
    expect(a.refresh).toHaveBeenCalledTimes(1);

    items.find((i) => i.label === "Colapsar carpetas")!.onSelect?.();
    expect(a.collapseAll).toHaveBeenCalledTimes(1);

    items.find((i) => i.label === "Mostrar en el Explorador de archivos")!.onSelect?.();
    expect(a.revealInExplorer).toHaveBeenCalledTimes(1);
  });

  it("can omit optional actions when not provided", () => {
    const items = treeRootMenuItems({
      newNote: vi.fn(),
      newFolder: vi.fn(),
      newCanvas: vi.fn(),
    });
    expect(labels(items)).toEqual(["Nueva nota", "Nueva carpeta", "Nuevo canvas"]);
  });
});
