// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const asked = vi.hoisted(() => ({ answer: "Mi etiqueta" as string | null, calls: [] as string[] }));
vi.mock("../ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui")>();
  return { ...actual, askText: async (title: string) => { asked.calls.push(title); return asked.answer; } };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}), onWatchEvent: () => () => undefined };
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
(document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;

import type { CanvasDoc } from "../../lib/canvas";
import { useCanvas } from "../../store/canvas";
import { CanvasView } from "./CanvasView";

const baseDoc = (): CanvasDoc => ({
  nodes: [
    { id: "a", type: "text", x: 100, y: 100, width: 200, height: 100, text: "A" },
    { id: "b", type: "text", x: 500, y: 100, width: 200, height: 100, text: "B" },
  ],
  edges: [{ id: "e1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", toEnd: "arrow" }],
});

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;
const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
const world = () => container.querySelector<HTMLElement>("[aria-label=Canvas] > div")!;
const translate = () => /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(world().style.transform)!.slice(1).map(Number) as [number, number, number];
const wheel = (init: WheelEventInit) => act(() => { host().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init })); });
const key = (k: string, init: KeyboardEventInit = {}) => act(() => { host().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: k, ...init })); });
const tool = (re: RegExp) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => re.test(b.title));
const render = (doc: CanvasDoc = baseDoc()) => {
  useCanvas.setState({ path: "c.canvas", title: "c", doc, modified: 1, dirty: false, conflict: false, past: [], future: [] });
  act(() => root.render(<CanvasView />));
};

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
  localStorage.clear();
  asked.answer = "Mi etiqueta";
  asked.calls = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.requestAnimationFrame = raf;
});

describe("moving around the canvas", () => {
  it("the wheel moves up and down, and Shift + wheel moves sideways", () => {
    render();
    wheel({ deltaY: 100 });
    expect(translate().slice(0, 2)).toEqual([0, -100]);
    wheel({ deltaY: 100, shiftKey: true }); // Chromium reports the movement in deltaY when Shift is held
    expect(translate().slice(0, 2)).toEqual([-100, -100]);
    wheel({ deltaY: -250, shiftKey: true });
    expect(translate().slice(0, 2)).toEqual([150, -100]);
    wheel({ deltaX: 40, deltaY: 0, shiftKey: true }); // a touchpad may send it already sideways
    expect(translate().slice(0, 2)).toEqual([110, -100]);
  });

  it("Ctrl + wheel still zooms", () => {
    render();
    wheel({ deltaY: -100, ctrlKey: true, clientX: 300, clientY: 300 });
    expect(translate()[2]).toBeGreaterThan(1);
  });

  it("there is no hand tool any more, and the snap button does not look like one", () => {
    render();
    expect(tool(/Mover/i)).toBeUndefined();
    const snap = tool(/Ajustar a la cuadrícula/)!;
    expect(snap.querySelector("svg")!.getAttribute("class")).toContain("lucide-magnet");
    expect(container.querySelector(".lucide-hand")).toBeNull();
  });
});

describe("V selects", () => {
  it("is a tool of its own, active by default, and no longer adds a web link", () => {
    render();
    const select = tool(/Seleccionar \(V\)/)!;
    expect(select).toBeTruthy();
    expect(select.className).toContain("bg-accent-soft");
    key("v");
    expect(useCanvas.getState().doc.nodes).toHaveLength(2); // nothing was created
    expect(tool(/Enlace web \(S\)/)).toBeTruthy();
  });

  it("cancels the pen mode (N) and goes back to selecting", () => {
    render();
    key("n");
    expect(tool(/Dibujo libre/)!.className).toContain("bg-accent-soft");
    expect(tool(/Seleccionar \(V\)/)!.className).not.toContain("bg-accent-soft");
    key("v");
    expect(tool(/Dibujo libre/)!.className).not.toContain("bg-accent-soft");
    expect(tool(/Seleccionar \(V\)/)!.className).toContain("bg-accent-soft");
  });

  it("clicking the Select tool does the same", () => {
    render();
    key("n");
    act(() => tool(/Seleccionar \(V\)/)!.click());
    expect(tool(/Dibujo libre/)!.className).not.toContain("bg-accent-soft");
  });
});

describe("grid shortcut", () => {
  it("G shows and hides the grid, and the choice is remembered", () => {
    render();
    expect(host().style.backgroundImage).toContain("radial-gradient");
    key("g");
    expect(host().style.backgroundImage).toBe("none");
    expect(localStorage.getItem("nv.canvas.grid")).toBe("0");
    key("g");
    expect(host().style.backgroundImage).toContain("radial-gradient");
    expect(localStorage.getItem("nv.canvas.grid")).toBe("1");
  });

  it("the grid button shows its letter, and Ctrl+G still groups", () => {
    render();
    expect(tool(/Cuadrícula \(G\)/)!.textContent).toContain("G");
    key("g", { ctrlKey: true });
    expect(useCanvas.getState().doc.nodes.some((n) => n.type === "group")).toBe(true); // with nothing selected it still makes an empty group, as before
    expect(host().style.backgroundImage).toContain("radial-gradient"); // and the grid was NOT toggled by it
  });
});

