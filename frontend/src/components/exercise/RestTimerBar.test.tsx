// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestTimer } from "../../store/restTimer";
import { RestTimerBar } from "./RestTimerBar";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("RestTimerBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRestTimer.getState().stop();
  });

  afterEach(() => {
    useRestTimer.getState().stop();
    vi.useRealTimers();
    if (root && host) {
      act(() => {
        root!.unmount();
      });
      host.remove();
    }
    host = null;
    root = null;
  });

  it("does not render when timer is inactive", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<RestTimerBar />);
    });

    expect(host.innerHTML).toBe("");
  });

  it("renders floating timer when active with countdown and controls", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<RestTimerBar />);
      useRestTimer.getState().start("Press Militar", 90);
    });

    expect(host.textContent).toContain("Press Militar");
    expect(host.textContent).toContain("01:30");
    expect(host.textContent).toContain("30s");

    // Pause timer
    const pauseBtn = host.querySelector('button[title="Pausar descanso"]') as HTMLButtonElement;
    expect(pauseBtn).toBeTruthy();

    await act(async () => {
      pauseBtn.click();
    });
    expect(useRestTimer.getState().running).toBe(false);

    // Add 30 seconds
    const addBtn = host.querySelector('button[title="Añadir 30 segundos"]') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();

    await act(async () => {
      addBtn.click();
    });
    expect(useRestTimer.getState().remainingSeconds).toBe(120);
    expect(host.textContent).toContain("02:00");
  });

  it("shows completed state when timer finishes", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<RestTimerBar />);
      useRestTimer.getState().start("Curl de Bíceps", 10);
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(host.textContent).toContain("¡Ejercicio completado automáticamente! ✓");
    expect(host.textContent).toContain("Guardado con éxito en el vault");
    expect(host.textContent).toContain("Continuar");
  });
});
