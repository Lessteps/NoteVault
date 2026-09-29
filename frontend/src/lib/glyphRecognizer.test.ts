import { describe, expect, it } from "vitest";
import { classifyGlyph, sampleSkeletons, type GlyphStroke } from "./glyphRecognizer";

/** Deterministic pseudo-random numbers, so a failure can be reproduced. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ink the way a hand makes it: slanted, squeezed, rotated, wobbly, unevenly sampled, moved and sized. */
function handwrite(strokes: GlyphStroke[], rand: () => number): GlyphStroke[] {
  const shear = (rand() - 0.5) * 0.5;
  const sx = 0.75 + rand() * 0.5;
  const rot = ((rand() - 0.5) * 24 * Math.PI) / 180;
  const size = 0.6 + rand() * 2.4;
  const dx = rand() * 300;
  const dy = rand() * 300;
  const wob = [rand() * 6.28, rand() * 6.28];
  return strokes.map((s) => {
    const dense: GlyphStroke = [];
    for (let i = 0; i < s.length - 1; i += 1) {
      const a = s[i]!;
      const b = s[i + 1]!;
      const parts = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < parts; k += 1) dense.push({ x: a.x + ((b.x - a.x) * k) / parts, y: a.y + ((b.y - a.y) * k) / parts });
    }
    dense.push(s[s.length - 1]!);
    return dense.map((p) => {
      let x = (p.x + shear * (50 - p.y)) * sx;
      let y = p.y;
      x += 2.5 * Math.sin(y / 14 + wob[0]!) + (rand() - 0.5) * 3;
      y += 2.5 * Math.sin(x / 14 + wob[1]!) + (rand() - 0.5) * 3;
      const rx = x * Math.cos(rot) - y * Math.sin(rot);
      const ry = x * Math.sin(rot) + y * Math.cos(rot);
      return { x: rx * size + dx, y: ry * size + dy };
    });
  });
}

const line = (...pts: Array<[number, number]>): GlyphStroke => pts.map(([x, y]) => ({ x, y }));

/** Shapes NOT in the template library: angular or otherwise different ways of writing the same digits. */
const OTHER_HANDS: Array<{ char: string; strokes: GlyphStroke[] }> = [
  // The user's own case: a 5 as a bar plus a body in two strokes, angular bowl.
  { char: "5", strokes: [line([70, 8], [26, 8]), line([26, 8], [22, 46], [58, 42], [76, 62], [66, 88], [38, 94], [18, 82])] },
  { char: "5", strokes: [line([24, 6], [72, 6]), line([28, 6], [26, 44]), line([26, 44], [60, 40], [78, 66], [56, 94], [20, 84])] },
  { char: "2", strokes: [line([24, 28], [40, 8], [68, 10], [78, 34], [22, 92], [84, 92])] },
  { char: "3", strokes: [line([22, 14], [50, 6], [74, 24], [48, 46], [78, 66], [56, 94], [20, 84])] },
  { char: "4", strokes: [line([62, 6], [14, 62], [86, 62]), line([62, 6], [62, 94])] },
  { char: "6", strokes: [line([70, 8], [36, 36], [24, 70], [40, 94], [68, 86], [70, 60], [42, 54], [26, 66])] },
  { char: "7", strokes: [line([16, 10], [84, 8]), line([84, 8], [38, 94])] },
  { char: "8", strokes: [line([50, 6], [26, 22], [50, 46], [76, 70], [50, 94], [24, 72], [50, 46], [74, 22], [50, 6])] },
  { char: "9", strokes: [line([50, 6], [74, 22], [50, 46], [26, 24], [50, 6]), line([74, 22], [70, 60], [46, 94])] },
  { char: "0", strokes: [line([50, 6], [20, 30], [20, 72], [50, 94], [80, 72], [80, 30], [50, 6])] },
  { char: "1", strokes: [line([54, 6], [54, 94])] },
];

describe("glyph recogniser", () => {
  it("recognises every template skeleton after handwriting-like distortion", () => {
    const rand = rng(7);
    const perChar = new Map<string, { ok: number; total: number }>();
    for (const sk of sampleSkeletons()) {
      for (let i = 0; i < 6; i += 1) {
        const guess = classifyGlyph(handwrite(sk.strokes, rand), 1)[0]!;
        const c = perChar.get(sk.char) ?? { ok: 0, total: 0 };
        c.total += 1;
        if (guess.char === sk.char) c.ok += 1;
        perChar.set(sk.char, c);
      }
    }
    const all = [...perChar.values()];
    const accuracy = all.reduce((a, c) => a + c.ok, 0) / all.reduce((a, c) => a + c.total, 0);
    const detail = [...perChar].map(([c, v]) => c + ":" + v.ok + "/" + v.total).join(" ");
    expect(accuracy, detail).toBeGreaterThan(0.9);
    for (const [char, c] of perChar) expect(c.ok / c.total, `glyph ${char} (${detail})`).toBeGreaterThanOrEqual(0.66);
  }, 60000);

  it("recognises other ways of writing the digits", () => {
    const rand = rng(21);
    let ok = 0;
    let total = 0;
    const misses: string[] = [];
    for (const hand of OTHER_HANDS) {
      for (let i = 0; i < 5; i += 1) {
        total += 1;
        const guess = classifyGlyph(handwrite(hand.strokes, rand), 1)[0]!;
        if (guess.char === hand.char) ok += 1;
        else misses.push(`${hand.char}→${guess.char}`);
      }
    }
    expect(ok / total, `misses: ${misses.join(" ")}`).toBeGreaterThan(0.8);
  }, 60000);

  it("reads the digit 5 the user drew (bar + body) as a 5, not as a minus and an x", () => {
    const rand = rng(3);
    for (let i = 0; i < 6; i += 1) {
      expect(classifyGlyph(handwrite(OTHER_HANDS[0]!.strokes, rand), 1)[0]!.char).toBe("5");
    }
  });

  it("returns nothing for empty ink", () => {
    expect(classifyGlyph([])).toEqual([]);
    expect(classifyGlyph([[{ x: 1, y: 1 }]])).toEqual([]);
  });
});
