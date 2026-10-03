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
const fire = (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number, target: Element = host(), buttons = type === "pointerup" ? 0 : 1) =>
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
  });
const drag = (from: [number, number], to: [number, number], target?: Element) => {
  fire("pointerdown", ...from, target);
  fire("pointermove", from[0] + 20, from[1] + 20);
  fire("pointermove", ...to);
  fire("pointerup", ...to);
};
const edges = () => useCanvas.getState().doc.edges;
const nodeA = () => useCanvas.getState().doc.nodes.find((n) => n.id === "a")!;

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

describe("connecting from anywhere on a card's outline", () => {
  it("shows where the connection would start when the pointer is on the stroke, wherever along it", () => {
    fire("pointermove", 130, 101, host(), 0);
    const marker = container.querySelector("[data-testid=border-marker]")!;
    expect(marker).toBeTruthy();
    expect(marker.getAttribute("cx")).toBe("130");
    expect(marker.getAttribute("cy")).toBe("100");
    // the dot marks the spot; the pointer stays an arrow
    expect(host().className).not.toContain("cursor-crosshair");
    // the marker follows the pointer along the outline, it does not jump to the middle
    fire("pointermove", 260, 99, host(), 0);
    expect(container.querySelector("[data-testid=border-marker]")!.getAttribute("cx")).toBe("260");
    // and leaves when the pointer is in the body or away from the card
    fire("pointermove", 200, 150, host(), 0);
    expect(container.querySelector("[data-testid=border-marker]")).toBeNull();
    fire("pointermove", 400, 400, host(), 0);
    expect(container.querySelector("[data-testid=border-marker]")).toBeNull();
    expect(host().className).not.toContain("cursor-crosshair");
  });

  it("a drag that starts off-centre on the stroke connects from exactly that point", () => {
    drag([130, 101], [520, 199]); // a's top edge at 15% → b's bottom edge at 10%
    expect(edges()).toHaveLength(1);
    const e = edges()[0]!;
    expect(e).toMatchObject({ fromNode: "a", fromSide: "top", toNode: "b", toSide: "bottom" });
    expect(e.nv?.fromT).toBeCloseTo(0.15, 3);
    expect(e.nv?.toT).toBeCloseTo(0.1, 3);
  });

  it("works from every side of the card, including the left and the right", () => {
    drag([299, 120], [500, 130]); // a's right edge at 20% → b's left edge at 30%
    expect(edges()[0]).toMatchObject({ fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" });
    expect(edges()[0]!.nv?.fromT).toBeCloseTo(0.2, 3);
    expect(edges()[0]!.nv?.toT).toBeCloseTo(0.3, 3);
  });

  it("near the middle of a side it sticks to the middle and stores nothing extra", () => {
    drag([203, 100], [602, 100]);
    expect(edges()).toHaveLength(1);
    expect(edges()[0]!.nv).toBeUndefined();
  });

  it("the round ports at the middle keep working", () => {
    const port = container.querySelector<HTMLElement>("[data-node-id=a] [data-port=right]")!;
    drag([300, 150], [500, 150], port);
    expect(edges()[0]).toMatchObject({ fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" });
    expect(edges()[0]!.nv).toBeUndefined();
  });

  it("a drag that starts in the body still moves the card instead of connecting", () => {
    const before = nodeA().x;
    drag([200, 150], [260, 150], container.querySelector("[data-node-id=a]")!);
    expect(edges()).toHaveLength(0);
    expect(nodeA().x).toBeGreaterThan(before);
  });

  it("a click on the outline without dragging connects nothing", () => {
    fire("pointerdown", 130, 100);
    fire("pointerup", 130, 100);
    expect(edges()).toHaveLength(0);
    expect(useCanvas.getState().doc.nodes).toHaveLength(2);
  });

  it("dropping on empty board from an outline point still makes a new connected card", () => {
    drag([130, 101], [130, 400]);
    const s = useCanvas.getState().doc;
    expect(s.nodes).toHaveLength(3);
    expect(s.edges[0]).toMatchObject({ fromNode: "a", fromSide: "top" });
    expect(s.edges[0]!.nv?.fromT).toBeCloseTo(0.15, 3);
  });

  it("a card inside a group wins over the group, and the group outline works too", () => {
    act(() => {
      useCanvas.setState({
        doc: {
          nodes: [
            { id: "g", type: "group", x: 50, y: 50, width: 700, height: 300, label: "G" },
            { id: "c", type: "text", x: 100, y: 100, width: 200, height: 100, text: "C" },
            { id: "z", type: "text", x: 500, y: 150, width: 200, height: 100, text: "Z" },
          ],
          edges: [],
        },
      });
    });
    drag([130, 101], [520, 249]);
    expect(edges()[0]).toMatchObject({ fromNode: "c", fromSide: "top" });
    act(() => useCanvas.setState({ doc: { ...useCanvas.getState().doc, edges: [] } }));
    drag([51, 300], [520, 249]);
    expect(edges()[0]).toMatchObject({ fromNode: "g", fromSide: "left" });
  });
});
