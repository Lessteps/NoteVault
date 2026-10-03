// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ canvasWrite: vi.fn(), canvasRead: vi.fn() }));
vi.mock("../lib/bridge", () => ({ api: new Proxy(api, { get: (t, k) => (t as Record<string, unknown>)[k as string] ?? (async () => ({})) }) }));

import type { CanvasDoc } from "../lib/canvas";
import { useApp } from "./app";
import { useCanvas } from "./canvas";

const GONE = "Error invoking remote method 'nv': ApiError: No existe: Programación/programming_practice/kata/zz borde test.canvas";
const doc = (): CanvasDoc => ({ nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 100, height: 60, text: "A" }], edges: [] });
const toasts = () => useApp.getState().toasts;

beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState({ toasts: [] });
  useCanvas.setState({ path: "Programación/x.canvas", title: "x", doc: doc(), modified: 1, dirty: true, conflict: false, past: [], future: [] });
});

describe("a canvas whose file disappears", () => {
  it("closes its tab once and quietly when saving finds the file gone, instead of raising an error", async () => {
    api.canvasWrite.mockRejectedValue(new Error(GONE));
    await useCanvas.getState().save();
    expect(useCanvas.getState().path).toBeNull();
    expect(useCanvas.getState().dirty).toBe(false);
    expect(toasts().map((t) => t.kind)).toEqual(["info"]);
    expect(toasts()[0]!.text).toMatch(/ya no existe/);
    // and nothing keeps trying to save it
    await useCanvas.getState().save();
    expect(api.canvasWrite).toHaveBeenCalledTimes(1);
  });

  it("does the same when a reload finds it gone", async () => {
    useCanvas.setState({ dirty: false });
    api.canvasRead.mockRejectedValue(new Error(GONE));
    await useCanvas.getState().reload();
    expect(useCanvas.getState().path).toBeNull();
    expect(toasts().map((t) => t.kind)).toEqual(["info"]);
  });

  it("any other failure is still reported as an error and keeps the canvas open", async () => {
    api.canvasWrite.mockRejectedValue(new Error("EACCES: permission denied"));
    await useCanvas.getState().save();
    expect(useCanvas.getState().path).toBe("Programación/x.canvas");
    expect(toasts().map((t) => t.kind)).toEqual(["error"]);
  });

  it("a reload that fails for another reason leaves the canvas alone and says nothing", async () => {
    useCanvas.setState({ dirty: false });
    api.canvasRead.mockRejectedValue(new Error("EBUSY"));
    await useCanvas.getState().reload();
    expect(useCanvas.getState().path).toBe("Programación/x.canvas");
    expect(toasts()).toHaveLength(0);
  });
});
