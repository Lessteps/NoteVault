// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = (over: Record<string, unknown>) => ({ id: "f1", kind: "podcast", title: "6 Minute English", media: "a.mp3", transcript: "a.srt", added: "2026-09-30", has_media: true, has_transcript: true, ...over });
let sources: Array<ReturnType<typeof source>> = [];
const invoke = vi.fn(async (method: string, ..._args: unknown[]) => {
  if (method === "en_source_list") return { items: sources, kinds: [] };
  if (method === "en_source_session") return { ok: true, count: 5, first: "Inglés/4 Escucha/x/ej.md", paths: [] };
  return {};
});
(window as unknown as { nv: unknown }).nv = { invoke: (m: string, a: unknown[]) => invoke(m, ...(a ?? [])) };

import { useApp } from "../../store/app";
import { SourcesPanel } from "./SourcesPanel";

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (re: RegExp) => [...container.querySelectorAll("button")].find((b) => re.test(`${b.textContent} ${b.title}`))!;

beforeEach(() => {
  invoke.mockClear();
  sources = [source({}), source({ id: "f2", kind: "movie", title: "Una película", has_transcript: false, transcript: "" })];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SourcesPanel", () => {
  it("lists the library, filters by kind and says what a source is missing", async () => {
    act(() => root.render(<SourcesPanel />));
    await flush();
    expect(container.textContent).toContain("6 Minute English");
    expect(container.textContent).toContain("Una película");
    expect(container.textContent).toContain("sin transcripción");
    act(() => button(/Películas/).click());
    expect(container.textContent).not.toContain("6 Minute English");
    expect(container.textContent).toContain("Una película");
  });

  it("only offers practice sessions for a source that has its transcript", async () => {
    act(() => root.render(<SourcesPanel />));
    await flush();
    expect(container.querySelectorAll("button[title^='5 dictados']")).toHaveLength(1);
    expect(container.textContent).toContain("Pegar transcripción");
    expect(container.textContent).toContain("Elegir .srt");
  });

  it("pastes a transcript for a source that has none and saves it through the API", async () => {
    act(() => root.render(<SourcesPanel />));
    await flush();
    act(() => button(/Pegar transcripción/).click());
    const area = container.querySelector("textarea[aria-label='Transcripción']") as HTMLTextAreaElement;
    expect(area).toBeTruthy();
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      set.call(area, "Welcome to the show. Today we talk about remote work every day.");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button(/Guardar la transcripción/).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("en_source_paste", "podcast", "Una película", "Welcome to the show. Today we talk about remote work every day.", "f2");
  });

  it("builds a dictation session from the source and opens its first exercise", async () => {
    const openNote = vi.fn(async () => undefined);
    useApp.setState({ openNote } as never);
    act(() => root.render(<SourcesPanel />));
    await flush();
    await act(async () => button(/Dictados/).click());
    await flush();
    expect(invoke).toHaveBeenCalledWith("en_source_session", "f1", "dictation", 5);
    expect(openNote).toHaveBeenCalledWith("Inglés/4 Escucha/x/ej.md");
  });

  it("without sources it explains what to do", async () => {
    sources = [];
    act(() => root.render(<SourcesPanel />));
    await flush();
    expect(container.textContent).toContain("Aún no hay fuentes");
  });
});
