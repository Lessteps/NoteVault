// @vitest-environment jsdom
//
// Sesión de un área: Pomodoro global y registro de horas (bloques del día, semana, alta a mano y borrado).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { idlePomodoro, startFocus } from "../../lib/pomodoro";
import type { TimeEntry } from "../../lib/timeLog";
import { usePomodoro } from "../../store/pomodoro";
import { AreaSession, PomodoroTicker } from "./AreaSession";

const DAY = "2026-10-16";
const entry = (o: Partial<TimeEntry>): TimeEntry => ({ id: "e1", areaKey: "backend", date: DAY, minutes: 25, kind: "pomodoro", at: "2026-10-16T10:00:00Z", ...o });

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`);
const click = async (el: Element | null | undefined) => { expect(el).toBeTruthy(); await act(async () => { el!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const mount = async (areaKey = "backend") => {
  await act(async () => { root.render(<><PomodoroTicker /><AreaSession planId="p1" areaKey={areaKey} areaName={areaKey === "backend" ? "Backend" : "Frontend"} date={DAY} plannedMinutes={60} colour="#08f" /></>); });
  await flush(); await flush();
};
const typeInto = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  usePomodoro.setState({ p: idlePomodoro(), logVersion: 0 });
  vi.spyOn(api, "mentorTimeLogGet").mockResolvedValue({ entries: [entry({}), entry({ id: "e2", areaKey: "frontend", minutes: 10 }), entry({ id: "e3", date: "2026-10-13", minutes: 30 })] });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("AreaSession", () => {
  it("enseña lo registrado hoy en ESA área frente a lo previsto, la semana y los bloques del día", async () => {
    await mount();
    expect(byTest("timelog-today")!.textContent).toContain("25 min");
    expect(byTest("timelog-today")!.textContent).toContain("1 h previstos");
    expect(byTest("timelog-week")!.textContent).toContain("55 min"); // 25 de hoy + 30 del martes; lo de Frontend no cuenta
    expect(host.querySelectorAll("[data-testid=timelog-entry]")).toHaveLength(1);
    expect(byTest("pomodoro-clock")!.textContent).toBe("25:00");
  });

  it("empieza un foco, se puede pausar y reanudar, y «Detener y guardar» registra los minutos hechos", async () => {
    const add = vi.spyOn(api, "mentorTimeLogAdd").mockResolvedValue({ entries: [], entry: entry({}) });
    await mount();
    await click(byTest("pomodoro-start"));
    expect(usePomodoro.getState().p).toMatchObject({ phase: "focus", running: true, areaKey: "backend" });
    await click(byTest("pomodoro-pause"));
    expect(usePomodoro.getState().p.running).toBe(false);
    await click(byTest("pomodoro-resume"));
    expect(usePomodoro.getState().p.running).toBe(true);
    // 7 min de foco hechos
    usePomodoro.setState({ p: startFocus(idlePomodoro("p1", "backend", 25, 5), "p1", "backend", Date.now() - 7 * 60_000 - 5_000) });
    await mount();
    await click(byTest("pomodoro-stop"));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", areaKey: "backend", minutes: 7, kind: "pomodoro" }));
    expect(usePomodoro.getState().p.phase).toBe("idle");
  });

  it("detener antes de 1 minuto no guarda nada", async () => {
    const add = vi.spyOn(api, "mentorTimeLogAdd").mockResolvedValue({ entries: [], entry: entry({}) });
    await mount();
    await click(byTest("pomodoro-start"));
    await click(byTest("pomodoro-stop"));
    expect(add).not.toHaveBeenCalled();
  });

  it("con un Pomodoro en marcha en otra área no deja empezar otro y lo dice", async () => {
    usePomodoro.setState({ p: startFocus(idlePomodoro("p1", "frontend", 25, 5), "p1", "frontend", Date.now()) });
    await mount("backend");
    expect(byTest("pomodoro-start")!.hasAttribute("disabled")).toBe(true);
    expect(byTest("pomodoro-busy")!.textContent).toContain("otra área");
  });

  it("al acabar el foco el reloj global guarda el bloque entero y pasa al descanso", async () => {
    const add = vi.spyOn(api, "mentorTimeLogAdd").mockResolvedValue({ entries: [], entry: entry({}) });
    usePomodoro.setState({ p: startFocus(idlePomodoro("p1", "backend", 25, 5), "p1", "backend", Date.now() - 26 * 60_000) });
    await mount();
    await act(async () => { await new Promise((ok) => setTimeout(ok, 700)); });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ minutes: 25, areaKey: "backend", kind: "pomodoro" }));
    expect(usePomodoro.getState().p.phase).toBe("break");
  });

  it("añade un bloque a mano (con validación) y quita uno", async () => {
    const add = vi.spyOn(api, "mentorTimeLogAdd").mockResolvedValue({ entries: [], entry: entry({}) });
    const del = vi.spyOn(api, "mentorTimeLogDelete").mockResolvedValue({ entries: [] });
    await mount();
    await click(byTest("timelog-add")); // sin minutos: no llama
    expect(add).not.toHaveBeenCalled();
    await typeInto(byTest("timelog-minutes") as HTMLInputElement, "40");
    await typeInto(byTest("timelog-note") as HTMLInputElement, "repaso de HTTP");
    await click(byTest("timelog-add"));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", areaKey: "backend", minutes: 40, kind: "manual", note: "repaso de HTTP" }));
    await click(host.querySelector("[data-testid=timelog-entry] button"));
    expect(del).toHaveBeenCalledWith("p1", "e1");
  });
});
