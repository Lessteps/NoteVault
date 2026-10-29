import { describe, expect, it, vi } from "vitest";
import { createVaultChangeNotifier } from "./vaultChange";

describe("createVaultChangeNotifier", () => {
  it("agrupa una ráfaga en UN aviso cuando se calma", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const on = createVaultChangeNotifier(flush, { quietMs: 500, maxMs: 3000, now: () => Date.now() });
    on("a.md");
    on("b.md");
    on("a.md");
    vi.advanceTimersByTime(499);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(["a.md", "b.md"]);
    vi.useRealTimers();
  });

  it("si los cambios no paran (140 notas seguidas) avisa igualmente cada maxMs", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const on = createVaultChangeNotifier(flush, { quietMs: 500, maxMs: 2000, now: () => Date.now() });
    for (let i = 0; i < 30; i++) {
      on(`n${i}.md`);
      vi.advanceTimersByTime(300);
    }
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
  });
});
