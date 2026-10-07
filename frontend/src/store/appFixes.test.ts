// @vitest-environment jsdom
// Regressions of three store bugs: an empty frontmatter block shown as body text, renaming a note
// throwing you onto another tab, and a canvas closed after a save conflict leaving "1 sin guardar".

import { beforeEach, describe, expect, it, vi } from "vitest";

(window as unknown as { nv: unknown }).nv = { invoke: vi.fn(async () => ({})) };

import { bodyOf, useApp } from "./app";
import { useCanvas } from "./canvas";

describe("bodyOf", () => {
  it("skips a frontmatter block whether it is empty, has one line, or is absent", () => {
    expect(bodyOf("---\n---\ncuerpo\n")).toBe("cuerpo\n");
    expect(bodyOf("---\na: 1\n---\ncuerpo\n")).toBe("cuerpo\n");
    expect(bodyOf("---\r\na: 1\r\n---\r\ncuerpo\r\n")).toBe("cuerpo\r\n");
    expect(bodyOf("sin bloque\n---\nregla\n---\n")).toBe("sin bloque\n---\nregla\n---\n");
  });

  it("an empty block does not swallow a later horizontal rule", () => {
    expect(bodyOf("---\n---\nuno\n---\ndos\n")).toBe("uno\n---\ndos\n");
  });
});

const note = (path: string) => ({ path, title: path.split("/").pop()!.replace(/\.md$/, ""), kind: "note", raw: "", dirty: false }) as never;

function open(paths: string[], active: string) {
  useApp.setState({
    notes: Object.fromEntries(paths.map((p) => [p, note(p)])),
    openTabs: paths.map((p) => ({ kind: "note", path: p, tabId: `note:${p}` })) as never,
    activeTabId: `note:${active}`,
    side: null,
  });
}

describe("pathRenamed keeps the active tab", () => {
  beforeEach(() => open(["a.md", "b.md", "c.md"], "b.md"));

  it("the renamed note that was active stays active under its new name", () => {
    useApp.getState().pathRenamed("b.md", "b2.md");
    expect(useApp.getState().activeTabId).toBe("note:b2.md");
  });

  it("renaming a note that was NOT active does not move you", () => {
    useApp.getState().pathRenamed("a.md", "a2.md");
    expect(useApp.getState().activeTabId).toBe("note:b.md");
  });

  it("renaming a folder follows the active note inside it", () => {
    open(["curso/a.md", "curso/b.md"], "curso/b.md");
    useApp.getState().pathRenamed("curso", "2026");
    expect(useApp.getState().activeTabId).toBe("note:2026/b.md");
  });

  it("a name that only shares a prefix is not the folder", () => {
    open(["curso.md", "curso2/x.md"], "curso2/x.md");
    useApp.getState().pathRenamed("curso", "otro");
    expect(useApp.getState().activeTabId).toBe("note:curso2/x.md");
  });
});

describe("canvas closed after a conflict", () => {
  it("does not leave the unsaved counter stuck", async () => {
    const invoke = vi.fn(async (method: string, args?: unknown[]) => {
      if (method === "canvas_write") {
        const forced = (args as unknown[])?.[2] === null;
        return forced ? { ok: true, conflict: false, modified: 2 } : { conflict: true, modified: 1 };
      }
      if (method === "set_unsaved") return { ok: true, args };
      return {};
    });
    (window as unknown as { nv: { invoke: typeof invoke } }).nv = { invoke };
    useCanvas.setState({ path: "m.canvas", dirty: true, doc: { nodes: [], edges: [] } } as never);
    useCanvas.getState().commit({ nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10 }], edges: [] } as never);
    await useCanvas.getState().close();
    await new Promise((r) => setTimeout(r, 0));
    const counts = invoke.mock.calls.filter((c) => c[0] === "set_unsaved").map((c) => (c[1] as number[])[0]);
    expect(counts.at(-1)).toBe(0);
    expect(useCanvas.getState().dirty).toBe(false);
  });
});
