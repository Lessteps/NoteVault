// @vitest-environment jsdom
//
// «Generar tema completo» en el chat: el diálogo con el selector de motor (en modo puente solo queda el agente externo) y la tarea creada,
// visible en el chat con su instrucción y «Ya terminó — validar».

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { RegenHandoff } from "../../lib/types";
import { useChatTopic } from "../../store/chatTopic";
import { useRegenEngine } from "../../store/regenEngine";
import { ChatHandoffs, ChatTopicDialog } from "./ChatTopicHost";

const BRIDGE = { mode: "bridge", provider: "bridge_claude", providerLabel: "Claude web (sin API)", model: "", hasKey: false, isClaude: false, recommended: "handoff", engines: [
  { id: "app", label: "Con la app", available: false, reason: "En modo puente.", detail: "d" },
  { id: "claude", label: "Con Claude (API key)", available: false, reason: "En modo puente.", detail: "d" },
  { id: "handoff", label: "Con Antigravity / Claude Code", available: true, reason: "", detail: "d" },
] };
const handoff = (): RegenHandoff => ({
  id: "h1", what: "all", createdAt: "2026-10-23T10:20:30.000Z", task: "P/_handoff/regenerar/h1.md", taskAbs: "C:/v/h1.md", resultDir: "r", folder: "f",
  prompt: "Read h1.md and execute it.", status: "waiting", log: [], ready: { found: 0, expected: 3 },
  topics: [{ folder: "P/A", title: "A", backup: "b", state: "pending", done: [], problems: [], created: [], restored: false }],
});

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); });
const byTest = (id: string) => host.querySelector<HTMLElement>(`[data-testid=${id}]`) ?? document.querySelector<HTMLElement>(`[data-testid=${id}]`);

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* sin almacenamiento */ }
  useRegenEngine.setState({ choice: "app", effective: "app", handoffs: {} });
  useChatTopic.setState({ asking: null, handoffIds: [] });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(api, "studyRegenEngines").mockResolvedValue(BRIDGE as never);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("ChatTopicDialog", () => {
  it("en modo puente deja solo el agente externo elegido y confirma con «Crear tarea para el agente»", async () => {
    await act(async () => { root.render(<ChatTopicDialog />); });
    let ok: boolean | undefined;
    await act(async () => { void useChatTopic.getState().ask("Generar «A»", "Se genera todo", "Generar").then((v) => { ok = v; }); });
    await flush(); await flush();
    expect(byTest("engine-choice")).toBeTruthy();
    expect((byTest("engine-app") as HTMLInputElement).disabled).toBe(true);
    expect((byTest("engine-handoff") as HTMLInputElement).checked).toBe(true);
    expect(useRegenEngine.getState().effective).toBe("handoff");
    expect(byTest("chat-topic-confirm")!.textContent).toBe("Crear tarea para el agente");
    await act(async () => { byTest("chat-topic-confirm")!.click(); });
    expect(ok).toBe(true);
    expect(byTest("chat-topic-dialog")).toBeNull();
  });

  it("Cancelar resuelve false", async () => {
    await act(async () => { root.render(<ChatTopicDialog />); });
    let ok: boolean | undefined;
    await act(async () => { void useChatTopic.getState().ask("t", "m", "Generar").then((v) => { ok = v; }); });
    await flush();
    await act(async () => { byTest("chat-topic-cancel")!.click(); });
    expect(ok).toBe(false);
  });
});

describe("ChatHandoffs", () => {
  it("enseña la tarea creada desde el chat y su validación llama a study_topic_regenerate_validate", async () => {
    const validate = vi.spyOn(api, "studyTopicRegenerateValidate").mockResolvedValue({ ...handoff(), status: "validated" });
    vi.spyOn(api, "studyTopicRegenerateHandoffStatus").mockResolvedValue(handoff());
    useRegenEngine.getState().putHandoff(handoff());
    useChatTopic.getState().showHandoff("h1");
    await act(async () => { root.render(<ChatHandoffs />); });
    expect(byTest("handoff-regen-prompt")!.textContent).toContain("h1.md");
    await act(async () => { byTest("handoff-regen-validate")!.click(); });
    await flush();
    expect(validate).toHaveBeenCalledWith("h1", false);
    expect(byTest("handoff-regen-panel")!.dataset.status).toBe("validated");
  });

  it("no pinta nada sin tareas", async () => {
    await act(async () => { root.render(<ChatHandoffs />); });
    expect(byTest("chat-handoffs")).toBeNull();
  });
});
