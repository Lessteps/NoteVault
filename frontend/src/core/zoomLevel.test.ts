// @vitest-environment node
import { describe, expect, it } from "vitest";

import { nextZoom, zoomActionFor, ZOOM_MAX, ZOOM_MIN } from "./zoomLevel";

const key = (over: Record<string, unknown>) => ({ type: "keyDown", key: "", code: "", control: true, meta: false, alt: false, ...over }) as never;

describe("zoom shortcuts", () => {
  it("reconoce Ctrl + y Ctrl - (teclado español, inglés y numérico) y Ctrl 0", () => {
    expect(zoomActionFor(key({ key: "+" }))).toBe("in");
    expect(zoomActionFor(key({ key: "=" }))).toBe("in");
    expect(zoomActionFor(key({ key: "-" }))).toBe("out");
    expect(zoomActionFor(key({ key: "Add", code: "NumpadAdd" }))).toBe("in");
    expect(zoomActionFor(key({ key: "Subtract", code: "NumpadSubtract" }))).toBe("out");
    expect(zoomActionFor(key({ key: "0" }))).toBe("reset");
  });
  it("ignora teclas sueltas, Alt y soltar la tecla", () => {
    expect(zoomActionFor(key({ key: "+", control: false }))).toBeNull();
    expect(zoomActionFor(key({ key: "+", alt: true }))).toBeNull();
    expect(zoomActionFor(key({ key: "+", type: "keyUp" }))).toBeNull();
    expect(zoomActionFor(key({ key: "a" }))).toBeNull();
  });
  it("acerca, aleja, vuelve a 100 % y respeta los límites", () => {
    expect(nextZoom(0, "in")).toBe(0.5);
    expect(nextZoom(0, "out")).toBe(-0.5);
    expect(nextZoom(2, "reset")).toBe(0);
    expect(nextZoom(ZOOM_MAX, "in")).toBe(ZOOM_MAX);
    expect(nextZoom(ZOOM_MIN, "out")).toBe(ZOOM_MIN);
  });
});
