// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}), onWatchEvent: () => () => undefined };
// jsdom has neither of these; the view only needs them to exist.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
(document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;

import type { CanvasDoc } from "../../lib/canvas";
import { useCanvas } from "../../store/canvas";
import { CanvasView } from "./CanvasView";

const doc = (): CanvasDoc => ({
  nodes: [
    { id: "a", type: "text", x: 100, y: 100, width: 200, height: 100, text: "A" },
    { id: "b", type: "text", x: 500, y: 100, width: 200, height: 100, text: "B" },
  ],
  edges: [],
});

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;

const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
/** The view starts at (0, 0) with zoom 1, so a client coordinate IS a world coordinate. */
const fire = (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number, o: { target?: Element; buttons?: number; ctrl?: boolean } = {}) =>
  act(() => {
    (o.target ?? host()).dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ctrlKey: !!o.ctrl,
      buttons: o.buttons ?? (type === "pointerup" ? 0 : 1),
    }));
  });
const drag = (from: [number, number], to: [number, number], o: { target?: Element; ctrl?: boolean } = {}) => {
  fire("pointerdown", ...from, o);
  fire("pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  fire("pointermove", ...to);
  fire("pointerup", ...to);
};
const hover = (x: number, y: number) => fire("pointermove", x, y, { buttons: 0 });
const node = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!;
const box = (id: string) => { const n = node(id); return [n.x, n.y, n.width, n.height]; };
const edges = () => useCanvas.getState().doc.edges;
const cursor = () => host().className;

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  // No automatic fit: the view stays at the origin and the coordinates of the test are the world's.
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
  useCanvas.setState({ path: "c.canvas", title: "c", doc: doc(), modified: 1, dirty: false, conflict: false, past: [], future: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CanvasView />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.requestAnimationFrame = raf;
  vi.useRealTimers();
});

describe("the outline of a card is a resize handle, wherever along it the pointer is", () => {
  it("the pointer says which way it stretches: up/down on top and bottom, sideways on the sides, diagonal near a corner", () => {
    hover(150, 101);
    expect(cursor()).toContain("cursor-ns-resize");
    hover(190, 199);
    expect(cursor()).toContain("cursor-ns-resize");
    hover(101, 150);
    expect(cursor()).toContain("cursor-ew-resize");
    hover(299, 170);
    expect(cursor()).toContain("cursor-ew-resize");
    hover(299, 199); // bottom-right corner
    expect(cursor()).toContain("cursor-nwse-resize");
    hover(101, 101); // top-left corner
    expect(cursor()).toContain("cursor-nwse-resize");
    hover(299, 101); // top-right corner
    expect(cursor()).toContain("cursor-nesw-resize");
    hover(101, 199); // bottom-left corner
    expect(cursor()).toContain("cursor-nesw-resize");
  });

  it("it is never a crosshair, and it goes back to the arrow in the body and away from the cards", () => {
    hover(150, 101);
    expect(cursor()).not.toContain("cursor-crosshair");
    hover(200, 150); // the body
    expect(cursor()).not.toMatch(/resize|crosshair/);
    hover(400, 400); // empty board
    expect(cursor()).not.toMatch(/resize|crosshair/);
    expect(cursor()).toContain("cursor-default");
  });

  it("dragging the TOP side stretches it upward, from any point of it (not only the middle)", () => {
    drag([130, 101], [130, 60]);
    expect(box("a")).toEqual([100, 60, 200, 140]);
  });

  it("dragging the BOTTOM side, the LEFT side and the RIGHT side, each from off-centre points", () => {
    drag([260, 199], [260, 240]); // bottom, far from the middle
    expect(box("a")).toEqual([100, 100, 200, 140]);
    drag([101, 120], [60, 120]); // left, near the top
    expect(box("a")).toEqual([60, 100, 240, 140]);
    drag([299, 180], [340, 180]); // right, near the bottom
    expect(box("a")).toEqual([60, 100, 280, 140]);
  });

  it("near a corner it stretches both ways", () => {
    drag([299, 199], [339, 239]);
    expect(box("a")).toEqual([100, 100, 240, 140]);
    drag([101, 101], [61, 61]);
    expect(box("a")).toEqual([60, 60, 280, 180]);
  });

  it("the pointer stays a resize pointer during the drag", () => {
    fire("pointerdown", 150, 101);
    fire("pointermove", 150, 80);
    expect(cursor()).toContain("cursor-ns-resize");
    fire("pointerup", 150, 80);
  });

  it("a card cannot be made smaller than a minimum", () => {
    drag([299, 150], [-200, 150]);
    expect(node("a").width).toBeGreaterThanOrEqual(40);
  });

  it("a click on the outline selects the card and changes nothing", () => {
    fire("pointerdown", 150, 101);
    fire("pointerup", 150, 101);
    expect(box("a")).toEqual([100, 100, 200, 100]);
    expect(container.querySelector("[data-node-id=a]")!.className).toMatch(/ring-accent|outline-accent/);
  });

  it("a drag that starts in the body still moves the card, and edges are untouched", () => {
    const before = node("a").x;
    drag([200, 150], [260, 150], { target: container.querySelector("[data-node-id=a]")! });
    expect(node("a").x).toBeGreaterThan(before);
    expect(node("a").width).toBe(200);
    expect(edges()).toHaveLength(0);
  });

  it("a GROUP is different: its outline moves it (with what it holds) instead of stretching it", () => {
    act(() => useCanvas.setState({
      doc: { nodes: [{ id: "g", type: "group", x: 100, y: 100, width: 300, height: 200, label: "G" }, { id: "k", type: "text", x: 140, y: 140, width: 100, height: 60, text: "K" }], edges: [] },
    }));
    hover(101, 200);
    expect(cursor()).toContain("cursor-move");
    drag([101, 200], [61, 200]); // its left side, from the middle
    expect(box("g")).toEqual([60, 100, 300, 200]); // moved, same size
    expect(node("k").x).toBe(100); // and the card inside went with it
    drag([250, 299], [250, 339]); // its bottom side, off-centre
    expect(box("g")).toEqual([60, 140, 300, 200]);
  });
});

describe("connecting", () => {
  it("the round ports still connect", () => {
    const port = container.querySelector<HTMLElement>("[data-node-id=a] [data-port=right]")!;
    drag([300, 150], [500, 150], { target: port });
    expect(edges()[0]).toMatchObject({ fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" });
    expect(edges()[0]!.nv).toBeUndefined();
    expect(box("a")).toEqual([100, 100, 200, 100]); // and nothing was resized
  });

  it("the ports show a plain pointer, not a crosshair", () => {
    const port = container.querySelector<HTMLElement>("[data-node-id=a] [data-port=right]")!;
    expect(port.className).toContain("cursor-pointer");
    expect(port.className).not.toContain("crosshair");
  });

  it("Ctrl + drag from the outline connects from exactly that point (it does not resize)", () => {
    drag([130, 101], [520, 199], { ctrl: true }); // a's top edge at 15% → b's bottom edge at 10%
    expect(edges()).toHaveLength(1);
    const e = edges()[0]!;
    expect(e).toMatchObject({ fromNode: "a", fromSide: "top", toNode: "b", toSide: "bottom" });
    expect(e.nv?.fromT).toBeCloseTo(0.15, 3);
    expect(e.nv?.toT).toBeCloseTo(0.1, 3);
    expect(box("a")).toEqual([100, 100, 200, 100]);
  });

  it("Ctrl + drag from the middle of a side stores no extra anchor, and a drop on empty board makes a connected card", () => {
    drag([203, 100], [602, 100], { ctrl: true });
    expect(edges()[0]!.nv).toBeUndefined();
    act(() => useCanvas.setState({ doc: { ...doc(), edges: [] } }));
    drag([130, 101], [130, 400], { ctrl: true });
    const s = useCanvas.getState().doc;
    expect(s.nodes).toHaveLength(3);
    expect(s.edges[0]!.nv?.fromT).toBeCloseTo(0.15, 3);
  });
});

describe("nested shapes", () => {
  it("a card inside a group wins over the group, and the group's own outline moves the group", () => {
    act(() => {
      useCanvas.setState({
        doc: {
          nodes: [
            { id: "g", type: "group", x: 50, y: 50, width: 700, height: 300, label: "G" },
            { id: "c", type: "text", x: 100, y: 100, width: 200, height: 100, text: "C" },
          ],
          edges: [],
        },
      });
    });
    drag([130, 101], [130, 60]); // the card's top
    expect(box("c")).toEqual([100, 60, 200, 140]);
    expect(box("g")).toEqual([50, 50, 700, 300]);
    drag([51, 300], [-19, 300]); // the group's left side
    expect(node("g").x).toBe(-20); // the whole group moved 70 to the left
    expect(node("g").width).toBe(700); // it did not stretch
    expect(node("c").x).toBe(30); // and the card went with it
  });
});
