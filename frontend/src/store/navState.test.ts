// @vitest-environment jsdom
// La persistencia de la navegación se agrupa: una ráfaga de cambios escribe una sola vez (en el temporizador, al cerrar o al ocultar la ventana).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushNavState, useNavState } from "./navState";

beforeEach(() => {
  vi.useFakeTimers();
  flushNavState();
  localStorage.clear();
  useNavState.setState({ values: {} });
});
afterEach(() => {
  flushNavState();
  vi.useRealTimers();
});

describe("navState: persistencia agrupada", () => {
  it("varios cambios seguidos hacen una sola escritura, con el último valor", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    useNavState.getState().set("a.view", "uno");
    useNavState.getState().set("a.view", "dos");
    useNavState.getState().set("b.tab", "x");
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("nv.navState")!)).toEqual({ "a.view": "dos", "b.tab": "x" });
    spy.mockRestore();
  });

  it("el valor es inmediato en memoria y flushNavState / beforeunload lo escriben al instante", () => {
    useNavState.getState().set("a.view", "uno");
    expect(useNavState.getState().values["a.view"]).toBe("uno");
    expect(localStorage.getItem("nv.navState")).toBeNull();
    window.dispatchEvent(new Event("beforeunload"));
    expect(JSON.parse(localStorage.getItem("nv.navState")!)).toEqual({ "a.view": "uno" });
  });

  it("clear también se agrupa y no pierde nada pendiente", () => {
    useNavState.getState().set("a.view", "uno");
    useNavState.getState().clear("a");
    flushNavState();
    expect(JSON.parse(localStorage.getItem("nv.navState")!)).toEqual({});
  });
});
