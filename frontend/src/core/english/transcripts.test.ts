import { describe, expect, it } from "vitest";
import { detectTranscriptFormat, isTimedFile, pastedTranscriptFile, plainTextOfNote, sentenceCues, splitSentences } from "./transcripts";

describe("transcripts", () => {
  it("tells a subtitle file from plain text", () => {
    expect(detectTranscriptFormat("1\n00:00:01,000 --> 00:00:03,000\nHello there.\n")).toBe("srt");
    expect(detectTranscriptFormat("WEBVTT\n\n00:01.000 --> 00:03.000\nHello")).toBe("vtt");
    expect(detectTranscriptFormat("Rob: Hello and welcome.\nSam: Thanks, Rob.")).toBe("plain");
    expect(isTimedFile("a/b/ep.SRT")).toBe(true);
    expect(isTimedFile("ep.md")).toBe(false);
  });

  it("splits plain text into sentences and joins tiny leftovers", () => {
    const s = splitSentences("Welcome to the show. Today we talk about work!\nIs it good? Yes. It is very good for us.");
    expect(s).toEqual(["Welcome to the show.", "Today we talk about work!", "Is it good? Yes.", "It is very good for us."]);
    expect(splitSentences("  \n\n ")).toEqual([]);
  });

  it("gives plain text made-up times so it can go through the same session builder", () => {
    const cues = sentenceCues("One two three four five. Six seven eight nine ten.");
    expect(cues.map((c) => c.en)).toEqual(["One two three four five.", "Six seven eight nine ten."]);
    expect(cues[1]!.start).toBeGreaterThan(cues[0]!.start);
  });

  it("writes a plain paste as a note with a title and reads it back without its front matter", () => {
    const { ext, content } = pastedTranscriptFile("Hello there.\r\n\r\n\r\nHow are you today?", "Ep \"1\"");
    expect(ext).toBe("md");
    expect(content).toContain("type: transcript");
    expect(plainTextOfNote(content)).toBe("Hello there.\n\nHow are you today?");
    expect(pastedTranscriptFile("1\n00:00:01,000 --> 00:00:03,000\nHi.\n", "x").ext).toBe("srt");
  });
});