describe("a label on an arrow with a double click", () => {
  const dbl = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 400, clientY: 150 })); });
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it("double clicking the arrow asks for the label and saves it", async () => {
    render();
    dbl(container.querySelector("[data-edge-id=e1]")!);
    await flush();
    expect(asked.calls).toEqual(["Etiqueta de la flecha"]);
    expect(useCanvas.getState().doc.edges[0]!.label).toBe("Mi etiqueta");
    expect(useCanvas.getState().doc.nodes).toHaveLength(2); // it did NOT create a card where it was clicked
  });

  it("double clicking the label itself edits it again; cancelling keeps it", async () => {
    render({ ...baseDoc(), edges: [{ ...baseDoc().edges[0]!, label: "antes" }] });
    const chip = [...container.querySelectorAll("[data-edge-id]")].find((e) => e.textContent === "antes")!;
    expect(chip).toBeTruthy();
    asked.answer = null; // the user cancels
    dbl(chip);
    await flush();
    expect(useCanvas.getState().doc.edges[0]!.label).toBe("antes");
    asked.answer = "después";
    dbl(chip);
    await flush();
    expect(useCanvas.getState().doc.edges[0]!.label).toBe("después");
  });

  it("an empty answer removes the label", async () => {
    render({ ...baseDoc(), edges: [{ ...baseDoc().edges[0]!, label: "antes" }] });
    asked.answer = "";
    dbl(container.querySelector("[data-edge-id=e1]")!);
    await flush();
    expect(useCanvas.getState().doc.edges[0]!.label).toBe("");
  });

  it("double clicking the empty board still creates a card", () => {
    render();
    dbl(host());
    expect(useCanvas.getState().doc.nodes.length).toBe(3);
  });
});

describe("groups inside groups", () => {
  // the INNER group comes first in the file, which used to leave it underneath the outer one
  const nested = (): CanvasDoc => ({
    nodes: [
      { id: "inner", type: "group", x: 150, y: 150, width: 300, height: 200, label: "Inner" },
      { id: "outer", type: "group", x: 50, y: 50, width: 700, height: 500, label: "Outer" },
      { id: "card", type: "text", x: 180, y: 180, width: 120, height: 60, text: "C" },
    ],
    edges: [],
  });
  const el = (id: string) => container.querySelector<HTMLElement>(`[data-node-id=${id}]`)!;
  const pointer = (type: string, target: Element, x: number, y: number) =>
    act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1 })); });

  it("the group that contains another is drawn first, so the inner one is on top", () => {
    render(nested());
    // DOM order is stacking order: later elements are drawn over earlier ones
    expect(el("outer").compareDocumentPosition(el("inner")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an unrelated group keeps its place in the file", () => {
    render({
      nodes: [
        { id: "g1", type: "group", x: 0, y: 0, width: 100, height: 100, label: "1" },
        { id: "g2", type: "group", x: 400, y: 0, width: 100, height: 100, label: "2" },
      ],
      edges: [],
    });
    expect(el("g1").compareDocumentPosition(el("g2")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  const label = (id: string) => el(id).querySelector<HTMLElement>("[data-group-label]")!;

  it("the inner group is selected by its label, and the outer one is not", () => {
    render(nested());
    pointer("pointerdown", label("inner"), 200, 120);
    pointer("pointerup", label("inner"), 200, 120);
    expect(el("inner").className).toContain("outline-accent");
    expect(el("outer").className).not.toContain("outline-accent");
  });

  it("the INTERIOR of a group does not grab it: it is the board (a drag draws a selection box, it neither moves the group nor the view)", () => {
    render(nested());
    const move = () => /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(host().firstElementChild!.getAttribute("style") ?? "")!;
    const x0 = useCanvas.getState().doc.nodes.find((n) => n.id === "inner")!.x;
    pointer("pointerdown", el("inner"), 400, 320); // empty part of the inner group
    pointer("pointermove", host(), 440, 320);
    pointer("pointermove", host(), 480, 320);
    pointer("pointerup", host(), 480, 320);
    const inner = useCanvas.getState().doc.nodes.find((n) => n.id === "inner")!;
    expect(inner.x).toBe(x0); // the group did not move
    expect(el("inner").className).not.toContain("outline-accent"); // and it was not selected
    expect(move()[1]).toBe("0"); // the view did not move either: a drag on the board selects now
  });

  it("a click on a group's interior clears the selection like a click on the board", () => {
    render(nested());
    pointer("pointerdown", label("inner"), 200, 120);
    pointer("pointerup", label("inner"), 200, 120);
    expect(el("inner").className).toContain("outline-accent");
    pointer("pointerdown", el("outer"), 700, 500);
    pointer("pointerup", host(), 700, 500);
    expect(el("inner").className).not.toContain("outline-accent");
  });

  it("a double click on a group's interior creates a card there; on its label it renames the group", () => {
    render(nested());
    const dbl = (target: Element) => act(() => { target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 400, clientY: 320 })); });
    const before = useCanvas.getState().doc.nodes.length;
    dbl(el("inner"));
    expect(useCanvas.getState().doc.nodes.length).toBe(before + 1);
    dbl(label("outer"));
    expect(el("outer").querySelector("input")).toBeTruthy(); // the label turned into an editor
  });

  it("dragging a group's LABEL moves it with its cards, and the outer group's label moves everything inside", () => {
    render(nested());
    const x = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!.x;
    pointer("pointerdown", label("inner"), 200, 320); // only horizontally: the group stays inside its parent
    pointer("pointermove", host(), 440, 320);
    pointer("pointermove", host(), 460, 320);
    pointer("pointerup", host(), 460, 320);
    expect(x("inner")).toBeGreaterThan(150);
    expect(x("card")).toBeGreaterThan(180);
    expect(x("outer")).toBe(50);
    const innerNow = x("inner");
    pointer("pointerdown", label("outer"), 100, 20);
    pointer("pointermove", host(), 130, 20);
    pointer("pointermove", host(), 150, 20);
    pointer("pointerup", host(), 150, 20);
    expect(x("outer")).toBeGreaterThan(50);
    expect(x("inner")).toBeGreaterThan(innerNow); // the subgroup travels with its parent
  });
});
