import { describe, expect, it } from "vitest";
import { clock, cueAt, cueBefore, nextTarget, parseMediaUrl, previousTarget } from "./player";

const P = [
  { start: 1000, end: 3000, en: "a", es: "" },
  { start: 4000, end: 6000, en: "b", es: "" },
];

describe("player timing", () => {
  it("finds cues", () => {
    expect(cueBefore(P, 500)).toBe(-1);
    expect(cueAt(P, 3500)).toBe(-1);
    expect(cueBefore(P, 3500)).toBe(0);
    expect(cueAt(P, 4500)).toBe(1);
  });
  it("moves between sentences", () => {
    expect(previousTarget(P, 4500)).toBe(0);     // just started: previous one
    expect(previousTarget(P, 5800)).toBe(1);     // well into it: restart it
    expect(nextTarget(P, 1200)).toBe(1);
    expect(nextTarget(P, 5000)).toBe(1);
  });
  it("parses timestamp links", () => {
    expect(parseMediaUrl("nv://media?file=Pelis/film%20a.mp4&t=65")).toEqual(["Pelis/film a.mp4", 65]);
    expect(parseMediaUrl("nv://media?file=x.mp3&t=1:05")).toEqual(["x.mp3", 65]);
    expect(parseMediaUrl("https://x")).toBeNull();
    expect(clock(3_725_000)).toBe("1:02:05");
  });
});
