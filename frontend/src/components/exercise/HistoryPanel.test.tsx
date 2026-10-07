// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string): Promise<unknown> => {
  if (method === "ex_history")
    return [
      { date: "2026-01-01", weight: 60, reps: 8, volume: 480, e1rm: 76 },
      { date: "2026-02-02", weight: 70, reps: 5, volume: 350, e1rm: 81.6 },
    ];
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { HistoryPanel } from "./HistoryPanel";

function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, cleanup: () => act(() => root.unmount()) };
}

it("muestra el PR y las sesiones", async () => {
  const { host, cleanup } = render(<HistoryPanel exerciseId="e1" name="Press" onClose={() => undefined} />);
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector("[data-history-pr]")!.textContent).toContain("2026-02-02");
    expect(host.querySelectorAll("[data-history-row]")).toHaveLength(2);
    expect(host.querySelector("[data-history-chart]")).not.toBeNull();
  } finally {
    cleanup();
  }
});

it("sin sesiones lo dice en vez de tabla vacía", async () => {
  invoke.mockResolvedValueOnce([]);
  const { host, cleanup } = render(<HistoryPanel exerciseId="e1" name="Press" onClose={() => undefined} />);
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain("sin sesiones");
    expect(host.querySelector("[data-history-pr]")).toBeNull();
  } finally {
    cleanup();
  }
});
