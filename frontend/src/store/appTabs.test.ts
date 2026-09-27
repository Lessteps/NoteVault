// @vitest-environment jsdom
//
// Area A (Interfaces V3): the unified Obsidian-style tab strip.
// Opening any module / note / canvas / browser target creates a tab, clicking a
// tab activates it, closing (×) removes it, and a pinned tab cannot be closed —
// pins are remembered per vault.

import { beforeEach, describe, expect, it, vi } from "vitest";

// The bridge talks to the core through `window.nv.invoke` in the desktop app;
// a jsdom test plays that role.
const invoke = vi.fn(async (): Promise<unknown> => ({ ok: true }));
(window as unknown as { nv: unknown }).nv = { invoke };

import { loadPinnedIds, useApp } from "./app";

const app = () => useApp.getState();

function reset() {
  localStorage.clear();
  invoke.mockClear();
  useApp.setState({
    vault: "C:/vault-a",
    openTabs: [],
    activeTabId: null,
    active: null,
    tabs: [],
    pinnedTabIds: new Set<string>(),
    notes: {},
    toasts: [],
  });
}

beforeEach(reset);

describe("unified tab strip", () => {
  it("reports the active note on every tab change (it must not freeze)", () => {
    app().openTab({ kind: "note", path: "nota.md" });
    expect(app().active).toBe("nota.md");
    expect(app().tabs).toEqual(["nota.md"]);

    app().openTab({ kind: "canvas", path: "mapa.canvas" });
    expect(app().active).toBe("mapa.canvas");
    expect(app().tabs).toEqual(["nota.md", "mapa.canvas"]);

    // A module tab shows a module, never a note.
    app().setModule("home");
    expect(app().active).toBeNull();
    expect(app().tabs).toEqual(["nota.md", "mapa.canvas"]);
  });
  it("opens a module as a tab and focuses it instead of duplicating it", () => {
    app().setModule("calendario");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["module:calendario"]);
    expect(app().activeTabId).toBe("module:calendario");
    expect(app().module).toBe("calendario");

    app().setModule("home");
    app().setModule("calendario");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["module:calendario", "module:home"]);
    expect(app().activeTabId).toBe("module:calendario");
  });

  it("gives notes, canvases and the browser a tab of their own", () => {
    app().openTab({ kind: "note", path: "Matemáticas/1.1/tema.md" });
    app().openTab({ kind: "canvas", path: "Matemáticas/1.1/mapa.canvas" });
    app().openTab({ kind: "note", path: "Matemáticas/1.1/tema.md" }); // already open
    app().openTab({ kind: "web" });

    expect(app().openTabs.map((t) => t.tabId)).toEqual([
      "note:Matemáticas/1.1/tema.md",
      "canvas:Matemáticas/1.1/mapa.canvas",
      "web",
    ]);
    expect(app().activeTabId).toBe("web");
    expect(app().module).toBe("web");

    app().setActiveTab("canvas:Matemáticas/1.1/mapa.canvas");
    expect(app().activeTabId).toBe("canvas:Matemáticas/1.1/mapa.canvas");
    // A canvas is shown by the Notes view (explorer + right bar belong to it).
    expect(app().module).toBe("notas");
    expect(app().active).toBe("Matemáticas/1.1/mapa.canvas");
  });

  it("closing a tab removes it and activates a neighbour", async () => {
    app().openTab({ kind: "note", path: "a.md" });
    app().openTab({ kind: "note", path: "b.md" });
    app().openTab({ kind: "note", path: "c.md" });
    app().setActiveTab("note:b.md");

    await app().closeTab("note:b.md");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["note:a.md", "note:c.md"]);
    expect(app().activeTabId).toBe("note:c.md");

    await app().closeTab("note:c.md");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["note:a.md"]);
    expect(app().activeTabId).toBe("note:a.md");

    await app().closeTab("note:a.md");
    expect(app().openTabs).toEqual([]);
    expect(app().activeTabId).toBeNull();
  });

  it("never closes a pinned tab; unpinning restores the ×", async () => {
    app().openTab({ kind: "note", path: "pinned.md" });
    app().openTab({ kind: "note", path: "other.md" });

    app().pinTab("note:pinned.md");
    expect([...app().pinnedTabIds]).toEqual(["note:pinned.md"]);

    await app().closeTab("note:pinned.md");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["note:pinned.md", "note:other.md"]);

    app().unpinTab("note:pinned.md");
    expect([...app().pinnedTabIds]).toEqual([]);
    await app().closeTab("note:pinned.md");
    expect(app().openTabs.map((t) => t.tabId)).toEqual(["note:other.md"]);
  });

  it("remembers pinned tabs per vault, not globally", async () => {
    app().pinTab("module:home");
    expect(JSON.parse(localStorage.getItem("nv.pinnedTabs:C:/vault-a")!)).toEqual(["module:home"]);
    // Another vault starts with no pins of its own.
    expect([...loadPinnedIds("C:/vault-b")]).toEqual([]);

    invoke.mockResolvedValueOnce({
      api_version: 1, vault_name: "vault-b", vault_path: "C:/vault-b",
      theme: "dark", rendering: { mode: "auto", angle: "default", liteEffects: false, reduceMotion: false },
    });
    await app().init();
    expect(app().vault).toBe("C:/vault-b");
    expect([...app().pinnedTabIds]).toEqual([]);

    invoke.mockResolvedValueOnce({
      api_version: 1, vault_name: "vault-a", vault_path: "C:/vault-a",
      theme: "dark", rendering: { mode: "auto", angle: "default", liteEffects: false, reduceMotion: false },
    });
    await app().init();
    expect(app().vault).toBe("C:/vault-a");
    expect([...app().pinnedTabIds]).toEqual(["module:home"]);
  });

  it("keeps the embedded browser alive until its last web tab closes", async () => {
    app().openTab({ kind: "web" });
    app().openTab({ kind: "module", id: "web" });
    app().openTab({ kind: "note", path: "nota.md" });

    await app().closeTab("note:nota.md");
    expect(invoke).not.toHaveBeenCalled();

    // One browser tab left: switching away must not tear the WebContentsView down.
    await app().closeTab("module:web");
    await Promise.resolve();
    expect(invoke).not.toHaveBeenCalled();

    await app().closeTab("web");
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("browser_destroy", []);
  });
});
