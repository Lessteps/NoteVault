// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TimeEntry } from "../../lib/timeLog";
import { LoggedTime } from "./LoggedTime";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const e = (o: Partial<TimeEntry>): TimeEntry => ({ id: "x", areaKey: "backend", date: "2026-10-16", minutes: 25, kind: "pomodoro", at: "", ...o });

describe("LoggedTime", () => {
  it("no pinta nada si no hay tiempo registrado en el rango", async () => {
    await act(async () => { root.render(<LoggedTime entries={[e({ date: "2026-09-01" })]} from="2026-10-12" to="2026-10-18" />); });
    expect(host.innerHTML).toBe("");
    await act(async () => { root.render(<LoggedTime entries={[]} />); });
    expect(host.innerHTML).toBe("");
  });

  it("muestra el total real y el desglose por tipo (y lo sin clasificar)", async () => {
    await act(async () => { root.render(<LoggedTime entries={[e({ work: "theory", minutes: 45 }), e({ id: "y", work: "practice", minutes: 35 }), e({ id: "z", minutes: 10 })]} areaKey="backend" />); });
    expect(host.textContent).toBe("Tiempo registrado: 1 h 30 min · Teoría 45 · Práctica 35 · Sin clasificar 10");
  });
});
