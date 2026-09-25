import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
