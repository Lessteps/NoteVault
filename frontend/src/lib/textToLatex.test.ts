import { describe, expect, it } from "vitest";
import { textToLatex } from "./textToLatex";

describe("textToLatex", () => {
  it("turns a/b into a fraction", () => {
    expect(textToLatex("5/5")).toBe(String.raw`\frac{5}{5}`);
    expect(textToLatex("x/2")).toBe(String.raw`\frac{x}{2}`);
    expect(textToLatex("1 + 3/4")).toBe(String.raw`1 + \frac{3}{4}`);
  });
  it("handles groups, roots and symbols", () => {
    expect(textToLatex("(a+b)/(c-d)")).toBe(String.raw`\frac{a+b}{c-d}`);
    expect(textToLatex("sqrt(x+1)")).toBe(String.raw`\sqrt{x+1}`);
    expect(textToLatex("2*3 <= 7")).toBe(String.raw`2\cdot 3 \leq 7`);
    expect(textToLatex("x^2/3")).toBe(String.raw`\frac{x^2}{3}`);
  });
  it("leaves LaTeX alone", () => {
    expect(textToLatex(String.raw`\frac{1}{2}`)).toBe(String.raw`\frac{1}{2}`);
    expect(textToLatex("  ")).toBe("");
  });
});
