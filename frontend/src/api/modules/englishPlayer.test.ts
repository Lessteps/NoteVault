import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addSource } from "../../core/english/sources.js";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { englishPlayerApi } from "./englishPlayer.js";

const EN =
  "1\n00:00:01,000 --> 00:00:03,000\nHello there.\n\n2\n00:00:04,000 --> 00:00:06,000\n<i>How are you?</i>\n";
const ES =
  "1\n00:00:01,100 --> 00:00:03,000\nHola.\n\n2\n00:00:04,000 --> 00:00:06,000\n¿Cómo estás?\n";

let dir: string;
let api: ReturnType<typeof englishPlayerApi>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_player_"));
  fs.mkdirSync(path.join(dir, "Pelis"));
  fs.writeFileSync(path.join(dir, "Pelis", "film.mp4"), Buffer.alloc(2048));
  fs.writeFileSync(path.join(dir, "Pelis", "film.en.srt"), EN, "utf-8");
  fs.writeFileSync(path.join(dir, "Pelis", "film.es.srt"), ES, "utf-8");
  api = englishPlayerApi(new AppState(dir));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function get(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

describe("english player", () => {
  it("opens, pairs subtitles and streams", async () => {
    const out = await api.en_player_open("Pelis/film.mp4", 4);
    expect((out.pairs as { en: string }[]).map((p) => p.en)).toEqual(["Hello there.", "How are you?"]);
    expect((out.pairs as { es: string }[])[1]!.es).toBe("¿Cómo estás?");
    expect(out.seconds).toBe(4);
    expect(JSON.stringify(out)).not.toContain(dir); // no disk paths reach the page
    const data = await get(out.url as string);
    expect(data.length).toBe(2048);
    expect((await api.en_player_open("Pelis/film.mp4")).id).toBe(out.id);
  });

  it("is confined to the vault and needs a desktop window to pick", async () => {
    for (const bad of ["../x.mp4", "/etc/passwd", "C:/x.mp4", "Pelis/film.en.srt"]) {
      await expect(api.en_player_open(bad)).rejects.toThrow(ApiError);
    }
    await expect(api.en_player_pick()).rejects.toThrow(ApiError);
  });

  it("makes timestamp links and mines sentences", async () => {
    const mid = (await api.en_player_open("Pelis/film.mp4")).id as string;
    expect(api.en_player_link(mid, 65).link).toBe("[01:05](nv://media?file=Pelis/film.mp4&t=65)");
    const out = api.en_player_mine(mid, {
      sentence: "How are you?",
      seconds: 4,
      mode: "cloze",
      target: "are",
      level: "a2",
      reference_es: "¿Cómo estás?",
    });
    const text = fs.readFileSync(path.join(dir, out.path as string), "utf-8");
    expect(text).toContain("type: exercise");
    expect(text).toContain("How _____ you?");
    expect(() => api.en_player_mine(mid, { sentence: "  " })).toThrow(ApiError);
    expect(() => api.en_player_mine("nope", { sentence: "x" })).toThrow(ApiError);
  });
});

describe("dictation from the player's subtitles", () => {
  const makeSpace = () => {
    fs.mkdirSync(path.join(dir, "Inglés 1"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inglés 1", "Inglés 1.resumen.md"), "---\nsubject: english\n---\n", "utf-8");
  };

  it("turns the sentence being played into a listening exercise that plays that stretch of the media", async () => {
    makeSpace();
    const media = (await api.en_player_open("Pelis/film.mp4", 4)) as { id: string };
    const out = api.en_player_dictation(media.id, 4.5);
    expect(out).toMatchObject({ ok: true, text: "How are you?", from_media: true });
    const note = fs.readFileSync(path.join(dir, ...(out.path as string).split("/")), "utf-8");
    expect(out.path).toContain("Inglés 1/4 Escucha/Dictados del reproductor/Ejercicios/ls_dictation/");
    expect(note).toContain("mode: ls_dictation");
    expect(note).toContain("discipline: english_listening");
    expect(note).toContain('media: "Pelis/film.mp4"');
    expect(note).toContain("media_start: 3.70");
    expect(note).toContain("## Texto del audio\nHow are you?");
    // the topic that collects them was created in the listening branch
    const practica = fs.readFileSync(path.join(dir, "Inglés 1", "4 Escucha", "Dictados del reproductor", "Dictados del reproductor.practica.md"), "utf-8");
    expect(practica).toContain("branch: listening");
  });

  it("puts shadowing and podcast exercises in the topics that train them (4.5 and 4.4) when the space has them", async () => {
    makeSpace();
    for (const t of ["4.4 Podcasts and interviews", "4.5 Shadowing to repeat what you hear"]) fs.mkdirSync(path.join(dir, "Inglés 1", "4 Escucha", t), { recursive: true });
    const media = (await api.en_player_open("Pelis/film.mp4", 4)) as { id: string };
    const shadow = api.en_player_dictation(media.id, 4.5, "shadowing");
    expect(shadow.path).toContain("4 Escucha/4.5 Shadowing to repeat what you hear/Ejercicios/ls_shadowing/");
    expect(fs.readFileSync(path.join(dir, ...(shadow.path as string).split("/")), "utf-8")).toContain("mode: ls_shadowing");
    const pod = api.en_player_dictation(media.id, 4.5, "podcast");
    expect(pod.path).toContain("4 Escucha/4.4 Podcasts and interviews/Ejercicios/ls_podcast/");
    const note = fs.readFileSync(path.join(dir, ...(pod.path as string).split("/")), "utf-8");
    expect(note).toContain("mode: ls_podcast");
    expect(note).toContain("idea general");
    expect(note).toContain("## Texto del audio");
  });

  it("with no English subtitles it explains why instead of failing", async () => {
    makeSpace();
    fs.rmSync(path.join(dir, "Pelis", "film.en.srt"));
    fs.rmSync(path.join(dir, "Pelis", "film.es.srt"));
    const media = (await api.en_player_open("Pelis/film.mp4")) as { id: string };
    const out = api.en_player_dictation(media.id, 2);
    expect(out).toMatchObject({ ok: false, reason: "no_subtitles" });
    expect(String(out.message)).toContain("no tiene subtítulos en inglés");
  });

  it("without an English space it says so", async () => {
    const media = (await api.en_player_open("Pelis/film.mp4")) as { id: string };
    expect(api.en_player_dictation(media.id, 2)).toMatchObject({ ok: false, reason: "no_space" });
  });
});

describe("library of sources", () => {
  const makeSpace = () => {
    fs.mkdirSync(path.join(dir, "Inglés 1", "4 Escucha", "4.5 Shadowing to repeat what you hear"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inglés 1", "Inglés 1.resumen.md"), "---\nsubject: english\n---\n", "utf-8");
  };
  const LONG = Array.from({ length: 12 }, (_, i) => `${i + 1}\n00:00:${String(i * 5).padStart(2, "0")},000 --> 00:00:${String(i * 5 + 3).padStart(2, "0")},500\nThis is the sentence number ${i} of the show.\n`).join("\n");

  it("lists sources, opens one with ITS transcript (not the film's sibling subtitles) and keeps paths private", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "nv_outside_"));
    try {
      fs.writeFileSync(path.join(outside, "ep1.mp3"), Buffer.alloc(1024));
      fs.writeFileSync(path.join(outside, "ep1-transcript.srt"), LONG, "utf-8");
      const s = addSource(dir, { kind: "podcast", title: "6 Minute English — ep 1", media: path.join(outside, "ep1.mp3"), transcript: path.join(outside, "ep1-transcript.srt") });
      const list = api.en_source_list() as { items: Array<{ id: string; has_media: boolean; has_transcript: boolean; kind: string }> };
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({ id: s.id, kind: "podcast", has_media: true, has_transcript: true });
      const opened = (await api.en_source_open(s.id, 0)) as { pairs: Array<{ en: string }>; url: string };
      expect(opened.pairs).toHaveLength(12);
      expect(opened.pairs[3]!.en).toContain("number 3");
      expect(JSON.stringify(opened)).not.toContain(outside);
      expect((await get(opened.url)).length).toBe(1024);
      // a source whose file went away says so instead of failing obscurely
      fs.rmSync(path.join(outside, "ep1.mp3"));
      expect((api.en_source_list() as { items: Array<{ has_media: boolean }> }).items[0]!.has_media).toBe(false);
      await expect(api.en_source_open(s.id)).rejects.toThrow(/No encuentro el archivo/);
      expect(api.en_source_remove(s.id)).toEqual({ ok: true });
      expect((api.en_source_list() as { items: unknown[] }).items).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("builds a session of dictations spread along the episode, tied to the source, with no AI", async () => {
    makeSpace();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "nv_outside_"));
    try {
      fs.writeFileSync(path.join(outside, "ep.mp3"), Buffer.alloc(512));
      fs.writeFileSync(path.join(outside, "ep.srt"), LONG, "utf-8");
      const s = addSource(dir, { kind: "podcast", title: "Ep", media: path.join(outside, "ep.mp3"), transcript: path.join(outside, "ep.srt") });
      const out = (await api.en_source_session(s.id, "dictation", 4)) as { ok: boolean; paths: string[]; count: number };
      expect(out).toMatchObject({ ok: true, count: 4 });
      const notes = out.paths.map((p) => fs.readFileSync(path.join(dir, ...p.split("/")), "utf-8"));
      expect(out.paths[0]).toContain("4.5 Shadowing to repeat what you hear/Ejercicios/ls_dictation/");
      expect(new Set(out.paths).size).toBe(4);
      for (const n of notes) {
        expect(n).toContain(`source: ${s.id}`);
        expect(n).not.toContain("media: ");
        expect(n).toContain("## Texto del audio\nThis is the sentence number");
      }
      // spread: not four neighbours
      const starts = notes.map((n) => Number(/media_start: ([\d.]+)/.exec(n)![1]));
      expect(starts[3]! - starts[0]!).toBeGreaterThan(20);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("explains when the source has no transcript yet", async () => {
    makeSpace();
    fs.writeFileSync(path.join(dir, "Pelis", "solo.mp3"), Buffer.alloc(64));
    const s = addSource(dir, { kind: "ted", title: "Talk", media: path.join(dir, "Pelis", "solo.mp3") });
    expect(s.media).toBe("Pelis/solo.mp3"); // inside the vault: stored relative to it
    expect(await api.en_source_session(s.id)).toMatchObject({ ok: false, reason: "no_subtitles" });
  });
});
