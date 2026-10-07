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

// outer (0,0 600x400) ⊃ inner (100,100 300x200) ⊃ card
const doc = (): CanvasDoc => ({
  nodes: [
    { id: "outer", type: "group", x: 0, y: 0, width: 600, height: 400, label: "Outer" },
    { id: "inner", type: "group", x: 100, y: 100, width: 300, height: 200, label: "Inner" },
    { id: "card", type: "text", x: 150, y: 150, width: 100, height: 60, text: "C" },
  ],
  edges: [],
});

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;
const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
const node = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!;
const fire = (type: string, x: number, y: number, target: Element = host(), buttons = type === "pointerup" ? 0 : 1) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })); });

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
  useCanvas.setState({ path: "c.canvas", title: "c", doc: doc(), modified: 1, dirty: false, conflict: false, past: [], future: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CanvasView />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); globalThis.requestAnimationFrame = raf; });

describe("nested groups", () => {
  it("an inner group can be selected from its label and resized from its corner handle", () => {
    const label = container.querySelector<HTMLElement>('[data-node-id="inner"] [data-group-label]')!;
    fire("pointerdown", 120, 80, label); // the label sits above the group's top edge
    fire("pointerup", 120, 80, label);
    const se = container.querySelector<HTMLElement>('[data-node-id="inner"] [data-resize="se"]');
    expect(se).toBeTruthy();
    fire("pointerdown", 400, 300, se!);
    fire("pointermove", 430, 330);
    fire("pointermove", 500, 380);
    fire("pointerup", 500, 380);
    expect(node("inner").width).toBe(400);
    expect(node("inner").height).toBe(280);
  });

  it("the outer group is still resizable when it is selected", () => {
    const label = container.querySelector<HTMLElement>('[data-node-id="outer"] [data-group-label]')!;
    fire("pointerdown", 20, -20, label);
    fire("pointerup", 20, -20, label);
    const se = container.querySelector<HTMLElement>('[data-node-id="outer"] [data-resize="se"]')!;
    fire("pointerdown", 600, 400, se);
    fire("pointermove", 650, 450);
    fire("pointermove", 700, 500);
    fire("pointerup", 700, 500);
    expect(node("outer").width).toBe(700);
  });

  it("clicking an inner group's outline selects it (cards cover its body) and shows its handles", () => {
    expect(container.querySelector('[data-node-id="inner"] [data-resize]')).toBeNull();
    fire("pointerdown", 100, 200); // inner's left outline, mid-height
    fire("pointerup", 100, 200);
    expect(container.querySelector('[data-node-id="inner"] [data-resize="se"]')).toBeTruthy();
    expect(useCanvas.getState().doc.edges).toHaveLength(0);
  });

  it("a drag from a group's outline stretches it (it does not connect or move it)", () => {
    fire("pointerdown", 100, 150); // inner's left side, off-centre
    fire("pointermove", 80, 150);
    fire("pointermove", 40, 150);
    fire("pointerup", 40, 150);
    expect(node("inner").x).toBe(40);
    expect(node("inner").width).toBe(360);
    expect(node("inner").y).toBe(100);
    expect(node("card").x).toBe(150);
    expect(useCanvas.getState().doc.edges).toHaveLength(0);
  });
});
