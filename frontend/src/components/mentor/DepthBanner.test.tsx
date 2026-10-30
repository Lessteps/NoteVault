// @vitest-environment jsdom

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import * as clip from "../../lib/clipboard";
import { DepthBanner } from "./DepthBanner";

let host: HTMLDivElement;
let root: Root;
const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const gap = (over = {}) => ({ subplanId: "s-b", areaId: "backend", area: "Backend", groupId: "g", groupTitle: "Backend fundamentals", groupKind: "knowledge", chapters: 4, missingPieces: 12, coarseCount: 4, sample: ["4.1 HTTP"], ...over });

describe("DepthBanner", () => {
  it("avisa de los capítulos gruesos y copia la instrucción ya escrita", async () => {
    vi.spyOn(api, "mentorPlanDepth").mockResolvedValue({ gaps: [gap()], standard: { minPieces: 3, minMinutes: 60 } });
    const h = vi.spyOn(api, "mentorPlanDepthHandoff").mockResolvedValue({ rel: "Programación/_handoff/desglosar/x.md", abs: "/v/x.md", shortPrompt: "NEW TASK read /v/x.md", chapters: 4 });
    const copy = vi.spyOn(clip, "copyText").mockResolvedValue(true);
    await act(async () => root.render(<DepthBanner planId="p" subplanId="s-b" />));
    await flush();
    expect(host.querySelector('[data-testid="depth-gap"]')!.textContent).toMatch(/4 de 4 capítulos sin desglosar/);
    await act(async () => (host.querySelector('[data-testid="depth-copy"]') as HTMLElement).click());
    await flush();
    expect(h).toHaveBeenCalledWith({ planId: "p", subplanId: "s-b", groupId: "g" });
    expect(copy).toHaveBeenCalledWith("NEW TASK read /v/x.md");
  });

  it("dentro de un área no enseña los fundamentos «Bases» y sin avisos no pinta nada", async () => {
    vi.spyOn(api, "mentorPlanDepth").mockResolvedValue({ gaps: [gap({ groupId: "bases", groupKind: "bases", groupTitle: "Bases" })], standard: { minPieces: 3, minMinutes: 60 } });
    await act(async () => root.render(<DepthBanner planId="p" subplanId="s-b" />));
    await flush();
    expect(host.querySelector('[data-testid="depth-banner"]')).toBeNull();
  });
});
