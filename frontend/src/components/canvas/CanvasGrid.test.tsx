// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}), onWatchEvent: () => () => undefined };
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
(document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;

import type { CanvasDoc } from "../../lib/canvas";
import { GRID } from "../../lib/canvas";
import { useCanvas } from "../../store/canvas";
import { MenuHost } from "../ui";
import { CanvasView } from "./CanvasView";

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;
const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
const node = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!;
const onGrid = (v: number) => Math.abs(v % GRID) === 0;
const fire = (type: string, x: number, y: number, target: Element = host(), buttons = type === "pointerup" ? 0 : 1) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })); });
const drag = (from: [number, number], to: [number, number], target?: Element) => {
  fire("pointerdown", ...from, target);
  fire("pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  fire("pointermove", ...to);
  fire("pointerup", ...to);
};
const render = (doc: CanvasDoc) => {
  useCanvas.setState({ path: "c.canvas", title: "c", doc, modified: 1, dirty: false, conflict: false, past: [], future: [] });
  act(() => root.render(<><CanvasView /><MenuHost /></>));
};
const key = (k: string) => act(() => { host().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: k })); });

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.requestAnimationFrame = raf;
});

describe("the grid and the places cards snap to are the same places", () => {
  it("a dot is drawn on every multiple of the grid (the background starts half a cell early)", () => {
    render({ nodes: [], edges: [] });
    // view at the origin, zoom 1: a 20 px cell; the tile starts at -10 so its centre dot lands on world 0
    expect(host().style.backgroundSize).toBe("20px 20px");
    expect(host().style.backgroundPosition).toBe("-10px -10px");
  });

  it("it follows the view when the board is moved", () => {
    render({ nodes: [], edges: [] });
    act(() => { host().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 30, deltaY: 50 })); });
    // the view moved by (-30, -50): the dot of world 0 is there, so the tile starts half a cell before it
    expect(host().style.backgroundPosition).toBe("-40px -60px");
  });
});

describe("moving", () => {
  it("a card lands on the grid", () => {
    render({ nodes: [{ id: "a", type: "text", x: 100, y: 100, width: 200, height: 100, text: "A" }], edges: [] });
    drag([150, 150], [177, 163], container.querySelector("[data-node-id=a]")!);
    expect(onGrid(node("a").x)).toBe(true);
    expect(onGrid(node("a").y)).toBe(true);
  });

  it("a group that carries cards keeps their layout: the group lands on the grid, the cards move by the same amount", () => {
    render({
      nodes: [
        { id: "g", type: "group", x: -24, y: -48, width: 400, height: 300, label: "G" },
        { id: "c1", type: "text", x: -4, y: -20, width: 120, height: 60, text: "1" }, // 20 px right of the group's edge: off-grid
        { id: "c2", type: "text", x: 137, y: 33, width: 120, height: 60, text: "2" },
      ],
      edges: [],
    });
    const rel = () => [node("c1").x - node("g").x, node("c1").y - node("g").y, node("c2").x - node("g").x, node("c2").y - node("g").y];
    const before = rel();
    drag([100, -60], [263, 71], container.querySelector("[data-node-id=g] [data-group-label]")!);
    expect(onGrid(node("g").x)).toBe(true);
    expect(onGrid(node("g").y)).toBe(true);
    expect(rel()).toEqual(before); // nothing in the group shifted relative to it
    expect(node("g").x).not.toBe(-24);
  });
});

describe("resizing", () => {
  it("the edge being dragged lands on the grid and the opposite edge does not move, even if it was off the grid", () => {
    render({ nodes: [{ id: "g", type: "text", x: 107, y: 93, width: 203, height: 97, text: "G" }], edges: [] }); // right edge 310, bottom edge 190
    drag([108, 140], [78, 140]); // left side
    expect(onGrid(node("g").x)).toBe(true);
    expect(node("g").x + node("g").width).toBe(310);
    drag([309, 120], [351, 120]); // right side
    expect(onGrid(node("g").x + node("g").width)).toBe(true);
    drag([200, 94], [200, 61]); // top side
    expect(onGrid(node("g").y)).toBe(true);
    expect(node("g").y + node("g").height).toBe(190);
  });
});

describe("aligning what is already off the grid", () => {
  const off = (): CanvasDoc => ({
    nodes: [
      { id: "a", type: "text", x: -24, y: -48, width: 368, height: 412, text: "A" },
      { id: "b", type: "text", x: 413, y: 7, width: 205, height: 99, text: "B" },
    ],
    edges: [],
  });

  it("the card menu has Alinear a la cuadrícula, and it puts all four edges of the selection on the grid", () => {
    render(off());
    act(() => { container.querySelector("[data-node-id=a]")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 })); });
    const item = [...document.querySelectorAll("button, [role=menuitem]")].find((b) => /Alinear a la cuadrícula/.test(b.textContent ?? ""));
    expect(item).toBeTruthy();
    act(() => (item as HTMLElement).click());
    const a = node("a");
    for (const v of [a.x, a.y, a.x + a.width, a.y + a.height]) expect(onGrid(v)).toBe(true);
    // the card that was not selected stays where it was
    expect(node("b").x).toBe(413);
  });

  it("the board menu has Alinear todo, which aligns every card", () => {
    render(off());
    act(() => { host().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 900, clientY: 900 })); });
    const item = [...document.querySelectorAll("button, [role=menuitem]")].find((b) => /Alinear todo a la cuadrícula/.test(b.textContent ?? ""));
    expect(item).toBeTruthy();
    act(() => (item as HTMLElement).click());
    for (const id of ["a", "b"]) {
      const n = node(id);
      for (const v of [n.x, n.y, n.x + n.width, n.y + n.height]) expect(onGrid(v)).toBe(true);
    }
  });

  it("the arrow keys keep a selected card on the grid", () => {
    render({ nodes: [{ id: "a", type: "text", x: 13, y: 7, width: 100, height: 60, text: "A" }], edges: [] });
    fire("pointerdown", 13, 7, container.querySelector("[data-node-id=a]")!);
    fire("pointerup", 13, 7);
    key("ArrowRight");
    expect(onGrid(node("a").x)).toBe(true);
    expect(onGrid(node("a").y)).toBe(true);
  });
});
