import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasDoc } from "../lib/canvas";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    canvasRead: vi.fn(),
    canvasWrite: vi.fn(),
    // store/app.ts calls it on every state change (unsaved counter).
    setUnsaved: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock("../lib/bridge", () => ({ api: apiMock }));

import { useCanvas } from "./canvas";
import { useApp } from "./app";

const doc = (n: number): CanvasDoc => ({ nodes: [{ id: `n${n}`, type: "text", x: 0, y: 0, width: 10, height: 10 }], edges: [] });
const read = (over: Record<string, unknown> = {}) => ({
  path: "mapa.canvas", title: "mapa", doc: doc(0), modified: 1, ...over,
});

function reset() {
  vi.clearAllMocks();
  vi.useRealTimers();
  useCanvas.setState({
    path: null, title: "", doc: { nodes: [], edges: [] }, modified: null,
    dirty: false, conflict: false, past: [], future: [],
  });
  useApp.setState({ toasts: [] });
  apiMock.canvasRead.mockResolvedValue(read());
  apiMock.canvasWrite.mockResolvedValue({ ok: true, conflict: false, modified: 2 });
}

beforeEach(reset);
afterEach(() => vi.useRealTimers());

describe("open/close", () => {
  it("open loads the document and clears the history", async () => {
    useCanvas.setState({ past: [doc(9)], future: [doc(8)], conflict: true });
    await useCanvas.getState().open("mapa.canvas");
    const s = useCanvas.getState();
    expect(s.path).toBe("mapa.canvas");
    expect(s.title).toBe("mapa");
    expect(s.modified).toBe(1);
    expect(s.dirty).toBe(false);
    expect(s.conflict).toBe(false);
    expect(s.past).toEqual([]);
  });
  it("open saves the previous document first", async () => {
    useCanvas.setState({ path: "otro.canvas", dirty: true, doc: doc(1), modified: 5 });
    await useCanvas.getState().open("mapa.canvas");
    expect(apiMock.canvasWrite).toHaveBeenCalledWith("otro.canvas", doc(1), 5);
  });
  it("a failed read toasts and keeps the previous state", async () => {
    useCanvas.setState({ path: "antes.canvas", title: "antes" });
    apiMock.canvasRead.mockRejectedValueOnce(new Error("no existe"));
    await useCanvas.getState().open("mapa.canvas");
    const s = useCanvas.getState();
    expect(s.path).toBe("antes.canvas");
    expect(useApp.getState().toasts.at(-1)?.text).toContain("no existe");
  });
  it("close saves and empties the canvas", async () => {
    useCanvas.setState({ path: "mapa.canvas", dirty: true, doc: doc(1), past: [doc(0)] });
    await useCanvas.getState().close();
    expect(apiMock.canvasWrite).toHaveBeenCalled();
    expect(useCanvas.getState()).toMatchObject({ path: null, past: [], future: [] });
  });
});

