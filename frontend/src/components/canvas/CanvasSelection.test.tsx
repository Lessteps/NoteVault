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

const doc = (): CanvasDoc => ({
  nodes: [
    { id: "g", type: "group", x: 40, y: 300, width: 500, height: 300, label: "G" },
    { id: "a", type: "text", x: 100, y: 40, width: 120, height: 60, text: "A" },
    { id: "b", type: "text", x: 300, y: 40, width: 120, height: 60, text: "B" },
    { id: "c", type: "text", x: 600, y: 40, width: 120, height: 60, text: "C" },
    { id: "k", type: "text", x: 100, y: 340, width: 120, height: 60, text: "K" }, // inside the group
  ],
  edges: [],
});

let container: HTMLDivElement;
let root: Root;
let raf: typeof requestAnimationFrame;
const host = () => container.querySelector<HTMLElement>("[aria-label=Canvas]")!;
const el = (id: string) => container.querySelector<HTMLElement>(`[data-node-id=${id}]`)!;
const node = (id: string) => useCanvas.getState().doc.nodes.find((n) => n.id === id)!;
const selected = () =>
  [...container.querySelectorAll<HTMLElement>("[data-node-id]")].filter((e) => /ring-accent|outline-accent/.test(e.className)).map((e) => e.getAttribute("data-node-id")).sort();
const translate = () => /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(host().firstElementChild!.getAttribute("style") ?? "")!.slice(1, 3).map(Number) as [number, number];
const fire = (type: string, x: number, y: number, o: { target?: Element; buttons?: number; shift?: boolean; alt?: boolean } = {}) =>
  act(() => {
    (o.target ?? host()).dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, shiftKey: !!o.shift, altKey: !!o.alt, buttons: o.buttons ?? (type === "pointerup" ? 0 : 1) }));
  });
const drag = (from: [number, number], to: [number, number], o: { target?: Element; shift?: boolean; alt?: boolean } = {}) => {
  fire("pointerdown", ...from, o);
  fire("pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { buttons: 1 });
  fire("pointermove", ...to, { buttons: 1 });
  fire("pointerup", ...to);
};
const keyDown = (key: string, init: KeyboardEventInit = {}) => act(() => { host().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init })); });
const keyUp = (key: string) => act(() => { host().dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key })); });

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

describe("the default tool selects", () => {
  it("dragging on the empty board draws a selection box and selects the cards it touches", () => {
    drag([80, 20], [440, 120]); // touches A and B, not C
    expect(selected()).toEqual(["a", "b"]);
    expect(translate()).toEqual([0, 0]); // the view did NOT move
  });

  it("a click on the empty board clears the selection", () => {
    drag([80, 20], [440, 120]);
    expect(selected()).toEqual(["a", "b"]);
    fire("pointerdown", 900, 700);
    fire("pointerup", 900, 700);
    expect(selected()).toEqual([]);
  });

  it("a new box replaces the selection; Shift + box adds to it", () => {
    drag([80, 20], [440, 120]);
    drag([580, 20], [760, 120]); // only C
    expect(selected()).toEqual(["c"]);
    drag([80, 20], [440, 120], { shift: true }); // adds A and B
    expect(selected()).toEqual(["a", "b", "c"]);
  });

  it("a box takes a group only when it holds the whole group (a group is mostly empty board)", () => {
    drag([20, 280], [300, 380]); // overlaps the group and holds K
    expect(selected()).not.toContain("g");
    expect(selected()).toContain("k");
    drag([20, 280], [560, 620]); // holds the whole group and K
    expect(selected()).toContain("g");
  });

  it("with several selected, dragging one moves them all together, keeping their layout", () => {
    drag([80, 20], [440, 120]); // A and B
    const gap = node("b").x - node("a").x;
    drag([150, 70], [250, 110], { target: el("a") });
    expect(node("a").x).toBeGreaterThan(100);
    expect(node("b").x - node("a").x).toBe(gap);
    expect(node("c").x).toBe(600); // the one that was not selected stayed
  });

  it("with several selected, the selection bar offers to act on all of them", () => {
    drag([80, 20], [440, 120]);
    expect(container.textContent).toMatch(/2/); // the bar shows how many are selected
    expect(selected()).toEqual(["a", "b"]);
  });
});

describe("Space moves the view", () => {
  it("Space + drag moves the view and selects nothing", () => {
    keyDown(" ");
    expect(host().className).toContain("cursor-grab");
    drag([300, 500], [380, 540]);
    expect(translate()).toEqual([80, 40]);
    expect(selected()).toEqual([]);
  });

  it("it works over a card too (the view moves, the card does not)", () => {
    keyDown(" ");
    drag([160, 70], [200, 90], { target: el("a") });
    expect(translate()).toEqual([40, 20]);
    expect(node("a").x).toBe(100);
  });

  it("when Space is released, a drag selects again", () => {
    keyDown(" ");
    keyUp(" ");
    expect(host().className).not.toContain("cursor-grab");
    drag([80, 20], [440, 120]);
    expect(translate()).toEqual([0, 0]);
    expect(selected()).toEqual(["a", "b"]);
  });

  it("losing focus while Space is down does not leave the view stuck in move mode", () => {
    keyDown(" ");
    act(() => { host().dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    act(() => { host().dispatchEvent(new FocusEvent("blur")); });
    drag([80, 20], [440, 120]);
    expect(translate()).toEqual([0, 0]);
  });

  it("Space does not type into a card that is being edited", () => {
    act(() => { el("a").dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })); });
    const input = container.querySelector("textarea, input, .cm-content");
    expect(input).toBeTruthy();
    const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
    act(() => { input!.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false); // the space reaches the text
  });

  it("Alt + drag and the wheel still move the view", () => {
    drag([300, 500], [340, 520], { alt: true });
    expect(translate()).toEqual([40, 20]);
    act(() => { host().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 })); });
    expect(translate()[1]).toBe(-80);
  });
});

describe("groups", () => {
  it("the outline stretches the group; its interior moves it (with what it holds) only once it is selected", () => {
    drag([300, 500], [340, 520], { target: el("g") }); // its interior, not selected yet: a box selection, nothing moves
    expect(node("g").x).toBe(40);
    drag([41, 380], [81, 380]); // the group's left outline
    expect(node("g").x).toBe(80);
    expect(node("g").width).toBe(460); // stretched
    expect(node("k").x).toBe(100); // K stayed
    drag([300, 500], [340, 520], { target: el("g") }); // its interior, now that it is selected
    expect(node("g").x).toBe(120);
    expect(node("k").x).toBe(140); // K went with it
  });

  it("the pointer says so: a resize cursor on a group's outline", () => {
    fire("pointermove", 41, 380, { buttons: 0 });
    expect(host().className).toContain("cursor-ew-resize");
  });

  it("a group is still resized by its handles once selected", () => {
    drag([41, 450], [41, 450]); // a click on the outline selects it
    expect(selected()).toContain("g");
    const se = container.querySelector<HTMLElement>("[data-node-id=g] [data-resize=se]")!;
    expect(se).toBeTruthy();
    drag([540, 600], [600, 660], { target: se });
    expect(node("g").width).toBeGreaterThan(500);
    expect(node("g").height).toBeGreaterThan(300);
    expect(node("g").x).toBe(40);
  });

  it("the connection ports sit OUTSIDE the card, so they no longer cover the middle resize handles", () => {
    const port = container.querySelector<HTMLElement>("[data-node-id=a] [data-port=right]")!;
    expect(port.className).toContain("calc(50%_+_12px)");
  });
});
