import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  Cue, cueAt, cueBefore, findSiblingSubtitles, loadSubtitles, pairTracks, parseSubtitles,
} from "./subtitles.js";

const SRT = `1
00:00:01,000 --> 00:00:03,500
<i>I've been meaning</i> to tell you
<font color="#ffff00">something.</font>

2
00:00:04,000 --> 00:00:06,000
{\\an8}Tom &amp; Jerry&nbsp;are here.
3
00:00:07,000 --> 00:00:08,000
Missing blank line before this index.

this line has no timing --> nothing

4
00:00:10,000 --> 00:00:09,000
End before start: skipped.

5
00:00:11,000 --> 00:00:12,500
42
`;

const VTT = `WEBVTT - demo

NOTE this is a comment
spanning two lines

STYLE
::cue { color: yellow }

intro
00:01.100 --> 00:02.000 align:start position:10%
Hace tiempo que

00:02.050 --> 00:03.400
<c.yellow>quiero decirte</c> algo.

00:00:04.100 --> 00:00:05.900
Tom y Jerry están aquí.
`;

const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const mkdir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nv_subs_"));
  tmp.push(d);
  return d;
};

describe("subtitles", () => {
  it("cleans SRT tags and survives malformed blocks", () => {
    const cues = parseSubtitles(SRT);
    expect(cues.map((c) => c.start)).toEqual([1000, 4000, 7000, 11000]);
    expect(cues[0]!.text).toBe("I've been meaning to tell you\nsomething.");
    expect(cues[0]!.line).toBe("I've been meaning to tell you something.");
    expect(cues[0]!.end).toBe(3500);
    expect(cues[1]!.text).toBe("Tom & Jerry are here.");
    expect(cues[2]!.text).toBe("Missing blank line before this index.");
    expect(cues[3]!.text).toBe("42");
  });

  it("handles VTT header, notes, styles, ids and short times", () => {
    const cues = parseSubtitles(VTT);
    expect(cues.map((c) => [c.start, c.end])).toEqual([[1100, 2000], [2050, 3400], [4100, 5900]]);
    expect(cues[1]!.text).toBe("quiero decirte algo.");
    expect(cues.map((c) => c.text).join(" ")).not.toContain("color");
  });

  it("handles CRLF, BOM and garbage", () => {
    const cues = parseSubtitles("﻿1\r\n00:00:01,5 --> 00:00:02,25\r\nHi there\r\n\r\n");
    expect(cues).toEqual([new Cue(1500, 2250, "Hi there")]);
    expect(parseSubtitles("not a subtitle file\n\n--> \n")).toEqual([]);
    expect(parseSubtitles("")).toEqual([]);
  });

  it("reads cp1252, utf-8-sig and utf-8", () => {
    const dir = mkdir();
    const body = "1\n00:00:01,000 --> 00:00:02,000\n¿Qué tal, señora?\n";
    fs.writeFileSync(path.join(dir, "a.srt"), Buffer.from(body, "latin1"));
    fs.writeFileSync(path.join(dir, "b.srt"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf-8")]));
    fs.writeFileSync(path.join(dir, "c.srt"), Buffer.from(body, "utf-8"));
    for (const name of ["a.srt", "b.srt", "c.srt"]) {
      expect(loadSubtitles(path.join(dir, name))[0]!.text).toBe("¿Qué tal, señora?");
    }
  });

  it("pairs tracks by overlap", () => {
    const en = parseSubtitles(SRT).slice(0, 3);
    const es = [
      new Cue(1100, 2000, "Hace tiempo que"),
      new Cue(2050, 3400, "quiero decirte algo."),
      new Cue(3900, 6100, "Tom y Jerry están aquí."),
      new Cue(20000, 21000, "sin pareja"),
    ];
    const pairs = pairTracks(en, es);
    expect(pairs.length).toBe(3);
    expect(pairs[0]!.es).toBe("Hace tiempo que quiero decirte algo.");
    expect(pairs[1]!.es).toBe("Tom y Jerry están aquí.");
    expect(pairs[2]!.es).toBe("");
    expect(pairTracks(en)[0]!.es).toBe("");
    expect(pairTracks(en, [new Cue(3000, 4600, "a caballo")])[1]!.es).toBe("a caballo");
  });

  it("looks up cues", () => {
    const cues = parseSubtitles(SRT);
    expect(cueAt(cues, 0)).toBe(-1);
    expect(cueAt(cues, 1000)).toBe(0);
    expect(cueAt(cues, 3499)).toBe(0);
    expect(cueAt(cues, 3500)).toBe(-1);
    expect(cueBefore(cues, 3700)).toBe(0);
    expect(cueAt(cues, 4000)).toBe(1);
    expect(cueAt(cues, 99999)).toBe(-1);
    expect(cueBefore(cues, 99999)).toBe(3);
    expect(cueAt([], 10)).toBe(-1);
  });

  it("finds sibling subtitles", () => {
    const dir = mkdir();
    const media = path.join(dir, "My Film.mkv");
    fs.writeFileSync(media, "");
    fs.writeFileSync(path.join(dir, "My Film.srt"), "x");
    fs.writeFileSync(path.join(dir, "My Film.ES.vtt"), "x");
    fs.writeFileSync(path.join(dir, "Other.en.srt"), "x");
    expect(findSiblingSubtitles(media)).toEqual([path.join(dir, "My Film.srt"), path.join(dir, "My Film.ES.vtt")]);
    fs.writeFileSync(path.join(dir, "My Film.en.srt"), "x");
    expect(findSiblingSubtitles(media)[0]).toBe(path.join(dir, "My Film.en.srt"));
  });
});
