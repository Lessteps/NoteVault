// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string, ..._args: unknown[]) => (method === "en_player_dictation" ? { ok: true, path: "Inglés/4 Escucha/x/ej.md" } : {}));
(window as unknown as { nv: unknown }).nv = { invoke: (m: string, a: unknown[]) => invoke(m, ...(a ?? [])) };

import { useApp } from "../../store/app";
import { useMini } from "../../store/miniPlayer";
import { MiniPlayer } from "./MiniPlayer";

let container: HTMLDivElement;
let root: Root;
const play = vi.fn(async () => undefined);
const pause = vi.fn();

const media = {
  id: "m1",
  url: "http://127.0.0.1/m/x",
  name: "ep.mp3",
  seconds: 0,
  en_file: "ep.srt",
  es_file: "",
  pairs: [
    { start: 0, end: 4000, en: "Welcome to the show.", es: "" },
    { start: 5000, end: 9000, en: "Today we talk about accents.", es: "" },
  ],
};
const source = { id: "f1", kind: "podcast", title: "Accents", media: "ep.mp3", transcript: "ep.srt", added: "", has_media: true, has_transcript: true, timed: true };

beforeEach(() => {
  play.mockClear();
  pause.mockClear();
  invoke.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  useApp.setState({ module: "notas" } as never);
  useMini.setState({ media: null, source: null, plain: "", expanded: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: RegExp) => [...container.querySelectorAll("button")].find((b) => label.test(`${b.getAttribute("aria-label") ?? ""} ${b.title} ${b.textContent}`))!;

describe("MiniPlayer", () => {
  it("shows nothing until a source is opened, and nothing inside the full player", () => {
    act(() => root.render(<MiniPlayer />));
    expect(container.textContent).toBe("");
    act(() => useMini.setState({ media: media as never, source: source as never }));
    expect(container.textContent).toContain("Accents");
    act(() => useApp.setState({ module: "player" } as never));
    expect(container.textContent).toBe("");
  });

  it("jumps back and forward and changes speed", () => {
    act(() => root.render(<MiniPlayer />));
    act(() => useMini.setState({ media: media as never, source: source as never }));
    const audio = container.querySelector("audio")!;
    act(() => button(/Adelante 30/).click());
    expect(audio.currentTime).toBe(30);
    act(() => button(/Atrás 10/).click());
    expect(audio.currentTime).toBe(20);
    act(() => button(/1\.5×/).click());
    expect(audio.playbackRate).toBe(1.5);
    expect(audio.defaultPlaybackRate).toBe(1.5);
  });

  it("shows the transcript, jumps to a sentence and can be minimised or closed", () => {
    act(() => root.render(<MiniPlayer />));
    act(() => useMini.setState({ media: media as never, source: source as never }));
    expect(container.textContent).toContain("Welcome to the show.");
    act(() => button(/Ver la transcripción/).click());
    act(() => button(/Today we talk about accents/).click());
    expect(container.querySelector("audio")!.currentTime).toBe(5);
    act(() => button(/Minimizar/).click());
    expect(container.querySelector("input[type=range]")).toBeNull();
    act(() => button(/Cerrar reproductor/).click());
    expect(container.textContent).toBe("");
  });

  it("makes an exercise from the point being played", async () => {
    const openNote = vi.fn(async () => undefined);
    useApp.setState({ openNote } as never);
    act(() => root.render(<MiniPlayer />));
    act(() => useMini.setState({ media: media as never, source: source as never }));
    await act(async () => button(/Un dictado/).click());
    expect(invoke).toHaveBeenCalledWith("en_player_dictation", "m1", 0, "dictation");
    expect(openNote).toHaveBeenCalledWith("Inglés/4 Escucha/x/ej.md");
  });
});
