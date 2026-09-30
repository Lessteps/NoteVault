import { describe, expect, it } from "vitest";
import { cleanCueText, pickDictationClip, pickPodcastClip } from "./dictation";

const cues = [
  { start: 1000, end: 3000, en: "Hello there." },
  { start: 4000, end: 6000, en: "<i>How are you?</i>" },
  { start: 7000, end: 9000, en: "I am fine, thank you very much for asking about it today." },
  { start: 10000, end: 11000, en: "♪♪" },
];

describe("podcast clips", () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ start: i * 4000, end: i * 4000 + 3500, en: `Sentence number ${i} of the show.` }));

  it("takes the cue being played and the ones after it, up to about 45 seconds", () => {
    const clip = pickPodcastClip(long, 8500)!;
    expect(clip.text.startsWith("Sentence number 2 ")).toBe(true);
    expect(clip.end - clip.start).toBeLessThanOrEqual(46);
    expect(clip.end - clip.start).toBeGreaterThan(30);
  });

  it("is null with no English text and short near the end of the file", () => {
    expect(pickPodcastClip([], 0)).toBeNull();
    expect(pickPodcastClip(long, 116000)!.text).toContain("Sentence number 29");
  });
});

describe("dictation clips", () => {
  it("cleans subtitle markup", () => {
    expect(cleanCueText(String.raw`<i>Hi</i>` + "\n[music] " + String.raw`{\an8}` + "there (laughs)")).toBe("Hi there");
  });

  it("takes the sentence being played, with a margin, and joins a very short one to the next", () => {
    expect(pickDictationClip(cues, 4500)).toMatchObject({ text: "How are you? I am fine, thank you very much for asking about it today.", start: 3.7 });
    expect(pickDictationClip(cues, 7500)!.text).toBe("I am fine, thank you very much for asking about it today.");
  });

  it("uses the first cue before the first one, the last cue after the last, and nothing without English text", () => {
    expect(pickDictationClip(cues, 0)!.text).toContain("Hello there.");
    expect(pickDictationClip(cues, 99000)!.text).toContain("I am fine");
    expect(pickDictationClip([{ start: 0, end: 1000, en: "" }, { start: 2000, end: 3000, en: "♪" }], 500)).toBeNull();
    expect(pickDictationClip([], 0)).toBeNull();
  });
});
