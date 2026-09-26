import { describe, expect, it } from "vitest";
import { formatTimestamp, isMediaFile, mediaLink, parseMediaUrl } from "./mediaLinks.js";

describe("media links", () => {
  it("round-trips with spaces and accents", () => {
    const link = mediaLink("Inglés/Películas/The Film (2020).mp4", 83.44);
    expect(link).toBe(
      "[01:23](nv://media?file=Ingl%C3%A9s/Pel%C3%ADculas/The%20Film%20%282020%29.mp4&t=83.4)",
    );
    const url = link.slice(link.indexOf("(") + 1, -1);
    expect(parseMediaUrl(url)).toEqual(["Inglés/Películas/The Film (2020).mp4", 83.4]);
  });

  it("parses variants and rejects non-media urls", () => {
    expect(parseMediaUrl("nv://media?file=a.mp4&t=90")).toEqual(["a.mp4", 90]);
    expect(parseMediaUrl("nv://media/?file=a.mp4&t=1:02:03")).toEqual(["a.mp4", 3723]);
    expect(parseMediaUrl("nv://media?file=a.mp4")).toEqual(["a.mp4", 0]);
    expect(parseMediaUrl("nv://media?file=a.mp4&t=zz")).toEqual(["a.mp4", 0]);
    for (const bad of ["nv://media?t=3", "https://media?file=a.mp4", "nv://note?file=a.mp4", "nv-note:Foo", "", null]) {
      expect(parseMediaUrl(bad)).toBeNull();
    }
  });

  it("formats timestamps", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(59.9)).toBe("00:59");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });

  it("recognises media kinds", () => {
    expect(isMediaFile("x/Film.MKV")).toBe(true);
    expect(isMediaFile("a.mp3")).toBe(true);
    expect(isMediaFile("a.md")).toBe(false);
  });
});