describe("commit and history", () => {
  it("commit records the previous doc in the past", () => {
    useCanvas.getState().commit(doc(1));
    const s = useCanvas.getState();
    expect(s.dirty).toBe(true);
    expect(s.past).toEqual([{ nodes: [], edges: [] }]);
    expect(s.future).toEqual([]);
  });
  it("commit(record=false) leaves the history alone (drag frames)", () => {
    useCanvas.getState().snapshot();
    useCanvas.getState().commit(doc(1), false);
    expect(useCanvas.getState().past).toHaveLength(1);
    expect(useCanvas.getState().dirty).toBe(true);
  });
  it("snapshot pushes the current doc and drops the redo stack", () => {
    useCanvas.setState({ doc: doc(1), future: [doc(2)] });
    useCanvas.getState().snapshot();
    const s = useCanvas.getState();
    expect(s.past).toEqual([doc(1)]);
    expect(s.future).toEqual([]);
  });
  it("undo/redo walk the two stacks", () => {
    useCanvas.setState({ doc: doc(0) });
    useCanvas.getState().commit(doc(1));
    useCanvas.getState().commit(doc(2));
    useCanvas.getState().undo();
    expect(useCanvas.getState().doc).toEqual(doc(1));
    useCanvas.getState().undo();
    expect(useCanvas.getState().doc).toEqual(doc(0));
    expect(useCanvas.getState().past).toEqual([]);
    useCanvas.getState().redo();
    expect(useCanvas.getState().doc).toEqual(doc(1));
  });
  it("undo/redo with an empty stack do nothing", () => {
    useCanvas.setState({ doc: doc(0) });
    useCanvas.getState().undo();
    useCanvas.getState().redo();
    expect(useCanvas.getState().doc).toEqual(doc(0));
  });
  it("the history is capped at 100 entries", () => {
    useCanvas.setState({ past: Array.from({ length: 120 }, (_, i) => doc(i)) });
    useCanvas.getState().snapshot();
    expect(useCanvas.getState().past).toHaveLength(100);
  });
});

describe("save", () => {
  it("writes with the current modified and clears dirty", async () => {
    useCanvas.setState({ path: "mapa.canvas", modified: 7, dirty: true, doc: doc(1) });
    await useCanvas.getState().save();
    expect(apiMock.canvasWrite).toHaveBeenCalledWith("mapa.canvas", doc(1), 7);
    expect(useCanvas.getState()).toMatchObject({ modified: 2, dirty: false, conflict: false });
  });
  it("force sends a null expectedModified", async () => {
    useCanvas.setState({ path: "mapa.canvas", modified: 7, dirty: true, doc: doc(1) });
    await useCanvas.getState().save(true);
    expect(apiMock.canvasWrite).toHaveBeenCalledWith("mapa.canvas", doc(1), null);
  });
  it("a conflict with disk is overwritten without a banner", async () => {
    apiMock.canvasWrite
      .mockResolvedValueOnce({ ok: false, conflict: true, modified: 9 })
      .mockResolvedValueOnce({ ok: true, conflict: false, modified: 10 });
    useCanvas.setState({ path: "mapa.canvas", modified: 1, dirty: true, doc: doc(1) });
    await useCanvas.getState().save();
    expect(apiMock.canvasWrite).toHaveBeenLastCalledWith("mapa.canvas", doc(1), null);
    expect(useCanvas.getState()).toMatchObject({ conflict: false, dirty: false, modified: 10 });
  });
  it("edits made while writing keep it dirty", async () => {
    useCanvas.setState({ path: "mapa.canvas", modified: 1, dirty: true, doc: doc(1) });
    let resolveWrite!: (v: { ok: boolean; conflict: boolean; modified: number }) => void;
    apiMock.canvasWrite.mockReturnValueOnce(new Promise((r) => (resolveWrite = r)));
    const p = useCanvas.getState().save();
    useCanvas.setState({ doc: doc(2) });
    resolveWrite({ ok: true, conflict: false, modified: 2 });
    await p;
    expect(useCanvas.getState().dirty).toBe(true);
  });
  it("does nothing without a path or a change", async () => {
    await useCanvas.getState().save();
    useCanvas.setState({ path: "mapa.canvas", dirty: false });
    await useCanvas.getState().save();
    expect(apiMock.canvasWrite).not.toHaveBeenCalled();
  });
  it("a failure toasts and leaves it dirty", async () => {
    apiMock.canvasWrite.mockRejectedValueOnce(new Error("disco lleno"));
    useCanvas.setState({ path: "mapa.canvas", dirty: true, doc: doc(1) });
    await useCanvas.getState().save();
    expect(useCanvas.getState().dirty).toBe(true);
    expect(useApp.getState().toasts.at(-1)?.text).toContain("disco lleno");
  });
  it("commit debounces: one write for many edits", async () => {
    vi.useFakeTimers();
    useCanvas.setState({ path: "mapa.canvas", modified: 1, dirty: false });
    useCanvas.getState().commit(doc(1));
    useCanvas.getState().commit(doc(2));
    useCanvas.getState().commit(doc(3));
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMock.canvasWrite).toHaveBeenCalledTimes(1);
    expect(apiMock.canvasWrite).toHaveBeenCalledWith("mapa.canvas", doc(3), 1);
  });
});

