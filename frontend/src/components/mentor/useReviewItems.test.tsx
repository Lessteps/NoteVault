// @vitest-environment jsdom
//
// Los repasos se leen UNA vez aunque la barra lateral (pistas de la Ejecución) y `PlanRun` los pidan a la vez; `enabled=false` no lee nada.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { useReviewItems } from "./AreaWork";

function Probe({ enabled = true, id }: { enabled?: boolean; id: string }) {
  const { data } = useReviewItems(enabled);
  return <span data-testid={id}>{data ? data.items.length : "-"}</span>;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("useReviewItems", () => {
  it("dos usos a la vez comparten una sola lectura", async () => {
    const list = vi.spyOn(api, "studyReviewsList").mockResolvedValue({ today: "2026-10-23", items: [{ path: "a" }] } as never);
    await act(async () => { root.render(<><Probe id="a" /><Probe id="b" /></>); });
    await act(async () => { await Promise.resolve(); });
    expect(list).toHaveBeenCalledTimes(1);
    expect(host.querySelector("[data-testid=a]")!.textContent).toBe("1");
    expect(host.querySelector("[data-testid=b]")!.textContent).toBe("1");
  });

  it("deshabilitado no lee nada", async () => {
    const list = vi.spyOn(api, "studyReviewsList").mockResolvedValue({ today: "", items: [] } as never);
    await act(async () => { root.render(<Probe id="a" enabled={false} />); });
    expect(list).not.toHaveBeenCalled();
  });
});
