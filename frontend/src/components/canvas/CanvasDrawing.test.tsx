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
import { useCanvas } from "../../store/canvas";
import { CanvasView } from "./CanvasView";

// One drawing (a diagonal stroke in a 200 × 100 box at 100,100) and one far-away card.
const doc = (): CanvasDoc => ({
  nodes: [
    { id: "d", type: "nv-drawing", x: 100, y: 100, width: 200, height: 100, nv: { strokes: [{ points: [[10, 10], [190, 90]], color: "5", width: 4 }] } },
    { id: "c", type: "text", x: 700, y: 500, width: 100, height: 60, text: "C" },
  ],
  edges: [],
});

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;
const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
const drawing = () => container.querySelector<HTMLElement>("[data-node-id=d]")!;
const hitLine = () => drawing().querySelector<SVGPolylineElement>("polyline[stroke=transparent]")!;
const node = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!;
const fire = (type: string, x: number, y: number, target: Element = host(), buttons = type === "pointerup" ? 0 : 1) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })); });
const drag = (from: [number, number], to: [number, number], target?: Element) => {
  fire("pointerdown", ...from, target);
  fire("pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, host(), 1);
  fire("pointermove", ...to, host(), 1);
  fire("pointerup", ...to);
};
const boxShown = () => /outline-dashed/.test(drawing().className);
const haloShown = () => drawing().querySelectorAll("polyline[stroke-opacity]").length > 0;

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
  localStorage.clear();
  useCanvas.setState({ path: "c.canvas", title: "c", doc: doc(), modified: 1, dirty: false, conflict: false, past: [], future: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CanvasView />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); globalThis.requestAnimationFrame = raf; });

describe("a drawing is its stroke, not its box", () => {
  it("only the stroke takes the pointer: the box does not", () => {
    expect(drawing().className).toContain("pointer-events-none");
    expect(hitLine().style.pointerEvents).toBe("stroke");
  });

  it("a click on the stroke selects it and shows the stroke itself, not a box", () => {
    fire("pointerdown", 150, 130, hitLine());
    fire("pointerup", 150, 130);
    expect(haloShown()).toBe(true);
    expect(boxShown()).toBe(false);
  });

  it("a selection box that touches it shows its box", () => {
    drag([50, 50], [320, 230]);
    expect(haloShown()).toBe(true);
    expect(boxShown()).toBe(true);
  });

  it("clicking the stroke after a selection box goes back to the stroke only", () => {
    drag([50, 50], [320, 230]);
    fire("pointerdown", 150, 130, hitLine());
    fire("pointerup", 150, 130);
    expect(boxShown()).toBe(false);
  });

  it("dragging the stroke moves it", () => {
    drag([150, 130], [180, 160], hitLine());
    expect(node("d").x).toBeGreaterThan(100); // it moved (the grid snaps it, so not exactly 30)
    expect(node("d").y).toBeGreaterThan(100);
    expect(node("d").width).toBe(200); // and was not resized
  });

  it("its resize handle makes it bigger and the stroke grows with it", () => {
    fire("pointerdown", 150, 130, hitLine());
    fire("pointerup", 150, 130);
    const se = drawing().querySelector<HTMLElement>("[data-resize=se]")!;
    expect(se).toBeTruthy();
    expect(drawing().querySelector("[data-port]")).toBeNull(); // a drawing has no connection ports
    drag([300, 200], [500, 300], se); // the box becomes 400 × 200: twice as big each way
    expect(node("d").width).toBe(400);
    expect(node("d").height).toBe(200);
    const pts = node("d").nv!.strokes![0]!.points;
    expect(pts[1]).toEqual([380, 180]); // (190, 90) scaled by 2
    expect(node("d").nv!.strokes![0]!.width).toBe(4); // the thickness stays
  });

  it("and smaller", () => {
    fire("pointerdown", 150, 130, hitLine());
    fire("pointerup", 150, 130);
    const se = drawing().querySelector<HTMLElement>("[data-resize=se]")!;
    drag([300, 200], [200, 150], se); // about half (the grid snaps the edge)
    const n = node("d");
    expect(n.width).toBeLessThan(150);
    expect(n.height).toBeLessThan(75);
    const [px, py] = n.nv!.strokes![0]!.points[1]!;
    expect(px).toBeCloseTo((190 * n.width) / 200, 0); // the stroke follows the box
    expect(py).toBeCloseTo((90 * n.height) / 100, 0);
  });
});

describe("a pen or tablet that never sends 'up'", () => {
  const penStroke = () => {
    act(() => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => /Dibujo libre/.test(b.title))!.click(); });
    fire("pointerdown", 400, 300);
    fire("pointermove", 420, 320, host(), 1);
    fire("pointermove", 450, 340, host(), 1);
  };
  const strokes = () => useCanvas.getState().doc.nodes.filter((n) => n.type === "nv-drawing").length;

  it("pointercancel ends the stroke and keeps it (once)", () => {
    penStroke();
    act(() => { host().dispatchEvent(new MouseEvent("pointercancel", { bubbles: true })); });
    act(() => { host().dispatchEvent(new MouseEvent("lostpointercapture", { bubbles: true })); });
    expect(strokes()).toBe(2);
  });

  it("a move with no button down (the pen was lifted) ends the stroke instead of drawing on", () => {
    penStroke();
    fire("pointermove", 460, 345, host(), 0);
    expect(strokes()).toBe(2);
    fire("pointermove", 600, 450, host(), 0); // hovering afterwards adds nothing
    expect(strokes()).toBe(2);
  });

  it("the canvas does not let the system turn pen strokes into scrolling", () => {
    expect(host().className).toContain("touch-none");
  });
});