describe("reload", () => {
  it("re-reads a clean canvas", async () => {
    useCanvas.setState({ path: "mapa.canvas", modified: 1, dirty: false, conflict: true });
    apiMock.canvasRead.mockResolvedValueOnce(read({ doc: doc(5), modified: 3 }));
    await useCanvas.getState().reload();
    expect(useCanvas.getState().doc).toEqual(doc(5));
    expect(useCanvas.getState().modified).toBe(3);
    expect(useCanvas.getState().conflict).toBe(false);
  });
  it("a dirty canvas keeps its edits: no reload and no conflict banner", async () => {
    useCanvas.setState({ path: "mapa.canvas", dirty: true, doc: doc(1) });
    await useCanvas.getState().reload();
    expect(useCanvas.getState().conflict).toBe(false);
    expect(useCanvas.getState().doc).toEqual(doc(1));
    expect(apiMock.canvasRead).not.toHaveBeenCalled();
  });
  it("no path means nothing to reload", async () => {
    await useCanvas.getState().reload();
    expect(apiMock.canvasRead).not.toHaveBeenCalled();
  });
  it("a missing file leaves the canvas as it is", async () => {
    useCanvas.setState({ path: "mapa.canvas", dirty: false, doc: doc(1) });
    apiMock.canvasRead.mockRejectedValueOnce(new Error("borrado"));
    await useCanvas.getState().reload();
    expect(useCanvas.getState().doc).toEqual(doc(1));
  });
});

describe("renamed", () => {
  it("follows the file and retitles the canvas", () => {
    useCanvas.setState({ path: "mapa.canvas", title: "mapa", dirty: true });
    useCanvas.getState().renamed("mapa.canvas", "renombrado.canvas");
    expect(useCanvas.getState().path).toBe("renombrado.canvas");
    expect(useCanvas.getState().title).toBe("renombrado");
  });
  it("a folder rename remaps every canvas under it", () => {
    useCanvas.setState({ path: "curso/mapa.canvas", title: "mapa" });
    useCanvas.getState().renamed("curso", "2026");
    expect(useCanvas.getState().path).toBe("2026/mapa.canvas");
  });
  it("an unrelated rename is ignored", () => {
    useCanvas.setState({ path: "curso/mapa.canvas", title: "mapa" });
    useCanvas.getState().renamed("otro", "otro2");
    expect(useCanvas.getState().path).toBe("curso/mapa.canvas");
  });
  it("a partial name is not a folder", () => {
    useCanvas.setState({ path: "curso2/mapa.canvas" });
    useCanvas.getState().renamed("curso", "2026");
    expect(useCanvas.getState().path).toBe("curso2/mapa.canvas");
  });
});

describe("path events", () => {
  it("opening a note closes the canvas", async () => {
    useCanvas.setState({ path: "mapa.canvas", dirty: false });
    const { pathEvents } = await import("./app");
    pathEvents.opened.forEach((f) => f("nota.md"));
    // close() saves first: let that promise land.
    await vi.waitFor(() => expect(useCanvas.getState().path).toBeNull());
  });
  it("deleting the file closes it", async () => {
    useCanvas.setState({ path: "curso/mapa.canvas", dirty: true, past: [doc(0)] });
    const { pathEvents } = await import("./app");
    pathEvents.deleted.forEach((f) => f("curso"));
    expect(useCanvas.getState()).toMatchObject({ path: null, dirty: false, past: [] });
  });
});
