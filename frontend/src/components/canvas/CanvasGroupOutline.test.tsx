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

/**
 * The shape of a generated map: an outer group, inner groups, and cards that nearly fill each inner group. The cards sit a few
 * pixels inside the group's outline, so the outline is the only place left to grab the group.
 */
const map = (): CanvasDoc => ({
  nodes: [
    { id: "outer", type: "group", x: 0, y: 0, width: 800, height: 600, label: "Examples" },
    { id: "g1", type: "group", x: 40, y: 40, width: 300, height: 240, label: "Example 1" },
    { id: "c1", type: "text", x: 46, y: 60, width: 288, height: 200, text: "card of example 1" },
    { id: "g2", type: "group", x: 400, y: 40, width: 300, height: 240, label: "Example 2" },
    { id: "c2", type: "text", x: 406, y: 60, width: 288, height: 200, text: "card of example 2" },
  ],
  edges: [],
});

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;
const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
const el = (id: string) => container.querySelector<HTMLElement>(`[data-node-id=${id}]`)!;
const node = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!;
const selected = () => [...container.querySelectorAll<HTMLElement>("[data-node-id]")].filter((e) => /outline-accent|ring-accent/.test(e.className)).map((e) => e.getAttribute("data-node-id"));
const fire = (type: string, x: number, y: number, target: Element = host(), buttons = type === "pointerup" ? 0 : 1) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })); });

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
  useCanvas.setState({ path: "c.canvas", title: "c", doc: map(), modified: 1, dirty: false, conflict: false, past: [], future: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CanvasView />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); globalThis.requestAnimationFrame = raf; });

describe("an inner group whose cards sit right inside its outline", () => {
  it("a click on the group's outline selects THE GROUP, not the card a few pixels inside", () => {
    fire("pointerdown", 41, 150); // 1 px from the group's left outline, 5 px from the card's
    fire("pointerup", 41, 150);
    expect(selected()).toEqual(["g1"]);
  });

  it("the same on the other sides: top, bottom and right", () => {
    for (const [x, y] of [[190, 41], [190, 279], [339, 150]] as const) {
      fire("pointerdown", x, y);
      fire("pointerup", x, y);
      expect(selected(), `${x},${y}`).toEqual(["g1"]);
    }
  });

  it("then its handles are there, and dragging the corner handle resizes the inner group", () => {
    fire("pointerdown", 41, 150);
    fire("pointerup", 41, 150);
    const se = container.querySelector<HTMLElement>("[data-node-id=g1] [data-resize=se]");
    expect(se).toBeTruthy();
    fire("pointerdown", 340, 280, se!);
    fire("pointermove", 360, 300);
    fire("pointermove", 420, 340);
    fire("pointerup", 420, 340);
    expect(node("g1").width).toBe(380);
    expect(node("g1").height).toBe(300);
    expect(node("outer").width).toBe(800); // the parent did not change
  });

  it("the other inner group is independent, and the outer group is still reachable by its own outline", () => {
    fire("pointerdown", 401, 150);
    fire("pointerup", 401, 150);
    expect(selected()).toEqual(["g2"]);
    fire("pointerdown", 1, 300);
    fire("pointerup", 1, 300);
    expect(selected()).toEqual(["outer"]);
  });

  it("the middle of the card is still the card: its body moves it, it does not start a connection", () => {
    fire("pointerdown", 200, 150, el("c1"));
    fire("pointermove", 230, 150);
    fire("pointermove", 260, 150);
    fire("pointerup", 260, 150);
    expect(node("c1").x).toBeGreaterThan(46);
    expect(useCanvas.getState().doc.edges).toHaveLength(0);
  });

  it("a drag that starts on the group's outline connects from the group (and does not move it)", () => {
    fire("pointerdown", 41, 150);
    fire("pointermove", 80, 150);
    fire("pointermove", 450, 450);
    fire("pointerup", 450, 450);
    expect(node("g1").x).toBe(40);
    const edge = useCanvas.getState().doc.edges[0];
    expect(edge).toBeTruthy();
    expect(edge!.fromNode).toBe("g1");
  });

  it("when the outlines are about equally near (a card one pixel inside), the card still wins over its group", () => {
    act(() => useCanvas.setState({ doc: { ...map(), nodes: map().nodes.map((n) => (n.id === "c1" ? { ...n, x: 41, y: 41, width: 298, height: 238 } : n)) } }));
    fire("pointerdown", 41, 150);
    fire("pointerup", 41, 150);
    expect(selected()).toEqual(["c1"]);
  });
});
