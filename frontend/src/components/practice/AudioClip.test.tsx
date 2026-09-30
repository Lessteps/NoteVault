// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string, ..._args: unknown[]) => (method === "en_player_open" ? { url: "http://127.0.0.1/media/1", ok: true } : {}));
(window as unknown as { nv: unknown }).nv = { invoke: (m: string, a: unknown[]) => invoke(m, ...(a ?? [])) };

import { AudioClip } from "./AudioClip";

let container: HTMLDivElement;
let root: Root;
const speak = vi.fn();

function setSpeech(voices: Array<{ lang: string }>) {
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
    getVoices: () => voices,
    speak,
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string }, text: string) {
    this.text = text;
  };
}

beforeEach(() => {
  speak.mockClear();
  invoke.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: { revealed: boolean; media?: { file: string; start: number; end: number } | null }) =>
  act(() => root.render(<AudioClip text="The meeting starts at nine." {...props} />));

describe("AudioClip", () => {
  it("hides the text until the exercise is graded, then shows it", () => {
    setSpeech([{ lang: "en-US" }]);
    render({ revealed: false });
    expect(container.textContent).not.toContain("The meeting starts at nine.");
    expect(container.textContent).toContain("El texto se muestra cuando corriges");
    render({ revealed: true });
    expect(container.textContent).toContain("The meeting starts at nine.");
  });

  it("reads the text with an English voice at the chosen speed", () => {
    setSpeech([{ lang: "es-ES" }, { lang: "en-GB" }]);
    render({ revealed: false });
    const speed = [...container.querySelectorAll("button")].find((b) => b.textContent === "0.7×")!;
    act(() => speed.click());
    const play = [...container.querySelectorAll("button")].find((b) => /Escuchar/.test(b.textContent ?? ""))!;
    act(() => play.click());
    expect(speak).toHaveBeenCalledTimes(1);
    const u = speak.mock.calls[0]![0] as { text: string; rate: number; lang: string };
    expect(u).toMatchObject({ text: "The meeting starts at nine.", rate: 0.7, lang: "en-US" });
  });

  it("says what to install when the system has no English voice", () => {
    setSpeech([{ lang: "es-ES" }]);
    render({ revealed: false });
    expect(container.textContent).toContain("No hay una voz en inglés instalada");
    expect([...container.querySelectorAll("button")].some((b) => /Escuchar/.test(b.textContent ?? ""))).toBe(false);
  });

  it("with a media clip it plays the original audio even without a voice", async () => {
    setSpeech([]);
    render({ revealed: false, media: { file: "Pelis/film.mp4", start: 3.7, end: 6.3 } });
    expect(container.textContent).not.toContain("No hay una voz");
    const play = [...container.querySelectorAll("button")].find((b) => /Escuchar/.test(b.textContent ?? ""))!;
    const played = vi.fn(async () => undefined);
    (globalThis as unknown as { Audio: unknown }).Audio = function () {
      return { play: played, pause: vi.fn() };
    };
    await act(async () => play.click());
    expect(invoke).toHaveBeenCalledWith("en_player_open", "Pelis/film.mp4", 0);
  });
});
